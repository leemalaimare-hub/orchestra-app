'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { GripVertical, X } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TemplateSelector } from '@/components/templates/TemplateSelector';
import { TemplatePreviewModal } from '@/components/templates/TemplatePreviewModal';
import type { ConcertPosition, EmailTemplateWithMeta, PayRate, PositionDefinition } from '@/types';

interface MusicianRow {
  key: string;            // dnd id
  musician_id: string;
  name: string;
  email: string;
  is_blacklisted: boolean;
  currently_unavailable: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  concertId: string;
  position?: ConcertPosition | null; // null = add
  existingPositionNames: string[];
}

function SortableMusician({ row, onRemove }: { row: MusicianRow; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style}
      className={`flex items-center gap-2 border-b border-slate-100 px-2 py-2 ${row.is_blacklisted ? 'bg-red-50' : 'bg-white'}`}>
      <button {...attributes} {...listeners} className="cursor-grab text-slate-400" aria-label="Drag">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-900">{row.name}</p>
        <p className="text-xs text-slate-500">{row.email}</p>
      </div>
      {row.is_blacklisted && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Do not contact</span>}
      {row.currently_unavailable && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Unavailable</span>}
      <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-600" aria-label="Remove">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AddEditPositionModal({ open, onClose, onSaved, concertId, position, existingPositionNames }: Props) {
  const isEdit = !!position;
  const lockedList = isEdit && position!.status !== 'pending';

  const [positionName, setPositionName] = useState('');
  const [needed, setNeeded] = useState(1);
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplateWithMeta | null>(null);
  const [deadlineType, setDeadlineType] = useState<'days' | 'specific_date'>('days');
  const [deadlineDays, setDeadlineDays] = useState(2);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [noResponseMode, setNoResponseMode] = useState<'auto' | 'notify'>('notify');
  const [autoResendDays, setAutoResendDays] = useState(0);
  const [broadcast, setBroadcast] = useState(false);
  const [musicians, setMusicians] = useState<MusicianRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [libraryPositions, setLibraryPositions] = useState<PositionDefinition[]>([]);
  const [payRates, setPayRates] = useState<PayRate[]>([]);
  const [payRateId, setPayRateId] = useState<string>('');
  const [payRateTouched, setPayRateTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/positions-library').then((r) => r.json()).then((d) => setLibraryPositions(d.positions ?? [])).catch(() => {});
    fetch('/api/pay-rates').then((r) => r.json()).then((d) => setPayRates(d.rates ?? [])).catch(() => {});
  }, [open]);

  // In add mode, default the pay rate from the matching library position's rate —
  // unless the manager has manually changed it for this position.
  useEffect(() => {
    if (isEdit || payRateTouched || !positionName) return;
    const libMatch = libraryPositions.find((p) => p.name.toLowerCase() === positionName.trim().toLowerCase());
    setPayRateId(libMatch?.pay_rate_id ?? '');
  }, [positionName, isEdit, payRateTouched, libraryPositions]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Initialize form when opened
  useEffect(() => {
    if (!open) return;
    if (position) {
      setPositionName(position.position_name);
      setNeeded(position.musicians_needed);
      setTemplateId(position.template_id ?? undefined);
      setDeadlineType(position.response_deadline_type);
      setDeadlineDays(position.response_deadline_days ?? 2);
      setDeadlineDate(position.response_deadline_date?.slice(0, 16) ?? '');
      setNoResponseMode(position.auto_resend_enabled ? 'auto' : 'notify');
      setAutoResendDays(position.auto_resend_days ?? 0);
      setBroadcast(position.send_mode === 'broadcast');
      setPayRateId(position.pay_rate_id ?? '');
      setPayRateTouched(false);
      // load existing position musician list
      setLoadingList(true);
      fetch(`/api/concerts/${concertId}/positions/${position.id}/musicians`)
        .then((r) => r.json())
        .then((d) => setMusicians((d.musicians ?? []).map((m: {
          id: string; musician_id: string; first_name: string; last_name: string; email: string;
          is_blacklisted: boolean; currently_unavailable: boolean;
        }) => ({
          key: m.id, musician_id: m.musician_id, name: `${m.first_name} ${m.last_name}`,
          email: m.email, is_blacklisted: m.is_blacklisted, currently_unavailable: m.currently_unavailable,
        }))))
        .catch(() => {})
        .finally(() => setLoadingList(false));
    } else {
      setPositionName(''); setNeeded(1); setTemplateId(undefined); setSelectedTemplate(null);
      setDeadlineType('days'); setDeadlineDays(2); setDeadlineDate('');
      setNoResponseMode('notify'); setAutoResendDays(0); setBroadcast(false); setMusicians([]);
      setPayRateId(''); setPayRateTouched(false);
    }
  }, [open, position, concertId]);

  // In add mode, load a list when the position name matches an existing position —
  // prefer the Positions library's ranked call list, fall back to a free-text match
  // against musicians.position.
  useEffect(() => {
    if (isEdit || !open || !positionName) return;
    const handle = setTimeout(async () => {
      setLoadingList(true);
      try {
        const libMatch = libraryPositions.find((p) => p.name.toLowerCase() === positionName.trim().toLowerCase());
        if (libMatch) {
          const d = await fetch(`/api/positions-library/${libMatch.id}/members`).then((r) => r.json());
          const libMembers = d.members ?? [];
          if (libMembers.length > 0) {
            setMusicians(libMembers.map((m: {
              id: string; musician_id: string;
              musicians: { first_name: string; last_name: string; email: string; is_blacklisted: boolean } | null;
            }) => ({
              key: m.id, musician_id: m.musician_id,
              name: m.musicians ? `${m.musicians.first_name} ${m.musicians.last_name}` : '',
              email: m.musicians?.email ?? '', is_blacklisted: m.musicians?.is_blacklisted ?? false,
              currently_unavailable: false,
            })));
            return;
          }
        }
        const d = await fetch(`/api/musicians?position=${encodeURIComponent(positionName)}&sort=rank&limit=100`).then((r) => r.json());
        setMusicians((d.musicians ?? []).map((m: {
          id: string; first_name: string; last_name: string; email: string;
          is_blacklisted: boolean; currently_unavailable?: boolean;
        }) => ({
          key: m.id, musician_id: m.id, name: `${m.first_name} ${m.last_name}`,
          email: m.email, is_blacklisted: m.is_blacklisted, currently_unavailable: !!m.currently_unavailable,
        })));
      } catch {
        // best-effort
      } finally {
        setLoadingList(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [positionName, isEdit, open, libraryPositions]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setMusicians((items) => {
      const oldIdx = items.findIndex((m) => m.key === active.id);
      const newIdx = items.findIndex((m) => m.key === over.id);
      return arrayMove(items, oldIdx, newIdx);
    });
  };

  const removeMusician = (key: string) => setMusicians((items) => items.filter((m) => m.key !== key));

  const save = async () => {
    if (!positionName.trim()) { toast.error('Position name is required'); return; }
    if (needed < 1) { toast.error('Need at least 1 musician'); return; }
    if (deadlineType === 'specific_date' && !deadlineDate) { toast.error('Pick a deadline date'); return; }

    setSaving(true);
    try {
      const settings = {
        position_name: positionName.trim(),
        musicians_needed: needed,
        template_id: templateId ?? null,
        response_deadline_type: deadlineType,
        response_deadline_days: deadlineType === 'days' ? deadlineDays : null,
        response_deadline_date: deadlineType === 'specific_date' && deadlineDate
          ? new Date(deadlineDate).toISOString() : null,
        auto_resend_enabled: noResponseMode === 'auto',
        auto_resend_days: noResponseMode === 'auto' ? autoResendDays : 0,
        send_mode: broadcast ? 'broadcast' as const : 'cascade' as const,
        pay_rate_id: payRateId || null,
      };

      if (isEdit) {
        const res = await fetch(`/api/concerts/${concertId}/positions/${position!.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
        });
        const b = await res.json();
        if (!res.ok) { toast.error(b.error || 'Save failed'); return; }
        // save order if list not locked
        if (!lockedList && musicians.length > 0) {
          await fetch(`/api/concerts/${concertId}/positions/${position!.id}/musicians`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: musicians.map((m, i) => ({ id: m.key, rank: i + 1 })) }),
          });
        }
      } else {
        const res = await fetch(`/api/concerts/${concertId}/positions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...settings, musician_ids: musicians.map((m) => m.musician_id) }),
        });
        const b = await res.json();
        if (!res.ok) { toast.error(b.error || 'Save failed'); return; }
      }
      toast.success(isEdit ? 'Position updated' : 'Position added');
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Position' : 'Add Position'} maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Section 1 — details */}
        <section className="space-y-3">
          <div>
            <Input label="Position Name" list="existing-positions" placeholder="e.g. Violin 1"
              value={positionName} onChange={(e) => setPositionName(e.target.value)} />
            <datalist id="existing-positions">
              {[...new Set([...existingPositionNames, ...libraryPositions.map((p) => p.name)])].map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <Input label="How many seats do you need for this position?" type="number" min={1} max={20}
            value={needed} onChange={(e) => setNeeded(Number(e.target.value))} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={broadcast} onChange={(e) => setBroadcast(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-amber-500" />
            📡 Broadcast — email everyone at once instead of one-by-one cascade
          </label>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Pay per service
              <span className="ml-1 text-xs font-normal text-slate-400">
                {payRateId && !payRateTouched ? '(from Positions library — override if needed)' : 'optional — inserted via {{pay_rate}}'}
              </span>
            </label>
            <select
              value={payRateId}
              onChange={(e) => { setPayRateId(e.target.value); setPayRateTouched(true); }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">No pay rate</option>
              {payRates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {new Intl.NumberFormat('en-US', { style: 'currency', currency: r.currency }).format(r.amount)}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Section 2 — template */}
        <section>
          <p className="mb-1 text-sm font-medium text-slate-700">Email Template</p>
          <TemplateSelector
            selectedTemplateId={templateId}
            onSelect={(t) => { setTemplateId(t.id); setSelectedTemplate(t); }}
          />
          {selectedTemplate && (
            <button type="button" onClick={() => setPreviewOpen(true)}
              className="mt-1 text-xs font-medium text-indigo-600 hover:underline">
              Preview Template
            </button>
          )}
        </section>

        {/* Section 3 — deadline */}
        <section>
          <p className="mb-1 text-sm font-medium text-slate-700">How long should contacts have to respond?</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={deadlineType === 'days'} onChange={() => setDeadlineType('days')} />
            <span className="flex items-center gap-1.5">
              <input type="number" min={0} max={60} value={deadlineDays}
                onChange={(e) => setDeadlineDays(Number(e.target.value))}
                disabled={deadlineType !== 'days'}
                className="w-16 rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100" />
              days after the email is sent
            </span>
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="radio" checked={deadlineType === 'specific_date'} onChange={() => setDeadlineType('specific_date')} />
            <span className="flex items-center gap-1.5">
              By a specific date:
              <input type="datetime-local" value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                disabled={deadlineType !== 'specific_date'}
                className="rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100" />
            </span>
          </label>
        </section>

        {/* Section 4 — no response handling */}
        <section>
          <p className="mb-1 text-sm font-medium text-slate-700">If a contact doesn&apos;t respond by the deadline:</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={noResponseMode === 'auto'} onChange={() => setNoResponseMode('auto')} />
            Automatically contact the next musician
          </label>
          {noResponseMode === 'auto' && (
            <div className="ml-6 mt-1 flex items-center gap-1.5 text-sm text-slate-600">
              Wait
              <input type="number" min={0} max={60} value={autoResendDays}
                onChange={(e) => setAutoResendDays(Number(e.target.value))}
                className="w-16 rounded border border-slate-300 px-2 py-1 text-sm" />
              additional days before moving on (0 = move on immediately)
            </div>
          )}
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="radio" checked={noResponseMode === 'notify'} onChange={() => setNoResponseMode('notify')} />
            Notify me and I&apos;ll decide when to move on
          </label>
        </section>

        {/* Section 5 — musician list */}
        <section>
          <p className="mb-1 text-sm font-medium text-slate-700">Contact List for This Position</p>
          {lockedList && (
            <p className="mb-2 text-xs text-amber-600">Sending has started — the contact list is locked.</p>
          )}
          {loadingList ? (
            <p className="text-sm text-slate-400">Loading contacts…</p>
          ) : musicians.length === 0 ? (
            <p className="text-sm text-slate-500">
              {positionName ? 'No musicians found for this position in your master list.' : 'Enter a position name to load musicians.'}
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-slate-200">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={lockedList ? undefined : onDragEnd}>
                <SortableContext items={musicians.map((m) => m.key)} strategy={verticalListSortingStrategy}>
                  {musicians.map((m) => (
                    <SortableMusician key={m.key} row={m} onRemove={() => removeMusician(m.key)} />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Note: Blacklisted and unavailable musicians will be automatically skipped when sending.
          </p>
        </section>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save Position</Button>
        </div>
      </div>

      {selectedTemplate && (
        <TemplatePreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          template={{ subject: selectedTemplate.subject, body: selectedTemplate.body }}
        />
      )}
    </Modal>
  );
}
