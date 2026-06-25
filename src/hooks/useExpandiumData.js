import { useCallback, useEffect, useRef, useState } from "react";
import { fetchKpis } from "../lib/expandium";

/**
 * Hook that loads Expandium KPIs and exposes helpers to reload them.
 *
 * Usage:
 *   const { data, loading, error, reload, lastFetchedAt } =
 *     useExpandiumData({ dateFrom, dateTo });
 */
export function useExpandiumData({ dateFrom, dateTo } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchKpis({ dateFrom, dateTo });
      if (!ac.signal.aborted) {
        setData(result);
        setLastFetchedAt(new Date());
      }
    } catch (err) {
      if (!ac.signal.aborted) setError(err.message || "Erreur inconnue");
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [dateFrom, dateTo]);

  // Auto-load on mount and when the date range changes
  useEffect(() => {
    load();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [load]);

  return { data, loading, error, reload: load, lastFetchedAt };
}