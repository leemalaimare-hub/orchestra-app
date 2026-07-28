import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentManager } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-server';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  section: z.string().max(120).nullable().optional(),
});

const STANDARD_POSITIONS: { name: string; section: string }[] = [
  { name: 'Concertmaster', section: 'Strings' },
  { name: 'Assistant Concertmaster', section: 'Strings' },
  { name: 'Violin 1', section: 'Strings' },
  { name: 'Violin 2', section: 'Strings' },
  { name: 'Principal Viola', section: 'Strings' },
  { name: 'Assistant Principal Viola', section: 'Strings' },
  { name: 'Viola', section: 'Strings' },
  { name: 'Principal Cello', section: 'Strings' },
  { name: 'Assistant Principal Cello', section: 'Strings' },
  { name: 'Cello', section: 'Strings' },
  { name: 'Principal Double Bass', section: 'Strings' },
  { name: 'Double Bass', section: 'Strings' },
  { name: 'Principal Flute', section: 'Woodwinds' },
  { name: 'Flute 2', section: 'Woodwinds' },
  { name: 'Flute 3 / Piccolo', section: 'Woodwinds' },
  { name: 'Principal Oboe', section: 'Woodwinds' },
  { name: 'Oboe 2', section: 'Woodwinds' },
  { name: 'Principal Clarinet', section: 'Woodwinds' },
  { name: 'Clarinet 2', section: 'Woodwinds' },
  { name: 'Principal Bassoon', section: 'Woodwinds' },
  { name: 'Bassoon 2', section: 'Woodwinds' },
  { name: 'Principal Horn', section: 'Brass' },
  { name: 'Horn 2', section: 'Brass' },
  { name: 'Horn 3', section: 'Brass' },
  { name: 'Horn 4', section: 'Brass' },
  { name: 'Principal Trumpet', section: 'Brass' },
  { name: 'Trumpet 2', section: 'Brass' },
  { name: 'Trumpet 3', section: 'Brass' },
  { name: 'Principal Trombone', section: 'Brass' },
  { name: 'Trombone 2', section: 'Brass' },
  { name: 'Bass Trombone', section: 'Brass' },
  { name: 'Tuba', section: 'Brass' },
  { name: 'Timpani', section: 'Percussion' },
  { name: 'Percussion', section: 'Percussion' },
  { name: 'Harp', section: 'Other' },
];

// GET /api/positions-library — list all position definitions for the org
export async function GET() {
  const ctx = await getCurrentManager();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: positions, error } = await admin
    .from('position_definitions')
    .select('*')
    .eq('organization_id', ctx.organization.id)
    .order('display_order')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ positions: positions ?? [] });
}

// POST /api/positions-library — create one position, or seed the standard roster
export async function POST(req: NextRequest) {
  const ctx = await getCurrentManager();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const raw = await req.json().catch(() => ({}));

  if (raw?.seed_standard) {
    const { data: existing } = await admin
      .from('position_definitions')
      .select('name')
      .eq('organization_id', ctx.organization.id);
    const existingNames = new Set((existing ?? []).map((p) => p.name));
    const toInsert = STANDARD_POSITIONS
      .filter((p) => !existingNames.has(p.name))
      .map((p, i) => ({
        organization_id: ctx.organization.id,
        name: p.name,
        section: p.section,
        display_order: i,
      }));
    if (toInsert.length === 0) return NextResponse.json({ positions: [], added: 0 });
    const { data, error } = await admin.from('position_definitions').insert(toInsert).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ positions: data ?? [], added: data?.length ?? 0 });
  }

  let body;
  try { body = createSchema.parse(raw); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  const { data, error } = await admin
    .from('position_definitions')
    .insert({ organization_id: ctx.organization.id, name: body.name, section: body.section ?? null })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A position with this name already exists' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ position: data }, { status: 201 });
}
