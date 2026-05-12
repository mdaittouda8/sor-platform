import { useState } from 'react';
import { useApp } from '../lib/AppContext.jsx';
import { FALLBACK_MODELS, SYSTEM_PROMPT, callOpenRouterWithFallback } from '../lib/openrouter.js';
import { renderMarkdown } from '../lib/markdown.js';

const DEFAULT_DESC = `Déconnexion au site 15, Cell 215 → 216, sens M1, couche 2. Handover échoué à plusieurs reprises, niveau de signal faible (-95 dBm) à l'approche de la cellule voisine. Vitesse TGV ~280 km/h. Incident récurrent sur cette section depuis 3 jours.`;

// User-facing model picker — kept short on purpose, matches FALLBACK_MODELS.
const MODEL_OPTIONS = [
  { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview — Google, principal' },
  { id: 'nvidia/nemotron-nano-9b-v2:free', label: 'Nemotron Nano 9B v2 — Fallback automatique' },
];

export default function AnalyzePage({ onOpenSettings }) {
  const { apiKey } = useApp();
  const [desc, setDesc] = useState(DEFAULT_DESC);
  const [modelId, setModelId] = useState(MODEL_OPTIONS[0].id);
  const [loading, setLoading] = useState(false);
  const [subText, setSubText] = useState('En attente de saisie…');

  // Result state: either { content, usedModel, fallbackUsed } or { attemptLog } on total failure
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [copyLabel, setCopyLabel] = useState('Copier');

  const runAnalysis = async () => {
    const trimmed = desc.trim();
    if (!trimmed) {
      setSubText('Veuillez décrire un événement.');
      return;
    }
    if (!apiKey) {
      setError(null);
      setResult(null);
      setSubText('Configuration requise');
      setResult({ noKey: true });
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const { content, usedModel, attemptLog, orderedModels } = await callOpenRouterWithFallback({
      apiKey,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: trimmed,
      preferredModelId: modelId,
      onProgress: (model, i, total) => {
        setSubText(i === 0
          ? `Analyse avec ${model.name}...`
          : `Basculement vers ${model.name} (tentative ${i + 1}/${total})...`);
      },
    });

    setLoading(false);

    if (content && usedModel) {
      const fallbackUsed = usedModel.id !== modelId;
      const preferredName = orderedModels[0].name;
      setResult({ content, usedModel, fallbackUsed, preferredName });
      setSubText(
        fallbackUsed
          ? `${preferredName} indisponible — analyse avec ${usedModel.name}`
          : `Analyse terminée · ${new Date().toLocaleTimeString('fr-FR')}`
      );
    } else {
      setError({ attemptLog });
      setSubText('Échec');
    }
  };

  const handleCopy = () => {
    if (!result?.content) return;
    navigator.clipboard.writeText(result.content);
    setCopyLabel('✓ Copié');
    setTimeout(() => setCopyLabel('Copier'), 1500);
  };

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analyse IA · Déconnexion GSM‑R</h1>
          <p className="page-sub">
            Décrivez un incident — l'IA suggère une cause racine et un plan d'action.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-ghost" onClick={onOpenSettings}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
            Config. OpenRouter
          </button>
        </div>
      </div>

      <div className="analyze-grid">
        {/* INPUT */}
        <div className="card">
          <div className="accent-strip"></div>
          <div className="card-head" style={{ marginTop: 14 }}>
            <div>
              <div className="card-title">Événement de déconnexion</div>
              <div className="card-sub">
                Décrivez l'événement — Cell ID, sens, couche, niveau de signal…
              </div>
            </div>
          </div>

          {!apiKey && (
            <div className="config-banner" style={{ display: 'flex' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>
                Aucune clé API OpenRouter configurée.{' '}
                <a onClick={onOpenSettings} style={{ cursor: 'pointer' }}>
                  Configurer →
                </a>
              </span>
            </div>
          )}

          <div className="analyze-input">
            <div className="field-group">
              <label>Modèle IA (avec basculement automatique en cas d'échec)</label>
              <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group">
              <label>Description de l'événement</label>
              <textarea
                style={{ minHeight: 280 }}
                placeholder="Ex : Déconnexion au site 15, Cell 215 → 216, sens M1, couche 2. Handover échoué, signal faible (-95 dBm)..."
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>

            <button
              className={`analyze-btn ${loading ? 'loading' : ''}`}
              onClick={runAnalysis}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  Analyse en cours...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l2.39 5.42L20 9l-4.5 4.04L17 19l-5-3-5 3 1.5-5.96L4 9l5.61-1.58z" />
                  </svg>
                  Lancer l'analyse IA
                </>
              )}
            </button>
          </div>
        </div>

        {/* RESULT */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Recommandations d'optimisation</div>
              <div className="card-sub">
                {result?.fallbackUsed && (
                  <>
                    ⚠️ <strong>{result.preferredName}</strong> indisponible — analyse faite avec{' '}
                    <strong>{result.usedModel.name}</strong> ·{' '}
                    {new Date().toLocaleTimeString('fr-FR')}
                  </>
                )}
                {!result?.fallbackUsed && subText}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-ghost"
                style={{ padding: '6px 10px', fontSize: 12 }}
                disabled={!result?.content}
                onClick={handleCopy}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                {copyLabel}
              </button>
            </div>
          </div>

          {result?.usedModel && (
            <div style={{ marginBottom: 12 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(243,146,0,.1)',
                  color: 'var(--oncf-orange-deep)',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(243,146,0,.2)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                ✓ {result.usedModel.name}
              </span>
            </div>
          )}

          <div className="result-box">
            <ResultContent loading={loading} subText={subText} result={result} error={error} />
          </div>
        </div>
      </div>
    </section>
  );
}

// Render the right-hand content panel based on current state.
// Split out because it has four distinct states: empty, loading, success, error.
function ResultContent({ loading, subText, result, error }) {
  if (loading) {
    return (
      <div className="result-empty">
        <div className="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <h4 style={{ marginTop: 12 }}>{subText}</h4>
        <p>Quelques secondes…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="result-empty" style={{ textAlign: 'left', padding: 20 }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--bad)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ margin: '0 auto 10px', display: 'block' }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h4 style={{ color: 'var(--bad)', textAlign: 'center' }}>
          Tous les modèles ont échoué
        </h4>
        <p style={{ color: 'var(--slate-500)', fontSize: 12, margin: '12px 0 8px' }}>
          Détail des tentatives :
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13 }}>
          {error.attemptLog.map((a, i) => {
            const ok = a.status === 'ok';
            return (
              <li key={i} style={{ margin: '4px 0' }}>
                <span
                  style={{
                    color: ok ? 'var(--good)' : 'var(--bad)',
                    fontWeight: 700,
                  }}
                >
                  {ok ? '✓' : '✗'}
                </span>{' '}
                <strong>{a.model}</strong>{' '}
                <span style={{ color: 'var(--slate-400)', fontSize: 11 }}>({a.id})</span>
                {a.error && (
                  <>
                    {' '}— <code style={{ fontSize: 11 }}>{a.error}</code>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <p
          style={{
            color: 'var(--slate-400)',
            fontSize: 11,
            marginTop: 14,
            textAlign: 'center',
          }}
        >
          Vérifiez votre clé API, votre connexion, ou réessayez dans quelques minutes (limites de
          débit OpenRouter).
        </p>
      </div>
    );
  }

  if (result?.noKey) {
    return (
      <div className="result-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <h4>Clé API requise</h4>
        <p>Configurez votre clé OpenRouter via l'icône ⚙️ en haut à droite pour lancer une analyse.</p>
      </div>
    );
  }

  if (result?.content) {
    // Rendered markdown — safe because we escape in renderMarkdown before inserting HTML tags
    return <div dangerouslySetInnerHTML={{ __html: renderMarkdown(result.content) }} />;
  }

  return (
    <div className="result-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" />
        <path d="M9 14l2 2 4-4" />
      </svg>
      <h4>Analyse en attente</h4>
      <p>Décrivez un événement de déconnexion GSM-R puis lancez l'analyse.</p>
    </div>
  );
}