# ONCF Backend (FastAPI)

Small Python service that sits between the React app and SharePoint. It downloads the ERTMS Excel file, caches it on disk, and serves it to the frontend. The dashboard's **Actualiser** button triggers a fresh download on demand.

## Prerequisites

- Python 3.10 or newer (`python --version`)
- An Azure AD app registration with SharePoint read access (your `SP_CLIENT_ID`)
- Either:
  - A service account (username + password, no MFA), **or**
  - A user who can do device-code flow (not yet wired up — see roadmap)

## Setup

```bash
cd backend

# 1. (recommended) Create a virtual environment so deps don't pollute system Python
python -m venv .venv

# Activate it:
#   Windows PowerShell:
.venv\Scripts\Activate.ps1
#   Windows cmd.exe:
.venv\Scripts\activate.bat
#   macOS / Linux:
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure credentials
cp .env.example .env       # or copy manually on Windows
# Open .env in your editor and fill in SP_CLIENT_ID, SP_USERNAME, SP_PASSWORD, SP_FILE_PATH

# 4. Run
python main.py
```

You should see something like:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Test it from another terminal:

```bash
curl http://localhost:8000/api/health
# {"ok":true,"cache_exists":false,"last_updated":null}

curl -X POST http://localhost:8000/api/refresh
# {"ok":true,"size_bytes":...,"last_updated":"2026-04-21T...","source":"sharepoint://..."}
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness check. Doesn't hit SharePoint. |
| `GET` | `/api/status` | Cache state + last-updated timestamp. |
| `GET` | `/api/ertms.xlsx` | Serves the cached file. Warms the cache on first call. |
| `POST` | `/api/refresh` | Force fresh download. Returns JSON with timestamp + byte size. |

## How the cache works

The downloaded Excel sits at `backend/cache/ertms.xlsx`. It's created on the first `/api/ertms.xlsx` call (if missing) or explicitly via `POST /api/refresh`. There's **no time-based expiry** — the cache lives forever until the user clicks "Actualiser" in the UI.

To wipe the cache manually: delete `backend/cache/ertms.xlsx`. The next frontend call will re-download it.

## Troubleshooting

**`Auth failed (400): AADSTS50076` or `AADSTS50079`** — MFA is required on the account. ROPC can't handle MFA. You need a service account without MFA, or a different auth flow.

**`Auth failed (400): AADSTS7000218` (invalid client)** — `SP_CLIENT_ID` is wrong or the app registration doesn't allow public client / ROPC. In Azure Portal → your app → Authentication → set "Allow public client flows" to **Yes**.

**`File not found (404)`** — `SP_FILE_PATH` is wrong. Open the file in SharePoint in a browser, copy the full URL, and use the path after the domain. Example:
- URL: `https://oncf.sharepoint.com/sites/X/Documents partages/Foo.xlsx`
- `SP_FILE_PATH=/sites/X/Documents partages/Foo.xlsx`

**Backend runs but React shows a "SharePoint error" banner** — check the backend logs in its terminal. The full error message comes from SharePoint and will tell you what's wrong.

## Roadmap

- **Device-code flow (MSAL)** as an alternative to ROPC, so MFA-enabled accounts work
- **Token persistence** across restarts (survives a `Ctrl+C` without re-authenticating)
- **Multi-file support** — current setup assumes one Excel; could extend to serve multiple files listed in `SP_FILES`
- **Production deployment guide** (systemd unit, nginx reverse proxy)
