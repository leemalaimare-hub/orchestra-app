'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, XCircle, Clock, Circle, SkipForward, ChevronDown, ChevronUp, StopCircle, Plus, Send } from 'lucide-react';
import { AddEditPositionModal } from '@/components/concerts/AddEditPositionModal';
import type { ConcertPosition } from '@/types';

interface SendLog {
  id: string;
  status: string;
  sent_at: string | null;
  responded_at: string | null;
  email_subject: string | null;
  email_body: string | null;
  musician_id: string;
  skip_reason: string | null;
  concert_position_id: string;
  musicians: { first_name: string; last_name: string; email: string } | null;
}

interface Project {
  id: string;
  name: string;
  status: string;
  created_at: string;
  positions: ConcertPosition[];
}

const STATUS_CFG: Record<string, { label: string; icon: typeof Circle; cls: string }> = {
  pending:     { label: 'Pending',   icon: Circle,       cls: 'text-slate-400' },
  sent:        { label: 'Awaiting',  icon: Clock,        cls: 'text-blue-500' },
  accepted:    { label: 'Accepted',  icon: CheckCircle2, cls: 'text-green-500' },
  declined:    { label: 'Declined',  icon: XCircle,      cls: 'text-red-400' },
  no_response: { label: 'No reply',  icon: Clock,        cls: 'text-amber-500' },
  skipped:     { label: 'Skipped',   icon: SkipForward,  cls: 'text-slate-300' },
};

