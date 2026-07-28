import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentManager } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-server';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  amount: z.number().min(0).max(1000000),
  currency: z.string().min(1).max(10).optional(),
});

// GET /api/pay-rates — list all pay rates for the org
export async function GET() {
  const ctx = await getCurrentManager();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: rates, error } = await admin
    .from('pay_rates')
    .select('*')
    .eq('organization_id', ctx.organization.id)
    .order('display_order')
    .order('amount');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rates: rates ?? [] });
}

// POST /api/pay-rates — create a pay rate
export async function POST(req: NextRequest) {
  const ctx = await getCurrentManager();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = createSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: 'Invalid input', details: (e as z.ZodError).issues }, { status: 400 }); }

  const admin = createAdminClient();
  const { count } = await admin
    .from('pay_rates').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.organization.id);

  const { data, error } = await admin
    .from('pay_rates')
    .insert({
      organization_id: ctx.organization.id, name: body.name, amount: body.amount,
      currency: body.currency ?? 'USD', display_order: count ?? 0,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rate: data }, { status: 201 });
}
