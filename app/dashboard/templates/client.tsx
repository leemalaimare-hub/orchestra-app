'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  FileText, Plus, Pencil, Copy, Trash2, Star, Paperclip,
  Search, MoreHorizontal, CheckSquare, Square, X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { TemplateTypeTabs } from '@/components/templates/TemplateTypeTabs';
import type { EmailTemplateWithMeta } from '@/types';

// ─── Row-level "..." context menu ─────────────────────────────────────────────

function RowMenu({
  template,
  onEdit,
  onDuplicate,
  onSetDefault,
  onDelete,
}: {
  template: EmailTemplateWithMeta;
  onEdit: () => void;
  onDuplicate: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const item = (label: string, icon: React.ReactNode, action: () => void, danger = false) => (
    <button
      type="button"
      onClick={() => { action(); setOpen(false); }}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((s) => !s); }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-700 focus:opacity-100"
        aria-label="More options"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {item('Edit', <Pencil className="h-3.5 w-3.5" />, onEdit)}
          {item('Duplicate', <Copy className="h-3.5 w-3.5" />, onDuplicate)}
          {!template.is_default && item('Set as default', <Star className="h-3.5 w-3.5" />, onSetDefault)}
          <div className="my-1 border-t border-slate-100" />
          {item('Delete', <Trash2 className="h-3.5 w-3.5" />, onDelete, true)}
        </div>
      )}
    </div>
  );
}

// ─── Main client ───────────────────────────────────────────────────────────────

export function TemplatesClient() {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplateWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplateWithMeta | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/templates')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { toast.error(d.error); return; }
        setTemplates(d.templates ?? []);
      })
      .catch(() => toast.error('Failed to load templates'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter by search
  const filtered = templates.filter((t) =>
    !search.trim() ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.subject.toLowerCase().includes(search.toLowerCase())
  );

  // Selection helpers
  const allSelected = filtered.length > 0 && filtered.every((t) => selected.has(t.id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((t) => t.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Actions
  const duplicate = async (t: EmailTemplateWithMeta) => {
    const res = await fetch(`/api/templates/${t.id}/duplicate`, { method: 'POST' });
    if (!res.ok) { toast.error('Duplicate failed'); return; }
    toast.success('Template duplicated');
    load();
  };

  const setDefault = async (t: EmailTemplateWithMeta) => {
    const res = await fetch(`/api/templates/${t.id}/set-default`, { method: 'POST' });
    if (!res.ok) { toast.error('Failed to set default'); return; }
    toast.success(`"${t.name}" is now the default`);
    load();
  };

  const doDelete = async (t: EmailTemplateWithMeta) => {
    const res = await fetch(`/api/templates/${t.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Delete failed'); return; }
    toast.success('Template deleted');
    setDeleteTarget(null);
    load();
  };

  const doBulkDelete = async () => {
    const ids = [...selected];
    await Promise.all(ids.map((id) => fetch(`/api/templates/${id}`, { method: 'DELETE' })));
    toast.success(`${ids.length} template${ids.length === 1 ? '' : 's'} deleted`);
    setSelected(new Set());
    setBulkDeleteOpen(false);
    load();
  };

  return (
    <div className="mx-auto max-w-3xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Templates</h1>
        <Link href="/dashboard/templates/new">
          <Button><Plus className="h-4 w-4" /> New Template</Button>
        </Link>
      </div>

      <TemplateTypeTabs active="email" />

      {/* ── Toolbar (search + bulk actions) ── */}
      <div className="mt-5 flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Bulk delete button (only when selection active) */}
        {someSelected && (
          <Button variant="danger" size="sm" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size}
          </Button>
        )}
      </div>

      {/* ── File list ── */}
      {loading ? (
        <p className="mt-10 text-center text-slate-400">Loading…</p>
      ) : templates.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-slate-300 p-10 text-center">
          <FileText className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-lg font-medium text-slate-700">No templates yet</p>
          <p className="mt-1 text-sm text-slate-500">Save a reusable email format to get started.</p>
          <Link href="/dashboard/templates/new" className="mt-4 inline-block">
            <Button>Create your first template</Button>
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-400">No templates match "{search}"</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

          {/* List header row (select-all + count) */}
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2">
            <button type="button" onClick={toggleAll} className="text-slate-400 hover:text-indigo-600">
              {allSelected
                ? <CheckSquare className="h-4 w-4 text-indigo-600" />
                : <Square className="h-4 w-4" />
              }
            </button>
            <span className="text-xs text-slate-400">
              {someSelected
                ? `${selected.size} of ${filtered.length} selected`
                : `${filtered.length} template${filtered.length === 1 ? '' : 's'}`
              }
            </span>
          </div>

          {/* Rows */}
          {filtered.map((t) => (
            <div
              key={t.id}
              className="group flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50"
            >
              {/* Checkbox */}
              <button
                type="button"
                onClick={() => toggleOne(t.id)}
                className="shrink-0 text-slate-300 hover:text-indigo-600"
              >
                {selected.has(t.id)
                  ? <CheckSquare className="h-4 w-4 text-indigo-600" />
                  : <Square className="h-4 w-4" />
                }
              </button>

              {/* File icon */}
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />

              {/* Name + meta — clicking opens editor */}
              <button
                type="button"
                onClick={() => router.push(`/dashboard/templates/${t.id}/edit`)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="truncate text-sm font-medium text-slate-900">{t.name}</span>
                {t.is_default && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Default
                  </span>
                )}
                {!!t.attachment_count && t.attachment_count > 0 && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                    <Paperclip className="h-3 w-3" />{t.attachment_count}
                  </span>
                )}
              </button>

              {/* Date */}
              <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                {new Date(t.updated_at).toLocaleDateString()}
              </span>

              {/* Context menu */}
              <RowMenu
                template={t}
                onEdit={() => router.push(`/dashboard/templates/${t.id}/edit`)}
                onDuplicate={() => duplicate(t)}
                onSetDefault={() => setDefault(t)}
                onDelete={() => setDeleteTarget(t)}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Single delete confirm ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) doDelete(deleteTarget); }}
        title="Delete template"
        message={deleteTarget
          ? `Delete "${deleteTarget.name}"? This won't affect emails already sent.`
          : ''}
        confirmLabel="Delete"
        danger
      />

      {/* ── Bulk delete confirm ── */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={doBulkDelete}
        title={`Delete ${selected.size} template${selected.size === 1 ? '' : 's'}?`}
        message="This can't be undone. Emails already sent won't be affected."
        confirmLabel={`Delete ${selected.size}`}
        danger
      />
    </div>
  );
}