function timeStr(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function EmailViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [sendLogs, setSendLogs] = useState<SendLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [addPositionOpen, setAddPositionOpen] = useState(false);
  const [sendingPositionId, setSendingPositionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [concertRes, logRes] = await Promise.all([
        fetch(`/api/concerts/${id}`),
        fetch(`/api/concerts/${id}/send-logs`),
      ]);
      if (!concertRes.ok) throw new Error('Not found');
      const { concert } = await concertRes.json();
      const { logs } = await logRes.json();
      setProject(concert ?? null);
      setSendLogs(logs ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Send logs can lag a moment behind the send call finishing — retry briefly
  // rather than showing "no contacts" if we land here right after sending.
  useEffect(() => {
    if (loading || !project || sendLogs.length > 0) return;
    if (project.status !== 'active') return;
    const t = setTimeout(load, 2000);
    return () => clearTimeout(t);
  }, [loading, project, sendLogs, load]);

  const stopCascade = async () => {
    if (!confirm('Stop this cascade? Pending response links will be expired and no further emails will be sent.')) return;
    setStopping(true);
    try {
      const res = await fetch(`/api/concerts/${id}/stop`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Failed to stop'); return; }
      toast.success('Cascade stopped');
      setProject((p) => p ? { ...p, status: 'cancelled' } : p);
    } catch {
      toast.error('Failed to stop cascade');
    } finally {
      setStopping(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-3xl pt-16 text-center text-slate-400">Loading…</div>;
  if (!project) return <div className="mx-auto max-w-3xl pt-16 text-center text-slate-400">Not found</div>;

  const statusCls =
    project.status === 'active'    ? 'bg-blue-100 text-blue-700' :
    project.status === 'filled'    ? 'bg-green-100 text-green-700' :
    project.status === 'completed' ? 'bg-green-100 text-green-700' :
    project.status === 'cancelled' ? 'bg-red-100 text-red-700'    :
                                     'bg-slate-100 text-slate-600';

  return (
    <div className="mx-auto max-w-3xl space-y-4">

      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => router.back()}
          className="mt-1 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-xl font-bold text-slate-900">{project.name}</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {project.positions.length} position{project.positions.length === 1 ? '' : 's'} · {timeStr(project.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCls}`}>
            {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
          </span>
          {(project.status === 'active' || project.status === 'draft') && (
            <button
              onClick={() => setAddPositionOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add Position
            </button>
          )}
          {project.status === 'active' && (
            <button
              onClick={stopCascade}
              disabled={stopping}
              className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              <StopCircle className="h-3.5 w-3.5" />
              {stopping ? 'Stopping…' : 'Stop'}
            </button>
          )}
        </div>
      </div>

      {/* One card per position — each has its own email content + contact list */}
      {project.positions.map((position) => (
        <PositionCard
          key={position.id}
          position={position}
          logs={sendLogs.filter((l) => l.concert_position_id === position.id)}
          sending={sendingPositionId === position.id}
          onSend={() => sendPosition(position.id)}
        />
      ))}

      <AddEditPositionModal
        open={addPositionOpen}
        onClose={() => setAddPositionOpen(false)}
        onSaved={load}
        concertId={project.id}
        position={null}
        existingPositionNames={project.positions.map((p) => p.position_name)}
      />
    </div>
  );

  async function sendPosition(positionId: string) {
    setSendingPositionId(positionId);
    try {
      const res = await fetch(`/api/concerts/${id}/positions/${positionId}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Failed to start sending'); return; }
      if (data.sent) {
        toast.success(`Sending started${data.recipient_name ? ` — sent to ${data.recipient_name}` : ''}`);
      } else {
        toast.warning(data.reason ?? 'No eligible contacts found');
      }
      load();
    } finally {
      setSendingPositionId(null);
    }
  }
}

// ─── One position's email content + contact list ─────────────────────────────

function PositionCard({ position, logs, sending, onSend }: {
  position: ConcertPosition;
  logs: SendLog[];
  sending: boolean;
  onSend: () => void;
}) {
  const [bodyOpen, setBodyOpen] = useState(false);
  const isBroadcast = position.send_mode === 'broadcast';
  const templateLog = logs.find((l) => l.email_body);

  function stripResponseFooter(html: string): string {
    // The engine appends a <div>———————————————————</div> separator
    const idx = html.indexOf('———————————————————');
    return idx !== -1 ? html.slice(0, idx).trim() : html;
  }

  // One row per musician (most recent log wins)
  const byMusician = new Map<string, SendLog>();
  for (const l of logs) {
    const prev = byMusician.get(l.musician_id);
    if (!prev || (l.sent_at ?? '') > (prev.sent_at ?? '')) byMusician.set(l.musician_id, l);
  }
  const rows = [...byMusician.values()].sort((a, b) =>
    (a.sent_at ?? '') < (b.sent_at ?? '') ? -1 : 1
  );
  const acceptedCount = rows.filter((r) => r.status === 'accepted').length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          {position.position_name}
          <span className="text-xs font-normal text-slate-400">
            {isBroadcast ? '📡 Broadcast' : '⬇ Cascade'} · {acceptedCount}/{position.musicians_needed} filled
          </span>
        </h2>
        {position.status === 'pending' && (
          <button
            onClick={onSend}
            disabled={sending}
            className="flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            <Send className="h-3.5 w-3.5" /> {sending ? 'Sending…' : 'Send'}
          </button>
        )}
      </div>

      {/* Email Content — collapsed by default, click to expand */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <button
          onClick={() => setBodyOpen((v) => !v)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Email Content</p>
            <p className="truncate text-sm font-medium text-slate-800">
              {templateLog?.email_subject ?? position.position_name}
            </p>
          </div>
          {bodyOpen
            ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
            : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
        </button>

        {bodyOpen && (
          <div className="border-t border-slate-100">
            {templateLog?.email_body ? (
              <div
                className="px-5 py-4 text-sm text-slate-800 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: stripResponseFooter(templateLog.email_body) }}
              />
            ) : (
              <p className="px-5 py-4 text-sm text-slate-400">
                {position.status === 'pending' ? 'Not sent yet.' : 'Email content not available.'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Recipients */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">
            Contacts
            <span className="ml-2 text-xs font-normal text-slate-400">
              {rows.length} · {isBroadcast ? 'all at once' : 'cascade order'}
            </span>
          </h3>
        </div>

        <div className="divide-y divide-slate-100">
          {rows.length === 0 && (
            <p className="px-4 py-4 text-sm text-slate-400">No contacts.</p>
          )}
          {rows.map((log, idx) => {
            const m = log.musicians;
            const cfg = STATUS_CFG[log.status] ?? STATUS_CFG.pending;
            const Icon = cfg.icon;
            const name = m ? `${m.first_name} ${m.last_name}` : '—';
            const sub = log.responded_at
              ? `responded ${timeStr(log.responded_at)}`
              : log.sent_at
                ? `sent ${timeStr(log.sent_at)}`
                : 'pending';

            return (
              <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                {!isBroadcast && (
                  <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-300">
                    {idx + 1}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{name}</p>
                  <p className="text-xs text-slate-400">
                    {m?.email}{sub ? ` · ${sub}` : ''}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  <Icon className={`h-4 w-4 ${cfg.cls}`} />
                  <span className={`text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
