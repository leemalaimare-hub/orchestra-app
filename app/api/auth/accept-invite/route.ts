import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
import { createRouteClient } from '@/lib/supabase-route';

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).optional(), // required only for new users
});

export async function POST(req: NextRequest) {
  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  const admin = createAdminClient();
  const route = createRouteClient();

  const { data: invite } = await admin.from('manager_invites').select('*').eq('token', body.token).maybeSingle();
  if (!invite) return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 });
  if (invite.accepted_at) return NextResponse.json({ error: 'Invite already used' }, { status: 410 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Invite expired' }, { status: 410 });

  // Find existing auth user by email, or create one
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = existing.users.find((u) => u.email?.toLowerCase() === invite.email.toLowerCase());
  let isNewUser = false;
  if (!user) {
    if (!body.password) return NextResponse.json({ error: 'Password required for new account' }, { status: 400 });
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: invite.email,
      password: body.password,
      email_confirm: true,
    });
    if (createErr || !created.user) return NextResponse.json({ error: createErr?.message || 'Failed to create user' }, { status: 500 });
    user = created.user;
    isNewUser = true;
  }

  // Create or activate the manager row
  const { data: mgrExisting } = await admin.from('managers')
    .select('id').eq('organization_id', invite.organization_id).eq('email', invite.email).maybeSingle();
  if (mgrExisting) {
    await admin.from('managers').update({ user_id: user.id, status: 'active', role: invite.role }).eq('id', mgrExisting.id);
  } else {
    await admin.from('managers').insert({
      organization_id: invite.organization_id,
      user_id: user.id,
      email: invite.email,
      role: invite.role,
      status: 'active',
    });
  }

  await admin.from('manager_invites').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id);

  // Sign the user in via cookie session
  if (isNewUser && body.password) {
    await route.auth.signInWithPassword({ email: invite.email, password: body.password });
  }

  return NextResponse.json({ ok: true, requiresLogin: !isNewUser });
}

export async function GET(req: NextRequest) {
  // Pre-fetch invite metadata so the accept-invite page can show the org name.
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const admin = createAdminClient();
  const { data: invite } = await admin.from('manager_invites').select('*').eq('token', token).maybeSingle();
  if (!invite) return NextResponse.json({ error: 'Invalid invite' }, { status: 404 });
  if (invite.accepted_at) return NextResponse.json({ error: 'Invite already used' }, { status: 410 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Invite expired' }, { status: 410 });

  const { data: org } = await admin.from('organizations').select('name').eq('id', invite.organization_id).single();
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const isExistingUser = existing.users.some((u) => u.email?.toLowerCase() === invite.email.toLowerCase());

  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    organization_name: org?.name ?? '',
    is_existing_user: isExistingUser,
  });
}
