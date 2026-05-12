import { useState, useEffect } from 'react';
import { useApp } from '../lib/AppContext.jsx';

export default function SettingsModal({ open, onClose }) {
  const { apiKey, setApiKey } = useApp();
  const [draftKey, setDraftKey] = useState(apiKey);

  // Sync draft with stored key whenever the modal opens
  useEffect(() => {
    if (open) setDraftKey(apiKey);
  }, [open, apiKey]);

  const handleSave = () => {
    setApiKey(draftKey.trim());
    onClose();
  };

  return (
    <div className={`modal-backdrop ${open ? 'active' : ''}`} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Configurer OpenRouter</h3>
        <p className="sub">
          Entrez votre clé API pour activer l'analyse IA. Le modèle se choisit sur la page Analyse.
        </p>
        <div className="field">
          <label>Clé API OpenRouter</label>
          <input
            type="password"
            placeholder="sk-or-v1-..."
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
          />
          <small>
            Obtenez-la gratuitement sur{' '}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
              openrouter.ai/keys
            </a>
          </small>
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn-primary"
            style={{ width: 'auto', padding: '9px 18px' }}
            onClick={handleSave}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
