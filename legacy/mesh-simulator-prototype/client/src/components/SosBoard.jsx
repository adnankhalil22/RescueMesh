import { SEVERITY, canCoordinate, timeAgo } from '../constants.js';

/**
 * SOS alerts. "Device view" shows what the selected device knows (which may be
 * stale or partial — that's the point of a mesh). "Network view" is the
 * simulator's god's-eye view, with how far each alert has spread.
 */
export default function SosBoard({ view, globalSos, mode, setMode, send }) {
  const isDevice = mode === 'device';
  const list = isDevice ? view?.sos ?? [] : globalSos;
  const coordinator = view && canCoordinate(view.node.kind);
  const now = Date.now();
  const openCount = globalSos.filter((s) => s.status !== 'resolved').length;

  return (
    <section className="panel sos-board">
      <div className="panel-head">
        <h2>
          SOS alerts {openCount > 0 && <span className="count-badge">{openCount} active</span>}
        </h2>
        <div className="segmented" role="tablist" aria-label="SOS view">
          <button type="button" role="tab" aria-selected={isDevice} className={isDevice ? 'on' : ''} onClick={() => setMode('device')}>
            Device
          </button>
          <button type="button" role="tab" aria-selected={!isDevice} className={!isDevice ? 'on' : ''} onClick={() => setMode('global')}>
            Network
          </button>
        </div>
      </div>

      {isDevice && view && !coordinator && (
        <p className="muted small hint">Switch this device to a responder or base role to acknowledge alerts.</p>
      )}

      <ol className="sos-list">
        {list.length === 0 && (
          <li className="muted empty">{isDevice ? 'No SOS alerts have reached this device.' : 'No SOS alerts in the network.'}</li>
        )}
        {list.map((s) => {
          const sev = SEVERITY[s.meta.severity] ?? SEVERITY[2];
          return (
            <li key={s.id} className={`sos-item status-${s.status}`}>
              <div className="sos-top">
                <span className={`sev ${sev.className}`}>{sev.label}</span>
                <strong>{s.fromName}</strong>
                <span className={`status status-${s.status}`}>{s.status}</span>
              </div>
              <p className="sos-body">{s.body || <em className="muted">No details given</em>}</p>
              <div className="muted small">
                {s.meta.people} {s.meta.people === 1 ? 'person' : 'people'} · grid {s.origin.x},{s.origin.y} · {timeAgo(s.createdAt, now)}
                {isDevice ? ` · ${s.hops} hops` : ` · reached ${s.reached}/${s.total} devices, ${s.respondersReached} responders`}
                {s.by && ` · ${s.status} by ${s.by}`}
              </div>
              {isDevice && coordinator && s.status !== 'resolved' && (
                <div className="row">
                  {s.status === 'open' && (
                    <button type="button" onClick={() => send('sosUpdate', { from: view.node.id, ref: s.id, status: 'acknowledged' })}>
                      Acknowledge — help is coming
                    </button>
                  )}
                  <button type="button" className="ok" onClick={() => send('sosUpdate', { from: view.node.id, ref: s.id, status: 'resolved' })}>
                    Mark resolved
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
