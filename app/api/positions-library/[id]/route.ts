import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentManager } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-server';

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  section: z.string().max(120).nullable().optional(),
  default_group_id: z.string().uuid().nullable().optional(),
});

async function loadOwnedPosition(id: string) {
  const ctx = await getCurrentManager();
  if (!ctx) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: position, error } = await admin
    .from('position_definitions')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organization.id)
    .single();
  if (error || !position) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { ctx, admin, position };
}

// PUT /api/positions-library/[id]
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await loadOwnedPosition(params.id);
  if (res.error) return res.error;
  const { admin } = res;

  let body;
  try { body = updateSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  const { data, error } = await admin!
    .from('position_definitions')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ position: data });
}

// DELETE /api/positions-library/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await loadOwnedPosition(params.id);
  if (res.error) return res.error;
  const { admin } = res;

  const { error } = await admin!.from('position_definitions').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
