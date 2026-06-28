import React, { useState } from "react";
import { useExpandiumData } from "../../hooks/useExpandiumData";
import ExpandiumKpiCard from "./ExpandiumKpiCard";
import ExpandiumRefreshButton from "./ExpandiumRefreshButton";
import EngineHandoverChart from "./EngineHandoverChart";

export default function ExpandiumPanel({ dateFrom, dateTo }) {
  // refreshKey: incremented after each successful pipeline refresh so that
  // child charts (EngineHandoverChart) re-fetch their data automatically.
  // The KPI cards already reload via their own useExpandiumData.reload().
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, loading, error, reload } = useExpandiumData({
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
          <ExpandiumRefreshButton
            onSuccess={() => {
              // Reload KPI cards
              reload();
              // Force engine charts to refetch by bumping the shared key
              setRefreshKey((k) => k + 1);
            }}
          />
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

      {/* ===== Graphiques par engin (1205 M2 + 1207 M1) ===== */}
      <div className="exp-engines-section">
        <div className="exp-engines-section-header">
          <h3 className="exp-engines-section-title">Analyse par engine</h3>
          <p className="exp-engines-section-subtitle">
            Évolution journalière des causes de handover pour les engins suivis
          </p>
        </div>

        <EngineHandoverChart
          engineLabel="1205 M2"
          dateFrom={dateFrom}
          dateTo={dateTo}
          refreshKey={refreshKey}
        />

        <EngineHandoverChart
          engineLabel="1207 M1"
          dateFrom={dateFrom}
          dateTo={dateTo}
          refreshKey={refreshKey}
        />
      </div>
    </section>
  );
}