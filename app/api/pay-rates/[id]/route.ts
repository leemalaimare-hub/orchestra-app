import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentManager } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-server';

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  amount: z.number().min(0).max(1000000).optional(),
  currency: z.string().min(1).max(10).optional(),
  display_order: z.number().int().optional(),
});

async function loadOwnedRate(id: string) {
  const ctx = await getCurrentManager();
  if (!ctx) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: rate, error } = await admin
    .from('pay_rates')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organization.id)
    .single();
  if (error || !rate) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { ctx, admin, rate };
}

// PUT /api/pay-rates/[id]
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await loadOwnedRate(params.id);
  if (res.error) return res.error;
  const { admin } = res;

  let body;
  try { body = updateSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  const { data, error } = await admin!
    .from('pay_rates')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rate: data });
}

// DELETE /api/pay-rates/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await loadOwnedRate(params.id);
  if (res.error) return res.error;
  const { admin } = res;

  const { error } = await admin!.from('pay_rates').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
