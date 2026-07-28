import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentManager } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-server';

const addSchema = z.object({
  musician_id: z.string().uuid(),
});

const reorderSchema = z.object({
  members: z.array(z.object({ id: z.string().uuid(), rank: z.number().int().min(0) })),
});

async function verifyPositionOwnership(positionId: string) {
  const ctx = await getCurrentManager();
  if (!ctx) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: position } = await admin
    .from('position_definitions')
    .select('id')
    .eq('id', positionId)
    .eq('organization_id', ctx.organization.id)
    .single();
  if (!position) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { ctx, admin };
}

// GET /api/positions-library/[id]/members — ranked contacts for this position
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await verifyPositionOwnership(params.id);
  if (res.error) return res.error;
  const { admin } = res;

  const { data: members, error } = await admin!
    .from('position_definition_members')
    .select('id, musician_id, rank, musicians(id, first_name, last_name, email, is_blacklisted)')
    .eq('position_definition_id', params.id)
    .order('rank');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: members ?? [] });
}

// POST /api/positions-library/[id]/members — add a contact
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await verifyPositionOwnership(params.id);
  if (res.error) return res.error;
  const { admin } = res;

  let body;
  try { body = addSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  const { data: existing } = await admin!
    .from('position_definition_members')
    .select('rank')
    .eq('position_definition_id', params.id)
    .order('rank', { ascending: false })
    .limit(1);
  const nextRank = (existing?.[0]?.rank ?? -1) + 1;

  const { data, error } = await admin!
    .from('position_definition_members')
    .insert({ position_definition_id: params.id, musician_id: body.musician_id, rank: nextRank })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'This contact is already in the list' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ member: data }, { status: 201 });
}

// PATCH /api/positions-library/[id]/members — reorder
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await verifyPositionOwnership(params.id);
  if (res.error) return res.error;
  const { admin } = res;

  let body;
  try { body = reorderSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  await Promise.all(
    body.members.map(({ id, rank }) =>
      admin!.from('position_definition_members').update({ rank }).eq('id', id).eq('position_definition_id', params.id)
    )
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/positions-library/[id]/members?memberId=xxx
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await verifyPositionOwnership(params.id);
  if (res.error) return res.error;
  const { admin } = res;

  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });

  const { error } = await admin!
    .from('position_definition_members')
    .delete()
    .eq('id', memberId)
    .eq('position_definition_id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
