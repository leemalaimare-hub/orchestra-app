import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { loadOwnedConcert } from '@/lib/concertAuth';
import { createAdminClient } from '@/lib/supabase-server';

const schema = z.object({ source_concert_id: z.string().uuid() });

// POST /api/concerts/[id]/positions/from-concert — copy just the instrumentation
// (position names + seat counts) from a past concert into this one, as fresh
// pending positions. Never copies musicians/call-order/status.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { error, concert } = await loadOwnedConcert(params.id);
  if (error) return error;

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  const admin = createAdminClient();
  const { data: sourceConcert } = await admin
    .from('concerts')
    .select('id')
    .eq('id', body.source_concert_id)
    .eq('organization_id', concert!.organization_id)
    .maybeSingle();
  if (!sourceConcert) return NextResponse.json({ error: 'Source concert not found' }, { status: 404 });

  const { data: sourcePositions } = await admin
    .from('concert_positions')
    .select('position_name, musicians_needed')
    .eq('concert_id', body.source_concert_id)
    .order('created_at');

  if (!sourcePositions || sourcePositions.length === 0) return NextResponse.json({ positions: [] });

  const { data: inserted, error: insErr } = await admin
    .from('concert_positions')
    .insert(sourcePositions.map((p) => ({
      concert_id: params.id,
      position_name: p.position_name,
      musicians_needed: p.musicians_needed,
      response_deadline_type: 'days',
      response_deadline_days: 2,
      auto_resend_enabled: false,
      auto_resend_days: 0,
      send_mode: 'cascade',
      status: 'pending',
    })))
    .select();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ positions: inserted ?? [] });
}
