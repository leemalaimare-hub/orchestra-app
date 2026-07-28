// Notification service — in-app notifications + Resend system emails.
// System emails ALWAYS go via Resend, never the manager's Gmail/Outlook.
import 'server-only';
import { sendEmail as sendSystemEmail } from './resend';
import { createAdminClient } from './supabase-server';
import type { NotificationPreferences } from '@/types';

function fromAddress(): string {
  return process.env.NOTIFY_FROM_EMAIL || 'Callscade <onboarding@resend.dev>';
}
function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

// ---------- email rendering ----------
interface EmailButton { label: string; url: string; }

function renderEmail(title: string, paragraphs: string[], buttons: EmailButton[]): { html: string; text: string } {
  const html = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <p style="font-weight:700;color:#4f46e5;font-size:18px;margin:0 0 16px">Callscade</p>
      <h1 style="font-size:18px;color:#0f172a;margin:0 0 12px">${title}</h1>
      ${paragraphs.map((p) => `<p style="color:#334155;font-size:14px;line-height:1.6;margin:0 0 10px">${p}</p>`).join('')}
      <div style="margin-top:16px">
        ${buttons.map((b) => `<a href="${b.url}" style="display:inline-block;margin-right:8px;padding:9px 14px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-size:14px">${b.label}</a>`).join('')}
      </div>
    </div>`;
  const text = `${title}\n\n${paragraphs.join('\n\n')}\n\n${buttons.map((b) => `${b.label}: ${b.url}`).join('\n')}`;
  return { html, text };
}

// ---------- preferences ----------
const DEFAULT_PREFS = {
  accepted_email: true, accepted_inapp: true,
  declined_email: true, declined_inapp: true,
  no_response_email: true, no_response_inapp: true,
  exhausted_email: true, exhausted_inapp: true,
  limit_warning_email: true, limit_warning_inapp: true,
};

export async function getOrCreatePreferences(managerId: string): Promise<NotificationPreferences> {
  const admin = createAdminClient();
  const { data } = await admin.from('notification_preferences').select('*').eq('manager_id', managerId).maybeSingle();
  if (data) return data as NotificationPreferences;
  const { data: created } = await admin
    .from('notification_preferences')
    .insert({ manager_id: managerId, ...DEFAULT_PREFS })
    .select()
    .single();
  return created as NotificationPreferences;
}

// Maps a notification type to its preference channels. Critical alerts always send.
function channelsFor(prefs: NotificationPreferences, type: string): { email: boolean; inapp: boolean } {
  switch (type) {
    case 'send_accepted': return { email: prefs.accepted_email, inapp: prefs.accepted_inapp };
    case 'send_declined': return { email: prefs.declined_email, inapp: prefs.declined_inapp };
    case 'send_no_response': return { email: prefs.no_response_email, inapp: prefs.no_response_inapp };
    case 'position_exhausted': return { email: prefs.exhausted_email, inapp: prefs.exhausted_inapp };
    case 'send_limit_warning':
    case 'send_limit_reached': return { email: prefs.limit_warning_email, inapp: prefs.limit_warning_inapp };
    // critical — cannot be disabled
    case 'send_failed':
    case 'trial_ending':
    case 'payment_failed':
    default: return { email: true, inapp: true };
  }
}

async function managerInfo(managerId: string): Promise<{ email: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin.from('managers').select('email').eq('id', managerId).maybeSingle();
  return data ?? null;
}

// ---------- core in-app notification creators ----------
export async function createNotification(params: {
  organizationId: string;
  managerId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('notifications').insert({
      organization_id: params.organizationId,
      manager_id: params.managerId,
      type: params.type,
      title: params.title,
      message: params.message,
      action_url: params.actionUrl ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (err) {
    console.error('[notifications] createNotification failed:', err);
  }
}

export async function createNotificationsForAllManagers(params: {
  organizationId: string;
  excludeManagerId?: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: managers } = await admin
      .from('managers').select('id').eq('organization_id', params.organizationId).eq('status', 'active');
    for (const m of managers ?? []) {
      if (params.excludeManagerId && m.id === params.excludeManagerId) continue;
      await createNotification({ ...params, managerId: m.id });
    }
  } catch (err) {
    console.error('[notifications] createNotificationsForAllManagers failed:', err);
  }
}

/** Sends an email + in-app notification for a single manager, honoring preferences. */
async function dispatch(params: {
  organizationId: string;
  managerId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  emailSubject: string;
  emailParagraphs: string[];
  emailButtons: EmailButton[];
  replyTo?: string;
}): Promise<void> {
  try {
    const prefs = await getOrCreatePreferences(params.managerId);
    const channels = channelsFor(prefs, params.type);

    if (channels.email) {
      const mgr = await managerInfo(params.managerId);
      if (mgr) {
        const { html, text } = renderEmail(params.title, params.emailParagraphs, params.emailButtons);
        try {
          await sendSystemEmail({
            from: fromAddress(), to: mgr.email, reply_to: params.replyTo,
            subject: params.emailSubject, html, text,
          });
        } catch (err) {
          console.error('[notifications] email send failed:', err);
        }
      }
    }
    if (channels.inapp) {
      await createNotification({
        organizationId: params.organizationId,
        managerId: params.managerId,
        type: params.type,
        title: params.title,
        message: params.message,
        actionUrl: params.actionUrl,
        metadata: params.metadata,
      });
    }
  } catch (err) {
    console.error('[notifications] dispatch failed:', err);
  }
}

const concertUrl = (id: string) => `${appUrl()}/dashboard/email/view/${id}`;

// ---------- send-event notifications ----------
export async function notifyAccepted(params: {
  organizationId: string; managerId: string; musicianName: string; musicianEmail: string;
  positionName: string; concertName: string; concertDate: string; concertId: string;
  seatsRemaining?: number;
}): Promise<void> {
  const stillOpen = (params.seatsRemaining ?? 0) > 0;
  const seatsNote = stillOpen
    ? ` ${params.seatsRemaining} seat${params.seatsRemaining === 1 ? '' : 's'} still open for this position.`
    : '';
  await dispatch({
    organizationId: params.organizationId,
    managerId: params.managerId,
    type: 'send_accepted',
    title: stillOpen
      ? `${params.positionName} — accepted, ${params.seatsRemaining} seat${params.seatsRemaining === 1 ? '' : 's'} left — ${params.concertName}`
      : `${params.positionName} filled — ${params.concertName}`,
    message: `${params.musicianName} has accepted.${seatsNote}`,
    actionUrl: `/dashboard/email/view/${params.concertId}`,
    metadata: { musicianName: params.musicianName, musicianEmail: params.musicianEmail,
      positionName: params.positionName, concertName: params.concertName },
    emailSubject: stillOpen
      ? `✓ ${params.concertName} — ${params.musicianName} accepted ${params.positionName}`
      : `✓ ${params.concertName} — ${params.positionName} has been filled`,
    emailParagraphs: [
      'Great news!',
      `${params.musicianName} has accepted the ${params.positionName} position for ${params.concertName} on ${params.concertDate}.${seatsNote}`,
      'You can reply directly to this email to contact them.',
    ],
    emailButtons: [{ label: 'View Concert', url: concertUrl(params.concertId) }],
    replyTo: params.musicianEmail,
  });
}

function autoSentParagraph(autoSentToNext: boolean, nextMusicianName: string | null): string {
  if (autoSentToNext && nextMusicianName) return `An email has automatically been sent to ${nextMusicianName}.`;
  if (autoSentToNext && !nextMusicianName) return 'There are no more musicians on the list. All available musicians have been contacted.';
  return 'Log in to send to the next musician on the list.';
}

export async function notifyDeclined(params: {
  organizationId: string; managerId: string; musicianName: string;
  positionName: string; concertName: string; concertId: string;
  nextMusicianName: string | null; autoSentToNext: boolean;
}): Promise<void> {
  const inappMsg = params.autoSentToNext
    ? (params.nextMusicianName ? `Email sent to ${params.nextMusicianName}.` : 'No more musicians on the list.')
    : 'Action required: send to next musician.';
  await dispatch({
    organizationId: params.organizationId,
    managerId: params.managerId,
    type: 'send_declined',
    title: `${params.musicianName} declined ${params.positionName} — ${params.concertName}`,
    message: inappMsg,
    actionUrl: `/dashboard/email/view/${params.concertId}`,
    emailSubject: `${params.concertName} — ${params.musicianName} declined ${params.positionName}`,
    emailParagraphs: [
      `${params.musicianName} has declined the ${params.positionName} position for ${params.concertName}.`,
      autoSentParagraph(params.autoSentToNext, params.nextMusicianName),
    ],
    emailButtons: [{ label: 'View Concert', url: concertUrl(params.concertId) }],
  });
}

export async function notifyNoResponse(params: {
  organizationId: string; managerId: string; musicianName: string;
  positionName: string; concertName: string; concertId: string;
  nextMusicianName: string | null; autoSentToNext: boolean;
}): Promise<void> {
  const inappMsg = params.autoSentToNext
    ? (params.nextMusicianName ? `Email sent to ${params.nextMusicianName}.` : 'No more musicians on the list.')
    : 'Action required: send to next musician.';
  await dispatch({
    organizationId: params.organizationId,
    managerId: params.managerId,
    type: 'send_no_response',
    title: `No response from ${params.musicianName} — ${params.concertName}`,
    message: inappMsg,
    actionUrl: `/dashboard/email/view/${params.concertId}`,
    emailSubject: `${params.concertName} — No response from ${params.musicianName} for ${params.positionName}`,
    emailParagraphs: [
      `${params.musicianName} did not respond to the ${params.positionName} request for ${params.concertName} by the deadline.`,
      autoSentParagraph(params.autoSentToNext, params.nextMusicianName),
    ],
    emailButtons: [{ label: 'View Concert', url: concertUrl(params.concertId) }],
  });
}

export async function notifyExhausted(params: {
  organizationId: string; managerId: string; positionName: string;
  concertName: string; concertId: string; totalContacted: number;
}): Promise<void> {
  await dispatch({
    organizationId: params.organizationId,
    managerId: params.managerId,
    type: 'position_exhausted',
    title: `No musicians available — ${params.positionName} for ${params.concertName}`,
    message: `All ${params.totalContacted} musicians contacted. None available.`,
    actionUrl: `/dashboard/email/view/${params.concertId}`,
    emailSubject: `⚠ ${params.concertName} — No musicians available for ${params.positionName}`,
    emailParagraphs: [
      `All ${params.totalContacted} musicians on your list for ${params.positionName} have been contacted for ${params.concertName}, but none are available.`,
      'You may need to find a musician outside your current list or add more musicians to your list.',
    ],
    emailButtons: [
      { label: 'View Concert', url: concertUrl(params.concertId) },
      { label: 'Manage Musicians', url: `${appUrl()}/dashboard/musicians` },
    ],
  });
}

export async function notifySendFailed(params: {
  organizationId: string; managerId: string; musicianName: string; musicianEmail: string;
  positionName: string; concertName: string; concertId: string; failureReason: string;
}): Promise<void> {
  await dispatch({
    organizationId: params.organizationId,
    managerId: params.managerId,
    type: 'send_failed',
    title: `Email failed to send — ${params.concertName}`,
    message: `Could not reach ${params.musicianName}. Check your email connection.`,
    actionUrl: '/dashboard/settings/email',
    emailSubject: `⚠ Email failed to send — ${params.concertName} ${params.positionName}`,
    emailParagraphs: [
      `An email to ${params.musicianName} (${params.musicianEmail}) failed to send for the ${params.positionName} position for ${params.concertName}.`,
      `Error: ${params.failureReason}`,
      'Please check your email connection in Settings and try again.',
    ],
    emailButtons: [
      { label: 'Check Email Settings', url: `${appUrl()}/dashboard/settings/email` },
      { label: 'View Concert', url: concertUrl(params.concertId) },
    ],
  });
}

// ---------- billing / account notifications ----------
export async function notifyTrialEnding(params: {
  organizationId: string; managerId: string; daysRemaining: number; planType: string;
}): Promise<void> {
  await dispatch({
    organizationId: params.organizationId,
    managerId: params.managerId,
    type: 'trial_ending',
    title: `Trial ends in ${params.daysRemaining} days`,
    message: 'Add a payment method to continue without interruption.',
    actionUrl: '/dashboard/settings/billing',
    emailSubject: `Your Callscade trial ends in ${params.daysRemaining} days`,
    emailParagraphs: [
      `Your free trial of Callscade ${params.planType} ends in ${params.daysRemaining} days.`,
      'To continue using Callscade without interruption, please add a payment method.',
    ],
    emailButtons: [{ label: 'Add Payment Method', url: `${appUrl()}/dashboard/settings/billing` }],
  });
}

export async function notifyPaymentFailed(params: {
  organizationId: string; managerId: string; planType: string;
}): Promise<void> {
  await dispatch({
    organizationId: params.organizationId,
    managerId: params.managerId,
    type: 'payment_failed',
    title: 'Payment failed — Action required',
    message: 'Update your payment method to avoid service interruption.',
    actionUrl: '/dashboard/settings/billing',
    emailSubject: '⚠ Payment failed — Action required',
    emailParagraphs: [
      `We were unable to process your payment for Callscade ${params.planType}.`,
      'Please update your payment method to avoid service interruption.',
    ],
    emailButtons: [{ label: 'Update Payment Method', url: `${appUrl()}/dashboard/settings/billing` }],
  });
}

export async function notifySendLimitWarning(params: {
  organizationId: string; managerId: string; sendCount: number; sendLimit: number; planType: string;
}): Promise<void> {
  await dispatch({
    organizationId: params.organizationId,
    managerId: params.managerId,
    type: 'send_limit_warning',
    title: '80% of monthly sends used',
    message: `${params.sendCount} of ${params.sendLimit} sends used. Upgrade for more.`,
    actionUrl: '/dashboard/settings/billing',
    emailSubject: "You've used 80% of your monthly sends",
    emailParagraphs: [
      `You have used ${params.sendCount} of your ${params.sendLimit} monthly sends on the ${params.planType} plan.`,
      'Upgrade to Pro to get 3,000 sends per month.',
    ],
    emailButtons: [{ label: 'Upgrade Plan', url: `${appUrl()}/dashboard/settings/billing` }],
  });
}

export async function notifySendLimitReached(params: {
  organizationId: string; managerId: string; planType: string;
}): Promise<void> {
  await dispatch({
    organizationId: params.organizationId,
    managerId: params.managerId,
    type: 'send_limit_reached',
    title: 'Monthly send limit reached',
    message: 'Overage charges apply. Upgrade for more sends.',
    actionUrl: '/dashboard/settings/billing',
    emailSubject: '⚠ Monthly send limit reached',
    emailParagraphs: [
      `You have reached your monthly send limit on the ${params.planType} plan.`,
      'Additional sends will be charged at $10 per 1,000 sends, or upgrade to Pro for 3,000 sends per month.',
    ],
    emailButtons: [{ label: 'Upgrade Plan', url: `${appUrl()}/dashboard/settings/billing` }],
  });
}
