# ONCF Service Optimisation

Plateforme interne de supervision, analyse et optimisation du réseau GSM‑R pour la LGV Tanger‑Kénitra.

Port React + Vite du prototype mono-fichier (`Platfrom.html`), avec un backend FastAPI qui récupère les données depuis SharePoint **et** expose les KPI radio issus de la sonde Expandium via un entrepôt PostgreSQL local.

## Architecture

```
┌──────────────┐       ┌───────────────┐       ┌────────────────┐
│  React app   │───────│  FastAPI      │───────│ SharePoint     │
│  :5173       │  /api │  :8000        │  MSAL │                │
│              │       │               │       └────────────────┘
│              │       │               │       ┌────────────────┐
│              │       │               │──SQL──│ PostgreSQL     │
│              │       │               │       │ gsmr_dwh       │
│              │       │               │       │ (bronze/silver/│
│              │       │               │       │       gold)    │
│              │       │               │       └────────────────┘
│              │       │               │             ▲
│              │       │               │             │ (alimenté par)
│              │       │               │       ┌────────────────┐
│              │       │  spawn subprocess     │ Pipeline ETL   │
│              │       │────────────────────── │ (repo séparé)  │
│              │       │                       │ Selenium + SSH │
└──────────────┘       └───────────────┘       └────────────────┘
                                                       ▲
                                                       │ (via tunnel SSH paramiko)
                                                ┌──────────────┐
                                                │ Sonde        │
                                                │ Expandium    │
                                                │ QATS         │
                                                └──────────────┘
```

Le frontend ne parle jamais directement à SharePoint (CORS impossible, credentials exposés). Le backend télécharge l'Excel, le cache sur disque, et le sert via `/api/ertms.xlsx`. Un bouton **Actualiser** dans le dashboard déclenche un re-téléchargement à la demande.

Pour Expandium, le backend expose les KPI via des requêtes SQL sur les **vues gold** de la base `gsmr_dwh`. Le rafraîchissement des données est déclenché par un bouton **Synchroniser** dans la page Expandium — le backend lance en arrière-plan le pipeline ETL (repo séparé `gsmr-data-pipeline-dwh`) qui ouvre un tunnel SSH vers la sonde, extrait 6 CSV via Selenium headless, et alimente Bronze puis Silver dans PostgreSQL. Le frontend polle l'état du job toutes les 3 secondes et recharge les graphiques à la fin.

## Prérequis

- **Node.js 18+** (recommandé : 20 LTS) — pour le frontend
- **Python 3.10+** — pour le backend
- **PostgreSQL 16** — base `gsmr_dwh` avec schémas bronze/silver/gold peuplés par le pipeline ETL
- **Un compte SharePoint / Azure AD** avec un `CLIENT_ID` d'app registration (voir `backend/README.md`)
- **Pipeline ETL** (repo séparé `gsmr-data-pipeline-dwh`) installé sur le même poste, avec Google Chrome pour Selenium headless

## Installation (deux terminaux)

### Terminal 1 — Backend

