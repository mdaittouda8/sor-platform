import { useEffect, useState, useRef, useMemo } from 'react';
import {
  tryLoadFromFolder,
  refreshFromSharePoint,
  getBackendStatus,
  BackendError,
} from '../lib/excel.js';
import { useChart } from '../hooks/useChart.js';
import { useApp } from '../lib/AppContext.jsx';
import DisconnectionMap from '../components/DisconnectionMap.jsx';
import ExportButton from '../components/ExportButton.jsx';
import RefreshButton from '../components/RefreshButton.jsx';

// Power BI-matching palette — kept verbatim from the original
const PAL = {
  m1: '#4A9EFF',
  m2: '#1E3A7A',
  y2026: '#F39200',
  bord: '#4A9EFF',
  bordGsmr: '#1E3A7A',
  adefinir: '#E87500',
  gsmr: '#5A2D6E',
  rbc: '#D94A9E',
  other: '#B8C0D0',
  ralent: '#4A9EFF',
  arret: '#1E3A7A',
};

function subsystemColor(name) {
  const map = {
    'BORD': PAL.bord,
    'BORD/GSMR': PAL.bordGsmr,
    'A définir': PAL.adefinir,
    'GSMR': PAL.gsmr,
    'RBC': PAL.rbc,
    'RBC/BORD': '#8A5BFF',
    'GSMR/RBC': '#E0447E',
    'Signalisation': '#6BC17A',
  };
  return map[name] || PAL.other;
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

// Format a Date as YYYY-MM-DD in *local* time. Don't use .toISOString().slice(0,10)
// — that converts to UTC first, which means evening users in Morocco (UTC+1) can
// get tomorrow's date. Local-time components keep the date stable.
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DashboardPage() {
  const { theme } = useApp();
  const isDark = theme === 'dark';

  // Chart color helpers — re-derived whenever theme changes
  const chartColors = {
    axis: isDark ? '#8594A8' : '#8A94AB',
    label: isDark ? '#ADBAC7' : '#1a2332',
    tickX: isDark ? '#8594A8' : '#52525b',
    barLabel: isDark ? '#ADBAC7' : '#1a2332',
    tooltip: '#0B1220',
  };

  // Full dataset loaded from Excel
  const [allData, setAllData] = useState([]);
  const [banner, setBanner] = useState(null); // { tone, content }
  // Timestamp of the SharePoint download (ISO string). Shown under the Actualiser button.
  const [lastUpdated, setLastUpdated] = useState(null);

  // Filter state — defaults: last 7 days ending today. Computed once on mount.
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toISO(d);
  });
  const [dateTo, setDateTo] = useState(() => toISO(new Date()));
  const [fltRame, setFltRame] = useState('');
  const [fltIntervalle, setFltIntervalle] = useState('');
  const [fltCab, setFltCab] = useState('');

  // Bumping this key forces the Leaflet map to fully remount. Used after PDF/PNG export,
  // which temporarily replaces the map DOM with an SVG fallback (html2canvas can't capture
  // cross-origin tiles). Simpler than trying to revive the old Leaflet instance in place.

  // Manual refresh: re-download from SharePoint via the backend.
  // Called by the Actualiser button. Errors surface as a dismissible banner.
  const handleRefresh = async () => {
    setBanner({ tone: 'info', content: <span>⏳ Téléchargement depuis SharePoint…</span> });
    try {
      const { data, lastUpdated: updated } = await refreshFromSharePoint();
      setAllData(data);
      setLastUpdated(updated);
      setBanner({
        tone: 'ok',
        content: (
          <span>
            ✓ Données rafraîchies depuis SharePoint — {data.length} enregistrements
          </span>
        ),
      });
      setTimeout(() => setBanner(null), 3500);
    } catch (e) {
      setBanner({
        tone: 'err',
        content: (
          <span>
            ❌ Échec du rafraîchissement : {e.message}
            {e.status === 0 && (
              <>
                {' '}— démarrez le backend avec <code>python main.py</code> dans{' '}
                <code>backend/</code>.
              </>
            )}
          </span>
        ),
      });
      // Re-throw so RefreshButton's finally block still hides the spinner
      throw e;
    }
  };

  // Initial load: try backend → static public/ → manual file picker
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let loaded = null;
      let backendError = null;

      try {
        loaded = await tryLoadFromFolder();
      } catch (e) {
        if (e instanceof BackendError) backendError = e;
      }
      if (cancelled) return;

      if (loaded && loaded.data.length) {
        setAllData(loaded.data);

        // If the file came from the backend, fetch its last-updated timestamp
        if (loaded.source === 'backend') {
          const status = await getBackendStatus();
          if (!cancelled && status?.last_updated) setLastUpdated(status.last_updated);
          setBanner(null);

          // Auto-refresh on page open: we just showed the cached data so the dashboard
          // paints fast. Now kick off a fresh SharePoint download in the background so
          // the user always sees current data without having to click Actualiser.
          if (!cancelled) {
            handleRefresh().catch(() => {
              /* handleRefresh already surfaces the error as a banner */
            });
          }
        } else {
          setBanner({
            tone: 'info',
            content: (
              <span>
                ℹ️ Données chargées depuis <code>public/</code> — backend hors ligne, le bouton{' '}
                <strong>Actualiser</strong> nécessite le backend démarré.
              </span>
            ),
          });
        }
        return;
      }

      // Backend failed with a SharePoint error — show it, don't drop to file picker
      if (backendError) {
        setBanner({
          tone: 'err',
          content: (
            <span>
              ❌ Erreur SharePoint : {backendError.message}. Vérifiez les credentials dans{' '}
              <code>backend/.env</code>.
            </span>
          ),
        });
        return;
      }

      // No backend, no public/ file — nothing to show, wait for backend to start
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build filter option lists (derived from full dataset)
  const filterOptions = useMemo(() => {
    const rames = new Set();
    const intervalles = new Set();
    const cabs = new Set();
    allData.forEach((r) => {
      if (r.r) rames.add(r.r);
      if (r.i) intervalles.add(r.i);
      if (r.c) cabs.add(r.c);
    });
    return {
      rames: [...rames].sort(),
      intervalles: [...intervalles].sort(),
      cabs: [...cabs].sort(),
    };
  }, [allData]);

  // Filtered data (what all charts + map use, except the monthly-by-year one)
  const filtered = useMemo(() => {
    return allData.filter((r) => {
      if (dateFrom && r.d < dateFrom) return false;
      if (dateTo && r.d > dateTo) return false;
      if (fltRame && r.r !== fltRame) return false;
      if (fltIntervalle && r.i !== fltIntervalle) return false;
      if (fltCab && r.c !== fltCab) return false;
      return true;
    });
  }, [allData, dateFrom, dateTo, fltRame, fltIntervalle, fltCab]);

  // KPIs.
  // "Total GSMR" uses the same splitting rule as the donut: records with subsystem
  // exactly = 'GSMR', plus FLOOR(BORD/GSMR / 2) — the odd remainder of BORD/GSMR
  // goes to BORD, not GSMR (matches the donut behavior below).
  const kpi = useMemo(() => {
    const total = filtered.length;
    const pureGsmr = filtered.filter((r) => r.s === 'GSMR').length;
    const bordGsmrCount = filtered.filter((r) => r.s === 'BORD/GSMR').length;
    const gsmr = pureGsmr + Math.floor(bordGsmrCount / 2);

    const m1 = filtered.filter((r) => r.c === 'M1').length;
    const m2 = filtered.filter((r) => r.c === 'M2').length;
    return { total, gsmr, m1, m2 };
  }, [filtered]);

  // ====== Chart configs ======

  // Subsystem donut.
  // Rule: BORD/GSMR entries are split between BORD and GSMR — half to each.
  // On odd counts, the extra one goes to BORD. Keeps two clean slices instead of
  // a third "BORD/GSMR" slice. Same rule for any date range / filter selection.
  const subData = useMemo(() => {
    const counts = {};
    let bordGsmrCount = 0;

    for (const r of filtered) {
      if (r.s === 'BORD/GSMR') {
        bordGsmrCount++;
        continue;
      }
      counts[r.s] = (counts[r.s] || 0) + 1;
    }

    if (bordGsmrCount > 0) {
      const toBord = Math.ceil(bordGsmrCount / 2);  // odd → extra goes here
      const toGsmr = Math.floor(bordGsmrCount / 2);
      counts['BORD'] = (counts['BORD'] || 0) + toBord;
      counts['GSMR'] = (counts['GSMR'] || 0) + toGsmr;
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return {
      sorted,
      labels: sorted.map((x) => x[0]),
      values: sorted.map((x) => x[1]),
      colors: sorted.map((x) => subsystemColor(x[0])),
      bordGsmrOriginal: bordGsmrCount, // kept so the footnote under the donut can show the original count
    };
  }, [filtered]);

  const subsystemCanvasRef = useRef(null);
  useChart(
    subsystemCanvasRef,
    () => ({
      type: 'doughnut',
      data: {
        labels: subData.labels,
        datasets: [
          {
            data: subData.values,
            backgroundColor: subData.colors,
            borderWidth: 0,
            spacing: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        layout: { padding: 40 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0B1220',
            padding: 8,
            cornerRadius: 6,
            callbacks: {
              label: (ctx) =>
                `${ctx.label}: ${ctx.parsed} (${
                  kpi.total ? ((ctx.parsed / kpi.total) * 100).toFixed(1) : 0
                }%)`,
            },
          },
        },
      },
    }),
    [subData, kpi.total]
  );

  // Event donut
  const evData = useMemo(() => {
    const counts = {};
    filtered.forEach((r) => {
      if (r.e) counts[r.e] = (counts[r.e] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const colors = sorted.map(([k]) => (k === 'Arrêt du train' ? PAL.arret : PAL.ralent));
    return {
      sorted,
      labels: sorted.map((x) => x[0]),
      values: sorted.map((x) => x[1]),
      colors,
    };
  }, [filtered]);

  const eventCanvasRef = useRef(null);
  useChart(
    eventCanvasRef,
    () => ({
      type: 'doughnut',
      data: {
        labels: evData.labels,
        datasets: [
          {
            data: evData.values,
            backgroundColor: evData.colors,
            borderWidth: 0,
            spacing: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        layout: { padding: 40 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0B1220',
            padding: 8,
            cornerRadius: 6,
            callbacks: {
              label: (ctx) =>
                `${ctx.label}: ${ctx.parsed} (${
                  kpi.total ? ((ctx.parsed / kpi.total) * 100).toFixed(1) : 0
                }%)`,
            },
          },
        },
      },
    }),
    [evData, kpi.total]
  );

  // Rame stacked bar
  const rameData = useMemo(() => {
    const rameMap = {};
    filtered.forEach((r) => {
      if (!r.r) return;
      if (!rameMap[r.r]) rameMap[r.r] = { M1: 0, M2: 0 };
      if (r.c === 'M1') rameMap[r.r].M1++;
      if (r.c === 'M2') rameMap[r.r].M2++;
    });
    const sorted = Object.entries(rameMap)
      .map(([k, v]) => ({ rame: k, m1: v.M1, m2: v.M2, total: v.M1 + v.M2 }))
      .sort((a, b) => b.total - a.total);
    return {
      labels: sorted.map((x) => x.rame),
      m1: sorted.map((x) => x.m1),
      m2: sorted.map((x) => x.m2),
    };
  }, [filtered]);

  const rameCanvasRef = useRef(null);
  useChart(
    rameCanvasRef,
    () => ({
      type: 'bar',
      data: {
        labels: rameData.labels,
        datasets: [
          { label: 'M1', data: rameData.m1, backgroundColor: PAL.m1, borderWidth: 0, stack: 's' },
          { label: 'M2', data: rameData.m2, backgroundColor: PAL.m2, borderWidth: 0, stack: 's' },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0B1220',
            padding: 8,
            cornerRadius: 6,
            callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.x}` },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { size: 10 }, color: chartColors.axis },
          },
          y: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { size: 11, weight: '600' }, color: chartColors.label },
          },
        },
      },
      plugins: [
        {
          id: 'stackLabels',
          afterDatasetsDraw(chart) {
            const { ctx } = chart;
            chart.data.datasets.forEach((ds, dsi) => {
              const meta = chart.getDatasetMeta(dsi);
              meta.data.forEach((bar, i) => {
                const val = ds.data[i];
                if (val > 0) {
                  ctx.save();
                  ctx.fillStyle = '#FFFFFF';
                  ctx.font = '600 11px "Inter Tight", sans-serif';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  const { x, y, base } = bar.getProps(['x', 'y', 'base']);
                  const cx = (x + base) / 2;
                  ctx.fillText(val, cx, y);
                  ctx.restore();
                }
              });
            });
          },
        },
      ],
    }),
    [rameData, isDark]
  );

  // Monthly by year — uses full dataset, not filtered (matches Power BI behavior)
  const monthData = useMemo(() => {
    const agg = { 2024: Array(12).fill(0), 2025: Array(12).fill(0), 2026: Array(12).fill(0) };
    allData.forEach((r) => {
      const d = new Date(r.d);
      const y = d.getFullYear();
      const m = d.getMonth();
      if (agg[y]) agg[y][m]++;
    });
    return agg;
  }, [allData]);

  const monthlyCanvasRef = useRef(null);
  useChart(
    monthlyCanvasRef,
    () => ({
      type: 'bar',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        datasets: [
          { label: '2024', data: monthData[2024], backgroundColor: PAL.m1, borderWidth: 0, borderRadius: 3, categoryPercentage: 0.85, barPercentage: 0.9 },
          { label: '2025', data: monthData[2025], backgroundColor: PAL.m2, borderWidth: 0, borderRadius: 3, categoryPercentage: 0.85, barPercentage: 0.9 },
          { label: '2026', data: monthData[2026], backgroundColor: PAL.y2026, borderWidth: 0, borderRadius: 3, categoryPercentage: 0.85, barPercentage: 0.9 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 22, right: 8, bottom: 4, left: 4 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0B1220',
            padding: 8,
            cornerRadius: 6,
            mode: 'index',
            intersect: false,
            callbacks: {
              title: (items) => {
                const fullMonths = [
                  'January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December',
                ];
                return fullMonths[items[0].dataIndex];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 11, weight: '500' },
              color: chartColors.tickX,
              maxRotation: 0,
              minRotation: 0,
              autoSkip: false,
              padding: 4,
            },
          },
          y: { display: false, beginAtZero: true, grace: '15%' },
        },
      },
      plugins: [
        {
          id: 'monthValues',
          afterDatasetsDraw(chart) {
            const { ctx } = chart;
            chart.data.datasets.forEach((ds, dsi) => {
              const meta = chart.getDatasetMeta(dsi);
              meta.data.forEach((bar, i) => {
                const val = ds.data[i];
                if (val > 0) {
                  ctx.save();
                  ctx.fillStyle = chartColors.barLabel;
                  ctx.font = '700 11px "Inter Tight", sans-serif';
                  ctx.textAlign = 'center';
                  ctx.fillText(val, bar.x, bar.y - 5);
                  ctx.restore();
                }
              });
            });
          },
        },
      ],
    }),
    [monthData, isDark]
  );

  return (
    <section className="page active" id="page-dashboard">
      {banner && (
        <div className={`data-banner ${banner.tone}`} style={{ display: 'flex' }}>
          {banner.content}
        </div>
      )}

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

        <div className="dash-filters">
          <div className="filter-group">
            <label>Rame</label>
            <select value={fltRame} onChange={(e) => setFltRame(e.target.value)}>
              <option value="">Toutes</option>
              {filterOptions.rames.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Intervalle</label>
            <select value={fltIntervalle} onChange={(e) => setFltIntervalle(e.target.value)}>
              <option value="">Tous</option>
              {filterOptions.intervalles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Motrice / Cab</label>
            <select value={fltCab} onChange={(e) => setFltCab(e.target.value)}>
              <option value="">Tous</option>
              {filterOptions.cabs.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <RefreshButton
            lastUpdated={lastUpdated}
            onRefresh={handleRefresh}
            onError={() => {
              /* handleRefresh already sets the banner */
            }}
          />
          <ExportButton dateFrom={dateFrom} dateTo={dateTo} filteredData={filtered} />
        </div>
      </div>

      <div className="dash-grid">
        {/* LEFT column: KPIs + donuts */}
        <div className="dash-col-left">
          <div className="kpi-row-ertms">
            <KpiMini label="Nombre total des déconnexions" value={kpi.total} />
            <KpiMini label="Nombre total de déconnexions GSM‑R" value={kpi.gsmr} />
            <KpiMini label="Nombre total des déconnexions pour M1" value={kpi.m1} />
            <KpiMini label="Nombre total des déconnexions pour M2" value={kpi.m2} />
          </div>

          <div className="card dash-card">
            <div className="dash-chart-title">Nombre de déconnexions par système mis en cause</div>
            <div
              className="donut-row"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' }}
            >
              <div style={{ position: 'relative', height: '100%', minHeight: 200 }}>
                <canvas ref={subsystemCanvasRef}></canvas>
              </div>
              <div className="dash-legend">
                <div style={{ fontSize: 10.5, color: 'var(--slate-400)', fontWeight: 600, marginBottom: 4 }}>
                  Sous Système mis en cause
                </div>
                {subData.sorted.map(([k, v]) => (
                  <div key={k} className="lg-row">
                    <span className="lg-dot" style={{ background: subsystemColor(k) }}></span>
                    <span className="lg-label">{k}</span>
                    <span className="lg-val">
                      {v} ({kpi.total ? ((v / kpi.total) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {/* Footnote: keeps the original BORD/GSMR count visible so no info is lost.
                Only renders when there actually are BORD/GSMR records in the current filter. */}
            {subData.bordGsmrOriginal > 0 && (
              <div className="chart-footnote">
                Dont <strong>{subData.bordGsmrOriginal}</strong> BORD/GSMR répartis :{' '}
                {Math.ceil(subData.bordGsmrOriginal / 2)} BORD ·{' '}
                {Math.floor(subData.bordGsmrOriginal / 2)} GSMR
              </div>
            )}
          </div>

          <div className="card dash-card">
            <div className="dash-chart-title">Nombre de déconnexions par événement</div>
            <div
              className="donut-row"
              style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 10, alignItems: 'center' }}
            >
              <div style={{ position: 'relative', height: '100%', minHeight: 180 }}>
                <canvas ref={eventCanvasRef}></canvas>
              </div>
              <div className="dash-legend">
                <div style={{ fontSize: 10.5, color: 'var(--slate-400)', fontWeight: 600, marginBottom: 4 }}>
                  Événement
                </div>
                {evData.sorted.map(([k, v]) => (
                  <div key={k} className="lg-row">
                    <span
                      className="lg-dot"
                      style={{ background: k === 'Arrêt du train' ? PAL.arret : PAL.ralent }}
                    ></span>
                    <span className="lg-label">{k}</span>
                    <span className="lg-val">
                      {v} ({kpi.total ? ((v / kpi.total) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CENTER column */}
        <div className="dash-col-center">
          <div className="card dash-card">
            <div className="dash-chart-title">Nombre de déconnexions par rame/motrice</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, fontSize: 11, color: 'var(--slate-400)' }}>
              <span>Motrice / Cab</span>
              <LegendDot color="#4A9EFF" label="M1" />
              <LegendDot color="#1E3A7A" label="M2" />
            </div>
            <div className="chart-fill" style={{ minHeight: 260 }}>
              <canvas ref={rameCanvasRef}></canvas>
            </div>
          </div>

          <div className="card dash-card">
            <div className="dash-chart-title">Déconnexions mensuelles par année</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, fontSize: 11, color: 'var(--slate-400)' }}>
              <span>Year</span>
              <LegendDot color="#4A9EFF" label="2024" />
              <LegendDot color="#1E3A7A" label="2025" />
              <LegendDot color="var(--oncf-orange)" label="2026" />
            </div>
            <div className="chart-fill" style={{ minHeight: 280 }}>
              <canvas ref={monthlyCanvasRef}></canvas>
            </div>
          </div>
        </div>
      </div>

      {/* Full-width disconnection map */}
      <div className="card dash-card map-card">
        <div className="dash-chart-title">Carte des déconnexions · LGV Tanger–Kénitra</div>
        <DisconnectionMap data={filtered} dateFrom={dateFrom} dateTo={dateTo} />
      </div>
    </section>
  );
}

function KpiMini({ label, value }) {
  return (
    <div className="kpi-mini">
      <div className="kpi-mini-label">{label}</div>
      <div className="kpi-mini-value">{value ?? '–'}</div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }}></span>
      {label}
    </span>
  );
}