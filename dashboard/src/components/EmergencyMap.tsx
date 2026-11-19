import { useEffect, useRef } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, Circle, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { CommNode, Emergency } from '../types';
import { PRIORITY_COLOR, PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL, fmtCoords, fmtDateTime } from '../lib/format';
import { useAuth } from '../context/AuthContext';

/**
 * Fits the view to the markers once, when they first load, and again whenever
 * `fitSignal` changes (e.g. a "Fit all" button). Live updates do NOT move the
 * map, so an operator's zoom/pan is kept while new SOS markers arrive.
 */
function FitBounds({ points, fitSignal }: { points: [number, number][]; fitSignal: number }) {
  const map = useMap();
  const fittedFor = useRef<number | null>(null);
  useEffect(() => {
    if (points.length === 0 || fittedFor.current === fitSignal) return;
    fittedFor.current = fitSignal;
    if (points.length === 1) map.setView(points[0], 14);
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
  }, [points, fitSignal, map]);
  return null;
}

const NODE_COLOR = { GATEWAY: '#7c3aed', RELAY: '#0f766e', ENDPOINT: '#475569' } as const;

export default function EmergencyMap({
  emergencies,
  nodes = [],
  links = [],
  onSelect,
  height = 520,
  fit = true,
  fitSignal = 0,
  showRanges = false,
}: {
  fitSignal?: number;
  emergencies: Emergency[];
  nodes?: CommNode[];
  links?: Array<[string, string]>;
  onSelect?: (e: Emergency) => void;
  height?: number | string;
  fit?: boolean;
  showRanges?: boolean;
}) {
  const { settings } = useAuth();
  // Fallback before settings load: Beirut demonstration area
  const center: [number, number] = [settings?.mapCenterLat ?? 33.884, settings?.mapCenterLng ?? 35.528];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const points: [number, number][] = [
    ...emergencies.map((e) => [e.latitude, e.longitude] as [number, number]),
    ...nodes.map((n) => [n.latitude, n.longitude] as [number, number]),
  ];

  return (
    <div style={{ height }} className="overflow-hidden rounded-lg">
      <MapContainer center={center} zoom={settings?.mapZoom ?? 13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {fit && <FitBounds points={points} fitSignal={fitSignal} />}

        {showRanges &&
          nodes
            .filter((n) => n.online)
            .map((n) => (
              <Circle
                key={`r-${n.id}`}
                center={[n.latitude, n.longitude]}
                radius={n.rangeKm * 1000}
                pathOptions={{ color: NODE_COLOR[n.kind], weight: 1, opacity: 0.35, fillOpacity: 0.04, dashArray: '4 6' }}
              />
            ))}
        {links.map(([a, b]) => {
          const na = byId.get(a);
          const nb = byId.get(b);
          if (!na || !nb) return null;
          return (
            <Polyline
              key={`l-${a}-${b}`}
              positions={[
                [na.latitude, na.longitude],
                [nb.latitude, nb.longitude],
              ]}
              pathOptions={{ color: '#0f766e', weight: 3, opacity: 0.7 }}
            />
          );
        })}
        {nodes.map((n) => (
          <CircleMarker
            key={n.id}
            center={[n.latitude, n.longitude]}
            radius={n.kind === 'GATEWAY' ? 10 : 7}
            pathOptions={{
              color: '#fff',
              weight: 2,
              fillColor: n.online ? NODE_COLOR[n.kind] : '#94a3b8',
              fillOpacity: 1,
              dashArray: n.online ? undefined : '3 3',
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <b>{n.id}</b> · {n.name} {n.online ? '' : '(offline)'} — simulated node
            </Tooltip>
          </CircleMarker>
        ))}

        {emergencies.map((e) => (
          <CircleMarker
            key={e.id}
            center={[e.latitude, e.longitude]}
            radius={e.priority === 'CRITICAL' ? 11 : e.priority === 'HIGH' ? 9 : 8}
            pathOptions={{
              color: e.status === 'RESOLVED' || e.status === 'CANCELLED' ? '#94a3b8' : '#ffffff',
              weight: 2,
              fillColor: PRIORITY_COLOR[e.priority],
              fillOpacity: e.status === 'RESOLVED' || e.status === 'CANCELLED' ? 0.35 : 0.9,
            }}
          >
            <Popup>
              <div className="min-w-[220px] space-y-1 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <b>#{e.code}</b>
                  <span style={{ color: PRIORITY_COLOR[e.priority] }} className="font-semibold">
                    {PRIORITY_LABEL[e.priority]}
                  </span>
                </div>
                <div className="font-semibold">{TYPE_LABEL[e.type]}</div>
                {e.description && <div className="text-slate-600">{e.description}</div>}
                <div>
                  <span className="text-slate-500">Status:</span> {STATUS_LABEL[e.status]}
                </div>
                <div>
                  <span className="text-slate-500">Location:</span> {fmtCoords(e.latitude, e.longitude)}
                </div>
                <div>
                  <span className="text-slate-500">Reported:</span> {fmtDateTime(e.createdAt)}
                </div>
                <div>
                  <span className="text-slate-500">Reporter:</span> {e.reporterName}
                </div>
                <div className="break-all text-[11px] text-slate-400">ID {e.id}</div>
                {onSelect && (
                  <button className="mt-1 w-full rounded bg-slate-800 px-2 py-1 text-xs font-medium text-white" onClick={() => onSelect(e)}>
                    Open details
                  </button>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
