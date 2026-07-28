'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ConcertTemplateWithPositions, PositionDefinition } from '@/types';

interface DraftPosition { position_name: string; musicians_needed: number }

export function ConcertTemplateForm({ template }: { template?: ConcertTemplateWithPositions }) {
  const router = useRouter();
  const isEdit = !!template;

  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [positions, setPositions] = useState<DraftPosition[]>(
    (template?.positions ?? []).map((p) => ({ position_name: p.position_name, musicians_needed: p.musicians_needed }))
  );
  const [libraryPositions, setLibraryPositions] = useState<PositionDefinition[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/positions-library').then((r) => r.json()).then((d) => setLibraryPositions(d.positions ?? [])).catch(() => {});
  }, []);

  const addPosition = () => setPositions((p) => [...p, { position_name: '', musicians_needed: 1 }]);
  const removePosition = (idx: number) => setPositions((p) => p.filter((_, i) => i !== idx));
  const updatePosition = (idx: number, patch: Partial<DraftPosition>) =>
    setPositions((p) => p.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const save = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return; }
    const cleaned = positions.filter((p) => p.position_name.trim());
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        positions: cleaned.map((p) => ({ position_name: p.position_name.trim(), musicians_needed: p.musicians_needed })),
      };
      const res = isEdit
        ? await fetch(`/api/concert-templates/${template!.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/concert-templates', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
      const b = await res.json();
      if (!res.ok) { toast.error(b.error || 'Save failed'); return; }
      toast.success(isEdit ? 'Concert template updated' : 'Concert template created');
      router.push('/dashboard/templates/concerts');
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">{isEdit ? 'Edit Concert Template' : 'New Concert Template'}</h1>
      <p className="mt-1 text-sm text-slate-500">
        A reusable instrumentation blueprint — e.g. Masterworks, Pops, Chamber — pick positions and seat
        counts once, then start any concert from it.
      </p>

      <div className="mt-6 space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <Input label="Template Name" placeholder="e.g. Masterworks" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium text-slate-700">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Instrumentation</h2>
            <Button type="button" size="sm" variant="secondary" onClick={addPosition}>
              <Plus className="h-3.5 w-3.5" /> Add Position
            </Button>
          </div>
          {positions.length === 0 && <p className="mt-2 text-xs text-slate-400">No positions added yet.</p>}
          <datalist id="template-position-names">
            {libraryPositions.map((p) => <option key={p.id} value={p.name} />)}
          </datalist>
          <div className="mt-3 space-y-2">
            {positions.map((p, i) => (
              <div key={i} className="flex items-end gap-2 rounded border border-slate-100 bg-slate-50 p-2">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500">Position</label>
                  <input type="text" list="template-position-names" value={p.position_name} placeholder="e.g. Violin 1"
                    onChange={(e) => updatePosition(i, { position_name: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500">Seats</label>
                  <input type="number" min={1} max={20} value={p.musicians_needed}
                    onChange={(e) => updatePosition(i, { musicians_needed: Number(e.target.value) })}
                    className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
                </div>
                <button type="button" onClick={() => removePosition(i)} className="p-1 text-slate-400 hover:text-red-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={save} loading={saving}>{isEdit ? 'Save Template' : 'Create Template'}</Button>
        <Button variant="ghost" onClick={() => router.push('/dashboard/templates/concerts')}>Cancel</Button>
      </div>
    </div>
  );
}
