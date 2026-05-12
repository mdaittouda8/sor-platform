export default function AlertsPage() {
  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <h1 className="page-title">Alertes</h1>
          <p className="page-sub">Notifications et seuils critiques.</p>
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
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        </svg>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Centre d'alertes</h3>
        <p style={{ color: 'var(--slate-400)', fontSize: 13 }}>
          Configuration des seuils et canaux de notification à venir.
        </p>
      </div>
    </section>
  );
}
