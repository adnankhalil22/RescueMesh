import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * Loads data immediately and then re-loads it every `autoRefreshSeconds`
 * (system setting) while the tab is visible.
 */
export function usePolling<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const { settings } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    try {
      const d = await loaderRef.current();
      setData(d);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    setLoading(true);
    void reload();
    const ms = (settings?.autoRefreshSeconds ?? 5) * 1000;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, ms);
    return () => clearInterval(id);
  }, [reload, settings?.autoRefreshSeconds]);

  return { data, error, loading, reload, lastUpdated };
}
