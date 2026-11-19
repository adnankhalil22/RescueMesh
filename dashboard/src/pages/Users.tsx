import { useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { api, describeError } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { useAuth } from '../context/AuthContext';
import type { Role, User } from '../types';
import { ROLE_LABEL, fmtDateTime } from '../lib/format';
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../components/ui';

const ROLE_BADGE: Record<Role, string> = {
  ADMIN: 'bg-violet-100 text-violet-700',
  RESPONDER: 'bg-blue-100 text-blue-700',
  VICTIM: 'bg-slate-100 text-slate-700',
};

export default function Users() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'ADMIN';
  const [role, setRole] = useState<Role | ''>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<User | null>(null);
  const { data, error, loading, reload } = usePolling(() => api<User[]>('/users', { query: { role, search: search.trim() } }), [role, search]);

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={isAdmin ? 'View accounts, change roles and activate or deactivate access' : 'Read-only: only administrators can manage accounts'}
      />
      {error && <ErrorBanner message={error} onRetry={reload} />}

      <div className="card mb-4 flex flex-wrap gap-3 p-4">
        <label className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <select className="input w-48" value={role} onChange={(e) => setRole(e.target.value as Role | '')} aria-label="Filter by role">
          <option value="">All roles</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading && !data ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState>No users found.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Role</th>
                  <th className="th">Phone</th>
                  <th className="th">Requests</th>
                  <th className="th">Status</th>
                  <th className="th">Last login</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="td">
                      <div className="font-medium text-slate-800">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </td>
                    <td className="td">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${ROLE_BADGE[u.role]}`}>{ROLE_LABEL[u.role]}</span>
                    </td>
                    <td className="td text-slate-600">{u.phone ?? '—'}</td>
                    <td className="td text-slate-600">
                      {u.role === 'VICTIM' ? `${u.reportedCount ?? 0} reported` : `${u.assignedCount ?? 0} assigned`}
                    </td>
                    <td className="td">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.isActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                        <span className={`h-2 w-2 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {u.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="td text-xs text-slate-500">{fmtDateTime(u.lastLoginAt)}</td>
                    <td className="td text-right">
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setEditing(u)}>
                        {isAdmin ? 'Manage' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <UserModal
          user={editing}
          canEdit={isAdmin}
          isSelf={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </>
  );
}

function UserModal({ user, canEdit, isSelf, onClose, onSaved }: { user: User; canEdit: boolean; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: user.name,
    phone: user.phone ?? '',
    organization: user.organization ?? '',
    role: user.role,
    isActive: user.isActive,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: form.name, phone: form.phone || null, organization: form.organization || null };
      if (!isSelf) {
        body.role = form.role;
        body.isActive = form.isActive;
      }
      await api(`/users/${user.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="card relative w-full max-w-lg">
        <div className="card-header">
          <span className="card-title">{canEdit ? 'Manage account' : 'Account details'}</span>
          <button onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="label">Name</span>
              <input className="input" disabled={!canEdit} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              <span className="label">Email</span>
              <input className="input" disabled value={user.email} />
            </label>
            <label>
              <span className="label">Phone</span>
              <input className="input" disabled={!canEdit} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>
              <span className="label">Organization</span>
              <input className="input" disabled={!canEdit} value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} />
            </label>
            <label>
              <span className="label">Role</span>
              <select className="input" disabled={!canEdit || isSelf} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {Object.entries(ROLE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Account</span>
              <select
                className="input"
                disabled={!canEdit || isSelf}
                value={form.isActive ? 'active' : 'inactive'}
                onChange={(e) => setForm({ ...form, isActive: e.target.value === 'active' })}
              >
                <option value="active">Active</option>
                <option value="inactive">Deactivated</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <div>Blood group: {user.bloodGroup ?? '—'}</div>
            <div>Emergency contact: {user.emergencyContact ?? '—'}</div>
            <div>Registered: {fmtDateTime(user.createdAt)}</div>
            <div>Last login: {fmtDateTime(user.lastLoginAt)}</div>
          </div>
          {isSelf && canEdit && <p className="text-xs text-slate-500">You cannot change your own role or deactivate your own account.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button className="btn-ghost" onClick={onClose}>
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && (
            <button className="btn-primary" onClick={save} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
