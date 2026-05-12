import { useState, useEffect } from 'react';
import { useApp } from '../lib/AppContext.jsx';

export default function SettingsPage() {
  const { apiKey, setApiKey } = useApp();
  const [draft, setDraft] = useState(apiKey);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(apiKey), [apiKey]);

  const handleSave = () => {
    setApiKey(draft.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <h1 className="page-title">Paramètres</h1>
          <p className="page-sub">Configuration de l'application.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Intégration OpenRouter</div>
            <div className="card-sub">Clé API pour la page d'analyse IA.</div>
          </div>
        </div>
        <div style={{ maxWidth: 500 }}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Clé API OpenRouter</label>
            <input
              type="password"
              placeholder="sk-or-v1-..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            style={{ width: 'auto', padding: '10px 20px' }}
            onClick={handleSave}
          >
            {saved ? '✓ Enregistré' : 'Enregistrer'}
          </button>
          <small
            style={{
              color: 'var(--slate-400)',
              fontSize: 11,
              display: 'block',
              marginTop: 12,
            }}
          >
            La clé est stockée dans votre navigateur (localStorage). En production, elle devra être
            gérée côté serveur.
          </small>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Modèles IA configurés</div>
            <div className="card-sub">Chaîne de basculement automatique.</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 500 }}>
          <ModelRow name="Gemini 3 Flash Preview" desc="Google · modèle principal" primary />
          <ModelRow name="Nemotron Nano 9B v2" desc="NVIDIA · fallback automatique (free tier)" />
        </div>
      </div>
    </section>
  );
}

function ModelRow({ name, desc, primary }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: 'var(--paper)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: primary ? 'var(--oncf-orange)' : 'var(--slate-400)',
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--slate-400)' }}>{desc}</div>
      </div>
      <div
        className="mono"
        style={{ fontSize: 10, color: 'var(--slate-400)' }}
      >
        {primary ? 'paid' : ':free'}
      </div>
    </div>
  );
}