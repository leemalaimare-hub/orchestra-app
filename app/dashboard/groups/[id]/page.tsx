'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, Search, UserPlus, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { ImportMembersModal } from '@/components/groups/ImportMembersModal';
import type { RecipientGroup, RecipientGroupMember, Musician } from '@/types';

interface GroupDetail extends RecipientGroup {
  members: RecipientGroupMember[];
}

function AddMemberModal({ open, onClose, groupId, onAdded }: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  onAdded: () => void;
}) {
  const [tab, setTab] = useState<'contacts' | 'adhoc'>('contacts');
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState<Musician[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [adhocName, setAdhocName] = useState('');
  const [adhocEmail, setAdhocEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingContacts(true);
    fetch('/api/musicians?limit=200')
      .then((r) => r.json())
      .then((d) => setContacts(d.musicians ?? []))
      .catch(() => {})
      .finally(() => setLoadingContacts(false));
  }, [open]);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  });

  const addContact = async (c: Musician) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          musician_id: c.id,
          name: `${c.first_name} ${c.last_name}`,
          email: c.email,
        }),
      });
      const b = await res.json();
      if (!res.ok) { toast.error(b.error || 'Failed to add'); return; }
      toast.success(`${c.first_name} ${c.last_name} added`);
      onAdded();
    } finally {
      setSaving(false);
    }
  };

  const addAdhoc = async () => {
    if (!adhocName.trim() || !adhocEmail.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: adhocName.trim(), email: adhocEmail.trim() }),
      });
      const b = await res.json();
      if (!res.ok) { toast.error(b.error || 'Failed to add'); return; }
      toast.success(`${adhocName} added`);
      setAdhocName('');
      setAdhocEmail('');
      onAdded();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add to Group" maxWidth="max-w-lg">
      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {(['contacts', 'adhoc'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'
            }`}
          >
            {t === 'contacts' ? 'From Contacts' : 'Add Manually'}
          </button>
        ))}
      </div>

      {tab === 'contacts' ? (
        <div>
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
            {loadingContacts ? (
              <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">No contacts found</p>
            ) : (
              filtered.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {c.first_name} {c.last_name}
                    </p>
                    <p className="text-xs text-slate-400">{c.email} · {c.position}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => addContact(c)} loading={saving}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Add someone who isn't in your contacts list — a guest, freelancer, or one-time contact.
          </p>
          <Input
            label="Name"
            placeholder="Full name"
            value={adhocName}
            onChange={(e) => setAdhocName(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            placeholder="email@example.com"
            value={adhocEmail}
            onChange={(e) => setAdhocEmail(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              onClick={addAdhoc}
              loading={saving}
              disabled={!adhocName.trim() || !adhocEmail.trim()}
            >
              Add to Group
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function GroupDetailPage({ params }: { params: { id: string } }) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecipientGroupMember | null>(null);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/groups/${params.id}`)
      .then((r) => r.json())
      .then((d) => setGroup(d.group ?? null))
      .catch(() => toast.error('Failed to load group'))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  const moveItem = async (members: RecipientGroupMember[], fromIdx: number, toIdx: number) => {
    const reordered = [...members];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const ranked = reordered.map((m, i) => ({ ...m, rank: i }));
    setGroup((g) => g ? { ...g, members: ranked } : g);
    setReordering(true);
    try {
      await fetch(`/api/groups/${params.id}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: ranked.map((m) => ({ id: m.id, rank: m.rank })) }),
      });
    } catch {
      toast.error('Failed to save order');
      load();
    } finally {
      setReordering(false);
    }
  };

  const deleteMember = async (m: RecipientGroupMember) => {
    const res = await fetch(`/api/groups/${params.id}/members?memberId=${m.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Failed to remove'); return; }
    toast.success('Removed from group');
    load();
  };

  if (loading) return <div className="text-center text-slate-400 py-20">Loading…</div>;
  if (!group) return <div className="text-center text-red-500 py-20">Group not found.</div>;

  const members = [...group.members].sort((a, b) => a.rank - b.rank);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Back nav */}
      <Link href="/dashboard/groups" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to Groups
      </Link>

      {/* Header */}
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{group.name}</h1>
          {group.description && (
            <p className="mt-1 text-sm text-slate-500">{group.description}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {members.length} contact{members.length === 1 ? '' : 's'} · cascade starts from #1
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" /> Import
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add Contact
          </Button>
        </div>
      </div>

      {/* Sequence */}
      <div className="mt-6">
        {members.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
            <p className="font-medium text-slate-600">No contacts in this group yet</p>
            <p className="mt-1 text-sm text-slate-400">
              Add contacts from your list, enter them manually, or import a spreadsheet.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="h-4 w-4" /> Import
              </Button>
              <Button onClick={() => setAddOpen(true)}>
                <UserPlus className="h-4 w-4" /> Add Contact
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Cascade Sequence
              </p>
              <p className="text-xs text-slate-400">Use ↑↓ to reorder</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {members.map((m, idx) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Rank number */}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                    {idx + 1}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                    <p className="text-xs text-slate-400 truncate">{m.email}
                      {!m.musician_id && <span className="ml-1 text-indigo-400">· ad-hoc</span>}
                    </p>
                  </div>

                  {/* Reorder + delete */}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      disabled={idx === 0 || reordering}
                      onClick={() => moveItem(members, idx, idx - 1)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      disabled={idx === members.length - 1 || reordering}
                      onClick={() => moveItem(members, idx, idx + 1)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(m)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <AddMemberModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        groupId={params.id}
        onAdded={load}
      />

      <ImportMembersModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        groupId={params.id}
        onImported={load}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteMember(deleteTarget); }}
        title="Remove from group"
        message={deleteTarget ? `Remove ${deleteTarget.name} from this group?` : ''}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
