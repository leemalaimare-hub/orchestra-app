'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Music2, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import type { PositionDefinition } from '@/types';

function NewPositionModal({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [section, setSection] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/positions-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), section: section.trim() || null }),
      });
      const b = await res.json();
      if (!res.ok) { toast.error(b.error || 'Failed to create position'); return; }
      toast.success('Position added');
      setName('');
      setSection('');
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Position" maxWidth="max-w-md">
      <div className="space-y-3">
        <Input
          label="Position name"
          placeholder="e.g. Violin 1, Principal Oboe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <Input
          label="Section (optional)"
          placeholder="e.g. Strings, Woodwinds, Brass"
          value={section}
          onChange={(e) => setSection(e.target.value)}
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={!name.trim()}>Add Position</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function PositionsLibraryPage() {
  const [positions, setPositions] = useState<PositionDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PositionDefinition | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/positions-library')
      .then((r) => r.json())
      .then((d) => setPositions(d.positions ?? []))
      .catch(() => toast.error('Failed to load positions'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const seedStandard = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/positions-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed_standard: true }),
      });
      const b = await res.json();
      if (!res.ok) { toast.error(b.error || 'Failed to add standard positions'); return; }
      toast.success(b.added > 0 ? `Added ${b.added} standard positions` : 'Standard positions already added');
      load();
    } finally {
      setSeeding(false);
    }
  };

  const doDelete = async (p: PositionDefinition) => {
    const res = await fetch(`/api/positions-library/${p.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Delete failed'); return; }
    toast.success('Position removed');
    load();
  };

  const sections = Array.from(new Set(positions.map((p) => p.section || 'Other')));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Positions</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Reusable position names for building campaigns — Violin 1, Principal Oboe, etc.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={seedStandard} loading={seeding}>
            <Sparkles className="h-4 w-4" /> Add standard positions
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> New Position
          </Button>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-center text-slate-400">Loading…</p>
        ) : positions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <Music2 className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 font-medium text-slate-600">No positions yet</p>
            <p className="mt-1 text-sm text-slate-400">
              Add your own, or start from the standard orchestra roster.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" onClick={seedStandard} loading={seeding}>
                <Sparkles className="h-4 w-4" /> Add standard positions
              </Button>
              <Button onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4" /> New Position
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{section}</p>
                <div className="space-y-2">
                  {positions.filter((p) => (p.section || 'Other') === section).map((p) => (
                    <div
                      key={p.id}
                      className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                        <Music2 className="h-4 w-4 text-indigo-600" />
                      </div>
                      <p className="flex-1 min-w-0 font-medium text-slate-900 truncate">{p.name}</p>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="rounded p-1.5 text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                        aria-label="Delete position"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <NewPositionModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={load} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) doDelete(deleteTarget); }}
        title="Delete position"
        message={deleteTarget ? `Delete "${deleteTarget.name}" from your position library? This does not affect any campaigns already sent.` : ''}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
