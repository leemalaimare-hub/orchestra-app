import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentManager } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-server';

const rowSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});
const schema = z.object({ rows: z.array(rowSchema).min(1).max(500) });

// POST /api/groups/[id]/import — bulk add ad-hoc members from a parsed CSV/XLSX file.
// Rows are appended in the order given, after any existing members.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getCurrentManager();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: group } = await admin
    .from('recipient_groups')
    .select('id')
    .eq('id', params.id)
    .eq('organization_id', ctx.organization.id)
    .single();
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  const { data: existing } = await admin
    .from('recipient_group_members')
    .select('email, rank')
    .eq('group_id', params.id)
    .order('rank', { ascending: false })
    .limit(1);
  let nextRank = (existing?.[0]?.rank ?? -1) + 1;

  const { data: existingEmails } = await admin
    .from('recipient_group_members')
    .select('email')
    .eq('group_id', params.id);
  const seen = new Set((existingEmails ?? []).map((m) => m.email.toLowerCase()));

  const toInsert: { group_id: string; name: string; email: string; rank: number }[] = [];
  let skipped = 0;
  for (const row of body.rows) {
    const email = row.email.toLowerCase();
    if (seen.has(email)) { skipped++; continue; }
    seen.add(email);
    toInsert.push({ group_id: params.id, name: row.name, email: row.email, rank: nextRank++ });
  }

  if (toInsert.length === 0) return NextResponse.json({ imported: 0, skipped });

  const { data, error } = await admin.from('recipient_group_members').insert(toInsert).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ imported: data?.length ?? 0, skipped });
}
