import { useState, useRef } from 'react';
import { useApp } from '../lib/AppContext.jsx';
import { callOpenRouterWithFallback } from '../lib/openrouter.js';
import { renderMarkdown, escapeHtml } from '../lib/markdown.js';
import { extractDocText, formatFileSize, docKind } from '../lib/docExtract.js';

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const ACCEPTED_EXT = ['pdf', 'docx', 'txt', 'md', 'csv', 'log'];

const DOC_SUMMARY_SYSTEM = `Tu es un assistant qui résume des documents techniques de manière structurée et fidèle.`;

function buildSummaryPrompt(docText, truncatedNote) {
  return `Tu es un assistant technique spécialisé dans les documents ferroviaires et télécoms (GSM-R, ERTMS, ONCF).

Analyse le document suivant et fournis un résumé structuré en français, au format Markdown, avec :
- **Type de document** (ex: procédure, rapport d'incident, fiche technique, compte-rendu...)
- **Objet / Sujet principal** (1-2 phrases)
- **Points clés** (liste à puces, maximum 7 points)
- **Données chiffrées importantes** (si présentes)
- **Actions ou décisions mentionnées** (si présentes)
- **Recommandations éventuelles**

Sois concis, factuel, et fidèle au contenu. N'invente rien qui ne soit pas dans le document.${truncatedNote}

---

${docText}`;
}

