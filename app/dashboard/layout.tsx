import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentManager } from '@/lib/auth';
import { daysRemaining } from '@/lib/plans';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { AnalyticsProvider } from '@/components/providers/AnalyticsProvider';

export const metadata: Metadata = { title: 'Dashboard — Callscade' };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentManager();
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
