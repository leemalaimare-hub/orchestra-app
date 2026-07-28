import { NextRequest, NextResponse } from 'next/server';
import { loadOwnedPosition } from '@/lib/concertAuth';
import { startSending } from '@/lib/sendEngine';

// POST /api/concerts/[id]/positions/[positionId]/send — begin sending for a
// position that was added to an existing concert (e.g. via "+ Add Position").
export async function POST(_req: NextRequest, { params }: { params: { id: string; positionId: string } }) {
  const { error, ctx } = await loadOwnedPosition(params.id, params.positionId);
  if (error) return error;

  const result = await startSending(params.positionId, ctx!.manager.id);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Failed to start sending' }, { status: 400 });
  return NextResponse.json({
    ok: true, sent: result.sent ?? false,
    recipient_name: result.musicianName ?? null, reason: result.reason ?? null,
  });
}
