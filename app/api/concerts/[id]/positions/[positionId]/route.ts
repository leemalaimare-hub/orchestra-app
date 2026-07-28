import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { loadOwnedPosition } from '@/lib/concertAuth';

const updateSchema = z.object({
  position_name: z.string().min(1).max(120).optional(),
  musicians_needed: z.number().int().min(1).max(20).optional(),
  template_id: z.string().uuid().nullable().optional(),
  response_deadline_type: z.enum(['days', 'specific_date']).optional(),
  response_deadline_days: z.number().int().min(0).max(60).nullable().optional(),
  response_deadline_date: z.string().nullable().optional(),
  auto_resend_enabled: z.boolean().optional(),
  auto_resend_days: z.number().int().min(0).max(60).nullable().optional(),
  send_mode: z.enum(['cascade', 'broadcast']).optional(),
  position_group_label: z.string().max(120).nullable().optional(),
  pay_rate_id: z.string().uuid().nullable().optional(),
  status: z.enum(['pending', 'active', 'filled', 'exhausted', 'cancelled']).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string; positionId: string } }) {
  const { error, admin, position } = await loadOwnedPosition(params.id, params.positionId);
  if (error) return error;

  const { data: musicians } = await admin!
    .from('concert_position_musicians')
    .select('*, musicians(first_name, last_name, email, is_blacklisted)')
    .eq('concert_position_id', params.positionId)
    .order('rank');

  return NextResponse.json({ position: { ...position, musicians: musicians ?? [] } });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string; positionId: string } }) {
  const { error, admin } = await loadOwnedPosition(params.id, params.positionId);
  if (error) return error;

  let body;
  try { body = updateSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  const { data, error: updErr } = await admin!
    .from('concert_positions')
    .update(body)
    .eq('id', params.positionId)
    .select()
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ position: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; positionId: string } }) {
  const { error, admin, position } = await loadOwnedPosition(params.id, params.positionId);
  if (error) return error;

  if (position!.status !== 'pending') {
    return NextResponse.json({ error: 'Only positions that have not started sending can be deleted' }, { status: 409 });
  }
  const { error: delErr } = await admin!.from('concert_positions').delete().eq('id', params.positionId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
