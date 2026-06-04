import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { createAdminClient } from '@/lib/supabase-server';
import { resetBillingPeriod } from '@/lib/usage';
import { chargeOverage } from '@/lib/overageBilling';
import { sendEmail } from '@/lib/resend';

export const runtime = 'nodejs';

// GET /api/cron/reset-billing — runs on the 1st of each month (Vercel Cron).
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: plans } = await admin
    .from('plans')
    .select('organization_id, billing_period_end, overage_count, plan_type, send_count, send_limit');

  let processed = 0;
  let overageCharged = 0;
  const nowIso = new Date().toISOString();

  for (const plan of plans ?? []) {
    if (!plan.billing_period_end || plan.billing_period_end > nowIso) continue;
    try {
      if ((plan.overage_count ?? 0) > 0) {
        const result = await chargeOverage(plan.organization_id);
        if (result.charged) overageCharged += 1;
      }
      await resetBillingPeriod(plan.organization_id);
      processed += 1;

      // Usage summary email to admin managers
      const { data: admins } = await admin
        .from('managers').select('email')
        .eq('organization_id', plan.organization_id).eq('role', 'admin').eq('status', 'active');
      const month = new Date().toLocaleString('en-US', { month: 'long' });
      const overageLine = (plan.overage_count ?? 0) > 0
        ? `<p>Overage sends: ${plan.overage_count} — charged on your next invoice.</p>`
        : '<p>No overage charges this month.</p>';
      for (const a of admins ?? []) {
        try {
          await sendEmail({
            from: process.env.NOTIFY_FROM_EMAIL || 'Callscade <onboarding@resend.dev>',
            to: a.email,
            subject: `Callscade — Your ${month} usage summary`,
            html: `<p>Here's your usage summary for ${month}:</p>
              <p>Sends used: ${plan.send_count ?? 0} of ${plan.send_limit ?? 0}</p>
              ${overageLine}
              <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing">View detailed usage history</a></p>`,
          });
        } catch { /* ignore individual email failures */ }
      }
    } catch (err) {
      console.error(`[cron reset-billing] org ${plan.organization_id} failed:`, err);
    }
  }

  console.log(`[cron] reset-billing processed=${processed} overageCharged=${overageCharged}`);
  return NextResponse.json({ processed, overageCharged });
}
