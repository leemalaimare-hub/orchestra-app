/**
 * Send engine — the core of Callscade.
 * Sends ranked emails one at a time, processes responses, auto-advances.
 */
import 'server-only';
import crypto from 'node:crypto';
import { format } from 'date-fns';
import { createAdminClient } from './supabase-server';
import { sendEmail } from './email';
import { renderTemplate } from './templateEngine';
import { isMusicianAvailable } from './availability';
import { checkEmailConnection } from './emailHealth';
import { formatConcertDates } from './concertDates';
import {
  notifyAccepted, notifyDeclined, notifyNoResponse, notifyExhausted, notifySendFailed,
  notifySendLimitWarning, notifySendLimitReached,
} from './notifications';
import { logActivity } from './activityLogger';
import { incrementSendCount } from './usage';
import type { EmailAttachment } from './mime';

type Admin = ReturnType<typeof createAdminClient>;

interface StartResult { ok: boolean; error?: string; sent?: boolean; musicianName?: string; reason?: string; }
interface SendResult { sent: boolean; reason?: string; musicianName?: string; token?: string; }
interface ResponseResult { success: boolean; action: 'accepted' | 'declined'; }
interface NoResponseResult { ok: boolean; advanced: boolean; }

function log(action: string, details: Record<string, unknown>): void {
  console.log(`[sendEngine] ${new Date().toISOString()} ${action}`, JSON.stringify(details));
}

/** After a send, checks 80%/100% thresholds and notifies once per billing period. */
async function checkSendLimits(
  organizationId: string, managerId: string, sendCount: number,
  sendLimit: number, planType: string, billingPeriodStart: string | null,
): Promise<void> {
  if (sendLimit <= 0) return;
  const pct = (sendCount / sendLimit) * 100;
  if (pct < 80) return;

  const action = pct >= 100 ? 'send_limit_reached' : 'send_limit_warning';
  const admin = createAdminClient();
  // Deduplicate: only once per billing period
  let query = admin.from('activity_logs').select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId).eq('action', action);
  if (billingPeriodStart) query = query.gte('created_at', billingPeriodStart);
  const { count } = await query;
  if ((count ?? 0) > 0) return;

  if (pct >= 100) {
    await notifySendLimitReached({ organizationId, managerId, planType });
  } else {
    await notifySendLimitWarning({ organizationId, managerId, sendCount, sendLimit, planType });
  }
  await logActivity({ organizationId, managerId, action, details: { sendCount, sendLimit } });
}

/** Fetches position + concert + template + organization in one bundle. */
async function loadPositionContext(admin: Admin, concertPositionId: string) {
  const { data: position } = await admin
    .from('concert_positions').select('*').eq('id', concertPositionId).maybeSingle();
  if (!position) return null;
  const { data: concert } = await admin
    .from('concerts').select('*').eq('id', position.concert_id).maybeSingle();
  if (!concert) return null;
  const { data: organization } = await admin
    .from('organizations').select('*').eq('id', concert.organization_id).maybeSingle();
  if (!organization) return null;
  let template = null;
  if (position.template_id) {
    const { data } = await admin.from('email_templates').select('*').eq('id', position.template_id).maybeSingle();
    template = data;
  }
  return { position, concert, organization, template };
}

async function fetchAttachments(admin: Admin, templateId: string | null): Promise<EmailAttachment[]> {
  if (!templateId) return [];
  const { data: rows } = await admin
    .from('template_attachments').select('file_name, file_url, mime_type').eq('template_id', templateId);
  const out: EmailAttachment[] = [];
  for (const r of rows ?? []) {
    try {
      const res = await fetch(r.file_url);
      if (!res.ok) continue;
      out.push({ filename: r.file_name, content: Buffer.from(await res.arrayBuffer()), mimeType: r.mime_type });
    } catch {
      // skip an attachment that can't be fetched
    }
  }
  return out;
}

