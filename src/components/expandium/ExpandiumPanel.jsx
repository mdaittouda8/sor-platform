import React from "react";
import { useExpandiumData } from "../../hooks/useExpandiumData";
import ExpandiumKpiCard from "./ExpandiumKpiCard";
import ExpandiumRefreshButton from "./ExpandiumRefreshButton";
import EngineHandoverChart from "./EngineHandoverChart";

/**
 * Format a Date as "il y a Xh Ym" (relative time, French).
 */
function formatRelativeTime(date) {
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `il y a ${hr} h ${min % 60} min`;
  const day = Math.floor(hr / 24);
  return `il y a ${day} j`;
}

export default function ExpandiumPanel({ dateFrom, dateTo }) {
  const { data, loading, error, reload, lastFetchedAt } = useExpandiumData({
    dateFrom,
    dateTo,
  });

  const k = data?.kpis || {};

  return (
    <section className="exp-panel">
      {/* ===== Header ===== */}
      <header className="exp-panel-header">
        <div>
          <h2 className="exp-panel-title">Expandium QATS</h2>
          <p className="exp-panel-subtitle">
            Indicateurs réseau dérivés des données QATS d'Expandium
          </p>
        </div>
        <div className="exp-panel-header-right">
          <div className="exp-freshness">
            <span className="exp-freshness-dot" />
            <div>
              <div className="exp-freshness-label">DERNIÈRE LECTURE</div>
              <div className="exp-freshness-value">
                {formatRelativeTime(lastFetchedAt)}
              </div>
            </div>
          </div>
          <ExpandiumRefreshButton onSuccess={() => reload()} />
        </div>
      </header>

      {/* ===== Error state ===== */}
      {error && (
        <div className="exp-error-banner">
          ⚠ Impossible de charger les données Expandium : {error}
          <button className="exp-error-retry" onClick={() => reload()}>
            Réessayer
          </button>
        </div>
      )}

      {/* ===== KPI row ===== */}
      <div className="exp-kpi-row">
        <ExpandiumKpiCard
          label="APPELS ETCS"
          value={k.etcs_calls?.value}
          variant="orange"
          loading={loading}
          sublabel="période sélectionnée"
        />
        <ExpandiumKpiCard
          label="TAUX SUCCÈS HO"
          value={k.ho_success_rate?.value}
          unit="%"
          variant="green"
          loading={loading}
          sublabel={
            k.ho_success_rate?.total
              ? `sur ${k.ho_success_rate.total.toLocaleString("fr-FR")} HO`
              : "aucune donnée"
          }
        />
        <ExpandiumKpiCard
          label="DURÉE MOY. HO"
          value={k.ho_avg_duration_ms?.value}
          unit="ms"
          variant="blue"
          loading={loading}
          sublabel={
            k.ho_avg_duration_ms?.samples
              ? `${k.ho_avg_duration_ms.samples.toLocaleString("fr-FR")} échant.`
              : "aucune donnée"
          }
        />
        <ExpandiumKpiCard
          label="ERREURS HDLC"
          value={k.hdlc_errors?.value}
          variant="red"
          loading={loading}
          sublabel="trames en erreur"
        />
        <ExpandiumKpiCard
          label="TRANSACTIONS"
          value={k.transactions?.value}
          variant="purple"
          loading={loading}
          sublabel="appels et signalisation"
        />
      </div>

      {/* ===== Sync info ===== */}
      <div className="exp-sync-info">
        🔗 Période :{" "}
        <strong>
          {data?.date_from || dateFrom || "auto"} → {data?.date_to || dateTo || "auto"}
        </strong>
        {" · "}
        Source : <code>gold.fact_*</code> · gsmr_dwh
      </div>

      {/* ===== Top intervals bar chart ===== */}
      <div className="exp-chart-card">
        <div className="exp-chart-header">
          <h3 className="exp-chart-title">Top 10 intervalles par handovers</h3>
          <p className="exp-chart-subtitle">
            Cell ID source/cible mappés vers les intervalles GSMR_XX/YY (intra-couche)
          </p>
        </div>
        <TopIntervalsBars
          items={data?.top_intervals || []}
          loading={loading}
        />
      </div>

      {/* ===== Graphiques par engin (1205 M2 + 1207 M1) ===== */}
      <div className="exp-engines-section">
        <div className="exp-engines-section-header">
          <h3 className="exp-engines-section-title">Analyse par engin</h3>
          <p className="exp-engines-section-subtitle">
            Évolution journalière des causes de handover pour les engins suivis
          </p>
        </div>

        <EngineHandoverChart
          engineLabel="1205 M2"
          dateFrom={dateFrom}
          dateTo={dateTo}
        />

        <EngineHandoverChart
          engineLabel="1207 M1"
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      </div>
    </section>
  );
}

/**
 * Inline component for the top intervals bar chart (kept private to this file).
 */
function TopIntervalsBars({ items, loading }) {
  if (loading && items.length === 0) {
    return <div className="exp-chart-empty">Chargement…</div>;
  }
  if (!items.length) {
    return (
      <div className="exp-chart-empty">
        Aucune donnée pour la période sélectionnée.
      </div>
    );
  }
  const max = Math.max(...items.map((it) => it.count), 1);
  return (
    <ul className="exp-bars">
      {items.map((it) => (
        <li key={`${it.interval}-${it.layer}`} className="exp-bar-row">
          <span className="exp-bar-label">{it.interval}</span>
          <span className="exp-bar-layer">{it.layer}</span>
          <span className="exp-bar-track">
            <span
              className="exp-bar-fill"
              style={{ width: `${(it.count / max) * 100}%` }}
            />
          </span>
          <span className="exp-bar-value">
            {it.count.toLocaleString("fr-FR")}
          </span>
        </li>
      ))}
    </ul>
  );
}