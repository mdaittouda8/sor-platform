export default function ReportsPage() {
  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rapports</h1>
          <p className="page-sub">Exports KPI, rapports hebdomadaires et mensuels.</p>
        </div>
      </div>
      <div className="card" style={{ textAlign: 'center', padding: 60 }}>
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--slate-300)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginBottom: 12 }}
        >
          <path d="M3 3v18h18" />
          <path d="M7 15l4-4 4 4 5-6" />
        </svg>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Module rapports</h3>
        <p style={{ color: 'var(--slate-400)', fontSize: 13 }}>
          À venir — génération automatisée de rapports PowerPoint.
        </p>
      </div>
    </section>
  );
}
