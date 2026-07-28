import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { loadOwnedConcert } from '@/lib/concertAuth';
import { createAdminClient } from '@/lib/supabase-server';

const schema = z.object({ concert_template_id: z.string().uuid() });

// POST /api/concerts/[id]/positions/from-template — create pending positions
// (name + seat count only) from a saved Concert Template's instrumentation.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { error, concert } = await loadOwnedConcert(params.id);
  if (error) return error;

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  const admin = createAdminClient();
  const { data: template } = await admin
    .from('concert_templates')
    .select('id')
    .eq('id', body.concert_template_id)
    .eq('organization_id', concert!.organization_id)
    .maybeSingle();
  if (!template) return NextResponse.json({ error: 'Concert template not found' }, { status: 404 });

  const { data: templatePositions } = await admin
    .from('concert_template_positions')
    .select('position_name, musicians_needed')
    .eq('concert_template_id', body.concert_template_id)
    .order('display_order');

  if (!templatePositions || templatePositions.length === 0) return NextResponse.json({ positions: [] });

  const { data: inserted, error: insErr } = await admin
    .from('concert_positions')
    .insert(templatePositions.map((p) => ({
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
