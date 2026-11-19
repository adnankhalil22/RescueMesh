import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api, describeError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { SystemSettings, User } from '../types';
import { PageHeader } from '../components/ui';
import { ROLE_LABEL } from '../lib/format';

function useForm() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<void>, success: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: success });
    } catch (e) {
      setMsg({ ok: false, text: describeError(e) });
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run };
}

function Feedback({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">
      {msg.ok && <CheckCircle2 className="h-4 w-4" />} {msg.text}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="card">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="card-title">{title}</h2>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { user, settings, setSettings, refreshUser } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [sys, setSys] = useState<SystemSettings | null>(settings);
  useEffect(() => setSys(settings), [settings]);
  const sysForm = useForm();

  const [profile, setProfile] = useState({ name: user?.name ?? '', phone: user?.phone ?? '', organization: user?.organization ?? '' });
  const profileForm = useForm();

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const pwForm = useForm();

  const saveSystem = (e: FormEvent) => {
    e.preventDefault();
    if (!sys) return;
    void sysForm.run(async () => {
      setSettings(await api<SystemSettings>('/settings', { method: 'PUT', body: sys }));
    }, 'System settings saved');
  };
  const saveProfile = (e: FormEvent) => {
    e.preventDefault();
    void profileForm.run(async () => {
      await api<User>(`/users/${user!.id}`, {
        method: 'PATCH',
        body: { name: profile.name, phone: profile.phone || null, organization: profile.organization || null },
      });
      await refreshUser();
    }, 'Profile updated');
  };
  const changePassword = (e: FormEvent) => {
    e.preventDefault();
    void pwForm.run(async () => {
      if (pw.newPassword !== pw.confirm) throw new Error('New passwords do not match');
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    }, 'Password changed');
  };

  const num = (k: keyof SystemSettings) => (e: ChangeEvent<HTMLInputElement>) => sys && setSys({ ...sys, [k]: Number(e.target.value) });

  return (
    <>
      <PageHeader title="Settings" subtitle="System configuration and your profile" />
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="System configuration" description={isAdmin ? 'Applies to every dashboard user and the mesh simulator' : 'Read-only: administrators can change these values'}>
          {sys && (
            <form className="space-y-4" onSubmit={saveSystem}>
              <fieldset disabled={!isAdmin || sysForm.busy} className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="label">Organization name</span>
                  <input className="input" value={sys.organizationName} onChange={(e) => setSys({ ...sys, organizationName: e.target.value })} />
                </label>
                <label>
                  <span className="label">Dashboard refresh (seconds)</span>
                  <input className="input" type="number" min={3} max={300} value={sys.autoRefreshSeconds} onChange={num('autoRefreshSeconds')} />
                </label>
                <label>
                  <span className="label">LoRa max hops (TTL)</span>
                  <input className="input" type="number" min={1} max={15} value={sys.maxHops} onChange={num('maxHops')} />
                </label>
                <label>
                  <span className="label">Map centre latitude</span>
                  <input className="input" type="number" step="0.0001" value={sys.mapCenterLat} onChange={num('mapCenterLat')} />
                </label>
                <label>
                  <span className="label">Map centre longitude</span>
                  <input className="input" type="number" step="0.0001" value={sys.mapCenterLng} onChange={num('mapCenterLng')} />
                </label>
                <label>
                  <span className="label">Default map zoom</span>
                  <input className="input" type="number" min={3} max={18} value={sys.mapZoom} onChange={num('mapZoom')} />
                </label>
              </fieldset>
              <Feedback msg={sysForm.msg} />
              {isAdmin && (
                <button className="btn-primary" disabled={sysForm.busy}>
                  {sysForm.busy && <Loader2 className="h-4 w-4 animate-spin" />} Save configuration
                </button>
              )}
            </form>
          )}
        </Section>

        <div className="space-y-5">
          <Section title="My profile" description={`Signed in as ${user?.email} · ${user ? ROLE_LABEL[user.role] : ''}`}>
            <form className="space-y-4" onSubmit={saveProfile}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="label">Full name</span>
                  <input className="input" required minLength={2} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                </label>
                <label>
                  <span className="label">Phone</span>
                  <input className="input" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                </label>
                <label>
                  <span className="label">Organization / team</span>
                  <input className="input" value={profile.organization} onChange={(e) => setProfile({ ...profile, organization: e.target.value })} />
                </label>
              </div>
              <Feedback msg={profileForm.msg} />
              <button className="btn-primary" disabled={profileForm.busy}>
                {profileForm.busy && <Loader2 className="h-4 w-4 animate-spin" />} Save profile
              </button>
            </form>
          </Section>

          <Section title="Change password" description="At least 8 characters">
            <form className="space-y-4" onSubmit={changePassword}>
              <label className="block">
                <span className="label">Current password</span>
                <input className="input" type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="label">New password</span>
                  <input className="input" type="password" autoComplete="new-password" minLength={8} required value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
                </label>
                <label>
                  <span className="label">Confirm</span>
                  <input className="input" type="password" autoComplete="new-password" minLength={8} required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
                </label>
              </div>
              <Feedback msg={pwForm.msg} />
              <button className="btn-primary" disabled={pwForm.busy}>
                {pwForm.busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
              </button>
            </form>
          </Section>
        </div>
      </div>
    </>
  );
}
