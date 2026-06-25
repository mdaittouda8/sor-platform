import { useState, useMemo } from 'react';
import { useApp } from '../lib/AppContext.jsx';
import ExpandiumPanel from '../components/expandium/ExpandiumPanel.jsx';
import '../styles/expandium.css';

/**
 * Format a Date as YYYY-MM-DD in *local* time (same approach as DashboardPage).
 */
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateBanner(from, to) {
  const fmt = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[parseInt(m) - 1]} ${y}`;
  };
  return `Date from ${fmt(from)} to ${fmt(to)}`;
}

export default function ExpandiumPage() {
  const { theme } = useApp();

  // Same default period as DashboardPage: last 7 days
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toISO(d);
  });
  const [dateTo, setDateTo] = useState(() => toISO(new Date()));

  return (
    <section className="page active" id="page-expandium">
      {/* ===== Top bar — same look as DashboardPage ===== */}
      <div className="dash-top-row">
        <div className="date-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <span>{formatDateBanner(dateFrom, dateTo)}</span>
        </div>

        <div className="date-pickers">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span className="arrow">→</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* ===== Expandium panel itself ===== */}
      <ExpandiumPanel dateFrom={dateFrom} dateTo={dateTo} />
    </section>
  );
}