import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { loadOwnedConcert } from '@/lib/concertAuth';
import { logActivity } from '@/lib/activityLogger';

const schema = z.object({
  position_name: z.string().min(1).max(120),
  musicians_needed: z.number().int().min(1).max(20),
  template_id: z.string().uuid().nullable().optional(),
  response_deadline_type: z.enum(['days', 'specific_date']),
  response_deadline_days: z.number().int().min(0).max(60).nullable().optional(),
  response_deadline_date: z.string().nullable().optional(),
  auto_resend_enabled: z.boolean(),
  auto_resend_days: z.number().int().min(0).max(60).nullable().optional(),
  send_mode: z.enum(['cascade', 'broadcast']).optional().default('cascade'),
  position_group_label: z.string().max(120).nullable().optional(),
  pay_rate_id: z.string().uuid().nullable().optional(),
  // Ordered musician list from the modal (after manual reorder/removal).
  // If omitted, the org master list for position_name is snapshotted.
  musician_ids: z.array(z.string().uuid()).optional(),
});

// POST /api/concerts/[id]/positions — create a position and snapshot its musician list.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { error, admin, concert } = await loadOwnedConcert(params.id);
  if (error) return error;

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  // 1. Create the position
  const { data: position, error: posErr } = await admin!
    .from('concert_positions')
    .insert({
      concert_id: params.id,
      position_name: body.position_name,
      musicians_needed: body.musicians_needed,
      template_id: body.template_id ?? null,
      response_deadline_type: body.response_deadline_type,
      response_deadline_days: body.response_deadline_days ?? 2,
      response_deadline_date: body.response_deadline_date ?? null,
      auto_resend_enabled: body.auto_resend_enabled,
      auto_resend_days: body.auto_resend_days ?? 0,
      send_mode: body.send_mode ?? 'cascade',
      position_group_label: body.position_group_label ?? null,
      pay_rate_id: body.pay_rate_id ?? null,
      status: 'pending',
    })
    .select()
    .single();
  if (posErr || !position) {
    return NextResponse.json({ error: posErr?.message ?? 'Failed to create position' }, { status: 500 });
  }

  // 2. Determine the musician list to snapshot
  let orderedIds: string[];
  if (body.musician_ids && body.musician_ids.length > 0) {
    // Verify all belong to this org
    const { data: owned } = await admin!
      .from('musicians')
      .select('id')
      .eq('organization_id', concert!.organization_id)
      .in('id', body.musician_ids);
    const ownedSet = new Set((owned ?? []).map((m) => m.id));
    orderedIds = body.musician_ids.filter((id) => ownedSet.has(id));
  } else {
    const { data: master } = await admin!
      .from('musicians')
      .select('id')
      .eq('organization_id', concert!.organization_id)
      .eq('position', body.position_name)
      .order('rank');
    orderedIds = (master ?? []).map((m) => m.id);
  }

  // 3. Snapshot into concert_position_musicians (rank = position in this list)
  if (orderedIds.length > 0) {
    const rows = orderedIds.map((musician_id, i) => ({
      concert_position_id: position.id,
      musician_id,
      rank: i + 1,
      status: 'pending' as const,
    }));
    const { error: cpmErr } = await admin!.from('concert_position_musicians').insert(rows);
    if (cpmErr) {
      await admin!.from('concert_positions').delete().eq('id', position.id);
      return NextResponse.json({ error: `Failed to add musicians: ${cpmErr.message}` }, { status: 500 });
    }
  }

  await logActivity({
    organizationId: concert!.organization_id, managerId: null, action: 'position_added',
    entityType: 'concert_position', entityId: position.id,
    details: { position_name: position.position_name, concert_name: concert!.name },
  });
  return NextResponse.json({ position, musician_count: orderedIds.length });
}
