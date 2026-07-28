'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, LayoutList, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { TemplateTypeTabs } from '@/components/templates/TemplateTypeTabs';
import type { ConcertTemplateWithPositions } from '@/types';

export default function ConcertTemplatesPage() {
  const [templates, setTemplates] = useState<ConcertTemplateWithPositions[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ConcertTemplateWithPositions | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/concert-templates')
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => toast.error('Failed to load concert templates'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const doDelete = async (t: ConcertTemplateWithPositions) => {
    const res = await fetch(`/api/concert-templates/${t.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Delete failed'); return; }
    toast.success('Concert template deleted');
    load();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Templates</h1>
        <Link href="/dashboard/templates/concerts/new">
          <Button><Plus className="h-4 w-4" /> New Concert Template</Button>
        </Link>
      </div>

      <TemplateTypeTabs active="concert" />

      {loading ? (
        <p className="text-center text-slate-400">Loading…</p>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <LayoutList className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-medium text-slate-600">No concert templates yet</p>
          <p className="mt-1 text-sm text-slate-400">
            Save a reusable instrumentation blueprint — e.g. Masterworks, Pops, Chamber.
          </p>
          <Link href="/dashboard/templates/concerts/new">
            <Button className="mt-4"><Plus className="h-4 w-4" /> New Concert Template</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                <p className="text-sm text-slate-400">
                  {t.positions.length} position{t.positions.length === 1 ? '' : 's'}
                  {t.description ? ` · ${t.description}` : ''}
                </p>
              </div>
              <button
                onClick={() => setDeleteTarget(t)}
                className="rounded p-1.5 text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                aria-label="Delete template"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <Link href={`/dashboard/templates/concerts/${t.id}`}>
                <button className="flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700">
                  Edit <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </Link>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) doDelete(deleteTarget); }}
        title="Delete concert template"
        message={deleteTarget ? `Delete "${deleteTarget.name}"? This doesn't affect any concerts already created from it.` : ''}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
