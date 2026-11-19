import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { CommNode, Emergency, Priority } from '../types';
import { PRIORITY_COLOR, PRIORITY_LABEL, TYPE_LABEL, timeAgo } from '../lib/format';
import { ErrorBanner, LastUpdated, PageHeader, PriorityBadge, SimulatedTag, Spinner, StatusBadge } from '../components/ui';
import EmergencyMap from '../components/EmergencyMap';
import EmergencyDrawer from '../components/EmergencyDrawer';

const PRIORITIES: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export default function LiveMap() {
  const [showResolved, setShowResolved] = useState(false);
  const [showNodes, setShowNodes] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error, loading, reload, lastUpdated } = usePolling(async () => {
    const [emergencies, mesh] = await Promise.all([
      api<Emergency[]>('/emergencies'),
      api<{ nodes: CommNode[]; links: Array<[string, string]> }>('/comm/nodes'),
    ]);
    return { emergencies, mesh };
  });

  const visible = useMemo(
    () => (data?.emergencies ?? []).filter((e) => showResolved || !['RESOLVED', 'CANCELLED'].includes(e.status)),
    [data, showResolved],
  );

  if (loading && !data) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Live Emergency Map"
        subtitle="Markers are coloured by priority. Click a marker for details."
        actions={
          <>
            <LastUpdated at={lastUpdated} />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved/cancelled
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showNodes} onChange={(e) => setShowNodes(e.target.checked)} /> Mesh nodes <SimulatedTag />
            </label>
          </>
        }
      />
      {error && <ErrorBanner message={error} onRetry={reload} />}

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="card p-2">
          <EmergencyMap
            emergencies={visible}
            nodes={showNodes ? data?.mesh.nodes : []}
            links={showNodes ? data?.mesh.links : []}
            onSelect={(e) => setSelected(e.id)}
            height="calc(100vh - 230px)"
          />
          <div className="flex flex-wrap gap-4 px-3 py-2 text-xs text-slate-600">
            {PRIORITIES.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ background: PRIORITY_COLOR[p] }} /> {PRIORITY_LABEL[p]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-slate-400/40 ring-1 ring-slate-400" /> Resolved / cancelled
            </span>
          </div>
        </div>

        <div className="card flex max-h-[calc(100vh-170px)] flex-col">
          <div className="card-header">
            <span className="card-title">{visible.length} on map</span>
          </div>
          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
            {[...visible]
              .sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority))
              .map((e) => (
                <li key={e.id}>
                  <button className="w-full space-y-1 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setSelected(e.id)}>
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={e.priority} />
                      <span className="text-sm font-medium">{TYPE_LABEL[e.type]}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <StatusBadge status={e.status} />
                      <span>
                        #{e.code} · {timeAgo(e.createdAt)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      </div>

      {selected && <EmergencyDrawer id={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </>
  );
}
