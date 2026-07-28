import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentManager } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-server';

const positionSchema = z.object({
  position_name: z.string().min(1).max(120),
  musicians_needed: z.number().int().min(1).max(20),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  positions: z.array(positionSchema).optional(),
});

// GET /api/concert-templates — list all concert templates for the org, with positions
export async function GET() {
  const ctx = await getCurrentManager();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: templates, error } = await admin
    .from('concert_templates')
    .select('*')
    .eq('organization_id', ctx.organization.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (templates ?? []).map((t) => t.id);
  let positionsByTemplate: Record<string, unknown[]> = {};
  if (ids.length > 0) {
    const { data: positions } = await admin
      .from('concert_template_positions')
      .select('*')
      .in('concert_template_id', ids)
      .order('display_order');
    positionsByTemplate = {};
    for (const p of positions ?? []) {
      const arr = positionsByTemplate[p.concert_template_id] ?? [];
      arr.push(p);
      positionsByTemplate[p.concert_template_id] = arr;
    }
  }

  const result = (templates ?? []).map((t) => ({ ...t, positions: positionsByTemplate[t.id] ?? [] }));
  return NextResponse.json({ templates: result });
}

// POST /api/concert-templates — create a template with its positions
export async function POST(req: NextRequest) {
  const ctx = await getCurrentManager();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = createSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  const admin = createAdminClient();
  const { data: template, error } = await admin
    .from('concert_templates')
    .insert({ organization_id: ctx.organization.id, name: body.name, description: body.description ?? null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.positions && body.positions.length > 0) {
    const { error: posErr } = await admin.from('concert_template_positions').insert(
      body.positions.map((p, i) => ({
        concert_template_id: template.id, position_name: p.position_name,
        musicians_needed: p.musicians_needed, display_order: i,
      })),
    );
    if (posErr) return NextResponse.json({ error: `Failed to save positions: ${posErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ template }, { status: 201 });
}
