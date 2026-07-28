'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Concert, ConcertRehearsal, ConcertTemplateWithPositions, EmailTemplate, ProjectStatus } from '@/types';

interface DraftRehearsal { date: string; start_time: string; location: string; notes: string; timezone: string }

const schema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
});

const STATUS_OPTIONS: { value: ProjectStatus; label: string; desc: string }[] = [
  { value: 'draft',     label: 'Draft',    desc: 'Not yet sending' },
  { value: 'active',   label: 'Active',   desc: 'Cascade is running' },
  { value: 'filled',   label: 'Filled',   desc: 'Someone accepted' },
  { value: 'cancelled',label: 'Cancelled',desc: 'Project cancelled' },
];

const COMMON_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
];
const ALL_TIMEZONES: string[] = (() => {
  try {
    const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    return all.length > 0 ? all : COMMON_TIMEZONES;
  } catch {
    return COMMON_TIMEZONES;
  }
})();
function detectTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'America/New_York'; }
}

function VariableEditor({
  variables,
  onChange,
}: {
  variables: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  const add = () => {
    const key = newKey.trim().replace(/\s+/g, '_').toLowerCase();
    if (!key || !newVal.trim()) return;
    onChange({ ...variables, [key]: newVal.trim() });
    setNewKey('');
    setNewVal('');
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">
        Custom Variables
        <span className="ml-1 text-xs font-normal text-slate-400">
          Use as {'{{key}}'} in your template
        </span>
      </label>
      {Object.entries(variables).map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 text-sm">
          <span className="rounded bg-indigo-50 px-2 py-1 font-mono text-indigo-700">{`{{${k}}}`}</span>
          <span className="flex-1 text-slate-600">{v}</span>
          <button
            type="button"
            onClick={() => {
              const next = { ...variables };
              delete next[k];
              onChange(next);
            }}
            className="text-slate-400 hover:text-red-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          placeholder="variable_name"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="w-36 rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm"
        />
        <input
          placeholder="value"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <Button type="button" size="sm" variant="secondary" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ConcertForm({ concert }: { concert?: Concert & { rehearsals?: ConcertRehearsal[] } }) {
  const router = useRouter();
  const isEdit = !!concert;

  const [name, setName] = useState(concert?.name ?? '');
  const [notes, setNotes] = useState(concert?.notes ?? '');
  const [templateId, setTemplateId] = useState<string>(concert?.template_id ?? '');
  const [customVariables, setCustomVariables] = useState<Record<string, string>>(
    concert?.custom_variables ?? {}
  );
  const [status, setStatus] = useState<ProjectStatus>(concert?.status ?? 'draft');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [concertTemplates, setConcertTemplates] = useState<ConcertTemplateWithPositions[]>([]);
  const [startFromTemplateId, setStartFromTemplateId] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [eventDate, setEventDate] = useState(concert?.dates?.[0] ?? '');
  const [eventTime, setEventTime] = useState(concert?.event_time ?? '');
  const [eventTimezone, setEventTimezone] = useState(concert?.event_timezone ?? detectTimezone());
  const [venue, setVenue] = useState(concert?.venue ?? '');
  const [rehearsals, setRehearsals] = useState<DraftRehearsal[]>(
    (concert?.rehearsals ?? []).map((r) => ({
      date: r.date, start_time: r.start_time ?? '', location: r.location ?? '', notes: r.notes ?? '',
      timezone: r.timezone ?? '',
    }))
  );

  const addRehearsal = () => setRehearsals((r) => [
    ...r, { date: '', start_time: '', location: venue, notes: '', timezone: eventTimezone },
  ]);
  const removeRehearsal = (idx: number) => setRehearsals((r) => r.filter((_, i) => i !== idx));
  const updateRehearsal = (idx: number, patch: Partial<DraftRehearsal>) =>
    setRehearsals((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => {});
    if (!isEdit) {
      fetch('/api/concert-templates')
        .then((r) => r.json())
        .then((d) => setConcertTemplates(d.templates ?? []))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (thenAddPositions: boolean) => {
    const parsed = schema.safeParse({ name });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message;
      setErrors(errs);
      return;
    }
    for (const r of rehearsals) {
      if (!r.date) { toast.error('Each rehearsal needs a date'); return; }
    }

    setErrors({});
    setSaving(true);
    try {
      const payload = {
        name,
        notes: notes || null,
        template_id: templateId || null,
        custom_variables: customVariables,
        dates: eventDate ? [eventDate] : null,
        event_time: eventTime || null,
        event_timezone: eventTimezone || null,
        venue: venue || null,
        rehearsals: rehearsals.map((r) => ({
          date: r.date, start_time: r.start_time || null, location: r.location || null, notes: r.notes || null,
          timezone: r.timezone || null,
        })),
        ...(isEdit ? { status } : {}),
      };
      let projectId = concert?.id;
      if (isEdit) {
        const res = await fetch(`/api/concerts/${projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const b = await res.json();
        if (!res.ok) { toast.error(b.error || 'Save failed'); return; }
      } else {
        const res = await fetch('/api/concerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const b = await res.json();
        if (!res.ok) { toast.error(b.error || 'Save failed'); return; }
        projectId = b.concert.id;

        if (startFromTemplateId && projectId) {
          const posRes = await fetch(`/api/concerts/${projectId}/positions/from-template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ concert_template_id: startFromTemplateId }),
          });
          if (!posRes.ok) toast.error('Concert created, but failed to load positions from the template');
        }
      }
      toast.success(isEdit ? 'Concert updated' : 'Concert created');
      router.push((thenAddPositions || startFromTemplateId) ? `/dashboard/email/view/${projectId}` : '/dashboard/concerts');
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">
        {isEdit ? 'Edit Concert' : 'New Concert'}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Set the event details, then add positions and seat counts to start sending.
      </p>

      <div className="mt-6 space-y-4">

        {/* Name */}
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Project</h2>
          <Input
            label="Project Name"
            placeholder="e.g. Spring Pops Violin Sub, Last-Minute Viola Coverage"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Internal Notes
              <span className="ml-1 text-xs font-normal text-slate-400">(not sent to recipients)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Context for your team — budget, priority, special notes…"
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </section>

        {/* Start from a Concert Template (create only) */}
        {!isEdit && concertTemplates.length > 0 && (
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Start From a Concert Template
            </h2>
            <p className="mb-2 text-xs text-slate-500">
              Optional — pre-fills the instrumentation (positions + seat counts) from a saved blueprint.
            </p>
            <select
              value={startFromTemplateId}
              onChange={(e) => setStartFromTemplateId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">None — build instrumentation manually</option>
              {concertTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.positions.length} positions)</option>
              ))}
            </select>
          </section>
        )}

        {/* Event details */}
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Event</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Date</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Time</label>
              <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)}
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Timezone</label>
              <select value={eventTimezone} onChange={(e) => setEventTimezone(e.target.value)}
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                {ALL_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <Input label="Location" placeholder="e.g. Symphony Hall" value={venue} onChange={(e) => setVenue(e.target.value)} />
          </div>
        </section>

        {/* Rehearsals */}
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Rehearsals</h2>
            <Button type="button" size="sm" variant="secondary" onClick={addRehearsal}>
              <Plus className="h-3.5 w-3.5" /> Add Rehearsal
            </Button>
          </div>
          {rehearsals.length === 0 && <p className="mt-2 text-xs text-slate-400">No rehearsals added.</p>}
          <div className="mt-3 space-y-2">
            {rehearsals.map((r, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded border border-slate-100 bg-slate-50 p-2">
                <div>
                  <label className="block text-xs text-slate-500">Date</label>
                  <input type="date" value={r.date} onChange={(e) => updateRehearsal(i, { date: e.target.value })}
                    className="rounded border border-slate-300 px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500">Time</label>
                  <input type="time" value={r.start_time} onChange={(e) => updateRehearsal(i, { start_time: e.target.value })}
                    className="rounded border border-slate-300 px-2 py-1 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-500">Location</label>
                  <input type="text" value={r.location} placeholder="Rehearsal room"
                    onChange={(e) => updateRehearsal(i, { location: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500">Timezone</label>
                  <select value={r.timezone || eventTimezone} onChange={(e) => updateRehearsal(i, { timezone: e.target.value })}
                    className="rounded border border-slate-300 px-2 py-1 text-sm">
                    {ALL_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <button type="button" onClick={() => removeRehearsal(i)} className="p-1 text-slate-400 hover:text-red-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Template */}
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Default Template</h2>
          <p className="mb-2 text-xs text-slate-500">
            Sets the default for all positions in this project. Each position can override it.
          </p>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">No default — pick per position</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.is_default ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </section>

        {/* Custom variables */}
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Custom Variables
          </h2>
          <VariableEditor variables={customVariables} onChange={setCustomVariables} />
        </section>

        {/* Status (edit only) */}
        {isEdit && (
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Status</h2>
            <div className="space-y-2">
              {STATUS_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="status"
                    checked={status === o.value}
                    onChange={() => setStatus(o.value)}
                    className="mt-1 h-4 w-4 text-indigo-600"
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-800">{o.label}</span>
                    <span className="block text-xs text-slate-500">{o.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => save(false)} loading={saving}>
          {isEdit ? 'Save Concert' : 'Create Concert'}
        </Button>
        <Button variant="secondary" onClick={() => save(true)} loading={saving}>
          Save &amp; Add Positions
        </Button>
        <Button variant="ghost" onClick={() => router.push('/dashboard/concerts')}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
