import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Live connection to the RescueMesh simulator.
 * Reconnects automatically; re-subscribes to the selected device view.
 */
export function useMesh(viewNode) {
  const [snapshot, setSnapshot] = useState(null);
  const [view, setView] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const viewRef = useRef(viewNode);
  viewRef.current = viewNode;

  useEffect(() => {
    let closed = false;
    let retryTimer;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;
      setConnection('connecting');

      ws.onopen = () => {
        setConnection('online');
        ws.send(JSON.stringify({ type: 'subscribe', node: viewRef.current }));
      };
      ws.onmessage = (ev) => {
        let data;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (data.type === 'state') {
          setSnapshot(data.snapshot);
          setView(data.view);
        } else if (data.type === 'error') {
          setError({ message: data.message, at: Date.now() });
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setConnection('offline');
        retryTimer = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'subscribe', node: viewNode }));
  }, [viewNode]);

  const send = useCallback((type, payload = {}) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) {
      setError({ message: 'Not connected to the simulator', at: Date.now() });
      return false;
    }
    ws.send(JSON.stringify({ type, ...payload }));
    return true;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { snapshot, view, connection, error, clearError, send };
}
