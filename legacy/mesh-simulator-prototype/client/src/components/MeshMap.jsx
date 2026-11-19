import { useMemo, useRef, useState } from 'react';
import { KIND_META } from '../constants.js';

const MOVE_THROTTLE_MS = 80;

/**
 * Live SVG topology of the mesh. Click a device to operate it, drag to move it.
 * No map tiles: it has to work with zero internet, like the devices it shows.
 */
export default function MeshMap({ snapshot, selectedId, onSelect, send, showAllRanges, neighbors }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const [dragPos, setDragPos] = useState(null); // { id, x, y } local override while dragging

  const nodes = useMemo(() => {
    const list = snapshot.nodes.map((n) => (dragPos?.id === n.id ? { ...n, x: dragPos.x, y: dragPos.y } : n));
    return new Map(list.map((n) => [n.id, n]));
  }, [snapshot.nodes, dragPos]);

  const openSos = useMemo(() => {
    const m = new Map();
    for (const s of snapshot.sos) {
      if (s.status === 'resolved') continue;
      m.set(s.from, Math.max(m.get(s.from) ?? 0, s.meta.severity));
    }
    return m;
  }, [snapshot.sos]);

  const neighborSet = useMemo(() => new Set(neighbors ?? []), [neighbors]);

  const toSvg = (ev) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return {
      x: Math.max(0, Math.min(snapshot.width, Math.round(p.x))),
      y: Math.max(0, Math.min(snapshot.height, Math.round(p.y))),
    };
  };

  const onPointerDown = (ev, node) => {
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dragRef.current = { id: node.id, moved: false, lastSent: 0, start: toSvg(ev) };
  };

  const onPointerMove = (ev) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toSvg(ev);
    if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) < 4) return;
    d.moved = true;
    setDragPos({ id: d.id, ...p });
    const now = performance.now();
    if (now - d.lastSent > MOVE_THROTTLE_MS) {
      d.lastSent = now;
      send('moveNode', { id: d.id, ...p });
    }
  };

  const onPointerUp = (ev) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) {
      send('moveNode', { id: d.id, ...toSvg(ev) });
    } else {
      onSelect(d.id);
    }
    setDragPos(null);
  };

  const selected = nodes.get(selectedId);

  return (
    <svg
      ref={svgRef}
      className="mesh-map"
      viewBox={`0 0 ${snapshot.width} ${snapshot.height}`}
      role="img"
      aria-label="Mesh network topology"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
        setDragPos(null);
      }}
    >
      <defs>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" className="grid-line" />
        </pattern>
      </defs>
      <rect width={snapshot.width} height={snapshot.height} fill="url(#grid)" />

      {/* radio ranges */}
      {[...nodes.values()]
        .filter((n) => n.online && (showAllRanges || n.id === selectedId))
        .map((n) => (
          <circle key={`r-${n.id}`} cx={n.x} cy={n.y} r={n.range} className={`range ${n.id === selectedId ? 'range-selected' : ''}`} />
        ))}

      {/* links */}
      {snapshot.links.map(([a, b]) => {
        const na = nodes.get(a);
        const nb = nodes.get(b);
        if (!na || !nb) return null;
        const active = a === selectedId || b === selectedId;
        return <line key={`l-${a}-${b}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} className={`link ${active ? 'link-active' : ''}`} />;
      })}

      {/* packets in flight this tick */}
      {snapshot.transfers.map((t, i) => {
        const a = nodes.get(t.from);
        const b = nodes.get(t.to);
        if (!a || !b) return null;
        return (
          <circle
            key={`p-${snapshot.tick}-${i}`}
            r={t.type === 'sos' || t.type === 'sos-update' ? 7 : 5}
            className={`packet packet-${t.type}`}
            style={{ '--x1': `${a.x}px`, '--y1': `${a.y}px`, '--x2': `${b.x}px`, '--y2': `${b.y}px` }}
          />
        );
      })}

      {/* devices */}
      {[...nodes.values()].map((n) => {
        const sev = openSos.get(n.id);
        const isSel = n.id === selectedId;
        return (
          <g
            key={n.id}
            className={`device kind-${n.kind} ${n.online ? '' : 'offline'} ${isSel ? 'selected' : ''} ${neighborSet.has(n.id) ? 'neighbor' : ''}`}
            transform={`translate(${n.x} ${n.y})`}
            onPointerDown={(ev) => onPointerDown(ev, n)}
            tabIndex={0}
            role="button"
            aria-label={`${n.name}, ${KIND_META[n.kind].label}, ${n.online ? 'online' : 'offline'}`}
            onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onSelect(n.id)}
          >
            {sev && <circle r="26" className={`sos-pulse sev-${sev}`} />}
            {isSel && <circle r="22" className="select-ring" />}
            <circle r={n.kind === 'base' ? 16 : 13} className="device-body" />
            <text className="device-icon" dy="0.35em">
              {KIND_META[n.kind].icon}
            </text>
            <text className="device-label" y="30">
              {n.name}
            </text>
            {n.relayQueue > 0 && (
              <g transform="translate(12 -14)">
                <circle r="8" className="queue-badge" />
                <text className="queue-text" dy="0.35em">
                  {n.relayQueue > 99 ? '99' : n.relayQueue}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {selected && !selected.online && (
        <text x={snapshot.width / 2} y="28" className="map-banner">
          {selected.name} is offline — messages you send will queue until it reconnects
        </text>
      )}
    </svg>
  );
}
