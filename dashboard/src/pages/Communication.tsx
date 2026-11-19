import { useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Copy, Database, Inbox, Loader2, Power, Radio, Send, ShieldOff, Wifi } from 'lucide-react';
import { api, describeError } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { CommNode, CommStatus, MessageRecord, SimulationResponse, TraceEvent, TransmissionRecord } from '../types';
import { PRIORITY_LABEL, TYPE_LABEL, fmtDateTime, timeAgo } from '../lib/format';
import { ErrorBanner, LastUpdated, PageHeader, SimulatedTag, Spinner, StatCard, EmptyState } from '../components/ui';
import EmergencyMap from '../components/EmergencyMap';

const EVENT_STYLE: Record<TraceEvent['type'], string> = {
  ORIGIN: 'bg-slate-800 text-white',
  TX: 'bg-blue-100 text-blue-800',
  RX: 'bg-emerald-100 text-emerald-800',
  DUPLICATE_DROPPED: 'bg-amber-100 text-amber-800',
  HOP_LIMIT: 'bg-orange-100 text-orange-800',
  DELIVERED: 'bg-emerald-600 text-white',
  NODE_OFFLINE: 'bg-red-100 text-red-800',
  NO_ROUTE: 'bg-red-600 text-white',
};

export default function Communication() {
  const { data, error, loading, reload, lastUpdated } = usePolling(async () => {
    const [status, mesh, transmissions, messages] = await Promise.all([
      api<CommStatus>('/comm/status'),
      api<{ nodes: CommNode[]; links: Array<[string, string]> }>('/comm/nodes'),
      api<TransmissionRecord[]>('/comm/transmissions'),
      api<MessageRecord[]>('/sync/messages', { query: { limit: '15' } }),
    ]);
    return { status, mesh, transmissions, messages };
  });

  const [source, setSource] = useState('EP-01');
  const [category, setCategory] = useState('TRAPPED');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const transmit = async (resendId?: string) => {
    setBusy(resendId ? 'resend' : 'send');
    setActionError(null);
    try {
      const r = await api<SimulationResponse>('/comm/simulate', {
        method: 'POST',
        body: { sourceNodeId: source, category, description, messageId: resendId },
      });
      setResult(r);
      await reload();
    } catch (e) {
      setActionError(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  const toggleNode = async (n: CommNode) => {
    setBusy(n.id);
    setActionError(null);
    try {
      const r = await api<{ retried: { messageId: string; delivered: boolean }[] }>(`/comm/nodes/${n.id}`, { method: 'PATCH', body: { online: !n.online } });
      const delivered = r.retried.filter((x) => x.delivered).length;
      setNotice(
        `${n.id} powered ${n.online ? 'off' : 'on'}.` +
          (r.retried.length ? ` Store-and-forward retried ${r.retried.length} held packet(s): ${delivered} delivered.` : ''),
      );
      await reload();
    } catch (e) {
      setActionError(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorBanner message={error ?? 'No data'} onRetry={reload} />;
  const { status: s, mesh, transmissions, messages } = data;
  const endpoints = mesh.nodes.filter((n) => n.kind !== 'GATEWAY');

  return (
    <>
      <PageHeader title="Communication Monitoring" subtitle="Online API status and the simulated LoRa mesh network" actions={<LastUpdated at={lastUpdated} />} />
      {error && <ErrorBanner message={error} onRetry={reload} />}

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
        <ShieldOff className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <b>Simulation mode.</b> {s.transport.description} Node positions, links, packet counters and traces below are produced by the
          software simulator. Hardware connected: <b>{s.transport.hardwareConnected ? 'yes' : 'no'}</b>.
        </div>
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Online channel (REST API)</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="API status" value={<span className="text-lg">{s.api.online ? 'Online' : 'Offline'}</span>} icon={<Wifi className="h-5 w-5" />} tone="green" hint={`DB ${s.api.database}`} />
        <StatCard label="Messages received" value={s.messages.receivedTotal} icon={<ArrowDownToLine className="h-5 w-5" />} tone="blue" hint={`${s.messages.receivedHttp} via HTTP sync · ${s.messages.receivedLora} via gateway`} />
        <StatCard label="Duplicates blocked" value={s.messages.duplicatesBlocked} icon={<Copy className="h-5 w-5" />} tone="amber" hint={`${s.messages.rejected} rejected as invalid`} />
        <StatCard label="Pending requests" value={s.pendingRequests} icon={<Inbox className="h-5 w-5" />} tone="red" hint="SOS awaiting a responder" />
      </div>

      <h2 className="mb-2 mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        LoRa mesh <SimulatedTag />
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Nodes online" value={`${s.nodes.online}/${s.nodes.total}`} icon={<Radio className="h-5 w-5" />} tone="violet" hint={`${s.nodes.gatewaysOnline} gateway(s) online`} />
        <StatCard label="Packets sent" value={s.lora.packetsSent} icon={<ArrowUpFromLine className="h-5 w-5" />} tone="slate" hint="Radio broadcasts by all nodes" />
        <StatCard label="Packets received" value={s.lora.packetsReceived} icon={<ArrowDownToLine className="h-5 w-5" />} tone="slate" hint={`${s.lora.packetsDropped} dropped (duplicate / hop limit)`} />
        <StatCard label="Pending packets" value={s.lora.pendingPackets} icon={<Database className="h-5 w-5" />} tone={s.lora.pendingPackets ? 'red' : 'slate'} hint="Held for store-and-forward" />
      </div>

      {actionError && <div className="mt-4"><ErrorBanner message={actionError} /></div>}
      {notice && (
        <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <div className="card p-2">
          <EmergencyMap emergencies={[]} nodes={mesh.nodes} links={mesh.links} showRanges height={420} />
          <p className="px-3 py-2 text-xs text-slate-500">
            Lines are radio links (both nodes online and within range). Purple = gateway, teal = relay, grey = field node / offline.
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Send a test SOS through the mesh</span>
            <SimulatedTag />
          </div>
          <div className="space-y-3 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="label">From node</span>
                <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
                  {endpoints.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.id} — {n.name}
                      {n.online ? '' : ' (offline)'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Emergency type</span>
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <input className="input" placeholder="Short description (optional)" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <button className="btn-danger" disabled={!!busy} onClick={() => transmit()}>
                {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Transmit SOS
              </button>
              <button
                className="btn-ghost"
                disabled={!!busy || !result}
                onClick={() => result && transmit(result.packet.messageId)}
                title="Send the same message ID again to show duplicate suppression"
              >
                <Copy className="h-4 w-4" /> Re-send same message
              </button>
            </div>

            {result && <TraceView r={result} />}
          </div>
        </div>
      </div>

      <div className="card mt-5">
        <div className="card-header">
          <span className="card-title">Simulated nodes</span>
          <span className="text-xs text-slate-500">Power a relay off to partition the mesh; held packets are retried automatically when it returns.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Node</th>
                <th className="th">Type</th>
                <th className="th">Range</th>
                <th className="th">Battery</th>
                <th className="th">Sent</th>
                <th className="th">Received</th>
                <th className="th">Dropped</th>
                <th className="th">Holding</th>
                <th className="th">Last activity</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mesh.nodes.map((n) => (
                <tr key={n.id}>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${n.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className="font-mono text-xs font-semibold">{n.id}</span>
                      <span className="text-slate-600">{n.name}</span>
                    </div>
                  </td>
                  <td className="td text-xs">{n.kind}</td>
                  <td className="td tabular-nums">{n.rangeKm} km</td>
                  <td className="td tabular-nums">{n.batteryLevel}%</td>
                  <td className="td tabular-nums">{n.packetsSent}</td>
                  <td className="td tabular-nums">{n.packetsReceived}</td>
                  <td className="td tabular-nums">{n.packetsDropped}</td>
                  <td className="td tabular-nums">{n.heldPackets || '—'}</td>
                  <td className="td text-xs text-slate-500">{timeAgo(n.lastSeen)}</td>
                  <td className="td text-right">
                    <button className={n.online ? 'btn-ghost px-3 py-1 text-xs' : 'btn-success px-3 py-1 text-xs'} disabled={!!busy} onClick={() => toggleNode(n)}>
                      {busy === n.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                      {n.online ? 'Power off' : 'Power on'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent mesh transmissions</span>
            <SimulatedTag />
          </div>
          {transmissions.length === 0 ? (
            <EmptyState>No transmissions yet. Send a test SOS above.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {transmissions.slice(0, 10).map((t, i) => (
                <li key={`${t.messageId}-${t.at}-${i}`} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${t.delivered ? 'bg-emerald-100 text-emerald-700' : t.queued ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                    {t.delivered ? 'DELIVERED' : t.queued ? 'QUEUED' : 'DROPPED'}
                  </span>
                  <span className="font-mono text-xs">{t.sourceNodeId}</span>
                  <span className="text-slate-500">{t.path ? t.path.join(' → ') : '—'}</span>
                  <span className="ml-auto text-xs text-slate-400">
                    {t.hopCount ?? '–'} hops · {t.duplicatesDropped} dup · {timeAgo(t.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Message log (received by server)</span>
          </div>
          {messages.length === 0 ? (
            <EmptyState>No messages yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {messages.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${m.transport === 'HTTP' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>
                    {m.transport === 'HTTP' ? 'HTTP' : 'LoRa (sim)'}
                  </span>
                  <span className="font-medium">{m.type}</span>
                  <span className="text-xs text-slate-500">{PRIORITY_LABEL[m.priority]}</span>
                  <span className="truncate text-xs text-slate-500">{m.sender?.name ?? m.sourceNodeId}</span>
                  <span className="ml-auto text-xs text-slate-400" title={fmtDateTime(m.receivedAt)}>
                    {m.deliveryStatus} · {m.hopCount} hops · {timeAgo(m.receivedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function TraceView({ r }: { r: SimulationResponse }) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {r.delivered ? (
          <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">Delivered to gateway</span>
        ) : r.queued ? (
          <span className="inline-flex items-center gap-1 rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
            <AlertTriangle className="h-3 w-3" /> No route — held for retry
          </span>
        ) : (
          <span className="rounded bg-slate-600 px-2 py-0.5 text-xs font-semibold text-white">Not transmitted (duplicate)</span>
        )}
        {r.trace.hopCount !== undefined && <span>{r.trace.hopCount} hops</span>}
        <span className="text-slate-500">
          · {r.trace.transmissions} broadcasts · {r.trace.duplicatesDropped} duplicates dropped · {r.onAirBytes}/{r.maxFrameBytes} bytes per LoRa frame
        </span>
      </div>
      {r.trace.path && <div className="font-mono text-xs text-slate-700">Path: {r.trace.path.join(' → ')}</div>}
      {r.ingest && (
        <div className="text-xs text-slate-600">
          Server ingest: <b>{r.ingest.result}</b>
          {r.ingest.requestId ? ` · request ${r.ingest.requestId.slice(-8).toUpperCase()}` : ''}
        </div>
      )}
      <div className="font-mono text-[11px] text-slate-500">Message ID {r.packet.messageId}</div>
      <ol className="max-h-56 space-y-1 overflow-y-auto">
        {r.trace.events.map((e, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span className="w-10 shrink-0 text-right text-slate-400">t{e.step}</span>
            <span className={`w-28 shrink-0 rounded px-1.5 py-0.5 text-center font-semibold ${EVENT_STYLE[e.type]}`}>{e.type.replace('_', ' ')}</span>
            <span className="text-slate-700">{e.detail}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