/** STEP 7.2 / Function 1 — begin sending for a position. */
export async function startSending(concertPositionId: string, managerId: string): Promise<StartResult> {
  const admin = createAdminClient();
  const ctx = await loadPositionContext(admin, concertPositionId);
  if (!ctx) return { ok: false, error: 'Position not found' };

  if (ctx.position.status !== 'pending') {
    return { ok: false, error: 'Sending already started for this position' };
  }

  const health = await checkEmailConnection(managerId);
  if (!health.connected) {
    return { ok: false, error: 'No email account connected. Connect your email in Settings → Email.' };
  }
  if (!ctx.position.template_id || !ctx.template) {
    return { ok: false, error: 'This position has no email template. Edit the position to choose one.' };
  }

  // Note: we never hard-block on the send limit — overage is charged instead.

  await admin.from('concert_positions').update({ status: 'active' }).eq('id', concertPositionId);
  log('startSending', { concertPositionId, managerId, mode: ctx.position.send_mode });
  await logActivity({
    organizationId: ctx.organization.id, managerId, action: 'send_started',
    entityType: 'concert_position', entityId: concertPositionId,
    details: { position_name: ctx.position.position_name, concert_name: ctx.concert.name, mode: ctx.position.send_mode ?? 'cascade' },
  });

  if (ctx.position.send_mode === 'broadcast') {
    const result = await broadcastSend(concertPositionId, managerId, ctx);
    return { ok: true, sent: result.sent, musicianName: result.firstRecipient ?? undefined, reason: result.reason };
  }

  const result = await sendToNextMusician(concertPositionId, managerId, 'manual');
  if (!result.sent) {
    return { ok: true, sent: false, reason: result.reason };
  }
  return { ok: true, sent: true, musicianName: result.musicianName };
}

