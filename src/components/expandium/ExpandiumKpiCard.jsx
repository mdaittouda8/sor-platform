import React from "react";

/**
 * One KPI card. Variant controls the accent color (left bar).
 */
export default function ExpandiumKpiCard({
  label,
  value,
  unit = "",
  variant = "orange",
  sublabel = "",
  loading = false,
}) {
  const variants = {
    orange: "#F39200",
    green: "#16A34A",
    blue: "#3B82F6",
    red: "#E22D1F",
    purple: "#8B5CF6",
  };
  const accent = variants[variant] || variants.orange;

  const display =
    loading
      ? "..."
      : value === null || value === undefined
      ? "—"
      : typeof value === "number"
      ? new Intl.NumberFormat("fr-FR").format(value)
      : String(value);

  return (
    <div className="exp-kpi-card">
      <div className="exp-kpi-accent" style={{ background: accent }} />
      <div className="exp-kpi-body">
        <div className="exp-kpi-label">{label}</div>
        <div className="exp-kpi-value-row">
          <span className="exp-kpi-value">{display}</span>
          {unit && <span className="exp-kpi-unit">{unit}</span>}
        </div>
        {sublabel && <div className="exp-kpi-sublabel">{sublabel}</div>}
      </div>
    </div>
  );
}