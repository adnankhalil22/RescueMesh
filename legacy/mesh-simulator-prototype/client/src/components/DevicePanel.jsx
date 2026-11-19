import { useState } from 'react';
import { KIND_META } from '../constants.js';

/** The device you are "holding": status, controls, compose and SOS. */
export default function DevicePanel({ view, nodes, send }) {
  const [to, setTo] = useState('*');
  const [body, setBody] = useState('');
  const [sosOpen, setSosOpen] = useState(false);
  const [sos, setSos] = useState({ body: '', severity: 2, people: 1 });

  if (!view) {
    return (
      <section className="panel">
        <h2>Device</h2>
        <p className="muted">Select a device on the map to operate it.</p>
      </section>
    );
  }

  const { node, neighbors } = view;
  const others = nodes.filter((n) => n.id !== node.id);
  const recipientValid = to === '*' || others.some((n) => n.id === to);

  const submitChat = (ev) => {
    ev.preventDefault();
    if (!body.trim()) return;
    if (send('chat', { from: node.id, to: recipientValid ? to : '*', body })) setBody('');
  };

  const submitSos = (ev) => {
    ev.preventDefault();
    if (send('sos', { from: node.id, ...sos })) {
      setSos({ body: '', severity: 2, people: 1 });
      setSosOpen(false);
    }
  };

  return (
    <section className="panel device-panel">
      <div className="device-head">
        <span className={`kind-dot kind-${node.kind}`} aria-hidden="true">
          {KIND_META[node.kind].icon}
        </span>
        <div>
          <h2>{node.name}</h2>
          <div className="muted small">{KIND_META[node.kind].label}</div>
        </div>
        <span className={`pill ${node.online ? 'pill-ok' : 'pill-off'}`}>{node.online ? 'Online' : 'Offline'}</span>
      </div>

      <dl className="facts">
        <div>
          <dt>Neighbours</dt>
          <dd>{neighbors.length}</dd>
        </div>
        <div>
          <dt>Stored</dt>
          <dd>{node.stored}</dd>
        </div>
        <div>
          <dt>To relay</dt>
          <dd>{node.relayQueue}</dd>
        </div>
        <div>
          <dt>Range</dt>
          <dd>{node.range}m</dd>
        </div>
      </dl>

      <div className="row">
        <button type="button" onClick={() => send('setOnline', { id: node.id, online: !node.online })}>
          {node.online ? 'Power off radio' : 'Power on radio'}
        </button>
        <select
          aria-label="Device role"
          value={node.kind}
          onChange={(e) => send('updateNode', { id: node.id, kind: e.target.value })}
        >
          {Object.entries(KIND_META).map(([k, m]) => (
            <option key={k} value={k}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <label className="range-label">
        Radio range: {node.range}m
        <input
          type="range"
          min="60"
          max="400"
          step="10"
          value={node.range}
          onChange={(e) => send('updateNode', { id: node.id, range: Number(e.target.value) })}
        />
      </label>

      <button type="button" className={`sos-button ${sosOpen ? 'active' : ''}`} onClick={() => setSosOpen((o) => !o)}>
        {sosOpen ? 'Cancel SOS' : 'SOS — request rescue'}
      </button>

      {sosOpen && (
        <form className="sos-form" onSubmit={submitSos}>
          <label>
            What's happening?
            <textarea
              rows="2"
              maxLength={500}
              placeholder="e.g. Elderly person needs evacuation, ground floor flooded"
              value={sos.body}
              onChange={(e) => setSos({ ...sos, body: e.target.value })}
            />
          </label>
          <div className="row">
            <label>
              Severity
              <select value={sos.severity} onChange={(e) => setSos({ ...sos, severity: Number(e.target.value) })}>
                <option value={1}>Low</option>
                <option value={2}>Urgent</option>
                <option value={3}>Critical</option>
              </select>
            </label>
            <label>
              People
              <input
                type="number"
                min="1"
                max="500"
                value={sos.people}
                onChange={(e) => setSos({ ...sos, people: Number(e.target.value) || 1 })}
              />
            </label>
          </div>
          <button type="submit" className="danger">
            Broadcast SOS
          </button>
        </form>
      )}

      <form className="compose" onSubmit={submitChat}>
        <label>
          Send to
          <select value={recipientValid ? to : '*'} onChange={(e) => setTo(e.target.value)}>
            <option value="*">Everyone (broadcast)</option>
            {others.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
                {n.online ? '' : ' (offline)'}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <input
            aria-label="Message"
            placeholder={node.online ? 'Type a message…' : 'Type a message (will queue)…'}
            maxLength={500}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button type="submit" className="primary" disabled={!body.trim()}>
            Send
          </button>
        </div>
      </form>

      <button type="button" className="link-button" onClick={() => send('removeNode', { id: node.id })}>
        Remove device from mesh
      </button>
    </section>
  );
}