/** Broadcast mode — send to ALL pending recipients simultaneously. */
async function broadcastSend(
  concertPositionId: string,
  managerId: string,
  ctx: NonNullable<Awaited<ReturnType<typeof loadPositionContext>>>,
): Promise<{ sent: boolean; firstRecipient?: string | null; reason?: string }> {
  const admin = createAdminClient();

  const { data: queue } = await admin
    .from('concert_position_musicians')
    .select('*, musicians(first_name, last_name, email, is_blacklisted)')
    .eq('concert_position_id', concertPositionId)
    .eq('status', 'pending')
    .order('rank');

  type Row = {
    id: string; musician_id: string; rank: number;
    musicians: { first_name: string; last_name: string; email: string; is_blacklisted: boolean } | null;
  };
  const rows = (queue ?? []) as unknown as Row[];
  if (rows.length === 0) return { sent: false, reason: 'No recipients' };

  const deadlineDays = ctx.position.response_deadline_type === 'none'
    ? 3650
    : (ctx.position.response_deadline_days ?? 2);
  const expiresAt = new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000);
  const deadlineStr = format(expiresAt, "EEEE, MMMM d, yyyy 'at' h:mm a");
  const attachments = await fetchAttachments(admin, ctx.position.template_id);

  let firstRecipient: string | null = null;
  let sentCount = 0;

  for (const raw of rows) {
    const m = raw.musicians;
    if (!m || m.is_blacklisted) continue;

    const musicianName = `${m.first_name} ${m.last_name}`;
    const token = crypto.randomUUID();

    const rendered = renderTemplate(
      { subject: ctx.template!.subject, body: ctx.template!.body },
      {
        name: m.first_name, full_name: musicianName,
        position: ctx.position.position_name,
        concert_name: ctx.concert.name,
        date: formatConcertDates(ctx.concert.dates),
        venue: ctx.concert.venue ?? '',
        deadline: deadlineStr,
        organization_name: ctx.organization.name,
      },
      { missing: 'blank' },
    );

    const responseUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/response/${token}`;
    const htmlBody =
      `<div style="white-space:pre-wrap">${rendered.body}</div>` +
      `<br><br><div>———————————————————</div>` +
      `<div>Please respond using the buttons on this page:</div>` +
      `<div><a href="${responseUrl}">→ Click here to accept or decline</a></div>` +
      `<div style="color:#888;font-size:12px">Please respond by ${deadlineStr}.</div>`;

    let sendOk = true;
    let failureReason: string | null = null;
    try {
      await sendEmail({ managerId, to: m.email, subject: rendered.subject, body: htmlBody, attachments });
    } catch (err) {
      sendOk = false;
      failureReason = err instanceof Error ? err.message : 'Unknown send error';
    }

    await admin.from('send_logs').insert({
      concert_position_id: concertPositionId,
      concert_position_musician_id: raw.id,
      musician_id: raw.musician_id,
      organization_id: ctx.organization.id,
      status: sendOk ? 'sent' : 'failed',
      token,
      token_expires_at: expiresAt.toISOString(),
      sent_at: sendOk ? new Date().toISOString() : null,
      email_subject: rendered.subject,
      email_body: htmlBody,
      manager_id: managerId,
      failure_reason: failureReason,
    });

    if (sendOk) {
      await admin.from('concert_position_musicians')
        .update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', raw.id);
      await incrementSendCount(ctx.organization.id);
      if (!firstRecipient) firstRecipient = musicianName;
      sentCount++;
    }
  }

  log('broadcastSent', { concertPositionId, sentCount });
  return { sent: sentCount > 0, firstRecipient, reason: sentCount === 0 ? 'All sends failed' : undefined };
}

/** STEP 7.2 / Function 2 — send to the next eligible musician by rank. */
export async function sendToNextMusician(
  concertPositionId: string,
  managerId: string,
  triggeredBy: 'manual' | 'decline' | 'no_response' = 'manual',
): Promise<SendResult> {
  const admin = createAdminClient();
  const ctx = await loadPositionContext(admin, concertPositionId);
  if (!ctx) return { sent: false, reason: 'Position not found' };

  const { data: queue } = await admin
    .from('concert_position_musicians')
    .select('*, musicians(first_name, last_name, email, is_blacklisted)')
    .eq('concert_position_id', concertPositionId)
    .eq('status', 'pending')
    .order('rank');

  let totalContacted = 0;
  {
    const { count } = await admin.from('concert_position_musicians')
      .select('id', { count: 'exact', head: true })
      .eq('concert_position_id', concertPositionId);
    totalContacted = count ?? 0;
  }

  // Find the next eligible contact, respecting rank ties.
  // Contacts sharing the same rank form a "tier" — within a tier, order is random.
  // We skip tiers that are fully ineligible and pick the first tier with an eligible contact.
  type Row = {
    id: string; musician_id: string; rank: number;
    musicians: { first_name: string; last_name: string; email: string; is_blacklisted: boolean } | null;
  };
  const rows = (queue ?? []) as unknown as Row[];

  // Group pending rows into tiers by rank
  const tierMap = new Map<number, Row[]>();
  for (const row of rows) {
    const bucket = tierMap.get(row.rank) ?? [];
    bucket.push(row);
    tierMap.set(row.rank, bucket);
  }
  const sortedRanks = [...tierMap.keys()].sort((a, b) => a - b);

  const skipRow = async (raw: Row, reason: string) => {
    await admin.from('concert_position_musicians')
      .update({ status: 'skipped', skip_reason: reason }).eq('id', raw.id);
    await admin.from('send_logs').insert({
      concert_position_id: concertPositionId,
      concert_position_musician_id: raw.id,
      musician_id: raw.musician_id,
      organization_id: ctx.organization.id,
      status: 'skipped',
      token: crypto.randomUUID(),
      token_expires_at: new Date().toISOString(),
      manager_id: managerId,
      failure_reason: reason,
    });
    log('skip', { concertPositionId, musicianId: raw.musician_id, reason });
  };

  let eligible: Row | null = null;

  tierLoop:
  for (const rank of sortedRanks) {
    const tier = tierMap.get(rank)!;
    // Shuffle tier so tied contacts are contacted in random order within the tier
    for (let i = tier.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tier[i], tier[j]] = [tier[j], tier[i]];
    }

    for (const raw of tier) {
      const m = raw.musicians;
      if (!m) continue;

      if (m.is_blacklisted) {
        await skipRow(raw, 'blacklisted');
        continue;
      }

      // Check availability across all concert dates
      let unavailableReason: string | null = null;
      for (const d of (ctx.concert.dates ?? []) as string[]) {
        const a = await isMusicianAvailable(raw.musician_id, d);
        if (!a.available) { unavailableReason = a.reason ?? 'unavailable'; break; }
      }
      if (unavailableReason) {
        await skipRow(raw, `unavailable: ${unavailableReason}`);
        continue;
      }

      eligible = raw;
      break tierLoop;
    }
    // All contacts in this tier were skipped — continue to next tier
  }

  if (!eligible || !eligible.musicians) {
    await admin.from('concert_positions').update({ status: 'exhausted' }).eq('id', concertPositionId);
    await notifyExhausted({
      organizationId: ctx.organization.id,
      managerId,
      positionName: ctx.position.position_name,
      concertName: ctx.concert.name,
      concertId: ctx.concert.id,
      totalContacted,
    });
    await logActivity({
      organizationId: ctx.organization.id, managerId, action: 'position_exhausted',
      entityType: 'concert_position', entityId: concertPositionId,
      details: { position_name: ctx.position.position_name, concert_name: ctx.concert.name, count: totalContacted },
    });
    log('exhausted', { concertPositionId });
    return { sent: false, reason: 'exhausted' };
  }

  const musician = eligible.musicians;
  const musicianName = `${musician.first_name} ${musician.last_name}`;

  // token + expiry
  const token = crypto.randomUUID();
  let expiresAt: Date;
  if (ctx.position.response_deadline_type === 'specific_date' && ctx.position.response_deadline_date) {
    expiresAt = new Date(ctx.position.response_deadline_date);
  } else if (ctx.position.response_deadline_type === 'none') {
    // No deadline — expire 10 years from now
    expiresAt = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000);
  } else {
    const days = ctx.position.response_deadline_days ?? 2;
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  const deadlineStr = format(expiresAt, "EEEE, MMMM d, yyyy 'at' h:mm a");
  const rendered = renderTemplate(
    { subject: ctx.template!.subject, body: ctx.template!.body },
    {
      name: musician.first_name,
      full_name: musicianName,
      position: ctx.position.position_name,
      concert_name: ctx.concert.name,
      date: formatConcertDates(ctx.concert.dates),
      venue: ctx.concert.venue ?? '',
      deadline: deadlineStr,
      organization_name: ctx.organization.name,
    },
    { missing: 'blank' },
  );

  const responseUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/response/${token}`;
  const htmlBody =
    `<div style="white-space:pre-wrap">${rendered.body}</div>` +
    `<br><br><div>———————————————————</div>` +
    `<div>Please respond using the buttons on this page:</div>` +
    `<div><a href="${responseUrl}">→ Click here to accept or decline</a></div>` +
    `<div style="color:#888;font-size:12px">Please respond by ${deadlineStr}.</div>`;

  const attachments = await fetchAttachments(admin, ctx.position.template_id);

  let sendOk = true;
  let failureReason: string | null = null;
  try {
    await sendEmail({
      managerId,
      to: musician.email,
      subject: rendered.subject,
      body: htmlBody,
      attachments,
    });
  } catch (err) {
    sendOk = false;
    failureReason = err instanceof Error ? err.message : 'Unknown send error';
  }

  // send_log
  await admin.from('send_logs').insert({
    concert_position_id: concertPositionId,
    concert_position_musician_id: eligible.id,
    musician_id: eligible.musician_id,
    organization_id: ctx.organization.id,
    status: sendOk ? 'sent' : 'failed',
    token,
    token_expires_at: expiresAt.toISOString(),
    sent_at: sendOk ? new Date().toISOString() : null,
    email_subject: rendered.subject,
    email_body: htmlBody,
    manager_id: managerId,
    failure_reason: failureReason,
  });

  if (!sendOk) {
    // Do NOT advance on failure — needs manager intervention.
    log('sendFailed', { concertPositionId, musicianId: eligible.musician_id, failureReason });
    await notifySendFailed({
      organizationId: ctx.organization.id, managerId, musicianName, musicianEmail: musician.email,
      positionName: ctx.position.position_name, concertName: ctx.concert.name,
      concertId: ctx.concert.id, failureReason: failureReason ?? 'Unknown error',
    });
    return { sent: false, reason: `Email failed to send: ${failureReason}` };
  }

  await admin.from('concert_position_musicians')
    .update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', eligible.id);

  // increment send_count atomically + monitor send limits
  const { newCount } = await incrementSendCount(ctx.organization.id);
  {
    const { data: plan } = await admin.from('plans').select('send_limit, plan_type, billing_period_start')
      .eq('organization_id', ctx.organization.id).maybeSingle();
    if (plan) {
      await checkSendLimits(ctx.organization.id, managerId, newCount, plan.send_limit ?? 0,
        plan.plan_type ?? 'starter', plan.billing_period_start ?? null);
    }
  }

  await logActivity({
    organizationId: ctx.organization.id, managerId,
    action: triggeredBy === 'manual' ? 'send_started' : 'send_next_triggered',
    entityType: 'concert_position', entityId: concertPositionId,
    details: { position_name: ctx.position.position_name, concert_name: ctx.concert.name, musician_name: musicianName },
  });
  log('sent', { concertPositionId, musicianId: eligible.musician_id, triggeredBy, token });
  return { sent: true, musicianName, token };
}

