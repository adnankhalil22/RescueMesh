import { useEffect, useMemo, useState } from 'react';
import { useMesh } from './useMesh.js';
import MeshMap from './components/MeshMap.jsx';
import DevicePanel from './components/DevicePanel.jsx';
import Inbox from './components/Inbox.jsx';
import SosBoard from './components/SosBoard.jsx';
import EventLog from './components/EventLog.jsx';
import { KIND_META } from './constants.js';

const SPEEDS = [0.5, 1, 2, 4];

export default function App() {
  const [selectedId, setSelectedId] = useState('command');
  const [showAllRanges, setShowAllRanges] = useState(false);
  const [sosMode, setSosMode] = useState('device');
  const [confirmReset, setConfirmReset] = useState(false);
  const { snapshot, view, connection, error, clearError, send } = useMesh(selectedId);

  // Keep a valid selection if the selected device is removed.
  useEffect(() => {
    if (!snapshot?.nodes.length) return;
    if (!snapshot.nodes.some((n) => n.id === selectedId)) setSelectedId(snapshot.nodes[0].id);
  }, [snapshot, selectedId]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 4000);
    return () => clearTimeout(t);
  }, [error, clearError]);

  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 3000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  const nodesById = useMemo(() => new Map((snapshot?.nodes ?? []).map((n) => [n.id, n])), [snapshot?.nodes]);

  if (!snapshot) {
    return (
      <div className="splash">
        <div className="brand-mark" aria-hidden="true" />
        <h1>RescueMesh</h1>
        <p className="muted">
          {connection === 'offline' ? 'Simulator not reachable — is the server running on port 4000? Retrying…' : 'Connecting to the mesh simulator…'}
        </p>
      </div>
    );
  }

  const onlineCount = snapshot.nodes.filter((n) => n.online).length;
  const activeSos = snapshot.sos.filter((s) => s.status !== 'resolved').length;

  const addDevice = () => {
    const n = snapshot.nodes.length + 1;
    send('addNode', { name: `Survivor ${n}`, kind: 'civilian' });
  };

  const onReset = () => {
    if (!confirmReset) return setConfirmReset(true);
    setConfirmReset(false);
    setSelectedId('command');
    send('reset');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <h1>RescueMesh</h1>
            <span className="muted small">Offline emergency mesh · simulator</span>
          </div>
        </div>

        <div className="stats" aria-label="Network stats">
          <Stat label="Devices online" value={`${onlineCount}/${snapshot.nodes.length}`} />
          <Stat label="Links" value={snapshot.links.length} />
          <Stat label="Active SOS" value={activeSos} tone={activeSos ? 'danger' : undefined} />
          <Stat label="Hops relayed" value={snapshot.stats.forwarded} />
          <Stat label="Tick" value={snapshot.tick} />
        </div>

        <div className="controls">
          <span className={`pill conn-${connection}`}>{connection === 'online' ? 'Live' : connection}</span>
          <button type="button" onClick={() => send('pause', { paused: !snapshot.paused })}>
            {snapshot.paused ? '▶ Resume' : '❚❚ Pause'}
          </button>
          <button type="button" onClick={() => send('step')} disabled={!snapshot.paused} title="Advance one tick">
            Step
          </button>
          <select aria-label="Simulation speed" value={snapshot.speed} onChange={(e) => send('speed', { speed: Number(e.target.value) })}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}× speed
              </option>
            ))}
          </select>
          <button type="button" onClick={addDevice}>
            + Device
          </button>
          <button type="button" className={confirmReset ? 'danger' : ''} onClick={onReset}>
            {confirmReset ? 'Confirm reset' : 'Reset'}
          </button>
        </div>
      </header>

      {error && (
        <div className="toast" role="alert" onClick={clearError}>
          {error.message}
        </div>
      )}

      <main className="layout">
        <aside className="col left">
          <DevicePanel key={view?.node.id ?? 'none'} view={view} nodes={snapshot.nodes} send={send} />
        </aside>

        <section className="col center">
          <div className="panel map-panel">
            <div className="panel-head">
              <h2>Mesh topology</h2>
              <div className="legend">
                {Object.entries(KIND_META).map(([k, m]) => (
                  <span key={k}>
                    <i className={`kind-dot kind-${k}`}>{m.icon}</i>
                    {m.short}
                  </span>
                ))}
                <label className="check">
                  <input type="checkbox" checked={showAllRanges} onChange={(e) => setShowAllRanges(e.target.checked)} />
                  All ranges
                </label>
              </div>
            </div>
            <MeshMap
              snapshot={snapshot}
              selectedId={selectedId}
              onSelect={setSelectedId}
              send={send}
              showAllRanges={showAllRanges}
              neighbors={view?.neighbors}
            />
            <p className="muted small map-hint">
              Click a device to operate it · drag to move it in or out of radio range · badge = messages waiting to be relayed
            </p>
          </div>
          <EventLog log={snapshot.log} />
        </section>

        <aside className="col right">
          <SosBoard view={view} globalSos={snapshot.sos} mode={sosMode} setMode={setSosMode} send={send} />
          <Inbox view={view} nodesById={nodesById} />
        </aside>
      </main>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
