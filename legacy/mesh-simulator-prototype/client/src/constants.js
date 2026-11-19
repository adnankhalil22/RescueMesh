export const KIND_META = {
  base: { label: 'Base station', short: 'Base', icon: '⌂' },
  responder: { label: 'Responder', short: 'Responder', icon: '✚' },
  relay: { label: 'Relay', short: 'Relay', icon: '⌁' },
  civilian: { label: 'Civilian', short: 'Civilian', icon: '●' },
};

export const SEVERITY = {
  1: { label: 'Low', className: 'sev-1' },
  2: { label: 'Urgent', className: 'sev-2' },
  3: { label: 'Critical', className: 'sev-3' },
};

export const canCoordinate = (kind) => kind === 'base' || kind === 'responder';

export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
