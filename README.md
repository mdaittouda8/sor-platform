# ONCF Service Optimisation

Plateforme interne de supervision, analyse et optimisation du réseau GSM‑R pour la LGV Tanger‑Kénitra.

Port React + Vite du prototype mono-fichier (`Platfrom.html`), avec un petit backend FastAPI qui récupère les données directement depuis SharePoint.

## Architecture

```
┌──────────────┐       ┌───────────────┐       ┌────────────┐
│  React app   │───────│  FastAPI      │───────│ SharePoint │
│  :5173       │  /api │  :8000        │  MSAL │            │
└──────────────┘       └───────────────┘       └────────────┘
```

Le frontend ne parle jamais directement à SharePoint (CORS impossible, credentials exposés). Le backend télécharge l'Excel, le cache sur disque, et le sert via `/api/ertms.xlsx`. Un bouton **Actualiser** dans le dashboard déclenche un re-téléchargement à la demande.

## Prérequis

- **Node.js 18+** (recommandé : 20 LTS) — pour le frontend
- **Python 3.10+** — pour le backend
- **Un compte SharePoint / Azure AD** avec un `CLIENT_ID` d'app registration (voir `backend/README.md`)

## Installation (deux terminaux)

### Terminal 1 — Backend

```bash
cd backend

# Créer un venv (recommandé)
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # macOS / Linux

pip install -r requirements.txt

# Configurer les credentials SharePoint
cp .env.example .env            # puis éditer .env

python main.py
# → http://localhost:8000  (uvicorn tourne en continu)
```

### Terminal 2 — Frontend

```bash
# (depuis la racine du projet)
npm install

# (Optionnel) Clé OpenRouter pour l'Analyse IA
cp .env.example .env            # puis éditer .env

npm run dev
# → http://localhost:5173 (s'ouvre automatiquement)
```

**Login démo :** n'importe quel identifiant / mot de passe — par ex. `mdaittouda` / `demo`.

### Que faire si le backend n'est pas démarré ?

Le dashboard fonctionne quand même :

1. D'abord il tente `/api/ertms.xlsx` (le backend)
2. Si le backend est hors ligne, il essaie `public/ertms.xlsx` (fichier statique)
3. Si rien ne marche, une bannière apparaît avec un bouton « Choisir le fichier Excel »

Le bouton **Actualiser**, lui, nécessite le backend démarré — il affiche une erreur sinon.

## Structure du projet

```
oncf-platform/
├── backend/                      # FastAPI service (Python)
│   ├── main.py                   # endpoints : /api/ertms.xlsx, /api/refresh, /api/status
│   ├── sharepoint.py             # client SharePoint (token cache, ROPC auth)
│   ├── requirements.txt
│   ├── .env.example              # credentials SharePoint à remplir
│   ├── cache/                    # fichier téléchargé (créé au runtime, git-ignoré)
│   └── README.md                 # guide détaillé du backend
├── index.html                    # shell HTML, charge Inter Tight + Leaflet CSS
├── package.json
├── vite.config.js
├── .env.example                  # gabarit pour la clé OpenRouter
├── public/                       # fichiers statiques servis à la racine
│   └── ertms.xlsx                # (à ajouter) — données de déconnexions
└── src/
    ├── main.jsx                  # point d'entrée, monte <App />
    ├── App.jsx                   # routeur simple + provider de contexte
    ├── styles/                   # CSS découpé par sujet (tokens → pages)
    │   ├── base.css              # :root, reset
    │   ├── login.css
    │   ├── layout.css            # sidebar, topbar, structure des pages
    │   ├── dashboard.css         # KPI, grille, légendes
    │   ├── analyze.css           # page d'analyse IA
    │   ├── modal.css             # modale de réglages
    │   ├── ertms.css             # charts, carte, bannières, overlay export
    │   ├── documents.css         # page documents
    │   └── responsive.css
    ├── pages/
    │   ├── LoginPage.jsx
    │   ├── DashboardPage.jsx     # KPI + 4 charts + carte + filtres + import Excel
    │   ├── AnalyzePage.jsx       # analyse IA d'un événement GSM‑R
    │   ├── DocumentsPage.jsx     # upload + extraction PDF/DOCX + résumé IA
    │   ├── ReportsPage.jsx       # placeholder (à développer)
    │   ├── AlertsPage.jsx        # placeholder (à développer)
    │   └── SettingsPage.jsx      # configuration OpenRouter
    ├── components/
    │   ├── Sidebar.jsx           # navigation latérale
    │   ├── Topbar.jsx            # fil d'Ariane + recherche + icônes
    │   ├── SettingsModal.jsx     # modale de config (icône ⚙ top bar)
    │   ├── DisconnectionMap.jsx  # carte Leaflet avec bulles agrégées
    │   └── ExportButton.jsx      # export dashboard PNG / PDF A4
    ├── hooks/
    │   └── useChart.js           # lifecycle Chart.js propre (create/destroy)
    ├── lib/
    │   ├── AppContext.jsx        # contexte global (clé API, user)
    │   ├── excel.js              # parse XLSX, normalisation sous-systèmes
    │   ├── openrouter.js         # client + chaîne de fallback + SYSTEM_PROMPT
    │   ├── docExtract.js         # pdf.js + mammoth → texte brut
    │   ├── markdown.js           # micro renderer MD → HTML pour les sorties LLM
    │   └── mapSvg.js             # carte SVG statique (fallback PDF)
    └── data/
        └── gsmrSites.js          # 33 coordonnées des sites GSM‑R (LGV)
```