```bash
cd backend

# Créer un venv (recommandé)
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # macOS / Linux

pip install -r requirements.txt

# Configurer les credentials SharePoint + connexion PostgreSQL + chemins pipeline
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

La page **Expandium**, en revanche, nécessite le backend **et** une base PostgreSQL joignable. Sans ça, les KPI et les graphiques par engin restent vides et un message d'erreur s'affiche.

## Structure du projet

```
oncf-platform/
├── backend/                      # FastAPI service (Python)
│   ├── main.py                   # endpoints SharePoint (/api/ertms.xlsx, /api/refresh, /api/status)
│   │                             # + endpoints Expandium (/api/expandium/kpis, /engine-causes,
│   │                             #   /refresh, /refresh/status, /health)
│   ├── sharepoint.py             # client SharePoint (token cache, ROPC auth)
│   ├── expandium.py              # requêtes SQL sur vues gold (5 KPI + causes handover par engin)
│   ├── expandium_jobs.py         # orchestration asynchrone du pipeline (subprocess + polling)
│   ├── engine_mapping.py         # table de correspondance IMSI → engin (44 IMSI / 22 engins)
│   ├── db.py                     # connexion SQLAlchemy à PostgreSQL
│   ├── requirements.txt
│   ├── .env.example              # credentials SharePoint + connexion PG + chemins pipeline
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
    │   ├── expandium.css         # cartes KPI + graphiques par engin
    │   ├── documents.css         # page documents
    │   └── responsive.css
    ├── pages/
    │   ├── LoginPage.jsx
    │   ├── DashboardPage.jsx     # KPI + 4 charts + carte + filtres + import Excel
    │   ├── ExpandiumPage.jsx     # 5 KPI radio + 2 graphiques journaliers par engin
    │   ├── AnalyzePage.jsx       # analyse IA d'un événement GSM‑R
    │   ├── DocumentsPage.jsx     # upload + extraction PDF/DOCX + résumé IA
    │   └── SettingsPage.jsx      # configuration OpenRouter
    ├── components/
    │   ├── Sidebar.jsx           # navigation latérale (Général / Outils)
    │   ├── Topbar.jsx            # fil d'Ariane + recherche + icônes
    │   ├── SettingsModal.jsx     # modale de config (icône ⚙ top bar)
    │   ├── DisconnectionMap.jsx  # carte Leaflet avec bulles agrégées
    │   ├── ExportButton.jsx      # export dashboard PNG / PDF A4
    │   └── expandium/
    │       ├── ExpandiumPanel.jsx           # conteneur page (header + KPI + engines)
    │       ├── ExpandiumKpiCard.jsx         # 1 carte KPI (variante couleur)
    │       ├── ExpandiumRefreshButton.jsx   # bouton Synchroniser + polling status
    │       └── EngineHandoverChart.jsx      # courbe Better Cell / Downlink Quality
    ├── hooks/
    │   ├── useChart.js           # lifecycle Chart.js propre (create/destroy)
    │   └── useExpandiumData.js   # charge KPI + reload signal partagé
    ├── lib/
    │   ├── AppContext.jsx        # contexte global (clé API, user)
    │   ├── excel.js              # parse XLSX, normalisation sous-systèmes
    │   ├── expandium.js          # client fetch pour endpoints /api/expandium/*
    │   ├── openrouter.js         # client + chaîne de fallback + SYSTEM_PROMPT
    │   ├── docExtract.js         # pdf.js + mammoth → texte brut
    │   ├── markdown.js           # micro renderer MD → HTML pour les sorties LLM
    │   └── mapSvg.js             # carte SVG statique (fallback PDF)
    └── data/
        └── gsmrSites.js          # 33 coordonnées des sites GSM‑R (LGV)
```

## Charger les données

### Données ERTMS (SharePoint / Excel)

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

### Données Expandium (PostgreSQL / QATS)

La page **Expandium** lit ses données depuis la base PostgreSQL `gsmr_dwh` via le backend. Les KPI et graphiques sont calculés à partir des vues du schéma `gold` :

- `gold.fact_handover` — événements de handover
- `gold.fact_etcs_call` — appels ETCS
- `gold.fact_hdlc_frame_error` — erreurs HDLC
- `gold.fact_transaction` — transactions GSM-R

Ces vues sont alimentées par le **pipeline ETL** (repo séparé `gsmr-data-pipeline-dwh`) qui doit être exécuté au moins une fois avant que la page Expandium affiche quelque chose. Après la première exécution, un simple clic sur **Synchroniser Expandium** depuis la page relance le pipeline pour les 7 derniers jours.

### Compte PostgreSQL en lecture seule

Le backend accède à `gsmr_dwh` via un compte applicatif restreint aux `SELECT` sur les vues gold. À créer une fois :

```sql
CREATE USER optimrail_reader WITH PASSWORD '<mot-de-passe>';
GRANT CONNECT ON DATABASE gsmr_dwh TO optimrail_reader;
GRANT USAGE ON SCHEMA gold TO optimrail_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA gold TO optimrail_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA gold
    GRANT SELECT ON TABLES TO optimrail_reader;
