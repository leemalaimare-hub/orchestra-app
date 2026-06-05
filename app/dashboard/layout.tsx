import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentManager } from '@/lib/auth';
import { daysRemaining } from '@/lib/plans';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { AnalyticsProvider } from '@/components/providers/AnalyticsProvider';

export const metadata: Metadata = { title: 'Dashboard — Callscade' };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // TEMP DEBUG: surface the real error instead of the generic boundary
  let ctx;
  try {
    ctx = await getCurrentManager();
  } catch (e: unknown) {
    // Re-throw Next.js internal redirect/notFound signals so they still work
    const digest = (e as { digest?: string })?.digest;
    if (typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND')) {
      throw e;
    }
    const msg = e instanceof Error ? `${e.message}\n\n${e.stack ?? ''}` : String(e);
    return (
      <div style={{ padding: 24, fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#b91c1c' }}>
        <strong>DASHBOARD DEBUG — getCurrentManager threw:</strong>{'\n\n'}{msg}
      </div>
    );
  }
  if (!ctx) redirect('/auth/login');

  const { organization, plan, manager } = ctx;
  if (!organization.onboarding_completed) redirect('/onboarding');

  const trialDaysLeft = plan.status === 'trialing' ? daysRemaining(plan.trial_ends_at) : null;
  const sendLimitReached = (plan.send_count ?? 0) >= (plan.send_limit ?? 0) && (plan.send_limit ?? 0) > 0;

  return (
    <DashboardShell
      organizationName={organization.name}
      logoUrl={organization.logo_url}
      managerEmail={manager.email}
      trialDaysLeft={trialDaysLeft}
      paymentFailed={!!(plan as { payment_failed?: boolean }).payment_failed}
      sendLimitReached={sendLimitReached}
    >
      <AnalyticsProvider userId={ctx.session.user.id} />
      {children}
    </DashboardShell>
  );
}
