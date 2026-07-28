'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, X, ChevronDown, Settings2 } from 'lucide-react';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Musician, MusicianAvailability, CustomFieldDefinition, CustomFieldType } from '@/types';

// ─── Form schema ──────────────────────────────────────────────────────────────

const schema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name:  z.string().optional().default(''),
  email:      z.string().email('Enter a valid email'),
  position:   z.string().optional().default(''),
  rank:       z.number().int().min(1).optional().default(999),
  phone:      z.string().optional(),
  notes:      z.string().max(500, 'Max 500 characters').optional(),
});

type FormData = {
  first_name: string;
  last_name: string;
  email: string;
  position: string;
  rank: number;
  phone?: string;
  notes?: string;
};

// ─── "Add new field" inline mini-form ────────────────────────────────────────

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text',    label: 'Text' },
  { value: 'number',  label: 'Number' },
  { value: 'date',    label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select',  label: 'Dropdown' },
];

function AddFieldForm({ onAdd, onCancel }: {
  onAdd: (def: CustomFieldDefinition) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType]   = useState<CustomFieldType>('text');
  const [options, setOptions] = useState(''); // comma-separated for select
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!label.trim()) { toast.error('Field name is required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          field_type: type,
          options: type === 'select' ? options.split(',').map((o) => o.trim()).filter(Boolean) : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Failed to add field'); return; }
      onAdd(d.field as CustomFieldDefinition);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
      <p className="text-xs font-semibold text-indigo-700">New custom field</p>
      <div className="flex gap-2">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="Field name (e.g. Department)"
          className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CustomFieldType)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      {type === 'select' && (
        <input
          value={options}
          onChange={(e) => setOptions(e.target.value)}
          placeholder="Options, separated by commas (e.g. Full-time, Part-time, Contractor)"
          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100">
          Cancel
        </button>
        <Button type="button" size="sm" onClick={save} loading={saving}>
          Add field
        </Button>
      </div>
    </div>
  );
}

// ─── Custom field value input ─────────────────────────────────────────────────

function FieldInput({ def, value, onChange }: {
  def: CustomFieldDefinition;
  value: string | number | boolean | null;
  onChange: (v: string | number | boolean | null) => void;
}) {
  const base = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

  if (def.field_type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded text-indigo-600"
        />
        <span className="text-sm text-slate-700">{value ? 'Yes' : 'No'}</span>
      </label>
    );
  }
  if (def.field_type === 'select' && def.options?.length) {
    return (
      <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={base}>
        <option value="">— select —</option>
        {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (def.field_type === 'date') {
    return (
      <input type="date" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={base} />
    );
  }
  if (def.field_type === 'number') {
    return (
      <input type="number" value={String(value ?? '')} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className={base} />
    );
  }
  return (
    <input type="text" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={base} />
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DraftWindow { id?: string; start_date: string; end_date: string; reason: string; }

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  musician?: Musician | null;
  initialEmail?: string;
  positions: string[];
  suggestNextRank?: (position: string) => number;
  onCreated?: (musician: Musician) => void;
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function AddEditMusician({
  open, onClose, onSaved, musician, initialEmail, positions, suggestNextRank, onCreated,
}: Props) {
  const isEdit = !!musician;

  const [blacklisted, setBlacklisted]       = useState(false);
  const [confirmBlacklist, setConfirmBlacklist] = useState(false);
  const [windows, setWindows]               = useState<DraftWindow[]>([]);
  const [saving, setSaving]                 = useState(false);

  // Custom fields
  const [fieldDefs, setFieldDefs]           = useState<CustomFieldDefinition[]>([]);
  const [customValues, setCustomValues]     = useState<Record<string, string | number | boolean | null>>({});
  const [showAddField, setShowAddField]     = useState(false);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
  });
  const notesValue    = watch('notes') ?? '';
  const positionValue = watch('position') ?? '';

  // Load field definitions once
  useEffect(() => {
    fetch('/api/custom-fields')
      .then((r) => r.json())
      .then((d) => setFieldDefs(d.fields ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    if (musician) {
      reset({
        first_name: musician.first_name,
        last_name:  musician.last_name,
        email:      musician.email,
        position:   musician.position,
        rank:       musician.rank,
        phone:      musician.phone ?? '',
        notes:      musician.notes ?? '',
      });
      setBlacklisted(musician.is_blacklisted);
      setCustomValues(musician.custom_fields ?? {});
      fetch(`/api/musicians/${musician.id}/availability`)
        .then((r) => r.json())
        .then((d) => setWindows((d.availability ?? []).map((w: MusicianAvailability) => ({
          id: w.id, start_date: w.start_date, end_date: w.end_date, reason: w.reason ?? '',
        }))))
        .catch(() => {});
    } else {
      reset({ first_name: '', last_name: '', email: initialEmail ?? '', position: '', rank: 999, phone: '', notes: '' });
      setBlacklisted(false);
      setCustomValues({});
      setWindows([]);
    }
  }, [open, musician, initialEmail, reset]);

  useEffect(() => {
    if (!isEdit && positionValue && suggestNextRank) {
      setValue('rank', suggestNextRank(positionValue));
    }
  }, [positionValue, isEdit, suggestNextRank, setValue]);

  const toggleBlacklist = () => {
    if (!blacklisted) setConfirmBlacklist(true);
    else setBlacklisted(false);
  };

  const addWindow    = () => setWindows((w) => [...w, { start_date: '', end_date: '', reason: '' }]);
  const removeWindow = (idx: number) => setWindows((w) => w.filter((_, i) => i !== idx));
  const updateWindow = (idx: number, patch: Partial<DraftWindow>) =>
    setWindows((w) => w.map((win, i) => (i === idx ? { ...win, ...patch } : win)));

  const syncAvailability = async (musicianId: string, existing: DraftWindow[]) => {
    if (isEdit) {
      const current = await fetch(`/api/musicians/${musicianId}/availability`).then((r) => r.json());
      const keepIds = new Set(existing.filter((w) => w.id).map((w) => w.id));
      for (const w of (current.availability ?? []) as MusicianAvailability[]) {
        if (!keepIds.has(w.id)) {
          await fetch(`/api/musicians/${musicianId}/availability?entry=${w.id}`, { method: 'DELETE' });
        }
      }
    }
    for (const w of existing) {
      if (w.id || !w.start_date || !w.end_date) continue;
      await fetch(`/api/musicians/${musicianId}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: w.start_date, end_date: w.end_date, reason: w.reason || null }),
      });
    }
  };

  const deleteFieldDef = async (id: string) => {
    await fetch(`/api/custom-fields/${id}`, { method: 'DELETE' });
    setFieldDefs((prev) => prev.filter((f) => f.id !== id));
    setCustomValues((prev) => { const n = { ...prev }; delete n[id]; return n; });
    toast.success('Field removed');
  };

  const onSubmit = async (values: FormData) => {
    for (const w of windows) {
      if ((w.start_date && !w.end_date) || (!w.start_date && w.end_date)) {
        toast.error('Each unavailability period needs both a start and end date'); return;
      }
      if (w.start_date && w.end_date && w.start_date > w.end_date) {
        toast.error('Start date must be on or before end date'); return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        first_name:     values.first_name,
        last_name:      values.last_name || '-',
        email:          values.email,
        position:       values.position || '',
        rank:           values.rank ?? 999,
        phone:          values.phone || null,
        notes:          values.notes || null,
        is_blacklisted: blacklisted,
        custom_fields:  customValues,
      };
      let musicianId = musician?.id;
      if (isEdit) {
        const res = await fetch(`/api/musicians/${musicianId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        const body = await res.json();
        if (!res.ok) { toast.error(body.error || 'Save failed'); return; }
      } else {
        const res = await fetch('/api/musicians', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        const body = await res.json();
        if (!res.ok) { toast.error(body.error || 'Save failed'); return; }
        musicianId = body.musician.id;
        onCreated?.(body.musician as Musician);
      }
      if (musicianId) await syncAvailability(musicianId, windows);
      toast.success(isEdit ? 'Contact updated' : 'Contact added');
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit contact' : 'New contact'} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* Name */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="First name *" {...register('first_name')} error={errors.first_name?.message} />
          <Input label="Last name" {...register('last_name')} error={errors.last_name?.message} />
        </div>

        {/* Email */}
        <Input label="Email *" type="email" {...register('email')} error={errors.email?.message} />

        {/* Position + Rank */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Input label="Role / Position" list="position-options" {...register('position')} error={errors.position?.message} />
            <datalist id="position-options">
              {positions.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
          <Input label="Rank" type="number" min={1} {...register('rank', { valueAsNumber: true })} error={errors.rank?.message} />
        </div>

        {/* Phone */}
        <Input label="Phone" {...register('phone')} error={errors.phone?.message} />

        {/* Notes */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
          <textarea
            {...register('notes')}
            maxLength={500}
            rows={3}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-red-600">{errors.notes?.message}</span>
            <span className="text-slate-400">{notesValue.length}/500</span>
          </div>
        </div>

        {/* ── Custom fields ─────────────────────────────────────────────── */}
        {(fieldDefs.length > 0 || showAddField) && (
          <div className="rounded-md border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-slate-400" />
                Custom Fields
              </p>
              {!showAddField && (
                <button
                  type="button"
                  onClick={() => setShowAddField(true)}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                >
                  <Plus className="h-3.5 w-3.5" /> Add field
                </button>
              )}
            </div>

            <div className="mt-3 space-y-3">
              {fieldDefs.map((def) => (
                <div key={def.id} className="group flex items-start gap-2">
                  <div className="flex-1">
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
                      {def.label}
                      {def.is_required && <span className="text-red-400">*</span>}
                      <span className="ml-1 text-slate-300">· {FIELD_TYPES.find((t) => t.value === def.field_type)?.label}</span>
                    </label>
                    <FieldInput
                      def={def}
                      value={customValues[def.id] ?? null}
                      onChange={(v) => setCustomValues((prev) => ({ ...prev, [def.id]: v }))}
                    />
                  </div>
                  <button
                    type="button"
                    title="Remove this field from all contacts"
                    onClick={() => deleteFieldDef(def.id)}
                    className="mt-6 shrink-0 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {showAddField && (
              <AddFieldForm
                onAdd={(newDef) => {
                  setFieldDefs((prev) => [...prev, newDef]);
                  setShowAddField(false);
                }}
                onCancel={() => setShowAddField(false)}
              />
            )}
          </div>
        )}

        {/* Show "+ Add field" button even when no custom fields yet */}
        {fieldDefs.length === 0 && !showAddField && (
          <button
            type="button"
            onClick={() => setShowAddField(true)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600"
          >
            <Plus className="h-3.5 w-3.5" /> Add custom field
          </button>
        )}
        {/* Do not contact */}
        <label className="flex items-center gap-3 rounded-md border border-slate-200 p-3">
          <input type="checkbox" checked={blacklisted} onChange={toggleBlacklist} className="h-4 w-4" />
          <span className="text-sm font-medium text-slate-700">Do not contact</span>
          {blacklisted && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">Blacklisted</span>}
        </label>

        {/* Unavailability windows */}
        <div className="rounded-md border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Mark as Unavailable</p>
            <Button type="button" size="sm" variant="secondary" onClick={addWindow}>
              <Plus className="h-4 w-4" /> Add Date Range
            </Button>
          </div>
          {windows.length === 0 && <p className="mt-2 text-xs text-slate-400">No unavailability periods.</p>}
          <div className="mt-3 space-y-2">
            {windows.map((w, i) => (
              <div key={w.id ?? `new-${i}`} className="flex flex-wrap items-end gap-2 rounded border border-slate-100 bg-slate-50 p-2">
                <div>
                  <label className="block text-xs text-slate-500">Start</label>
                  <input type="date" value={w.start_date}
                    onChange={(e) => updateWindow(i, { start_date: e.target.value })}
                    className="rounded border border-slate-300 px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500">End</label>
                  <input type="date" value={w.end_date}
                    onChange={(e) => updateWindow(i, { end_date: e.target.value })}
                    className="rounded border border-slate-300 px-2 py-1 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-500">Reason (optional)</label>
                  <input type="text" value={w.reason} placeholder="Vacation"
                    onChange={(e) => updateWindow(i, { reason: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                </div>
                <button type="button" onClick={() => removeWindow(i)} className="p-1 text-slate-400 hover:text-red-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{isEdit ? 'Save changes' : 'Add contact'}</Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmBlacklist}
        onClose={() => setConfirmBlacklist(false)}
        onConfirm={() => setBlacklisted(true)}
        title="Do not contact"
        message="Mark this contact as do not contact? They will be skipped automatically when sending."
        confirmLabel="Yes, blacklist"
        danger
      />
    </Modal>
  );
}
