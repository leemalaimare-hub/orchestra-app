import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentManager } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-server';

const positionSchema = z.object({
  position_name: z.string().min(1).max(120),
  musicians_needed: z.number().int().min(1).max(20),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  positions: z.array(positionSchema).optional(), // when present, replaces the full list
});

async function loadOwnedTemplate(id: string) {
  const ctx = await getCurrentManager();
  if (!ctx) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: template, error } = await admin
    .from('concert_templates')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organization.id)
    .single();
  if (error || !template) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { ctx, admin, template };
}

// GET /api/concert-templates/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await loadOwnedTemplate(params.id);
  if (res.error) return res.error;
  const { admin, template } = res;

  const { data: positions } = await admin!
    .from('concert_template_positions')
    .select('*')
    .eq('concert_template_id', params.id)
    .order('display_order');
  return NextResponse.json({ template: { ...template, positions: positions ?? [] } });
}

// PUT /api/concert-templates/[id]
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await loadOwnedTemplate(params.id);
  if (res.error) return res.error;
  const { admin } = res;

  let body;
  try { body = updateSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  const { positions, ...fields } = body;
  const { data, error } = await admin!
    .from('concert_templates')
    .update(fields)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (positions) {
    await admin!.from('concert_template_positions').delete().eq('concert_template_id', params.id);
    if (positions.length > 0) {
      const { error: posErr } = await admin!.from('concert_template_positions').insert(
        positions.map((p, i) => ({
          concert_template_id: params.id, position_name: p.position_name,
          musicians_needed: p.musicians_needed, display_order: i,
        })),
      );
      if (posErr) return NextResponse.json({ error: `Failed to save positions: ${posErr.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ template: data });
}

// DELETE /api/concert-templates/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await loadOwnedTemplate(params.id);
  if (res.error) return res.error;
  const { admin } = res;

  const { error } = await admin!.from('concert_templates').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
