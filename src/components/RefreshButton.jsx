import { useState, useEffect } from 'react';

// "time ago" formatter — keeps the UI lively without being overly precise.
// For anything over a day we just show the date.
function timeAgo(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (isNaN(then)) return null;
  const diff = Date.now() - then;

  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "à l'instant";
  if (sec < 60) return `il y a ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `il y a ${hr} h`;
  const d = new Date(iso);
  return `le ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`;
}

export default function RefreshButton({ lastUpdated, onRefresh, onError }) {
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0); // forces timeAgo re-render every 30s

  // Tick every 30s so "il y a 2 min" stays accurate without user interaction
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onRefresh();
    } catch (e) {
      if (onError) onError(e);
    } finally {
      setLoading(false);
    }
  };

  const ago = timeAgo(lastUpdated);

  return (
    <div className="refresh-wrap" data-tick={tick}>
      <button
        className={`refresh-btn ${loading ? 'loading' : ''}`}
        onClick={handleClick}
        disabled={loading}
        title="Re-télécharger depuis SharePoint"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={loading ? 'spin' : ''}
        >
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        {loading ? 'Téléchargement…' : 'Actualiser'}
      </button>
      {ago && !loading && (
        <span className="refresh-meta" title={lastUpdated}>
          Dernière maj : {ago}
        </span>
      )}
    </div>
  );
}
