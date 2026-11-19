import { useEffect, useRef } from 'react';
import { timeAgo } from '../constants.js';

export default function Inbox({ view, nodesById }) {
  const listRef = useRef(null);
  const count = view?.inbox.length ?? 0;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, view?.node.id]);

  if (!view) return null;
  const now = Date.now();

  return (
    <section className="panel inbox">
      <h2>
        Messages <span className="muted small">as seen by {view.node.name}</span>
      </h2>
      <ol className="messages" ref={listRef}>
        {view.inbox.length === 0 && <li className="muted empty">No messages have reached this device yet.</li>}
        {view.inbox.map((m) => {
          const toName = m.to === '*' ? 'everyone' : nodesById.get(m.to)?.name ?? 'unknown';
          return (
            <li key={m.id} className={`msg ${m.mine ? 'mine' : ''} ${m.to !== '*' ? 'direct' : ''}`}>
              <div className="msg-meta">
                <strong>{m.mine ? 'You' : m.fromName}</strong>
                <span>→ {m.mine || m.to !== '*' ? toName : 'everyone'}</span>
                <span className="muted">{timeAgo(m.createdAt, now)}</span>
              </div>
              <div className="msg-body">{m.body}</div>
              <div className="msg-foot muted small">
                {m.mine
                  ? m.to === '*'
                    ? 'Broadcast'
                    : m.delivered
                      ? '✓✓ Delivered'
                      : '✓ Sent — waiting for a route'
                  : `${m.hops} hop${m.hops === 1 ? '' : 's'}`}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
