import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { EmergencyStatus, Priority } from '../types';
import { PRIORITY_BADGE, PRIORITY_LABEL, STATUS_BADGE, STATUS_LABEL } from '../lib/format';

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${PRIORITY_BADGE[priority]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function StatusBadge({ status }: { status: EmergencyStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function SimulatedTag({ className = '' }: { className?: string }) {
  return (
    <span
      title="This data comes from the software LoRa simulator, not from physical radio hardware"
      className={`inline-flex items-center rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-600/20 ${className}`}
    >
      Simulated
    </span>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'slate',
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: 'slate' | 'red' | 'amber' | 'green' | 'blue' | 'violet';
  hint?: ReactNode;
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    red: 'bg-red-100 text-red-600',
    amber: 'bg-amber-100 text-amber-600',
    green: 'bg-emerald-100 text-emerald-600',
    blue: 'bg-blue-100 text-blue-600',
    violet: 'bg-violet-100 text-violet-600',
  };
  return (
    <div className="card flex items-start gap-4 p-4">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button className="font-medium underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-slate-500">{children}</div>;
}

export function LastUpdated({ at }: { at: Date | null }) {
  if (!at) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden /> Live · updated {at.toLocaleTimeString()}
    </span>
  );
}
