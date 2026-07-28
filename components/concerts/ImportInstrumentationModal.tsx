'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { Concert, ConcertPosition } from '@/types';

type ConcertRow = Concert & { positions?: Pick<ConcertPosition, 'id' | 'position_name' | 'musicians_needed'>[] };

export function ImportInstrumentationModal({ open, onClose, concertId, onImported }: {
  open: boolean;
  onClose: () => void;
  concertId: string;
  onImported: () => void;
}) {
  const [concerts, setConcerts] = useState<ConcertRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/concerts?origin=concert&include_positions=true&limit=100')
      .then((r) => r.json())
      .then((d) => setConcerts((d.concerts ?? []).filter((c: ConcertRow) => c.id !== concertId)))
      .catch(() => toast.error('Failed to load past concerts'))
      .finally(() => setLoading(false));
  }, [open, concertId]);

  const past = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const q = search.toLowerCase();
    return concerts
      .filter((c) => c.dates?.[0] && c.dates[0] < today)
      .filter((c) => (c.positions?.length ?? 0) > 0)
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => (b.dates?.[0] ?? '').localeCompare(a.dates?.[0] ?? ''));
  }, [concerts, search]);

  const doImport = async (source: ConcertRow) => {
    setImportingId(source.id);
    try {
      const res = await fetch(`/api/concerts/${concertId}/positions/from-concert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_concert_id: source.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Import failed'); return; }
      toast.success(`Imported ${data.positions?.length ?? 0} position(s) from "${source.name}"`);
      onImported();
      onClose();
    } finally {
      setImportingId(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import Instrumentation from a Past Concert" maxWidth="max-w-lg">
      <p className="mb-3 text-sm text-slate-500">
        Copies each position&apos;s name and seat count only — you&apos;ll pick the call list and deadline
        for each fresh, same as adding a position manually.
      </p>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search past concerts…"
          className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div className="max-h-80 overflow-y-auto space-y-1">
        {loading ? (
          <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
        ) : past.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No past concerts with positions found.</p>
        ) : (
          past.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50">
              <div>
                <p className="text-sm font-medium text-slate-800">{c.name}</p>
                <p className="text-xs text-slate-400">
                  {c.dates?.[0]} · {c.positions?.length} position{c.positions?.length === 1 ? '' : 's'}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => doImport(c)} loading={importingId === c.id}>
                Import
              </Button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
