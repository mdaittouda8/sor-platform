import React, { useEffect, useRef, useState } from "react";
import { useChart } from "../../hooks/useChart";

/**
 * Daily line chart of handover causes (Better Cell + Downlink Quality)
 * for a specific engine.
 *
 * Props:
 *   - engineLabel : string (e.g. "1205 M2")
 *   - dateFrom, dateTo : ISO strings (YYYY-MM-DD)
 */
export default function EngineHandoverChart({ engineLabel, dateFrom, dateTo }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);

  // Fetch data when engine or dates change
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
  }, [engineLabel, dateFrom, dateTo]);

  // Render the line chart
  useChart(
    canvasRef,
    () => {
      if (!data || !data.days || data.days.length === 0) return null;

      return {
        type: "line",
        data: {
          labels: data.days,
          datasets: [
            {
              label: "Better Cell",
              data: data.better_cell,
              borderColor: "#F39200",
              backgroundColor: "rgba(243, 146, 0, 0.1)",
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointRadius: 3,
              pointBackgroundColor: "#F39200",
            },
            {
              label: "Downlink Quality",
              data: data.downlink_quality,
              borderColor: "#E22D1F",
              backgroundColor: "rgba(226, 45, 31, 0.1)",
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointRadius: 3,
              pointBackgroundColor: "#E22D1F",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              position: "top",
              align: "end",
              labels: { boxWidth: 12, font: { size: 11 } },
            },
            tooltip: {
              backgroundColor: "#0B1220",
              padding: 8,
              cornerRadius: 6,
              callbacks: {
                title: (items) => `Jour : ${items[0].label}`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 10 }, color: "#6B7280", maxRotation: 0 },
            },
            y: {
              beginAtZero: true,
              grid: { color: "rgba(0,0,0,0.05)" },
              ticks: { font: { size: 10 }, color: "#6B7280", precision: 0 },
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
          <h4 className="exp-engine-title">Engin {engineLabel}</h4>
          <p className="exp-engine-subtitle">
            Évolution journalière des handovers — causes Better Cell &amp; Downlink Quality
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