# OptimRail

**Plateforme web interne de supervision et d'optimisation du réseau GSM-R**
Service Optimisation Réseau — ONCF · LGV Tanger–Kénitra

---

## Aperçu

OptimRail est un outil interne développé pour le Service Optimisation Réseau de l'ONCF. Il centralise le suivi des déconnexions ERTMS Niveau 2 sur la LGV Tanger–Kénitra, expose les indicateurs radio de la sonde Expandium QATS, et intègre un assistant IA pour l'aide à la décision sur les paramètres BSC Huawei.

La plateforme remplace un enchaînement historique d'outils (Excel SharePoint + Power BI + exports manuels QATS) par une application web unifiée, interactive et automatisée.

---

## Fonctionnalités

**Tableau de bord ERTMS**
Indicateurs de déconnexion (total, GSM-R, M1, M2), donuts de répartition par sous-système et par événement, histogramme par rame et distribution mensuelle multi-années. Filtres en cascade sur période, rame, intervalle et cabine.

**Carte interactive Leaflet**
Agrégation des déconnexions par intervalle de sites GSM-R (`GSMR_XX/YY`), positionnement au milieu géographique des deux sites, coloration dynamique calibrée sur la fenêtre temporelle (règle 2N/3N/4N par nombre de semaines), labels permanents, popups détaillés, mode plein écran, export PNG haute résolution.

**Page Expandium**
Cinq KPI réseau calculés depuis la base `gsmr_dwh` (appels ETCS, taux de succès handover, durée moyenne HO, erreurs HDLC, transactions). Deux graphiques journaliers par engin (1205 M2 et 1207 M1) séparant les causes Better Cell et Downlink Quality. Bouton de synchronisation asynchrone qui déclenche le pipeline ETL en arrière-plan.

**Analyse IA**
Chaîne de fallback automatique Gemini 3 Flash Preview → Nemotron Nano 9B v2 via OpenRouter. Prompt système spécialisé GSM-R (~350 lignes) avec catalogue des paramètres BSC Huawei et méthodologie d'analyse en trois étapes.

**Documents**
Import PDF/DOCX, extraction de texte côté navigateur (pdf.js, mammoth.js), génération de résumés techniques via OpenRouter.

**Exports**
Export PNG et PDF haute résolution du tableau de bord complet ou de la carte seule.

---

## Stack

| Couche | Technologies |
|---|---|
| Frontend | React 19 · Vite 5 · Chart.js · Leaflet · xlsx.js · jsPDF · html2canvas · pdf.js · mammoth.js |
| Backend | FastAPI · Python 3.11 · SQLAlchemy · psycopg2 · Requests · python-dotenv |
| Entrepôt | PostgreSQL 16 (architecture médaillon Bronze/Silver/Gold) |
| Intégrations | SharePoint (OAuth ROPC via Microsoft Graph) · OpenRouter · sonde Expandium QATS |
| Pipeline ETL | Repo séparé `gsmr-data-pipeline-dwh` (Selenium + paramiko) |

---

## Structure du dépôt

```
oncf-platform/
├── src/                       # Frontend React
│   ├── pages/                 # LoginPage, DashboardPage, ExpandiumPage,
│   │                          # AnalyzePage, DocumentsPage, SettingsPage
│   ├── components/            # Sidebar, Topbar, DisconnectionMap,
│   │                          # ExpandiumPanel, EngineHandoverChart,
│   │                          # ExpandiumKpiCard, ExpandiumRefreshButton, etc.
│   ├── styles/                # CSS modulaires
│   ├── hooks/                 # useExpandiumData, etc.
│   ├── lib/                   # excel.js, openrouter.js, expandium.js, mapSvg.js
│   └── data/                  # gsmrSites.js (33 sites GSM-R)
│
├── backend/
│   ├── main.py                # FastAPI, endpoints REST
│   ├── sharepoint.py          # OAuth ROPC + Microsoft Graph
│   ├── expandium.py           # Requêtes SQL sur vues Gold (KPI + engin)
│   ├── expandium_jobs.py      # Orchestration asynchrone du pipeline
│   ├── engine_mapping.py      # Table de correspondance IMSI → engin
│   ├── db.py                  # Connexion SQLAlchemy à PostgreSQL
│   ├── requirements.txt
│   ├── .env.example           # Modèle de configuration (à copier en .env)
│   └── cache/                 # ertms.xlsx téléchargé (gitignored)
│
├── public/                    # Ressources statiques (logo)
├── package.json
├── vite.config.js             # Proxy /api → localhost:8000
├── index.html
└── .gitignore
```

---

## Prérequis

- **Node.js** 20 LTS ou supérieur
- **Python** 3.11
- **PostgreSQL** 16 (accès en lecture aux vues `gold.*` de la base `gsmr_dwh`)
- **Google Chrome** installé (pour le mode headless du pipeline ETL séparé)
- Un compte de service Azure AD avec droits sur le site SharePoint cible et l'option **« Allow public client flows »** activée
- Une clé API **OpenRouter**

