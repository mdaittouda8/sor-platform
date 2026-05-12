import { useState } from 'react';
import { useApp } from '../lib/AppContext.jsx';

export default function LoginPage() {
  const { login } = useApp();
  const [username, setUsername] = useState('mdaittouda');
  const [password, setPassword] = useState('demo');

  const handleSubmit = (e) => {
    e.preventDefault();
    login(username);
  };

  return (
    <div className="login-wrap">
      <div className="login-left">
        <div className="brand-mark">
          <div className="brand-logo">ON</div>
          <div className="brand-text">
            ONCF <span>· Optim</span>
          </div>
        </div>

        <div className="login-hero">
          <span className="eyebrow">Service Optimisation</span>
          <h1>
            Outil interne pour <em>superviser</em>, analyser et optimiser le réseau GSM‑R.
          </h1>
          <p>
            Plateforme unifiée de suivi des déconnexions, analyse assistée par IA et reporting pour
            le service optimisation réseau.
          </p>
        </div>

        <div className="login-footer">
          <div>
            <strong>24/7</strong>Monitoring actif
          </div>
          <div>
            <strong>v1.0</strong>Beta interne
          </div>
        </div>
      </div>

      <div className="login-right">
        <div className="login-card">
          <h2>Connexion</h2>
          <p className="sub">Accédez à votre espace Optimisation.</p>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="loginUser">Identifiant / Matricule</label>
              <input
                type="text"
                id="loginUser"
                placeholder="mdaittouda"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="loginPass">Mot de passe</label>
              <input
                type="password"
                id="loginPass"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="row-between">
              <label>
                <input type="checkbox" defaultChecked /> Rester connecté
              </label>
              <a href="#">Mot de passe oublié ?</a>
            </div>
            <button type="submit" className="btn-primary">
              Se connecter →
            </button>
          </form>

          <div className="login-hint">
            <strong>Demo :</strong> n'importe quel identifiant / mot de passe fonctionne.{' '}
            <span className="mono">mdaittouda / demo</span>
          </div>
        </div>
      </div>
    </div>
  );
}
