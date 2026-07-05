import { useState, useRef, useEffect } from 'react';
import { useApp } from '../lib/AppContext.jsx';
import { SYSTEM_PROMPT, callChatWithFallback } from '../lib/openrouter.js';
import { renderMarkdown } from '../lib/markdown.js';
import { extractDocText, formatFileSize, docKind } from '../lib/docExtract.js';

const CONV_STORAGE = 'oncf.analyze.conversations';
const ACTIVE_STORAGE = 'oncf.analyze.activeId';

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const ACCEPTED_EXT = ['pdf', 'docx', 'xlsx', 'xls', 'txt', 'md', 'csv', 'log'];
const MAX_DOC_CONTEXT_CHARS = 50000;

const MODEL_OPTIONS = [
  { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview — Google, principal' },
  { id: 'nvidia/nemotron-nano-9b-v2:free', label: 'Nemotron Nano 9B v2 — Fallback automatique' },
];

function makeConversation() {
  return {
    id: 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    title: 'Nouvelle conversation',
    messages: [], // { role: 'user'|'assistant', content, ts, usedModel?, isError? }
    documents: [], // { id, name, size, kind, text, addedAt }
    createdAt: Date.now(),
  };
}

function loadConversations() {
  try {
    const raw = localStorage.getItem(CONV_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* localStorage unavailable or corrupted — fall through */
  }
  return null;
}

function truncateTitle(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 42 ? clean.slice(0, 42) + '…' : clean;
}

function buildDocContext(documents) {
  if (!documents || !documents.length) return '';
  let combined = documents.map((d) => `## Document : ${d.name}\n${d.text}`).join('\n\n');
  if (combined.length > MAX_DOC_CONTEXT_CHARS) {
    combined =
      combined.slice(0, MAX_DOC_CONTEXT_CHARS) +
      `\n\n[... contexte tronqué à ~${Math.round(MAX_DOC_CONTEXT_CHARS / 1000)}k caractères]`;
  }
  return combined;
}

function buildErrorContent(attemptLog) {
  const lines = (attemptLog || []).map(
    (a) => `- ${a.status === 'ok' ? '✓' : '✗'} **${a.model}**${a.error ? ` — ${a.error}` : ''}`
  );
  return `⚠️ **Tous les modèles ont échoué.**\n\n${lines.join(
    '\n'
  )}\n\nVérifiez votre clé API, votre connexion, ou réessayez dans quelques minutes (limites de débit OpenRouter).`;
}

export default function AnalyzePage({ onOpenSettings }) {
  const { apiKey } = useApp();

  const [conversations, setConversations] = useState(() => loadConversations() || [makeConversation()]);
  const [activeId, setActiveId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_STORAGE) || null;
    } catch {
      return null;
    }
  });

  const [modelId, setModelId] = useState(MODEL_OPTIONS[0].id);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [subText, setSubText] = useState('');
  const [extracting, setExtracting] = useState(false);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Keep activeId valid: default to the first conversation, and recover if the
  // active one was deleted.
  useEffect(() => {
    if (!conversations.length) {
      setConversations([makeConversation()]);
      return;
    }
    if (!activeId || !conversations.some((c) => c.id === activeId)) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);

  useEffect(() => {
    try {
      localStorage.setItem(CONV_STORAGE, JSON.stringify(conversations));
    } catch {
      /* localStorage unavailable (private mode, quota) */
    }
  }, [conversations]);

  useEffect(() => {
    try {
      if (activeId) localStorage.setItem(ACTIVE_STORAGE, activeId);
    } catch {
      /* localStorage unavailable */
    }
  }, [activeId]);

  const active = conversations.find((c) => c.id === activeId) || conversations[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages.length, loading]);

  const handleNewConversation = () => {
    const conv = makeConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setInput('');
  };

  const handleDeleteConversation = (id) => {
    if (!confirm('Supprimer cette conversation ?')) return;
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      return next.length ? next : [makeConversation()];
    });
  };

  const handleFiles = async (fileList) => {
    if (!fileList || !fileList.length || !active) return;
    setExtracting(true);
    for (const file of fileList) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!ACCEPTED_EXT.includes(ext)) {
        alert(`Format non supporté : ${file.name}\nFormats acceptés : ${ACCEPTED_EXT.join(', ')}`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        alert(`Fichier trop volumineux : ${file.name} (${formatFileSize(file.size)})\nMaximum : 20 Mo`);
        continue;
      }
      try {
        const text = await extractDocText({ file, kind: docKind(file.name), extractedText: null });
        const docEntry = {
          id: 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          name: file.name,
          size: file.size,
          kind: docKind(file.name),
          text,
          addedAt: Date.now(),
        };
        setConversations((prev) =>
          prev.map((c) => (c.id === activeId ? { ...c, documents: [...c.documents, docEntry] } : c))
        );
      } catch (e) {
        alert(`Erreur lors de la lecture de ${file.name} : ${e.message || e}`);
      }
    }
    setExtracting(false);
  };

  const removeDocument = (docId) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, documents: c.documents.filter((d) => d.id !== docId) } : c))
    );
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !apiKey || !active) return;

    const convId = active.id;
    const priorMessages = active.messages;
    const docContext = buildDocContext(active.documents);
    const fullSystemPrompt = docContext
      ? `${SYSTEM_PROMPT}\n\n---\n\n# Contexte documents fournis par l'utilisateur\n${docContext}`
      : SYSTEM_PROMPT;

    const userMsg = { role: 'user', content: trimmed, ts: Date.now() };
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              title: c.messages.length === 0 ? truncateTitle(trimmed) : c.title,
              messages: [...c.messages, userMsg],
            }
          : c
      )
    );
    setInput('');
    setLoading(true);
    setSubText('Réflexion...');

    const chatMessages = [
      { role: 'system', content: fullSystemPrompt },
      ...priorMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: trimmed },
    ];

    const { content, usedModel, attemptLog } = await callChatWithFallback({
      apiKey,
      messages: chatMessages,
      preferredModelId: modelId,
      onProgress: (model, i, total) => {
        setSubText(
          i === 0 ? `Réflexion avec ${model.name}...` : `Basculement vers ${model.name} (${i + 1}/${total})...`
        );
      },
    });

    setLoading(false);

    const replyMsg =
      content && usedModel
        ? { role: 'assistant', content, ts: Date.now(), usedModel: usedModel.name }
        : { role: 'assistant', content: buildErrorContent(attemptLog), ts: Date.now(), isError: true };

    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, replyMsg] } : c))
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!active) return null;

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <h1 className="page-title">Assistant IA · GSM-R</h1>
          <p className="page-sub">
            Discutez avec l'assistant, joignez des documents pour lui donner du contexte.
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

      <div className="chat-layout">
        <aside className="chat-sidebar">
          <button className="chat-new-btn" onClick={handleNewConversation}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nouvelle conversation
          </button>
          <div className="chat-conv-list">
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`chat-conv-item ${c.id === activeId ? 'active' : ''}`}
                onClick={() => setActiveId(c.id)}
              >
                <span className="chat-conv-title" title={c.title}>
                  {c.title}
                </span>
                <button
                  className="chat-conv-del"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConversation(c.id);
                  }}
                  aria-label="Supprimer la conversation"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="chat-main card">
          <div className="chat-toolbar">
            <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="chat-messages">
            {active.messages.length === 0 && !loading && (
              <div className="result-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                <h4>Nouvelle conversation</h4>
                <p>Décrivez un événement GSM-R ou posez une question. Joignez un document pour lui donner du contexte.</p>
              </div>
            )}

            {active.messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))}

            {loading && (
              <div className="chat-msg chat-msg-assistant">
                <div className="chat-msg-bubble">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--slate-400)' }}>{subText}</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {active.documents.length > 0 && (
            <div className="chat-doc-chips">
              {active.documents.map((d) => (
                <span key={d.id} className="chat-doc-chip" title={`${d.name} · ${formatFileSize(d.size)}`}>
                  📄 <span>{d.name}</span>
                  <button onClick={() => removeDocument(d.id)} aria-label="Retirer le document">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="chat-input-row">
            <button
              className="chat-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting || !apiKey}
              title="Joindre un document"
            >
              {extracting ? (
                <div className="typing-indicator" style={{ padding: 0 }}>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.xls,.txt,.md,.csv,.log"
              style={{ display: 'none' }}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <textarea
              placeholder="Écrivez votre message... (Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!apiKey}
            />
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!apiKey || loading || !input.trim()}
              title="Envoyer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`chat-msg ${isUser ? 'chat-msg-user' : 'chat-msg-assistant'} ${msg.isError ? 'chat-msg-error' : ''}`}>
      <div className="chat-msg-bubble">
        {isUser ? <p>{msg.content}</p> : <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />}
      </div>
      {!isUser && msg.usedModel && !msg.isError && <div className="chat-msg-meta">✓ {msg.usedModel}</div>}
    </div>
  );
}