Le pipeline ETL Expandium (repo séparé `gsmr-data-pipeline-dwh`) doit être installé sur le même poste et son chemin renseigné dans le `.env` du backend.

---

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/mdaittouda8/sor-platfporm.git oncf-platform
cd oncf-platform
```

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate       # Linux/macOS
pip install -r requirements.txt
```

Copier le fichier de configuration :

```bash
copy .env.example .env            # Windows
# cp .env.example .env            # Linux/macOS
```

Puis remplir `.env` (voir section **Configuration** plus bas).

### 3. Frontend

Depuis la racine du dépôt :

```bash
npm install
```

---

## Configuration

Le fichier `backend/.env` regroupe tous les secrets et paramètres d'environnement. **Il ne doit jamais être versionné.**

```env
# --- SharePoint (OAuth ROPC via Microsoft Graph) ---
SP_TENANT=<tenant-id-azure-ad-oncf>
SP_CLIENT_ID=<application-id-azure-ad>
SP_USERNAME=<compte-de-service@oncf.ma>
SP_PASSWORD=<mot-de-passe-compte-service>
SP_SITE=https://<oncf>.sharepoint.com/sites/<site>
SP_FILE_PATH=/Documents/.../ertms.xlsx

# --- Base PostgreSQL (entrepôt Expandium) ---
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gsmr_dwh
DB_USER=optimrail_reader
DB_PASSWORD=<mot-de-passe-reader>

# --- Pipeline ETL (chemins vers le repo séparé) ---
PIPELINE_SCRIPT_PATH=C:\Users\<vous>\OneDrive\Bureau\gsmr-data-pipeline-dwh\scheduler.py
PIPELINE_PYTHON=C:\Users\<vous>\OneDrive\Bureau\gsmr-data-pipeline-dwh\.venv\Scripts\python.exe
```

La clé API **OpenRouter** est saisie côté frontend, dans la page **Paramètres** de l'application. Elle est stockée dans `localStorage` du navigateur. Une migration future vers un stockage backend est prévue.

### Création du compte PostgreSQL en lecture seule

À exécuter une fois en administrateur PostgreSQL sur la base `gsmr_dwh` :

```sql
CREATE USER optimrail_reader WITH PASSWORD '<mot-de-passe>';
GRANT CONNECT ON DATABASE gsmr_dwh TO optimrail_reader;
GRANT USAGE ON SCHEMA gold TO optimrail_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA gold TO optimrail_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA gold
    GRANT SELECT ON TABLES TO optimrail_reader;
```

---

## Lancement

Deux terminaux, l'un pour le backend, l'autre pour le frontend.

### Backend (port 8000)

```bash
cd backend
.venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

La documentation interactive OpenAPI est disponible sur `http://localhost:8000/docs`.

### Frontend (port 5173)

Depuis la racine :

```bash
npm run dev
```

L'application est accessible sur `http://localhost:5173`. Vite proxifie automatiquement toutes les requêtes `/api/*` vers `http://localhost:8000`.

### Login

