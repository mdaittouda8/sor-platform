import React, { useEffect, useRef, useState } from "react";
import { useChart } from "../../hooks/useChart";

/**
 * Line chart of handover causes (Better Cell + Downlink Quality)
 * for a specific engine — daily counts in absolute values.
 *
 * Props:
 *   - engineLabel : string (e.g. "1205 M2")
 *   - dateFrom, dateTo : ISO strings (YYYY-MM-DD)
 *   - refreshKey : any (optional). When this value changes, the chart re-fetches
 *                  its data. Used by ExpandiumPanel to force a reload after the
 *                  pipeline finishes synchronizing.
 */
export default function EngineHandoverChart({ engineLabel, dateFrom, dateTo, refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);

  // Fetch data when engine, dates, or refreshKey changes
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ engine: engineLabel });
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);

        const res = await fetch(
          `/api/expandium/engine-causes?${params.toString()}`,
          { signal: ac.signal }
        );
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled && err.name !== "AbortError") {
          setError(err.message || "Erreur de chargement");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [engineLabel, dateFrom, dateTo, refreshKey]);

  // Render the line chart
  useChart(
    canvasRef,
    () => {
      if (!data || !data.days || data.days.length === 0) return null;

      // Pre-compute daily totals for the tooltip
      const totalsPerDay = data.days.map(
        (_, i) => (data.better_cell[i] || 0) + (data.downlink_quality[i] || 0)
      );

      // Format X-axis labels nicely (DD-MMM-YY in French)
      const monthShort = [
        "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
        "Jui", "Aoû", "Sep", "Oct", "Nov", "Déc",
      ];
      const xLabels = data.days.map((isoDate) => {
        const [y, m, d] = isoDate.split("-");
        return `${d}-${monthShort[parseInt(m, 10) - 1]}-${y.slice(2)}`;
      });

      return {
        type: "line",
        data: {
          labels: xLabels,
          datasets: [
            {
              label: "Better Cell",
              data: data.better_cell,
              borderColor: "#F39200",
              backgroundColor: "rgba(243, 146, 0, 0.12)",
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointRadius: 3,
              pointHoverRadius: 5,
              pointBackgroundColor: "#F39200",
            },
            {
              label: "Downlink Quality",
              data: data.downlink_quality,
              borderColor: "#3B82F6",
              backgroundColor: "rgba(59, 130, 246, 0.12)",
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointRadius: 3,
              pointHoverRadius: 5,
              pointBackgroundColor: "#3B82F6",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              position: "bottom",
              align: "center",
              labels: {
                boxWidth: 12,
                font: { size: 11 },
                padding: 12,
              },
            },
            tooltip: {
              backgroundColor: "#0B1220",
              padding: 10,
              cornerRadius: 6,
              callbacks: {
                title: (items) => {
                  const idx = items[0].dataIndex;
                  return `${xLabels[idx]} · total ${totalsPerDay[idx]} handovers`;
                },
                label: (ctx) => {
                  const idx = ctx.dataIndex;
                  const exactCount = ctx.parsed.y;
                  const total = totalsPerDay[idx];
                  const pct = total > 0 ? (exactCount / total) * 100 : 0;
                  return `${ctx.dataset.label}: ${exactCount} handovers (${pct.toFixed(1)}%)`;
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                font: { size: 9 },
                color: "#6B7280",
                maxRotation: 90,
                minRotation: 90,
                autoSkip: true,
                maxTicksLimit: 30,
              },
            },
            y: {
              beginAtZero: true,
              grid: { color: "rgba(0,0,0,0.05)" },
              ticks: {
                font: { size: 10 },
                color: "#6B7280",
                precision: 0,
              },
            },
          },
        },
      };
    },
    [data]
  );

  return (
    <div className="exp-engine-card">
      <div className="exp-engine-header">
        <div>
          <h4 className="exp-engine-title">Engine {engineLabel}</h4>
          <p className="exp-engine-subtitle">
            Évolution journalière des handovers — Better Cell &amp; Downlink Quality
          </p>
        </div>
        {data && !loading && !error && data.days && data.days.length > 0 && (
          <div className="exp-engine-totals">
            <span className="exp-engine-total exp-engine-total-orange">
              {data.total_better_cell.toLocaleString("fr-FR")} Better Cell
            </span>
            <span className="exp-engine-total exp-engine-total-red">
              {data.total_downlink_quality.toLocaleString("fr-FR")} Downlink Quality
            </span>
          </div>
        )}
      </div>

      <div className="exp-engine-chart-area">
        {loading && <div className="exp-engine-empty">Chargement…</div>}
        {error && (
          <div className="exp-engine-empty exp-engine-error">⚠ {error}</div>
        )}
        {!loading && !error && data && (!data.days || data.days.length === 0) && (
          <div className="exp-engine-empty">
            Aucun handover Better Cell ou Downlink Quality sur la période pour cet engin.
          </div>
        )}
        {!loading && !error && data && data.days && data.days.length > 0 && (
          <canvas ref={canvasRef}></canvas>
        )}
      </div>
    </div>
  );
}