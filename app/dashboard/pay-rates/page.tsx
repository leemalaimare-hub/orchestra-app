'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, DollarSign, Trash2, GripVertical } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  DragEndEvent, useDraggable, useDroppable,
} from '@dnd-kit/core';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import type { PayRate, PositionDefinition } from '@/types';

const UNASSIGNED = 'unassigned';

function NewRateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const amt = Number(amount);
    if (!name.trim() || !Number.isFinite(amt) || amt < 0) { toast.error('Enter a name and a valid amount'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/pay-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), amount: amt }),
      });
      const b = await res.json();
      if (!res.ok) { toast.error(b.error || 'Failed to create pay rate'); return; }
      toast.success('Pay rate added');
      setName(''); setAmount('');
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Pay Rate" maxWidth="max-w-sm">
      <div className="space-y-3">
        <Input label="Rate name" placeholder="e.g. Section, Assistant Principal, Principal, Concertmaster"
          value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Input label="Amount per service (USD)" type="number" min={0} step="0.01"
          value={amount} onChange={(e) => setAmount(e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Add Rate</Button>
        </div>
      </div>
    </Modal>
  );
}

function PositionChip({ position }: { position: PositionDefinition }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: position.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex cursor-grab items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <GripVertical className="h-3.5 w-3.5 text-slate-300" />
      {position.name}
    </div>
  );
}

function Column({ id, title, subtitle, positions, onDelete }: {
  id: string;
  title: string;
  subtitle?: string;
  positions: PositionDefinition[];
  onDelete?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[140px] rounded-xl border p-3 transition-colors ${
        isOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        {onDelete && (
          <button onClick={onDelete} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500" aria-label="Delete rate">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {positions.length === 0 && <p className="text-xs text-slate-400">Drop positions here</p>}
        {positions.map((p) => <PositionChip key={p.id} position={p} />)}
      </div>
    </div>
  );
}

export default function PayRatesPage() {
  const [rates, setRates] = useState<PayRate[]>([]);
  const [positions, setPositions] = useState<PositionDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PayRate | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/pay-rates').then((r) => r.json()),
      fetch('/api/positions-library').then((r) => r.json()),
    ])
      .then(([rateData, posData]) => {
        setRates(rateData.rates ?? []);
        setPositions(posData.positions ?? []);
      })
      .catch(() => toast.error('Failed to load pay rates'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const doDelete = async (r: PayRate) => {
    const res = await fetch(`/api/pay-rates/${r.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Delete failed'); return; }
    toast.success('Pay rate deleted');
    load();
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const positionId = String(active.id);
    const targetRateId = over.id === UNASSIGNED ? null : String(over.id);
    const current = positions.find((p) => p.id === positionId);
    if (!current || current.pay_rate_id === targetRateId) return;

    setPositions((prev) => prev.map((p) => (p.id === positionId ? { ...p, pay_rate_id: targetRateId } : p)));
    try {
      const res = await fetch(`/api/positions-library/${positionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pay_rate_id: targetRateId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Failed to save — reverting');
      load();
    }
  };

  const fmtAmount = (r: PayRate) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: r.currency }).format(r.amount);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pay Rates</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Define per-service pay tiers, then drag positions into the tier they earn
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> New Pay Rate
        </Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-center text-slate-400">Loading…</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <div className="space-y-3">
              <Column
                id={UNASSIGNED}
                title="Unassigned"
                subtitle="No pay rate set"
                positions={positions.filter((p) => !p.pay_rate_id)}
              />
              {rates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
                  <DollarSign className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 font-medium text-slate-600">No pay rates yet</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Add a rate for Section, Assistant Principal, Principal, Concertmaster, etc.
                  </p>
                  <Button className="mt-4" onClick={() => setModalOpen(true)}>
                    <Plus className="h-4 w-4" /> New Pay Rate
                  </Button>
                </div>
              ) : (
                rates.map((r) => (
                  <Column
                    key={r.id}
                    id={r.id}
                    title={r.name}
                    subtitle={fmtAmount(r)}
                    positions={positions.filter((p) => p.pay_rate_id === r.id)}
                    onDelete={() => setDeleteTarget(r)}
                  />
                ))
              )}
            </div>
          </DndContext>
        )}
      </div>

      <NewRateModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={load} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) doDelete(deleteTarget); }}
        title="Delete pay rate"
        message={deleteTarget ? `Delete "${deleteTarget.name}"? Positions using it become unassigned.` : ''}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
