'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { X, ChevronDown, ArrowUp, ArrowDown, Clock, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AddEditMusician } from '@/components/musicians/AddEditMusician';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { TEMPLATE_VARIABLES } from '@/lib/templateEngine';
import type { Musician, EmailTemplate, RecipientGroupWithCount, RecipientGroupMember } from '@/types';

const EDITOR_VARIABLES = TEMPLATE_VARIABLES.map((v) => ({ label: v.description, key: v.key }));

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recipient {
  key: string;        // unique UI key
  musician_id: string | null;
  name: string;
  email: string;
  rank: number;       // tier — multiple recipients can share the same rank
}

// ─── Recipient chip ───────────────────────────────────────────────────────────

function Chip({ r, onRemove }: { r: Recipient; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 pl-2.5 pr-1 py-0.5 text-sm text-indigo-800">
      {r.name}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-indigo-200"
        aria-label={`Remove ${r.name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ─── To field with autocomplete ───────────────────────────────────────────────

function ToField({
  recipients,
  onAdd,
  onRemove,
  groups,
  onLoadGroup,
}: {
  recipients: Recipient[];
  onAdd: (r: Omit<Recipient, 'key' | 'rank'>) => void;
  onRemove: (key: string) => void;
  groups: RecipientGroupWithCount[];
  onLoadGroup: (groupId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Musician[]>([]);
  const [loading, setLoading] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [focused, setFocused] = useState(false);
  const [createEmail, setCreateEmail] = useState<string | null>(null); // triggers modal
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback((q: string) => {
    if (!q.trim()) { setSuggestions([]); return; }
    setLoading(true);
    fetch(`/api/musicians?search=${encodeURIComponent(q)}&limit=8`)
      .then((r) => r.json())
      .then((d) => setSuggestions(d.musicians ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 200);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  const existingEmails = new Set(recipients.map((r) => r.email));

  const pick = (m: Musician) => {
    if (existingEmails.has(m.email)) { toast.error('Already added'); return; }
    onAdd({ musician_id: m.id, name: `${m.first_name} ${m.last_name}`, email: m.email });
    setQuery('');
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const triggerCreate = (email: string) => {
    if (existingEmails.has(email)) { toast.error('Already added'); return; }
    setFocused(false);
    setSuggestions([]);
    setCreateEmail(email);
  };

  // Enter on a valid email opens the create-contact modal
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.includes('@') && query.includes('.')) {
      e.preventDefault();
      if (!existingEmails.has(query)) triggerCreate(query);
    }
    if (e.key === 'Backspace' && !query && recipients.length > 0) {
      onRemove(recipients[recipients.length - 1].key);
    }
  };

  return (
    <>
      <div className="relative">
        <div
          className="flex min-h-[44px] flex-wrap items-center gap-1.5 px-4 py-2 cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          <span className="shrink-0 text-sm font-medium text-slate-400 w-6">To</span>
          {recipients.map((r) => (
            <Chip key={r.key} r={r} onRemove={() => onRemove(r.key)} />
          ))}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => { setFocused(false); setSuggestions([]); }, 150)}
            onKeyDown={handleKey}
            placeholder={recipients.length === 0 ? 'Search contacts or type an email…' : ''}
            className="min-w-[180px] flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          {/* Group picker button */}
          <button
            type="button"
            onClick={() => setShowGroups((s) => !s)}
            className="ml-auto shrink-0 flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
          >
            Load Group <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        {/* Contact suggestions dropdown */}
        {focused && (suggestions.length > 0 || loading || (query.includes('@') && query.includes('.'))) && (
          <div className="absolute left-0 right-0 top-full z-50 mt-0.5 rounded-lg border border-slate-200 bg-white shadow-lg">
            {loading && (
              <p className="px-4 py-2 text-xs text-slate-400">Searching…</p>
            )}
            {suggestions.filter((s) => !existingEmails.has(s.email)).map((m) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={() => pick(m)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                  {m.first_name[0]}{m.last_name[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {m.first_name} {m.last_name}
                  </p>
                  <p className="text-xs text-slate-400">{m.email}{m.position ? ` · ${m.position}` : ''}</p>
                </div>
              </button>
            ))}
            {/* "Create new contact" option for unknown emails */}
            {!loading && query.includes('@') && query.includes('.') && !existingEmails.has(query) && (
              <button
                type="button"
                onMouseDown={() => triggerCreate(query)}
                className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-2.5 text-left hover:bg-indigo-50"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                  <UserPlus className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-indigo-700">Create new contact</p>
                  <p className="text-xs text-slate-400">{query}</p>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Groups dropdown */}
        {showGroups && (
          <div className="absolute right-0 top-full z-50 mt-0.5 w-64 rounded-lg border border-slate-200 bg-white shadow-lg">
            <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase text-slate-400">
              Recipient Groups
            </p>
            {groups.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">No groups yet</p>
            ) : (
              groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onMouseDown={() => { onLoadGroup(g.id); setShowGroups(false); }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="text-sm font-medium text-slate-800">{g.name}</span>
                  <span className="text-xs text-slate-400">{g.member_count} contacts</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Create contact modal — reuses the same AddEditMusician modal */}
      {createEmail && (
        <AddEditMusician
          open={true}
          initialEmail={createEmail}
          positions={[]}
          onClose={() => {
            setCreateEmail(null);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          onSaved={() => {}}
          onCreated={(m) => {
            const displayName = [m.first_name, m.last_name === '-' ? '' : m.last_name].filter(Boolean).join(' ');
            onAdd({ musician_id: m.id, name: displayName, email: m.email });
            setCreateEmail(null);
            setQuery('');
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
        />
      )}
    </>
  );
}

// ─── Tier-based sequence list ─────────────────────────────────────────────────

const TIER_COLORS = [
  'border-indigo-200 bg-indigo-50',
  'border-violet-200 bg-violet-50',
  'border-sky-200 bg-sky-50',
  'border-emerald-200 bg-emerald-50',
  'border-amber-200 bg-amber-50',
  'border-rose-200 bg-rose-50',
];
const TIER_BADGE = [
  'bg-indigo-100 text-indigo-700',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
];

function SequenceList({
  recipients,
  onChange,
  onRemove,
}: {
  recipients: Recipient[];
  onChange: (updated: Recipient[]) => void;
  onRemove: (key: string) => void;
}) {
  if (recipients.length === 0) return null;

  // Sort by rank then by insertion order (key)
  const sorted = [...recipients].sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));

  // Unique sorted ranks → tier labels (Tier 1, 2, 3…)
  const uniqueRanks = [...new Set(sorted.map((r) => r.rank))];
  const rankToTier  = new Map(uniqueRanks.map((r, i) => [r, i]));

  const updateRanks = (fn: (r: Recipient) => Recipient) =>
    onChange(recipients.map(fn));

  // Move a whole tier up (swap ranks with the tier above)
  const moveTierUp = (rank: number) => {
    const idx = uniqueRanks.indexOf(rank);
    if (idx === 0) return;
    const prevRank = uniqueRanks[idx - 1];
    updateRanks((r) => {
      if (r.rank === rank)     return { ...r, rank: prevRank };
      if (r.rank === prevRank) return { ...r, rank };
      return r;
    });
  };

  // Move a whole tier down (swap ranks with the tier below)
  const moveTierDown = (rank: number) => {
    const idx = uniqueRanks.indexOf(rank);
    if (idx === uniqueRanks.length - 1) return;
    const nextRank = uniqueRanks[idx + 1];
    updateRanks((r) => {
      if (r.rank === rank)     return { ...r, rank: nextRank };
      if (r.rank === nextRank) return { ...r, rank };
      return r;
    });
  };

  // Merge a single recipient into the tier above
  const mergeUp = (recipient: Recipient) => {
    const currentTierIdx = rankToTier.get(recipient.rank)!;
    if (currentTierIdx === 0) return;
    const targetRank = uniqueRanks[currentTierIdx - 1];
    // If this person is the only one in their tier, just change their rank
    onChange(recipients.map((r) =>
      r.key === recipient.key ? { ...r, rank: targetRank } : r
    ));
  };

  // Split a person out of their tier into a new tier just below the current one
  const splitOut = (recipient: Recipient) => {
    const tierIdx = rankToTier.get(recipient.rank)!;
    const nextRank = uniqueRanks[tierIdx + 1];
    // New rank = current + 0.5 (will be normalised)
    const newRank = nextRank !== undefined
      ? (recipient.rank + nextRank) / 2
      : recipient.rank + 1;
    const updated = recipients.map((r) =>
      r.key === recipient.key ? { ...r, rank: newRank } : r
    );
    // Normalise ranks to integers
    const sortedUp = [...updated].sort((a, b) => a.rank - b.rank);
    const normRanks = [...new Set(sortedUp.map((r) => r.rank))];
    const norm = new Map(normRanks.map((r, i) => [r, i + 1]));
    onChange(updated.map((r) => ({ ...r, rank: norm.get(r.rank)! })));
  };

  // Group sorted list into tiers
  const tiers: { rank: number; tierIdx: number; members: Recipient[] }[] = [];
  for (const rank of uniqueRanks) {
    tiers.push({
      rank,
      tierIdx: rankToTier.get(rank)!,
      members: sorted.filter((r) => r.rank === rank),
    });
  }

  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Cascade sequence — contacts in the same tier are treated as equal priority
      </p>
      <div className="space-y-2">
        {tiers.map(({ rank, tierIdx, members }, tIdx) => {
          const colorCard  = TIER_COLORS[tierIdx % TIER_COLORS.length];
          const colorBadge = TIER_BADGE[tierIdx % TIER_BADGE.length];
          const isFirst    = tIdx === 0;
          const isLast     = tIdx === tiers.length - 1;

          return (
            <div key={rank} className={`rounded-lg border ${colorCard} p-2`}>
              {/* Tier header */}
              <div className="mb-1.5 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colorBadge}`}>
                  Tier {tierIdx + 1}
                </span>
                {members.length > 1 && (
                  <span className="text-xs text-slate-400">{members.length} contacts — sent simultaneously</span>
                )}
                <div className="ml-auto flex items-center gap-0.5">
                  <button
                    type="button"
                    title="Move tier up"
                    disabled={isFirst}
                    onClick={() => moveTierUp(rank)}
                    className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Move tier down"
                    disabled={isLast}
                    onClick={() => moveTierDown(rank)}
                    className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Members */}
              <div className="space-y-1">
                {members.map((r) => (
                  <div key={r.key} className="group flex items-center gap-2 rounded-md bg-white/70 px-2 py-1.5">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-800">{r.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{r.email}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Merge up into previous tier */}
                      {!isFirst && (
                        <button
                          type="button"
                          title="Move up to previous tier"
                          onClick={() => mergeUp(r)}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {/* Split out to own tier */}
                      {members.length > 1 && (
                        <button
                          type="button"
                          title="Split into own tier"
                          onClick={() => splitOut(r)}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemove(r.key)}
                        className="rounded p-0.5 text-slate-400 hover:text-red-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* "Add to this tier" hint between tiers */}
              {!isLast && (
                <p className="mt-1.5 text-center text-[10px] text-slate-400">
                  ↓ if no one above accepts, cascade moves to next tier
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main compose page ────────────────────────────────────────────────────────

export default function ComposePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get('draft'); // existing draft project id

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templateId, setTemplateId] = useState('');
  // null = no deadline
  const [deadlineHours, setDeadlineHours] = useState<number | null>(48);
  const [hasDeadline, setHasDeadline] = useState(true);

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [groups, setGroups] = useState<RecipientGroupWithCount[]>([]);
  const [broadcast, setBroadcast] = useState(false);
  const [filledMessage, setFilledMessage] = useState(
    `Thank you for considering this opportunity. Someone else has accepted, so we're all set for now. We appreciate your time and will keep you in mind for future opportunities.`
  );
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const autoSaveInFlightRef = useRef<Promise<void> | null>(null);

  // Load templates + groups
  useEffect(() => {
    fetch('/api/templates').then((r) => r.json()).then((d) => setTemplates(d.templates ?? []));
    fetch('/api/groups').then((r) => r.json()).then((d) => setGroups(d.groups ?? []));
  }, []);

  // Load existing draft if ?draft=<id>
  useEffect(() => {
    if (!draftId) return;
    setLoadingDraft(true);
    fetch(`/api/concerts/${draftId}`)
    .then((r) => r.json())
    .then(async (concertData) => {
      const concert = concertData.concert;
      // positions are embedded in the concert GET response
      const pos = concert?.positions?.[0];
      if (!concert) return;
      setSubject(concert.name ?? '');
      if (concert.filled_message) setFilledMessage(concert.filled_message);
      if (pos?.send_mode === 'broadcast') setBroadcast(true);
      if (concert.accept_deadline_hours) {
        setDeadlineHours(concert.accept_deadline_hours);
        setHasDeadline(true);
      } else {
        setHasDeadline(false);
      }
      // Load template body
      if (pos?.template_id) {
        const td = await fetch(`/api/templates/${pos.template_id}`).then((r) => r.json());
        if (td.template) {
          setBody(td.template.body ?? '');
          setTemplateId(pos.template_id);
        }
      }
      // Load recipients
      if (pos?.id) {
        const md = await fetch(`/api/concerts/${draftId}/positions/${pos.id}/musicians`).then((r) => r.json());
        const list = md.musicians ?? [];
        setRecipients(list.map((m: { musician_id?: string; first_name: string; last_name: string; email: string; rank: number }) => ({
          key: `${m.email}-draft`,
          musician_id: m.musician_id ?? null,
          name: `${m.first_name} ${m.last_name}`.trim(),
          email: m.email,
          rank: m.rank,
        })));
      }
    }).catch(() => toast.error('Failed to load draft'))
      .finally(() => setLoadingDraft(false));
  }, [draftId]);

  // Auto-save draft after 3 seconds of inactivity (only if there's something to save)
  useEffect(() => {
    if (loadingDraft) return; // don't auto-save while loading
    if (!subject.trim() && recipients.length === 0) return; // nothing worth saving yet

    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveInFlightRef.current = (async () => {
        try {
          const res = await fetch('/api/email/compose-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subject: subject || '(Untitled draft)',
              body: body || '<p></p>',
              recipients: recipients.map((r) => ({ musician_id: r.musician_id, name: r.name, email: r.email, rank: r.rank })),
              template_id: templateId || null,
              accept_deadline_hours: hasDeadline ? (deadlineHours ?? 48) : null,
              send_mode: broadcast ? 'broadcast' : 'cascade',
              filled_message: broadcast ? filledMessage : undefined,
              save_as_draft: true,
              draft_project_id: currentDraftId || null,
            }),
          });
          const data = await res.json();
          if (res.ok && data.project_id) {
            setCurrentDraftId(data.project_id);
            setAutoSavedAt(new Date());
            // Update URL without page reload so refreshing keeps the draft
            window.history.replaceState(null, '', `/dashboard/email/compose?draft=${data.project_id}`);
          }
        } catch {
          // Silent fail — auto-save is best-effort
        } finally {
          autoSaveInFlightRef.current = null;
        }
      })();
    }, 3000);

    return () => clearTimeout(autoSaveTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, body, recipients, hasDeadline, deadlineHours, broadcast, filledMessage, templateId]);

  // When template selected, pre-fill subject + body
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (!subject) setSubject(t.subject);
    setBody(t.body);
  };

  // Next available rank = max existing rank + 1 (each new add gets its own tier by default)
  const nextRank = () => {
    if (recipients.length === 0) return 1;
    return Math.max(...recipients.map((r) => r.rank)) + 1;
  };

  // Add recipient — each new contact gets its own tier by default
  const addRecipient = (r: Omit<Recipient, 'key' | 'rank'>) => {
    setRecipients((prev) => [...prev, { ...r, key: `${r.email}-${Date.now()}`, rank: nextRank() }]);
  };

  // Remove recipient
  const removeRecipient = (key: string) => {
    setRecipients((prev) => prev.filter((r) => r.key !== key));
  };

  // Load a group's members as recipients, preserving their group ranks as tiers
  const loadGroup = async (groupId: string) => {
    const res = await fetch(`/api/groups/${groupId}`);
    const d = await res.json();
    const members: RecipientGroupMember[] = d.group?.members ?? [];
    const sorted = [...members].sort((a, b) => a.rank - b.rank);
    const existingEmails = new Set(recipients.map((r) => r.email));
    const base = nextRank();
    const groupRanks = [...new Set(sorted.map((m) => m.rank))];
    const rankMap = new Map(groupRanks.map((r, i) => [r, base + i]));
    const newOnes = sorted
      .filter((m) => !existingEmails.has(m.email))
      .map((m) => ({
        key: `${m.email}-${Date.now()}-${m.rank}`,
        musician_id: m.musician_id ?? null,
        name: m.name,
        email: m.email,
        rank: rankMap.get(m.rank) ?? base,
      }));
    setRecipients((prev) => [...prev, ...newOnes]);
    toast.success(`Loaded ${newOnes.length} contacts from group`);
  };

  const submit = async (saveAsDraft: boolean) => {
    if (recipients.length === 0) { toast.error('Add at least one contact'); return; }
    if (!subject.trim()) { toast.error('Subject is required'); return; }
    if (!body.trim() || body === '<p></p>') { toast.error('Email body is required'); return; }

    // Prevent a stray draft row: cancel any pending autosave and wait for one
    // already in flight so currentDraftId reflects the latest saved row.
    clearTimeout(autoSaveTimerRef.current);
    if (autoSaveInFlightRef.current) await autoSaveInFlightRef.current;

    if (saveAsDraft) setSavingDraft(true);
    else setSending(true);

    try {
      const res = await fetch('/api/email/compose-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body,
          recipients: recipients.map((r) => ({ musician_id: r.musician_id, name: r.name, email: r.email, rank: r.rank })),
          template_id: templateId || null,
          accept_deadline_hours: hasDeadline ? (deadlineHours ?? 48) : null,
          send_mode: broadcast ? 'broadcast' : 'cascade',
          filled_message: broadcast ? filledMessage : undefined,
          save_as_draft: saveAsDraft,
          draft_project_id: currentDraftId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to send'); return; }

      if (saveAsDraft) {
        toast.success('Draft saved');
      } else {
        if (data.sent) {
          const mode = broadcast ? 'Broadcast sent' : 'Cascade started';
          toast.success(`${mode}${data.recipient_name ? ` — sent to ${data.recipient_name}` : ''}`);
        } else if (data.reason === 'exhausted') {
          toast.warning('No eligible contacts found');
        } else {
          // Show the actual failure reason so user can diagnose
          toast.error(`Send failed: ${data.reason ?? 'Unknown error'}`);
          return; // don't redirect so user can fix and retry
        }
      }
      router.push('/dashboard/email');
    } finally {
      setSending(false);
      setSavingDraft(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Page title */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">New Email</h1>
        <button
          onClick={() => router.back()}
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          Discard
        </button>
      </div>

      {/* Compose card — Gmail-style */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

        {/* TO field */}
        <ToField
          recipients={recipients}
          onAdd={addRecipient}
          onRemove={removeRecipient}
          groups={groups}
          onLoadGroup={loadGroup}
        />

        {/* Tier sequence (shown when ≥ 1 recipient so user can manage tiers) */}
        {recipients.length > 0 && (
          <SequenceList
            recipients={recipients}
            onChange={setRecipients}
            onRemove={removeRecipient}
          />
        )}

        {/* Divider */}
        <div className="h-px bg-slate-100" />

        {/* SUBJECT */}
        <div className="flex items-center border-b border-slate-100 px-4">
          <span className="shrink-0 w-16 text-sm font-medium text-slate-400">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject line"
            className="flex-1 border-0 bg-transparent py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
        </div>

        {/* Template selector + options toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2">
          <select
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
            className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 focus:border-indigo-400 focus:outline-none"
          >
            <option value="">Use a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <span className="text-xs text-slate-400">or write below ↓</span>

          {/* Deadline checkbox */}
          <label className="ml-auto flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasDeadline}
              onChange={(e) => {
                setHasDeadline(e.target.checked);
                if (e.target.checked && !deadlineHours) setDeadlineHours(48);
              }}
              className="h-3.5 w-3.5 rounded accent-indigo-600"
            />
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-600">Response deadline</span>
          </label>

          {/* Broadcast checkbox */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={broadcast}
              onChange={(e) => setBroadcast(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-amber-500"
            />
            <span className="text-xs font-medium text-slate-600">📡 Broadcast</span>
          </label>
        </div>

        {/* Deadline picker (shown when checkbox checked) */}
        {hasDeadline && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-indigo-50 px-4 py-2.5">
            <span className="text-xs font-medium text-indigo-700">Response window:</span>
            {[24, 48, 72, 168].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setDeadlineHours(h)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  deadlineHours === h
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'
                }`}
              >
                {h === 168 ? '1 week' : `${h}h`}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={8760}
                value={deadlineHours ?? 48}
                onChange={(e) => setDeadlineHours(Number(e.target.value))}
                className="w-16 rounded border border-slate-200 px-2 py-1 text-xs"
              />
              <span className="text-xs text-slate-500">hours</span>
            </div>
          </div>
        )}

        {/* Broadcast: editable "position filled" message */}
        {broadcast && (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-3">
            <p className="mb-1.5 text-xs font-semibold text-amber-800">
              📡 Broadcast mode — everyone receives the email at once. First to accept wins.
            </p>
            <p className="mb-2 text-xs text-amber-700">Message shown to others once someone accepts:</p>
            <textarea
              value={filledMessage}
              onChange={(e) => setFilledMessage(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 resize-none"
            />
            <p className="mt-1 text-xs text-amber-600">
              Their response links will be blocked and this message will appear when they open it.
            </p>
          </div>
        )}

        {/* BODY — rich text editor */}
        <div className="border-0">
          <RichTextEditor
            content={body}
            onChange={setBody}
            placeholder="Write your email here… Use the { } button to insert variables like {{name}}."
            variables={EDITOR_VARIABLES}
            minHeight={300}
          />
        </div>

        {/* Footer / Send bar */}
        <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <Button
            onClick={() => submit(false)}
            loading={sending}
            disabled={savingDraft}
          >
            {broadcast ? '📡 Send Broadcast' : '▶ Start Cascade'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => submit(true)}
            loading={savingDraft}
            disabled={sending}
          >
            Save Draft
          </Button>
          <div className="ml-auto text-xs text-slate-400 text-right">
            {autoSavedAt && (
              <span className="mr-2 text-slate-300">
                Auto-saved {autoSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            {recipients.length > 0
              ? `${recipients.length} contact${recipients.length === 1 ? '' : 's'}${hasDeadline && deadlineHours ? ` · ${deadlineHours}h window` : ' · no deadline'}`
              : 'Add contacts to send'}
          </div>
        </div>
      </div>
    </div>
  );
}