## Charger les données

La page **Tableau de bord** lit automatiquement un fichier Excel placé dans `public/`. Trois noms sont tentés dans l'ordre :

1. `public/ertms.xlsx`
2. `public/Suivi_des_déconnexions_ERTMS_et_actions_correctives.xlsx`
3. `public/data.xlsx`

Si aucun n'est trouvé, une bannière orange apparaît sur le dashboard avec un bouton « Choisir le fichier Excel » pour le charger manuellement.

**Colonnes attendues** (noms exacts, feuille `Data` en priorité puis la première feuille) :

| Colonne | Rôle |
|---|---|
| `Date` | date de l'événement (format Excel ou ISO) |
| `Rame` | identifiant de la rame |
| `Motrice / Cab` | M1 ou M2 |
| `Intervalle` | intervalle temporel |
| `Evénement ` | type (⚠️ espace final intentionnel) |
| `Sous Système mis en cause` | GSMR, BORD, RBC, … |
| `Km` | PK (utilisé pour localiser sur la carte) |

## Clé API OpenRouter

Les pages **Analyse IA** et **Documents** utilisent OpenRouter (chaîne de fallback : DeepSeek V3 → Llama 3.3 70B → Qwen3 → Gemma → Nemotron).

**3 manières de fournir la clé**, par ordre de priorité :

1. **`.env`** : `VITE_OPENROUTER_KEY=sk-or-v1-...` — idéal en développement
2. **Icône ⚙ (top bar)** : ouvre la modale, stocke dans le `localStorage` du navigateur
3. **Page Paramètres** : même comportement que la modale

La clé saisie à l'écran a priorité sur celle du `.env`. Pour la réinitialiser : efface le champ dans Paramètres et clique Enregistrer.

> ⚠️ En production, la clé **doit** être gérée côté serveur (un backend proxy OpenRouter), pas exposée au navigateur. L'implémentation actuelle est acceptable pour un outil interne derrière un SSO.

## Commandes

```bash
npm run dev        # serveur dev avec HMR (port 5173)
npm run build      # build de production dans dist/
npm run preview    # sert le build dist/ en local pour tester
```

## Déploiement

Le `npm run build` produit un dossier `dist/` statique qu'on peut héberger n'importe où :

- **Vercel / Netlify** : connecter le repo, build command `npm run build`, output `dist`
- **Nginx / serveur interne ONCF** : copier `dist/` et servir avec du `try_files $uri /index.html` (pas de routing côté serveur nécessaire — il n'y a pas de React Router, tout tient en un seul `index.html`)
- **Docker** : base `nginx:alpine`, copier `dist/` dans `/usr/share/nginx/html/`

Pour le déploiement, pense à :
- Injecter `VITE_OPENROUTER_KEY` au moment du build (ou mieux : ajouter un backend proxy)
- Copier `ertms.xlsx` dans `public/` avant `npm run build` si tu veux que les données soient servies statiquement

## Ce qui reste à faire (roadmap v2)

Le port React reproduit fidèlement le prototype. Les axes naturels pour la suite :

- **Backend FastAPI** pour :
  - proxyer OpenRouter (clé côté serveur, logs d'usage)
  - lire `ertms.xlsx` depuis SharePoint via MSAL (au lieu de `public/`)
  - persister les documents uploadés et leurs résumés
- **Auth réelle** (SSO Azure AD ONCF) — le login actuel accepte n'importe quoi
- **Pages Rapports & Alertes** — placeholders aujourd'hui
- **Tests** : la logique métier (`excel.js`, `openrouter.js`, `mapSvg.js`) est pure et facile à tester en unitaire avec Vitest

## Dépannage

**La carte reste blanche après export PDF** — corrigé via un `key` qui force le remount. Si ça arrive quand même, recharge la page.

**Erreur `pdfjs.worker.min.js not found`** — Vite récupère le worker via `?url` depuis `node_modules`. Si le `npm install` a échoué au milieu, relance-le en repartant de zéro : `rm -rf node_modules package-lock.json && npm install`.

**Le dashboard affiche « sans Km »** pour beaucoup de lignes — la colonne Km est vide ou non numérique pour ces lignes. Les lignes sans Km n'apparaissent pas sur la carte mais comptent bien dans les KPI.

**CORS errors depuis OpenRouter** — n'utilise pas `file://` pour ouvrir l'app. Passe toujours par `npm run dev` ou par un vrai serveur HTTP.
