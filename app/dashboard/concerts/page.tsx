'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, CalendarDays, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Concert, ConcertPosition } from '@/types';

type ConcertRow = Concert & { positions?: Pick<ConcertPosition, 'id' | 'position_name' | 'status' | 'musicians_needed'>[] };

const STATUS_CLS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-blue-100 text-blue-700',
  filled: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

function fmtDate(dates: string[] | null) {
  if (!dates || dates.length === 0) return null;
  return new Date(dates[0] + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ConcertsPage() {
  const [concerts, setConcerts] = useState<ConcertRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/concerts?include_positions=true&limit=100')
      .then((r) => r.json())
      .then((d) => setConcerts(d.concerts ?? []))
      .catch(() => toast.error('Failed to load concerts'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Concerts</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Build out an event&apos;s positions and send from one place
          </p>
        </div>
        <Link href="/dashboard/concerts/new">
          <Button><Plus className="h-4 w-4" /> New Concert</Button>
        </Link>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-center text-slate-400">Loading…</p>
        ) : concerts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 font-medium text-slate-600">No concerts yet</p>
            <p className="mt-1 text-sm text-slate-400">
              Create a concert, add positions and seat counts, then send.
            </p>
            <Link href="/dashboard/concerts/new">
              <Button className="mt-4"><Plus className="h-4 w-4" /> New Concert</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {concerts.map((c) => (
              <Link key={c.id} href={`/dashboard/email/view/${c.id}`}>
                <div className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                    <CalendarDays className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                    <p className="text-sm text-slate-400">
                      {[fmtDate(c.dates), c.venue, `${c.positions?.length ?? 0} position${c.positions?.length === 1 ? '' : 's'}`]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLS[c.status] ?? STATUS_CLS.draft}`}>
                    {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