```

Puis renseigner `DB_USER=optimrail_reader` et son mot de passe dans `backend/.env`.

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
- Déployer aussi le backend FastAPI (systemd + uvicorn ou Docker) — la page Expandium et le bouton Actualiser en dépendent
- S'assurer que PostgreSQL est joignable depuis le backend (mêmes machines, ou réseau interne ONCF)

## Ce qui reste à faire (roadmap v2)

Le port React reproduit fidèlement le prototype, et intègre désormais Expandium. Les axes naturels pour la suite :

- **Backend FastAPI** pour :
  - proxyer OpenRouter (clé côté serveur, logs d'usage)
  - lire `ertms.xlsx` depuis SharePoint via MSAL (au lieu de `public/`)
  - persister les documents uploadés et leurs résumés
- **Auth réelle** (SSO Azure AD ONCF) — le login actuel accepte n'importe quoi
- **Enrichissement Expandium** :
  - récupérer le vrai mapping IMSI → engin depuis `silver.exp_subscriber_matrix` plutôt que la table en dur dans `engine_mapping.py`
  - ajouter d'autres engins prioritaires en plus de 1205 M2 et 1207 M1
  - percentiles P50/P95 sur la durée des handovers
  - corrélation entre pics de déconnexion ERTMS et pics d'erreurs HDLC/handover
- **Analyse IA** :
  - upload de documents (PDF specs Huawei, drive test) comme contexte additionnel à l'incident décrit
  - historique des analyses avec persistance
- **Génération de rapport hebdo automatique** (module dédié à partir des KPI Expandium)
- **Tests** : la logique métier (`excel.js`, `openrouter.js`, `mapSvg.js`, `expandium.py`) est pure et facile à tester en unitaire avec Vitest / pytest

## Dépannage

**La carte reste blanche après export PDF** — corrigé via un `key` qui force le remount. Si ça arrive quand même, recharge la page.

**Erreur `pdfjs.worker.min.js not found`** — Vite récupère le worker via `?url` depuis `node_modules`. Si le `npm install` a échoué au milieu, relance-le en repartant de zéro : `rm -rf node_modules package-lock.json && npm install`.

**Le dashboard affiche « sans Km »** pour beaucoup de lignes — la colonne Km est vide ou non numérique pour ces lignes. Les lignes sans Km n'apparaissent pas sur la carte mais comptent bien dans les KPI.

**CORS errors depuis OpenRouter** — n'utilise pas `file://` pour ouvrir l'app. Passe toujours par `npm run dev` ou par un vrai serveur HTTP.

**Le bouton Synchroniser Expandium reste à « En cours » indéfiniment** — le sous-processus du pipeline s'est probablement bloqué (tunnel SSH refusé, Chrome absent, timeout Selenium). Vérifie les logs dans `gsmr-data-pipeline-dwh/logs/` du repo pipeline.

**KPI Expandium tous à zéro ou taux de succès HO à 0%** — souvent lié à une désynchro entre les valeurs attendues et les valeurs réellement présentes dans `handover_end_event`. Requête de diagnostic : `SELECT DISTINCT handover_end_event FROM gold.fact_handover;` — les valeurs attendues sont `HO Performed`, `HO Complete`, `HO Failure`, `RLC HO Failure` (attention à la casse).

**Erreurs `UnicodeEncodeError` dans les logs du pipeline lancé depuis OptimRail** — le sous-processus Windows utilise CP1252 par défaut. Vérifie que `expandium_jobs.py` injecte bien `PYTHONIOENCODING=utf-8` et `PYTHONUTF8=1` dans l'environnement du subprocess.