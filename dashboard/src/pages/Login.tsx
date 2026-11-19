import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Radio, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { describeError } from '../api/client';

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy-950 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-alert-600 text-xl font-black">+</div>
          <div className="text-lg font-bold tracking-wide">RescueMesh</div>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-bold leading-tight">Intelligent Disaster Emergency Communication Network</h1>
          <p className="mt-4 text-slate-400">
            Coordinate rescue operations from SOS requests submitted online, synchronised from offline devices, or relayed through the mesh.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            <li className="flex gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-400" /> Role-based access for responders and administrators
            </li>
            <li className="flex gap-3">
              <Radio className="h-5 w-5 text-violet-400" /> Simulated ESP32 + LoRa mesh monitoring (hardware-ready architecture)
            </li>
          </ul>
        </div>
        <div className="text-xs text-slate-500">Emergency Operations Center</div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full border-[40px] border-red-600/10" />
        <div className="pointer-events-none absolute -bottom-32 -right-10 h-96 w-96 rounded-full border-[30px] border-navy-700/40" />
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Responder and administrator access</p>
          </div>
          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <label className="block">
            <span className="label">Email</span>
            <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="btn-danger w-full py-2.5" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
          </button>
          <p className="text-center text-xs text-slate-400">Demo accounts are listed in the project README.</p>
        </form>
      </div>
    </div>
  );
}
