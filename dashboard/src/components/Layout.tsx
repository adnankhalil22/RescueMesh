import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, LayoutDashboard, LogOut, Map, Menu, Radio, Settings, Siren, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { ROLE_LABEL } from '../lib/format';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/map', label: 'Live Map', icon: Map },
  { to: '/emergencies', label: 'Emergencies', icon: Siren },
  { to: '/communication', label: 'Communication', icon: Radio },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function useApiHealth() {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () =>
      api('/health')
        .then(() => alive && setOnline(true))
        .catch(() => alive && setOnline(false));
    void check();
    const id = setInterval(check, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return online;
}

export default function Layout() {
  const { user, settings, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const online = useApiHealth();
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-screen">
      {/* sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-navy-900 text-slate-300 transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-alert-600 text-lg font-black text-white shadow-lg shadow-red-900/40">+</div>
          <div>
            <div className="font-bold tracking-wide text-white">RescueMesh</div>
            <div className="text-[11px] uppercase tracking-widest text-slate-400">Operations Center</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-navy-700 text-white' : 'hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="m-3 rounded-lg bg-navy-800 p-3 text-xs">
          <div className="flex items-center gap-2">
            <Activity className={`h-4 w-4 ${online ? 'text-emerald-400' : online === false ? 'text-red-400' : 'text-slate-500'}`} />
            <span className="font-medium text-slate-200">
              API {online ? 'online' : online === false ? 'unreachable' : 'checking…'}
            </span>
          </div>
          <p className="mt-1 text-slate-400">LoRa nodes shown are a software simulation.</p>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-navy-800 bg-navy-950 px-4 py-3 text-white sm:px-6">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="truncate text-sm font-medium text-slate-300">{settings?.organizationName}</div>
          <div className="ml-auto flex items-center gap-3">
            <span
              className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${
                online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {online ? 'Online' : 'Offline'}
            </span>
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="text-[11px] text-slate-400">{user && ROLE_LABEL[user.role]}</div>
            </div>
            <button onClick={logout} className="rounded-lg p-2 text-slate-300 hover:bg-navy-800 hover:text-white" title="Sign out" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
