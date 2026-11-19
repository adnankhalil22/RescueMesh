import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from 'lucide-react';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { Emergency, EmergencyStatus, EmergencyType, Priority } from '../types';
import { CHANNEL_LABEL, PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL, fmtDateTime, timeAgo } from '../lib/format';
import { EmptyState, ErrorBanner, LastUpdated, PageHeader, PriorityBadge, Spinner, StatusBadge } from '../components/ui';
import EmergencyDrawer from '../components/EmergencyDrawer';

type SortKey = 'createdAt' | 'priority' | 'status' | 'type';

export default function Emergencies() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<EmergencyType | ''>('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [status, setStatus] = useState<EmergencyStatus | ''>('');
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<SortKey>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<string | null>(null);

  // debounce search typing
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, error, loading, reload, lastUpdated } = usePolling(
    () =>
      api<Emergency[]>('/emergencies', {
        query: { search, type, priority, status, sort, order, includeArchived: archived ? 'true' : undefined },
      }),
    [search, type, priority, status, sort, order, archived],
  );

  const toggleSort = (key: SortKey) => {
    if (sort === key) setOrder(order === 'asc' ? 'desc' : 'asc');
    else {
      setSort(key);
      setOrder('desc');
    }
  };
  const SortHeader = ({ k, children }: { k: SortKey; children: string }) => (
    <th className="th">
      <button className="inline-flex items-center gap-1 uppercase hover:text-slate-800" onClick={() => toggleSort(k)} aria-label={`Sort by ${children}`}>
        {children}
        {sort === k ? order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );

  const clear = () => {
    setSearchInput('');
    setType('');
    setPriority('');
    setStatus('');
    setArchived(false);
  };

  return (
    <>
      <PageHeader title="Emergency Management" subtitle="Search, filter and update every SOS request" actions={<LastUpdated at={lastUpdated} />} />
      {error && <ErrorBanner message={error} onRetry={reload} />}

      <div className="card mb-4 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <label className="relative">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search ID, description or reporter…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as EmergencyType | '')} aria-label="Filter by type">
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} aria-label="Filter by priority">
          <option value="">All priorities</option>
          {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as EmergencyStatus | '')} aria-label="Filter by status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archived
          </label>
          <button className="btn-ghost" onClick={clear}>
            Clear
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading && !data ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <EmptyState>No emergency requests match these filters.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">ID</th>
                  <SortHeader k="type">Type</SortHeader>
                  <SortHeader k="priority">Priority</SortHeader>
                  <SortHeader k="status">Status</SortHeader>
                  <th className="th">Reporter</th>
                  <th className="th">Responder</th>
                  <th className="th">Channel</th>
                  <SortHeader k="createdAt">Reported</SortHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.map((e) => (
                  <tr
                    key={e.id}
                    className={`cursor-pointer hover:bg-slate-50 ${e.archived ? 'opacity-60' : ''}`}
                    onClick={() => setSelected(e.id)}
                    tabIndex={0}
                    onKeyDown={(ev) => ev.key === 'Enter' && setSelected(e.id)}
                  >
                    <td className="td font-mono text-xs text-slate-500">#{e.code}</td>
                    <td className="td">
                      <div className="font-medium text-slate-800">{TYPE_LABEL[e.type]}</div>
                      <div className="max-w-[260px] truncate text-xs text-slate-500">{e.description || '—'}</div>
                    </td>
                    <td className="td">
                      <PriorityBadge priority={e.priority} />
                    </td>
                    <td className="td">
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="td">{e.reporterName}</td>
                    <td className="td text-slate-600">{e.responder?.name ?? <span className="text-slate-400">Not assigned</span>}</td>
                    <td className="td text-xs text-slate-500">{CHANNEL_LABEL[e.channel]}</td>
                    <td className="td text-slate-600" title={fmtDateTime(e.createdAt)}>
                      {timeAgo(e.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <div className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">{data.length} request(s)</div>}
      </div>

      {selected && <EmergencyDrawer id={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </>
  );
}
