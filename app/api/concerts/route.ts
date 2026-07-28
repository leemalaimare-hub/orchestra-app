import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentManager } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-server';
import { logActivity } from '@/lib/activityLogger';

const rehearsalSchema = z.object({
  date: z.string().min(1),
  start_time: z.string().nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  notes: z.string().max(5000).nullable().optional(),
  template_id: z.string().uuid().nullable().optional(),
  accept_deadline_hours: z.number().int().min(1).max(8760).optional(),
  accept_deadline_text: z.string().max(500).nullable().optional(),
  custom_variables: z.record(z.string(), z.string()).optional(),
  dates: z.array(z.string()).nullable().optional(),
  event_time: z.string().nullable().optional(),
  venue: z.string().max(300).nullable().optional(),
  rehearsals: z.array(rehearsalSchema).optional(),
});

// GET /api/concerts?status=&include_positions=&page=&limit=
export async function GET(req: NextRequest) {
  const ctx = await getCurrentManager();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const includePositions = sp.get('include_positions') === 'true';
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20', 10)));

  const admin = createAdminClient();
  let query = admin
    .from('concerts')
    .select('*', { count: 'exact' })
    .eq('organization_id', ctx.organization.id)
    .order('updated_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (status) query = query.eq('status', status);

  const { data: concerts, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let result = concerts ?? [];
  if (includePositions && result.length > 0) {
    const { data: positions } = await admin
      .from('concert_positions')
      .select('id, concert_id, position_name, status, musicians_needed')
      .in('concert_id', result.map((c) => c.id));
    const byConcert = new Map<string, unknown[]>();
    for (const p of positions ?? []) {
      const arr = byConcert.get(p.concert_id) ?? [];
      arr.push(p);
      byConcert.set(p.concert_id, arr);
    }
    result = result.map((c) => ({ ...c, positions: byConcert.get(c.id) ?? [] }));
  }

  return NextResponse.json({ concerts: result, total: count ?? 0, page, limit });
}

// POST /api/concerts — create a concert in draft status.
export async function POST(req: NextRequest) {
  const ctx = await getCurrentManager();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = createSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('concerts')
    .insert({
      organization_id: ctx.organization.id,
      created_by: ctx.manager.id,
      name: body.name,
      notes: body.notes ?? null,
      template_id: body.template_id ?? null,
      accept_deadline_hours: body.accept_deadline_hours ?? 48,
      accept_deadline_text: body.accept_deadline_text ?? null,
      custom_variables: body.custom_variables ?? {},
      dates: body.dates ?? null,
      event_time: body.event_time ?? null,
      venue: body.venue ?? null,
      status: 'draft',
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.rehearsals && body.rehearsals.length > 0) {
    const { error: rehErr } = await admin.from('concert_rehearsals').insert(
      body.rehearsals.map((r, i) => ({
        concert_id: data.id,
        date: r.date,
        start_time: r.start_time || null,
        location: r.location || null,
        notes: r.notes || null,
        display_order: i,
      })),
    );
    if (rehErr) return NextResponse.json({ error: `Failed to save rehearsals: ${rehErr.message}` }, { status: 500 });
  }

  await logActivity({
    organizationId: ctx.organization.id, managerId: ctx.manager.id, action: 'concert_created',
    entityType: 'concert', entityId: data.id, details: { concert_name: data.name },
  });
  return NextResponse.json({ concert: data });
}
