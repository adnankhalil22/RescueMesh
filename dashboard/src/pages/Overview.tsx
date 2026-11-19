import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertOctagon, CheckCircle2, Clock, Radio, Siren, Timer, Wifi } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { CommStatus, Overview as OverviewData } from '../types';
import { CHANNEL_LABEL, PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL, TYPE_LABEL, timeAgo } from '../lib/format';
import { ErrorBanner, LastUpdated, PageHeader, PriorityBadge, SimulatedTag, Spinner, StatCard, StatusBadge, EmptyState } from '../components/ui';
import EmergencyDrawer from '../components/EmergencyDrawer';

export default function Overview() {
  const { data, error, loading, reload, lastUpdated } = usePolling(async () => {
    const [overview, comm] = await Promise.all([api<OverviewData>('/stats/overview'), api<CommStatus>('/comm/status')]);
    return { overview, comm };
  });
  const [selected, setSelected] = useState<string | null>(null);

  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorBanner message={error ?? 'No data'} onRetry={reload} />;
  const { overview: o, comm } = data;

  const daily = o.daily.map((d) => ({ ...d, label: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }));
  const byType = o.byType.map((t) => ({ name: TYPE_LABEL[t.key], count: t.count }));
  const byPriority = o.byPriority.filter((p) => p.count > 0).map((p) => ({ name: PRIORITY_LABEL[p.key], value: p.count, color: PRIORITY_COLOR[p.key] }));
  const byStatus = o.byStatus.map((s) => ({ name: STATUS_LABEL[s.key], count: s.count, color: STATUS_COLOR[s.key] }));

  return (
    <>
      <PageHeader title="Dashboard Overview" subtitle="Real-time situation summary computed from the RescueMesh database" actions={<LastUpdated at={lastUpdated} />} />
      {error && <ErrorBanner message={`Refresh failed: ${error}`} onRetry={reload} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total requests" value={o.totals.total} icon={<Siren className="h-5 w-5" />} tone="slate" hint={`${o.totals.cancelled} cancelled`} />
        <StatCard label="Pending" value={o.totals.pending} icon={<Clock className="h-5 w-5" />} tone="red" hint={`${o.totals.criticalOpen} critical still open`} />
        <StatCard label="Active" value={o.totals.active} icon={<Activity className="h-5 w-5" />} tone="amber" hint="Accepted or in progress" />
        <StatCard label="Resolved" value={o.totals.resolved} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <StatCard
          label="Communication"
          value={<span className="text-lg">{comm.api.online ? 'API online' : 'API offline'}</span>}
          icon={<Wifi className="h-5 w-5" />}
          tone="blue"
          hint={`Database ${comm.api.database}`}
        />
        <StatCard
          label="Connected nodes"
          value={`${comm.nodes.online}/${comm.nodes.total}`}
          icon={<Radio className="h-5 w-5" />}
          tone="violet"
          hint={<SimulatedTag />}
        />
        <StatCard label="Avg. response" value={o.avgResponseMinutes === null ? '—' : `${o.avgResponseMinutes} min`} icon={<Timer className="h-5 w-5" />} tone="slate" hint="Report → accepted" />
        <StatCard label="Critical open" value={o.totals.criticalOpen} icon={<AlertOctagon className="h-5 w-5" />} tone="red" hint="Highest priority, unresolved" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <div className="card-header">
            <span className="card-title">Requests over the last 14 days</span>
          </div>
          <div className="h-72 p-4">
            <ResponsiveContainer>
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="rep" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dc2626" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#dc2626" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="res" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} width={30} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="reported" name="Reported" stroke="#dc2626" strokeWidth={2} fill="url(#rep)" />
                <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#059669" strokeWidth={2} fill="url(#res)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">By priority</span>
          </div>
          <div className="h-72 p-4">
            {byPriority.length === 0 ? (
              <EmptyState>No requests yet</EmptyState>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byPriority} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {byPriority.map((p) => (
                      <Cell key={p.name} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">By emergency type</span>
          </div>
          <div className="h-72 p-4">
            <ResponsiveContainer>
              <BarChart data={byType} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: '#334155' }} />
                <Tooltip />
                <Bar dataKey="count" name="Requests" fill="#1a2847" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">By status</span>
          </div>
          <div className="h-72 p-4">
            <ResponsiveContainer>
              <BarChart data={byStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} width={30} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip />
                <Bar dataKey="count" name="Requests" radius={[4, 4, 0, 0]}>
                  {byStatus.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">How requests arrived</span>
          </div>
          <ul className="space-y-3 p-5">
            {o.byChannel.map((c) => {
              const pct = o.totals.total ? Math.round((c.count / o.totals.total) * 100) : 0;
              return (
                <li key={c.key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-slate-700">{CHANNEL_LABEL[c.key]}</span>
                    <span className="font-semibold tabular-nums">{c.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-navy-700" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
            <li className="pt-2 text-xs text-slate-500">
              Messages received: {comm.messages.receivedTotal} · duplicates blocked: {comm.messages.duplicatesBlocked}
            </li>
          </ul>
        </div>
      </div>

      <div className="card mt-5">
        <div className="card-header">
          <span className="card-title">Recent SOS requests</span>
          <Link to="/emergencies" className="text-sm font-medium text-blue-700 hover:underline">
            View all
          </Link>
        </div>
        {o.recent.length === 0 ? (
          <EmptyState>No emergency requests yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {o.recent.map((e) => (
              <li key={e.id}>
                <button className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-slate-50" onClick={() => setSelected(e.id)}>
                  <PriorityBadge priority={e.priority} />
                  <span className="font-medium text-slate-800">{TYPE_LABEL[e.type]}</span>
                  <span className="hidden min-w-0 flex-1 truncate text-sm text-slate-500 md:block">{e.description}</span>
                  <span className="text-sm text-slate-500">{e.reporterName}</span>
                  <StatusBadge status={e.status} />
                  <span className="w-16 text-right text-xs text-slate-400">{timeAgo(e.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && <EmergencyDrawer id={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </>
  );
}
