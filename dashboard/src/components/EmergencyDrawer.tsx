import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Archive, CheckCircle2, ExternalLink, Hand, Loader2, PlayCircle, RotateCcw, X, XCircle } from 'lucide-react';
import { api, describeError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Emergency, EmergencyStatus, User } from '../types';
import { CHANNEL_LABEL, STATUS_LABEL, TYPE_LABEL, fmtCoords, fmtDateTime, timeAgo } from '../lib/format';
import { PriorityBadge, StatusBadge } from './ui';
import EmergencyMap from './EmergencyMap';

const NEXT: Record<EmergencyStatus, EmergencyStatus[]> = {
  PENDING: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['RESOLVED', 'CANCELLED'],
  RESOLVED: ['PENDING'],
  CANCELLED: ['PENDING'],
};

export default function EmergencyDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: () => void }) {
  const { user } = useAuth();
  const [item, setItem] = useState<Emergency | null>(null);
  const [responders, setResponders] = useState<User[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItem(await api<Emergency>(`/emergencies/${id}`));
      setError(null);
    } catch (e) {
      setError(describeError(e));
    }
  }, [id]);

  useEffect(() => {
    setItem(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    api<User[]>('/users')
      .then((u) => setResponders(u.filter((x) => x.isActive && (x.role === 'RESPONDER' || x.role === 'ADMIN'))))
      .catch(() => setResponders([]));
  }, [user?.role]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      setNote('');
      await load();
      onChanged?.();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (status: EmergencyStatus) =>
    run(status, () => api(`/emergencies/${id}/status`, { method: 'PATCH', body: { status, note: note || undefined } }));
  const assign = (responderId: string | null | undefined) =>
    run('assign', () => api(`/emergencies/${id}/assign`, { method: 'PATCH', body: { responderId, note: note || undefined } }));

  const statusButton = (s: EmergencyStatus) => {
    const meta: Record<EmergencyStatus, { cls: string; icon: JSX.Element; text: string }> = {
      IN_PROGRESS: { cls: 'btn-warning', icon: <PlayCircle className="h-4 w-4" />, text: 'Mark In Progress' },
      RESOLVED: { cls: 'btn-success', icon: <CheckCircle2 className="h-4 w-4" />, text: 'Mark Resolved' },
      CANCELLED: { cls: 'btn-ghost', icon: <XCircle className="h-4 w-4" />, text: 'Cancel' },
      PENDING: { cls: 'btn-ghost', icon: <RotateCcw className="h-4 w-4" />, text: 'Reopen' },
      ACCEPTED: { cls: 'btn-primary', icon: <Hand className="h-4 w-4" />, text: 'Accept' },
    };
    const m = meta[s];
    return (
      <button key={s} className={m.cls} disabled={!!busy} onClick={() => setStatus(s)}>
        {busy === s ? <Loader2 className="h-4 w-4 animate-spin" /> : m.icon} {m.text}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Emergency details">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-navy-900 px-5 py-4 text-white">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-widest text-slate-400">Emergency request</div>
            <div className="truncate text-lg font-bold">{item ? `#${item.code} · ${TYPE_LABEL[item.type]}` : 'Loading…'}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-navy-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {!item ? (
            !error && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading details…</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <PriorityBadge priority={item.priority} />
                <StatusBadge status={item.status} />
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{CHANNEL_LABEL[item.channel]}</span>
                {item.archived && <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-white">Archived</span>}
              </div>

              {item.description && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{item.description}</p>}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Field label="Request ID" value={<span className="break-all font-mono text-xs">{item.id}</span>} full />
                <Field label="Reported by" value={item.reporterName} />
                <Field label="Phone" value={item.reporter?.phone ?? '—'} />
                <Field label="People affected" value={item.peopleCount} />
                <Field label="GPS accuracy" value={item.accuracy ? `± ${Math.round(item.accuracy)} m` : '—'} />
                <Field label="Created on device" value={`${fmtDateTime(item.createdAt)} (${timeAgo(item.createdAt)})`} />
                <Field label="Received by server" value={fmtDateTime(item.receivedAt)} />
                <Field label="Assigned responder" value={item.responder?.name ?? 'Unassigned'} />
                <Field
                  label="Location"
                  value={
                    <a
                      className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                      href={`https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=17/${item.latitude}/${item.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {fmtCoords(item.latitude, item.longitude)} <ExternalLink className="h-3 w-3" />
                    </a>
                  }
                />
              </dl>

              <EmergencyMap emergencies={[item]} height={200} />

              <section className="space-y-3 rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-800">Actions</h3>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Optional note (e.g. team dispatched, ETA 10 min)"
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  {!item.responder && !['RESOLVED', 'CANCELLED'].includes(item.status) && (
                    <button className="btn-danger" disabled={!!busy} onClick={() => assign(undefined)}>
                      {busy === 'assign' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="h-4 w-4" />} Accept & assign to me
                    </button>
                  )}
                  {NEXT[item.status].map(statusButton)}
                </div>
                {user?.role === 'ADMIN' && !['RESOLVED', 'CANCELLED'].includes(item.status) && (
                  <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                    <label className="flex-1">
                      <span className="label">Assign responder</span>
                      <select
                        className="input"
                        value={item.responder?.id ?? ''}
                        disabled={!!busy}
                        onChange={(e) => assign(e.target.value || null)}
                      >
                        <option value="">— Unassigned —</option>
                        {responders.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.organization ?? r.role.toLowerCase()})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="btn-ghost"
                      disabled={!!busy}
                      onClick={() => run('archive', () => api(`/emergencies/${id}`, { method: 'DELETE' }))}
                    >
                      <Archive className="h-4 w-4" /> {item.archived ? 'Unarchive' : 'Archive'}
                    </button>
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Timeline</h3>
                <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4">
                  {item.history?.map((h) => (
                    <li key={h.id} className="relative">
                      <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white bg-navy-600" />
                      <div className="text-sm font-medium text-slate-800">{STATUS_LABEL[h.status]}</div>
                      {h.note && <div className="text-sm text-slate-600">{h.note}</div>}
                      <div className="text-xs text-slate-400">
                        {fmtDateTime(h.createdAt)}
                        {h.user ? ` · ${h.user.name}` : ''}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{value}</dd>
    </div>
  );
}
