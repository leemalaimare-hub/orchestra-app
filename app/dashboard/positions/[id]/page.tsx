'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, GripVertical, Search, Trash2, UserPlus } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import type { PositionDefinition, PositionDefinitionMember, Musician } from '@/types';

function AddMemberModal({ open, onClose, positionId, existingMusicianIds, onAdded }: {
  open: boolean;
  onClose: () => void;
  positionId: string;
  existingMusicianIds: Set<string>;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState<Musician[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/musicians?limit=200')
      .then((r) => r.json())
      .then((d) => setContacts(d.musicians ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return !existingMusicianIds.has(c.id) && (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  });

  const add = async (c: Musician) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/positions-library/${positionId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ musician_id: c.id }),
      });
      const b = await res.json();
      if (!res.ok) { toast.error(b.error || 'Failed to add'); return; }
      toast.success(`${c.first_name} ${c.last_name} added`);
      onAdded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Contact to Position" maxWidth="max-w-lg">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts…"
          className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div className="max-h-72 overflow-y-auto space-y-1">
        {loading ? (
          <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No contacts found</p>
        ) : (
          filtered.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50">
              <div>
                <p className="text-sm font-medium text-slate-800">{c.first_name} {c.last_name}</p>
                <p className="text-xs text-slate-400">{c.email}{c.position ? ` · ${c.position}` : ''}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => add(c)} loading={saving}>
                Add
              </Button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

function SortableMember({ member, onRemove }: { member: PositionDefinitionMember; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: member.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const m = member.musicians;
  return (
    <li ref={setNodeRef} style={style} className={`flex items-center gap-3 px-4 py-3 ${m?.is_blacklisted ? 'bg-red-50' : ''}`}>
      <button {...attributes} {...listeners} className="cursor-grab text-slate-400" aria-label="Drag to reorder">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{m ? `${m.first_name} ${m.last_name}` : '—'}</p>
        <p className="text-xs text-slate-400 truncate">{m?.email}</p>
      </div>
      {m?.is_blacklisted && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Do not contact</span>}
      <button onClick={onRemove} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="Remove">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

export default function PositionDetailPage({ params }: { params: { id: string } }) {
  const [position, setPosition] = useState<PositionDefinition | null>(null);
  const [members, setMembers] = useState<PositionDefinitionMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PositionDefinitionMember | null>(null);
  const [reordering, setReordering] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/positions-library').then((r) => r.json()),
      fetch(`/api/positions-library/${params.id}/members`).then((r) => r.json()),
    ])
      .then(([posData, memberData]) => {
        const found = (posData.positions ?? []).find((p: PositionDefinition) => p.id === params.id);
        setPosition(found ?? null);
        setMembers(memberData.members ?? []);
      })
      .catch(() => toast.error('Failed to load position'))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = members.findIndex((m) => m.id === active.id);
    const newIdx = members.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(members, oldIdx, newIdx).map((m, i) => ({ ...m, rank: i }));
    setMembers(reordered);
    setReordering(true);
    try {
      await fetch(`/api/positions-library/${params.id}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: reordered.map((m) => ({ id: m.id, rank: m.rank })) }),
      });
    } catch {
      toast.error('Failed to save order');
      load();
    } finally {
      setReordering(false);
    }
  };

  const removeMember = async (m: PositionDefinitionMember) => {
    const res = await fetch(`/api/positions-library/${params.id}/members?memberId=${m.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Failed to remove'); return; }
    toast.success('Removed from position');
    load();
  };

  if (loading) return <div className="text-center text-slate-400 py-20">Loading…</div>;
  if (!position) return <div className="text-center text-red-500 py-20">Position not found.</div>;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard/positions" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to Positions
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{position.name}</h1>
          <p className="mt-1 text-xs text-slate-400">
            {members.length} contact{members.length === 1 ? '' : 's'} · call order starts from #1
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className="h-4 w-4" /> Add Contact
        </Button>
      </div>

      <div className="mt-6">
        {members.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
            <p className="font-medium text-slate-600">No contacts in this position yet</p>
            <p className="mt-1 text-sm text-slate-400">
              Add contacts and drag to set the call order.
            </p>
            <Button className="mt-4" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add Contact
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Call Order</p>
              <p className="text-xs text-slate-400">Drag to reorder{reordering ? ' · saving…' : ''}</p>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={members.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                <ul className="divide-y divide-slate-100">
                  {members.map((m) => (
                    <SortableMember key={m.id} member={m} onRemove={() => setDeleteTarget(m)} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      <AddMemberModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        positionId={params.id}
        existingMusicianIds={new Set(members.map((m) => m.musician_id))}
        onAdded={load}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) removeMember(deleteTarget); }}
        title="Remove from position"
        message={deleteTarget ? `Remove ${deleteTarget.musicians?.first_name ?? 'this contact'} from this position?` : ''}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
