import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Signups are disabled during private beta
const SIGNUPS_OPEN = false;
import { createAdminClient } from '@/lib/supabase-server';
import { createRouteClient } from '@/lib/supabase-route';
import { trialEndsAt, PLAN_CONFIG } from '@/lib/plans';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  organization_name: z.string().min(1).max(120),
});

export async function POST(req: NextRequest) {
  if (!SIGNUPS_OPEN) {
    return NextResponse.json({ error: 'Signups are currently closed. Contact hello@callscade.com for early access.' }, { status: 403 });
  }
  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) {
    return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 });
  }

  const supabase = createRouteClient();
  const admin = createAdminClient();

  // 1. Create auth user (signs them in via cookie)
  const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
    email: body.email,
    password: body.password,
  });
  if (signUpErr || !signUp.user) {
    const msg = signUpErr?.message ?? 'Signup failed';
    const status = /already registered|already in use/i.test(msg) ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
  const userId = signUp.user.id;

  // 2-4. Org → manager (admin) → plan. Use service-role for inserts; cleanup on failure.
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name: body.organization_name, onboarding_step: 1 })
    .select()
    .single();
  if (orgErr || !org) {
    return NextResponse.json({ error: 'Failed to create organization', details: orgErr?.message }, { status: 500 });
  }

  const { error: mgrErr } = await admin.from('managers').insert({
    organization_id: org.id,
    user_id: userId,
    email: body.email,
    role: 'admin',
    status: 'active',
  });
  if (mgrErr) {
    await admin.from('organizations').delete().eq('id', org.id);
    return NextResponse.json({ error: 'Failed to create manager', details: mgrErr.message }, { status: 500 });
  }

  const { error: planErr } = await admin.from('plans').insert({
    organization_id: org.id,
    plan_type: 'starter',
    send_limit: PLAN_CONFIG.starter.sendLimit,
    status: 'trialing',
    trial_ends_at: trialEndsAt(),
  });
  if (planErr) {
    await admin.from('managers').delete().eq('organization_id', org.id);
    await admin.from('organizations').delete().eq('id', org.id);
    return NextResponse.json({ error: 'Failed to create plan', details: planErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, organization_id: org.id });
}