/** STEP 7.2 / Function 3 — process an accept/decline response. */
export async function processResponse(
  token: string,
  response: 'accepted' | 'declined',
): Promise<ResponseResult> {
  const admin = createAdminClient();
  const { data: sendLog } = await admin.from('send_logs').select('*').eq('token', token).maybeSingle();
  if (!sendLog) throw new Error('Invalid response link');
  if (sendLog.token_used_at) throw new Error('This link has already been used');
  if (new Date(sendLog.token_expires_at) < new Date()) throw new Error('This response link has expired');

  const now = new Date().toISOString();
  await admin.from('send_logs')
    .update({ status: response, responded_at: now, token_used_at: now })
    .eq('id', sendLog.id);
  if (sendLog.concert_position_musician_id) {
    await admin.from('concert_position_musicians')
      .update({ status: response, responded_at: now })
      .eq('id', sendLog.concert_position_musician_id);
  }

  const ctx = sendLog.concert_position_id
    ? await loadPositionContext(admin, sendLog.concert_position_id)
    : null;
  const { data: musician } = await admin.from('musicians')
    .select('first_name, last_name, email').eq('id', sendLog.musician_id).maybeSingle();
  const musicianName = musician ? `${musician.first_name} ${musician.last_name}` : 'A musician';

  if (response === 'accepted') {
    // A position may need more than one seat filled (e.g. "Violin 1: 8 seats") — only
    // close it out once enough recipients have accepted, not on the very first accept.
    let seatsRemaining = 0;
    let positionFilled = false;
    if (sendLog.concert_position_id && ctx) {
      const { count: acceptedCount } = await admin
        .from('concert_position_musicians')
        .select('id', { count: 'exact', head: true })
        .eq('concert_position_id', sendLog.concert_position_id)
        .eq('status', 'accepted');
      const needed = ctx.position.musicians_needed ?? 1;
      seatsRemaining = Math.max(0, needed - (acceptedCount ?? 0));
      positionFilled = seatsRemaining <= 0;
      if (positionFilled) {
        await admin.from('concert_positions').update({ status: 'filled' }).eq('id', sendLog.concert_position_id);
      }
    }
    if (ctx && ctx.concert.status === 'draft') {
      await admin.from('concerts').update({ status: 'active' }).eq('id', ctx.concert.id);
    }
    // Once every position on this concert is filled, mark the concert itself completed.
    if (ctx && positionFilled) {
      const { data: positions } = await admin
        .from('concert_positions').select('status').eq('concert_id', ctx.concert.id);
      const allFilled = (positions ?? []).length > 0 && (positions ?? []).every((p) => p.status === 'filled');
      if (allFilled) {
        await admin.from('concerts').update({ status: 'completed' }).eq('id', ctx.concert.id);
      }
    }
    if (ctx && sendLog.manager_id && musician) {
      await notifyAccepted({
        organizationId: ctx.organization.id,
        managerId: sendLog.manager_id,
        musicianName,
        musicianEmail: musician.email,
        positionName: ctx.position.position_name,
        concertName: ctx.concert.name,
        concertDate: formatConcertDates(ctx.concert.dates),
        concertId: ctx.concert.id,
        seatsRemaining: positionFilled ? 0 : seatsRemaining,
      });
    }

    // Broadcast mode: once every seat is filled, expire remaining pending send_logs.
    if (ctx && ctx.position.send_mode === 'broadcast' && positionFilled) {
      const { data: otherLogs } = await admin
        .from('send_logs')
        .select('id, token, musician_id')
        .eq('concert_position_id', sendLog.concert_position_id)
        .eq('status', 'sent')
        .neq('id', sendLog.id);

      if (otherLogs && otherLogs.length > 0) {
        // Expire their tokens
        await admin.from('send_logs')
          .update({ token_used_at: new Date().toISOString(), status: 'skipped', skip_reason: 'position_filled_by_other' })
          .in('id', otherLogs.map((l) => l.id));

        // Also update concert_position_musicians status
        await admin.from('concert_position_musicians')
          .update({ status: 'skipped', skip_reason: 'position_filled_by_other' })
          .eq('concert_position_id', sendLog.concert_position_id)
          .eq('status', 'sent')
          .neq('musician_id', sendLog.musician_id);

        // Send "position filled" courtesy email to each other recipient
        const filledMessage = ctx.concert.filled_message ||
          `Thank you for considering this opportunity. Someone else has accepted the position, so we're all set for now. We truly appreciate your time and will keep you in mind for future opportunities.`;

        for (const other of otherLogs) {
          const { data: otherMusician } = await admin
            .from('musicians').select('first_name, last_name, email').eq('id', other.musician_id).maybeSingle();
          if (!otherMusician) continue;
          const filledUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/response/${other.token}`;
          const body =
            `<p>Hi ${otherMusician.first_name},</p>` +
            `<p>${filledMessage}</p>` +
            `<p style="color:#888;font-size:12px">This link is no longer active. <a href="${filledUrl}">View status</a></p>`;
          try {
            await sendEmail({
              managerId: sendLog.manager_id,
              to: otherMusician.email,
              subject: `Position filled — ${ctx.concert.name}`,
              body,
            });
          } catch {
            // Best-effort; don't fail the whole accept flow
          }
        }
      }
    }

    // Cascade mode: if seats remain open, keep advancing to the next musician on the list —
    // mirrors the decline auto-resend path below.
    if (ctx && ctx.position.send_mode !== 'broadcast' && !positionFilled
        && ctx.position.auto_resend_enabled && sendLog.manager_id && sendLog.concert_position_id) {
      await sendToNextMusician(sendLog.concert_position_id, sendLog.manager_id, 'decline');
    }

    if (ctx) {
      await logActivity({
        organizationId: ctx.organization.id, managerId: sendLog.manager_id, action: 'send_accepted',
        entityType: 'concert_position', entityId: ctx.position.id,
        details: { musician_name: musicianName, position_name: ctx.position.position_name, concert_name: ctx.concert.name },
      });
      await logActivity({
        organizationId: ctx.organization.id, managerId: sendLog.manager_id, action: 'position_filled',
        entityType: 'concert_position', entityId: ctx.position.id,
        details: { musician_name: musicianName, position_name: ctx.position.position_name, concert_name: ctx.concert.name },
      });
    }
    log('accepted', { token, musicianId: sendLog.musician_id });
    return { success: true, action: 'accepted' };
  }

  // declined
  let nextMusicianName: string | null = null;
  let autoSentToNext = false;
  if (ctx && ctx.position.auto_resend_enabled && sendLog.manager_id && sendLog.concert_position_id) {
    const next = await sendToNextMusician(sendLog.concert_position_id, sendLog.manager_id, 'decline');
    autoSentToNext = true;
    nextMusicianName = next.musicianName ?? null;
  }
  if (ctx && sendLog.manager_id) {
    await notifyDeclined({
      organizationId: ctx.organization.id,
      managerId: sendLog.manager_id,
      musicianName,
      positionName: ctx.position.position_name,
      concertName: ctx.concert.name,
      concertId: ctx.concert.id,
      nextMusicianName,
      autoSentToNext,
    });
  }
  if (ctx) {
    await logActivity({
      organizationId: ctx.organization.id, managerId: sendLog.manager_id, action: 'send_declined',
      entityType: 'concert_position', entityId: ctx.position.id,
      details: { musician_name: musicianName, position_name: ctx.position.position_name, concert_name: ctx.concert.name },
    });
  }
  log('declined', { token, musicianId: sendLog.musician_id, autoSentToNext });
  return { success: true, action: 'declined' };
}

/** STEP 7.2 / Function 4 — handle a send whose deadline passed with no reply. */
export async function processNoResponse(sendLogId: string): Promise<NoResponseResult> {
  const admin = createAdminClient();
  const { data: sendLog } = await admin.from('send_logs').select('*').eq('id', sendLogId).maybeSingle();
  if (!sendLog || sendLog.status !== 'sent') return { ok: false, advanced: false };

  await admin.from('send_logs').update({ status: 'no_response' }).eq('id', sendLogId);
  if (sendLog.concert_position_musician_id) {
    await admin.from('concert_position_musicians')
      .update({ status: 'no_response' }).eq('id', sendLog.concert_position_musician_id);
  }

  const ctx = sendLog.concert_position_id
    ? await loadPositionContext(admin, sendLog.concert_position_id)
    : null;
  if (!ctx || !sendLog.manager_id || !sendLog.concert_position_id) return { ok: true, advanced: false };

  const { data: musician } = await admin.from('musicians')
    .select('first_name, last_name').eq('id', sendLog.musician_id).maybeSingle();
  const musicianName = musician ? `${musician.first_name} ${musician.last_name}` : 'A musician';

  let nextMusicianName: string | null = null;
  let autoSentToNext = false;
  if (ctx.position.auto_resend_enabled) {
    const next = await sendToNextMusician(sendLog.concert_position_id, sendLog.manager_id, 'no_response');
    autoSentToNext = true;
    nextMusicianName = next.musicianName ?? null;
  }
  await notifyNoResponse({
    organizationId: ctx.organization.id,
    managerId: sendLog.manager_id,
    musicianName,
    positionName: ctx.position.position_name,
    concertName: ctx.concert.name,
    concertId: ctx.concert.id,
    nextMusicianName,
    autoSentToNext,
  });
  await logActivity({
    organizationId: ctx.organization.id, managerId: sendLog.manager_id, action: 'send_no_response',
    entityType: 'concert_position', entityId: ctx.position.id,
    details: { musician_name: musicianName, position_name: ctx.position.position_name, concert_name: ctx.concert.name },
  });
  log('noResponse', { sendLogId, autoSentToNext });
  return { ok: true, advanced: autoSentToNext };
}

/** STEP 7.2 / Function 5 — manager manually triggers the next send. */
export async function triggerNextManually(
  concertPositionId: string,
  managerId: string,
): Promise<StartResult> {
  const admin = createAdminClient();
  const ctx = await loadPositionContext(admin, concertPositionId);
  if (!ctx) return { ok: false, error: 'Position not found' };
  if (ctx.position.status !== 'active') {
    return { ok: false, error: 'This position is not currently sending' };
  }

  // Don't advance while a send is still awaiting response.
  const { data: pending } = await admin
    .from('send_logs')
    .select('token_expires_at, musician_id')
    .eq('concert_position_id', concertPositionId)
    .eq('status', 'sent')
    .limit(1);
  if (pending && pending.length > 0) {
    const { data: m } = await admin.from('musicians')
      .select('first_name, last_name').eq('id', pending[0].musician_id).maybeSingle();
    const name = m ? `${m.first_name} ${m.last_name}` : 'the current musician';
    const deadline = format(new Date(pending[0].token_expires_at), "MMM d 'at' h:mm a");
    return {
      ok: false,
      error: `Still waiting for a response from ${name}. Their deadline is ${deadline}. ` +
        `You can wait for them to respond or for their deadline to pass.`,
    };
  }

  const result = await sendToNextMusician(concertPositionId, managerId, 'manual');
  if (!result.sent) return { ok: true, sent: false, reason: result.reason };
  return { ok: true, sent: true, musicianName: result.musicianName };
}
