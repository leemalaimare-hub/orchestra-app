import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { createAdminClient } from '@/lib/supabase-server';
import { processNoResponse } from '@/lib/sendEngine';

export const runtime = 'nodejs';

// GET /api/cron/check-deadlines — runs hourly via Vercel Cron.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: expired, error } = await admin
    .from('send_logs')
    .select('id')
    .eq('status', 'sent')
    .lt('token_expires_at', new Date().toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  const errors: string[] = [];
  for (const log of expired ?? []) {
    try {
      await processNoResponse(log.id);
      processed += 1;
    } catch (err) {
      errors.push(`${log.id}: ${err instanceof Error ? err.message : 'error'}`);
    }
  }

  console.log(`[cron] check-deadlines processed=${processed} errors=${errors.length}`);
  return NextResponse.json({ processed, errors });
}