export default function DocumentsPage() {
  const { apiKey } = useApp();
  const [docs, setDocs] = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  // Modal state for the AI summary
  const [summaryModal, setSummaryModal] = useState(null); // { doc, state: 'extracting'|'analyzing'|'ready'|'error', summary, usedModel, attemptLog }
  const [copyLabel, setCopyLabel] = useState('Copier');

  const handleFiles = (fileList) => {
    if (!fileList || !fileList.length) return;
    const next = [...docs];
    for (const file of fileList) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!ACCEPTED_EXT.includes(ext)) {
        alert(`Format non supporté : ${file.name}\nFormats acceptés : ${ACCEPTED_EXT.join(', ')}`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        alert(
          `Fichier trop volumineux : ${file.name} (${formatFileSize(file.size)})\nMaximum : 20 Mo`
        );
        continue;
      }
      next.push({
        id: 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        ext,
        kind: docKind(file.name),
        extractedText: null,
        summary: null,
        summaryModel: null,
        uploadedAt: new Date(),
      });
    }
    setDocs(next);
  };

  const handleDownload = (doc) => {
    const url = URL.createObjectURL(doc.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDelete = (doc) => {
    if (!confirm(`Supprimer « ${doc.name} » ?`)) return;
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  };

  const handleAnalyze = async (doc) => {
    if (!apiKey) {
      alert("Aucune clé API OpenRouter configurée. Allez dans « Analyse IA » ou « Paramètres » pour l'ajouter.");
      return;
    }

    setSummaryModal({ doc, state: 'extracting' });

    try {
      const text = await extractDocText(doc);
      if (!text || text.trim().length < 20) {
        setSummaryModal({
          doc,
          state: 'error',
          errorMessage: "Aucun texte exploitable — le document est vide, scanné sans OCR, ou protégé.",
        });
        return;
      }

      // Cap at ~50k chars (~12k words) so we don't blow past the model's context window
      const MAX_CHARS = 50000;
      let docText = text;
      let truncatedNote = '';
      if (text.length > MAX_CHARS) {
        docText = text.slice(0, MAX_CHARS);
        truncatedNote = `\n\n[Note: document tronqué à ~${Math.round(
          MAX_CHARS / 1000
        )}k caractères sur ${Math.round(text.length / 1000)}k]`;
      }

      setSummaryModal({ doc, state: 'analyzing', charCount: docText.length });

      const { content, usedModel, attemptLog } = await callOpenRouterWithFallback({
        apiKey,
        systemPrompt: DOC_SUMMARY_SYSTEM,
        userPrompt: buildSummaryPrompt(docText, truncatedNote),
        preferredModelId: null, // no user pref on this page — just use default order
        temperature: 0.3,
        maxTokens: 2048,
        title: 'ONCF Document Analyzer',
      });

      if (content && usedModel) {
        // Update doc record with summary so the list shows the "Analysé" badge
        setDocs((prev) =>
          prev.map((d) =>
            d.id === doc.id ? { ...d, summary: content, summaryModel: usedModel.name } : d
          )
        );
        setSummaryModal({ doc, state: 'ready', summary: content, usedModel });
      } else {
        setSummaryModal({ doc, state: 'error', attemptLog });
      }
    } catch (e) {
      console.error('Doc analyze error:', e);
      setSummaryModal({
        doc,
        state: 'error',
        errorMessage: e.message || String(e),
      });
    }
  };

  const handleCopySummary = () => {
    if (!summaryModal?.summary) return;
    navigator.clipboard.writeText(summaryModal.summary);
    setCopyLabel('✓ Copié');
    setTimeout(() => setCopyLabel('Copier'), 1500);
  };

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="page-sub">
            Importez vos procédures, rapports et fiches techniques pour les analyser avec l'IA.
          </p>
        </div>
      </div>

      <div className="card doc-upload-card">
        <label
          htmlFor="docFileInput"
          className={`doc-dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <div className="doc-dropzone-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="doc-dropzone-text">
            <strong>Cliquez ou glissez vos fichiers ici</strong>
            <span>PDF · Word (.docx) · Texte · Markdown · CSV — jusqu'à 20 Mo</span>
          </div>
          <input
            ref={inputRef}
            type="file"
            id="docFileInput"
            multiple
            accept=".pdf,.docx,.txt,.md,.csv,.log"
            style={{ display: 'none' }}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = ''; // allow re-picking the same file
            }}
          />
        </label>
      </div>

      <div className="doc-list-wrap">
        <div className="doc-list-header">
          <h2>Vos documents</h2>
          <span className="doc-count">
            {docs.length === 0 ? '0 document' : `${docs.length} document${docs.length > 1 ? 's' : ''}`}
          </span>
        </div>

        <div className="doc-list">
          {docs.length === 0 ? (
            <div className="doc-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p>Aucun document pour le moment.</p>
            </div>
          ) : (
            docs.map((doc) => (
              <DocItem
                key={doc.id}
                doc={doc}
                onDownload={handleDownload}
                onAnalyze={handleAnalyze}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </div>

      {summaryModal && (
        <SummaryModal
          modal={summaryModal}
          onClose={() => setSummaryModal(null)}
          onCopy={handleCopySummary}
          copyLabel={copyLabel}
        />
      )}
    </section>
  );
}

function DocItem({ doc, onDownload, onAnalyze, onDelete }) {
  const iconLabel = doc.kind === 'other' ? doc.ext.toUpperCase().slice(0, 3) : doc.kind.toUpperCase();
  const uploadedStr = doc.uploadedAt.toLocaleString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });

  return (
    <div className="doc-item">
      <div className={`doc-item-icon ${doc.kind}`}>{iconLabel}</div>
      <div className="doc-item-info">
        <div className="doc-item-name">{doc.name}</div>
        <div className="doc-item-meta">
          <span>{formatFileSize(doc.size)}</span>
          <span className="sep">·</span>
          <span>{uploadedStr}</span>
          {doc.summary && (
            <>
              <span className="sep">·</span>
              <span style={{ color: 'var(--good)', fontWeight: 600 }}>✓ Analysé</span>
            </>
          )}
        </div>
      </div>
      <div className="doc-item-actions">
        <button className="doc-btn" onClick={() => onDownload(doc)} title="Télécharger">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Télécharger
        </button>
        <button className="doc-btn doc-btn-ai" onClick={() => onAnalyze(doc)} title="Résumer avec l'IA">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l2.39 5.42L20 9l-4.5 4.04L17 19l-5-3-5 3 1.5-5.96L4 9l5.61-1.58z" />
          </svg>
          Analyser IA
        </button>
        <button className="doc-btn doc-btn-danger" onClick={() => onDelete(doc)} title="Supprimer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function SummaryModal({ modal, onClose, onCopy, copyLabel }) {
  const { doc, state } = modal;

  return (
    <div className="doc-modal" style={{ display: 'flex' }}>
      <div className="doc-modal-backdrop" onClick={onClose}></div>
      <div className="doc-modal-panel">
        <div className="doc-modal-head">
          <div>
            <h3>Analyse IA</h3>
            <p className="doc-modal-sub">
              {doc.name}
              {modal.usedModel && (
                <>
                  {' '}
                  · <span style={{ color: 'var(--good)', fontWeight: 600 }}>✓ {modal.usedModel.name}</span>
                </>
              )}
            </p>
          </div>
          <button className="doc-modal-close" onClick={onClose} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="doc-modal-body">
          <SummaryBody modal={modal} />
        </div>
        <div className="doc-modal-foot">
          <button className="doc-btn" onClick={onCopy} disabled={state !== 'ready'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copyLabel}
          </button>
          <button className="doc-btn doc-btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryBody({ modal }) {
  const { state, doc } = modal;

  if (state === 'extracting') {
    return (
      <div className="loading-block">
        <div className="spinner"></div>
        <strong>Extraction du texte…</strong>
        <em>Lecture du document {doc.ext.toUpperCase()}</em>
      </div>
    );
  }

  if (state === 'analyzing') {
    return (
      <div className="loading-block">
        <div className="spinner"></div>
        <strong>Analyse en cours…</strong>
        <em>Le modèle lit {Math.round((modal.charCount || 0) / 1000)}k caractères</em>
      </div>
    );
  }

  if (state === 'ready') {
    return <div dangerouslySetInnerHTML={{ __html: renderMarkdown(modal.summary) }} />;
  }

  if (state === 'error') {
    if (modal.errorMessage) {
      return (
        <div className="loading-block">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--bad)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <strong style={{ color: 'var(--bad)', marginTop: 10 }}>Erreur lors de l'analyse</strong>
          <em>{modal.errorMessage}</em>
        </div>
      );
    }
    // Model fallback total failure
    const logItems = modal.attemptLog || [];
    return (
      <div style={{ padding: '10px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--bad)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginBottom: 8 }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <strong style={{ color: 'var(--bad)', display: 'block', fontSize: 14 }}>
            Tous les modèles ont échoué
          </strong>
        </div>
        <p style={{ fontSize: 12, color: 'var(--slate-400)', marginBottom: 6 }}>
          Détail des tentatives :
        </p>
        <ul style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          {logItems.map((a, i) => (
            <li key={i}>
              <strong>{a.model}</strong> — <code>{a.error || 'erreur inconnue'}</code>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return null;
}