En développement, tout couple identifiant / mot de passe est accepté (mécanisme minimaliste en attente de l'intégration Azure AD SSO).

---

## Endpoints REST principaux

**SharePoint**

- `GET  /api/ertms.xlsx` — Fichier Excel en cache, ou téléchargement frais si absent
- `POST /api/refresh` — Force un téléchargement depuis SharePoint
- `GET  /api/status` — État du cache (date, taille)
- `GET  /api/health` — Sonde de santé

**Expandium**

- `GET  /api/expandium/kpis?date_from=...&date_to=...` — Cinq indicateurs réseau
- `GET  /api/expandium/engine-causes?engine=1205 M2&date_from=...&date_to=...` — Série journalière Better Cell / Downlink Quality
- `POST /api/expandium/refresh` — Démarre un job de synchronisation du pipeline
- `GET  /api/expandium/refresh/status?job_id=...` — État du job
- `GET  /api/expandium/health` — Test de la connexion PostgreSQL

Documentation complète et testable sur `/docs`.

---

## Architecture

Architecture en quatre tiers :

1. **Présentation** — Frontend React exécuté dans le navigateur, avec parsing Excel côté client et rendus Leaflet / Chart.js
2. **Médiation et orchestration** — Backend FastAPI : proxy OAuth vers SharePoint, requêtes SQL sur `gold.*`, orchestration asynchrone du pipeline via sous-processus
3. **Pipeline ETL** — Repo séparé, scripts Python (paramiko + Selenium) qui alimentent l'entrepôt PostgreSQL en couches Bronze / Silver / Gold
4. **Sources externes** — SharePoint (Microsoft Graph), sonde Expandium QATS (via tunnel SSH), PostgreSQL `gsmr_dwh`, OpenRouter Gateway, Azure Active Directory

---

## Règles métier importantes

- **Normalisation sous-systèmes** — Les libellés (`bord`, `Bord`, `BORD`) sont ramenés à une forme canonique
- **Redistribution BORD/GSMR** — Les lignes hybrides sont réparties à parts égales, impair à BORD
- **Mapping intervalle → coordonnées** — Un intervalle `GSMR_XX/YY` est placé au milieu arithmétique des deux sites
- **Seuils de coloration carte** — Formule linéaire 2N / 3N / 4N où N est le nombre de semaines de la fenêtre filtrée
- **Filtrage handovers Expandium** — Restreint aux causes `Better cell` et `Downlink quality` (attention à la casse, valeurs vérifiées empiriquement en base)
- **Mapping IMSI → engin** — 44 IMSI répartis sur 22 engins (2 IMSI par motrice), maintenu dans `backend/engine_mapping.py`

---

## Développement

### Conventions

- Le code frontend suit les conventions React : composants fonctionnels, hooks, contexte `AppContext` pour l'état global partagé
- Le backend expose une API REST typée via Pydantic, avec messages d'erreur en français
- Les secrets ne sont **jamais** commités : `.env` est dans `.gitignore`, seul `.env.example` est versionné
- Les endpoints Expandium n'écrivent **jamais** dans la base : le compte `optimrail_reader` n'a que le droit `SELECT`

### Ajouter un nouveau KPI Expandium

1. Ajouter la fonction de calcul dans `backend/expandium.py` (requête SQL sur une vue `gold.*`)
2. Exposer un endpoint dans `backend/main.py`
3. Consommer l'endpoint depuis `src/hooks/useExpandiumData.js` (ou un nouveau hook)
4. Afficher dans un composant `ExpandiumKpiCard`

Si la donnée requise n'existe pas encore en `gold`, créer d'abord une vue SQL dans le schéma `gold` de la base `gsmr_dwh` (aucune modification du pipeline ETL n'est nécessaire, car les droits `ALTER DEFAULT PRIVILEGES` propagent automatiquement l'accès en lecture au compte `optimrail_reader`).

### Ajouter un engin au mapping IMSI

Éditer directement `backend/engine_mapping.py` et ajouter les deux IMSI (M1 et M2) du nouvel engin dans le dictionnaire `IMSI_TO_ENGINE`. Redémarrer le backend.

---

## Limites connues

- **Authentification** minimaliste en développement, en attente d'intégration Azure AD SSO
- **Clé API OpenRouter** stockée côté navigateur, migration vers proxy backend prévue
- **Aucune persistance applicative** — pas de base de données pour l'utilisateur (préférences, historique d'analyses), tout est en session
- **Usage monoposte** — un utilisateur à la fois par instance
- **Aucun test automatisé** — validation manuelle uniquement

Ces limites sont documentées dans le chapitre 3 du rapport de titularisation.

---

## Difficultés techniques résolues

- **Authentification SharePoint MFA** — Activation manuelle de l'option « Allow public client flows » côté Azure AD pour compatibilité ROPC
- **CORS et capture Leaflet** — Substitution temporaire du rendu Leaflet par un rendu SVG maison pendant les exports PNG
- **Encodage UTF-8 sous-processus Windows** — Variables `PYTHONIOENCODING=utf-8` et `PYTHONUTF8=1` injectées dans l'environnement du sous-processus pour éviter les `UnicodeEncodeError` sur les logs
- **Propagation code de sortie du pipeline** — `sys.exit(0 if success else 1)` dans le scheduler pour que le backend distingue succès et échec
- **Filtrage par valeurs effectives et non par motif** — Le filtre initial `ILIKE '%success%'` retournait zéro ; remplacé par une énumération explicite `IN ('HO Performed', 'HO Complete')` après inspection SQL de `SELECT DISTINCT handover_end_event`
- **Rafraîchissement des graphiques après synchronisation** — Propagation d'une `refreshKey` incrémentée aux composants enfants pour forcer un reload

---

## Ressources

- Documentation FastAPI : [https://fastapi.tiangolo.com](https://fastapi.tiangolo.com)
- Documentation Leaflet : [https://leafletjs.com](https://leafletjs.com)
- Documentation OpenRouter : [https://openrouter.ai/docs](https://openrouter.ai/docs)
- Microsoft Graph : [https://learn.microsoft.com/graph](https://learn.microsoft.com/graph)

---

## Auteur

**Mohamed Ait Touda** — Data Engineer, Service Optimisation Réseau, ONCF
Encadrement : Yassir El Barki, Chef de Service Optimisation Réseau

Projet réalisé dans le cadre du dossier de titularisation au poste d'Ingénieur (2026).

---

## Licence

Usage interne ONCF. Non destiné à une diffusion publique.
