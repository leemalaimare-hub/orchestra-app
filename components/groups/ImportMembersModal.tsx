'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { UploadCloud } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

const MAX_BYTES = 10 * 1024 * 1024;
const ALIASES = {
  name: ['name', 'fullname', 'contact', 'musician'],
  email: ['email', 'emailaddress', 'mail', 'e-mail'],
};
const norm = (s: string) => s.toLowerCase().replace(/[\s_\-.]/g, '');

interface Row { name: string; email: string }

async function parseFile(f: File): Promise<Record<string, unknown>[]> {
  const lower = f.name.toLowerCase();
  if (lower.endsWith('.csv')) {
    const text = await f.text();
    return Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true }).data;
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(await f.arrayBuffer());
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  }
  throw new Error('Unsupported file type. Use .csv, .xlsx, or .xls');
}

export function ImportMembersModal({ open, onClose, groupId, onImported }: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  onImported: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (f: File) => {
    if (f.size > MAX_BYTES) { toast.error('File exceeds the 10MB limit'); return; }
    let parsed: Record<string, unknown>[];
    try { parsed = await parseFile(f); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not parse that file'); return; }
    if (parsed.length === 0) { toast.error('File has no data rows'); return; }

    const cols = Object.keys(parsed[0]);
    const nameCol = cols.find((c) => ALIASES.name.includes(norm(c))) ?? cols.find((c) => norm(c).includes('name'));
    const emailCol = cols.find((c) => ALIASES.email.includes(norm(c))) ?? cols.find((c) => norm(c).includes('email'));
    if (!nameCol || !emailCol) { toast.error('Could not find name/email columns in this file'); return; }

    const out: Row[] = parsed
      .map((r) => ({ name: String(r[nameCol] ?? '').trim(), email: String(r[emailCol] ?? '').trim() }))
      .filter((r) => r.name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
    if (out.length === 0) { toast.error('No valid name + email rows found'); return; }

    setFileName(f.name);
    setRows(out);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Import failed'); return; }
      toast.success(`Imported ${data.imported} contact${data.imported === 1 ? '' : 's'}${data.skipped ? ` (${data.skipped} duplicate emails skipped)` : ''}`);
      setRows([]);
      setFileName('');
      onImported();
      onClose();
    } finally {
      setImporting(false);
    }
  };

  const reset = () => { setRows([]); setFileName(''); };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Import from Excel/CSV" maxWidth="max-w-lg">
      {rows.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-lg border-2 border-dashed p-10 text-center ${dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300'}`}
        >
          <UploadCloud className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm text-slate-600">Drag and drop a file with name + email columns</p>
          <p className="text-xs text-slate-400">Accepts .csv, .xlsx, .xls — order in the file becomes call order</p>
          <label className="mt-3 inline-block">
            <span className="cursor-pointer text-sm font-medium text-indigo-600 hover:text-indigo-700">Or click to browse</span>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
        </div>
      ) : (
        <div>
          <p className="text-sm text-slate-600">
            <strong>{fileName}</strong> — {rows.length} contact{rows.length === 1 ? '' : 's'} ready to import
          </p>
          <div className="mt-3 max-h-64 overflow-y-auto rounded border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr><th className="px-2 py-1.5 text-left">Name</th><th className="px-2 py-1.5 text-left">Email</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">{r.name}</td>
                    <td className="px-2 py-1.5">{r.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={reset} disabled={importing}>Choose a different file</Button>
            <Button onClick={runImport} loading={importing}>Import {rows.length} contacts</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
