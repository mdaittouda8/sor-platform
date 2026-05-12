import * as XLSX from 'xlsx';

// Column names matching the ONCF SharePoint Excel structure
const COL_DATE = 'Date';
const COL_RAME = 'Rame';
const COL_CAB = 'Motrice / Cab';
const COL_INTERVALLE = 'Intervalle';
const COL_EVENT = 'Evénement '; // trailing space intentional — present in source
const COL_SUBSYSTEM = 'Sous Système mis en cause';
const COL_KM = 'Km';

// Candidate filenames tried (in order) when loading from the public/ folder via fetch
export const EXCEL_CANDIDATE_FILES = [
  'ertms.xlsx',
  'Suivi_des_déconnexions_ERTMS_et_actions_correctives.xlsx',
  'data.xlsx',
];

// Subsystem normalization — merges casing/accent variants into a canonical label.
export function normalizeSubsystem(raw) {
  if (!raw) return 'A définir';
  const up = String(raw).trim().toUpperCase();
  const merge = {
    BORD: 'BORD',
    'BORD/GSMR': 'BORD/GSMR',
    'GSMR/BORD': 'BORD/GSMR',
    'GSMR / BORD': 'BORD/GSMR',
    GSMR: 'GSMR',
    RBC: 'RBC',
    'RBC/BORD': 'RBC/BORD',
    'BORD/RBC': 'RBC/BORD',
    'GSMR/RBC': 'GSMR/RBC',
    'NON SPECIFIE': 'A définir',
    NA: 'A définir',
    'A DÉFINIR': 'A définir',
    SIGNALISATION: 'Signalisation',
  };
  return merge[up] || String(raw).trim();
}

// Convert an Excel serial date or ISO string to YYYY-MM-DD
export function toISODate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number') {
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${dd}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d)) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${dd}`;
  }
  return null;
}

// Parse an .xlsx ArrayBuffer into our compact record shape { d, r, c, i, e, s, k }
export function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames.includes('Data') ? 'Data' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });

  const out = [];
  for (const r of rows) {
    const dateIso = toISODate(r[COL_DATE]);
    if (!dateIso) continue;

    let rame = r[COL_RAME];
    if (rame != null) rame = String(rame).trim();

    let km = r[COL_KM];
    if (km != null && km !== '') {
      const n = typeof km === 'number' ? km : parseFloat(String(km).replace(',', '.').trim());
      km = isFinite(n) ? n : null;
    } else {
      km = null;
    }

    out.push({
      d: dateIso,
      r: rame,
      c: r[COL_CAB],
      i: r[COL_INTERVALLE],
      e: (r[COL_EVENT] || '').toString().trim(),
      s: normalizeSubsystem(r[COL_SUBSYSTEM]),
      k: km,
    });
  }
  out.sort((a, b) => a.d.localeCompare(b.d));
  return out;
}

// Try fetching the Excel file from the FastAPI backend first, then fall back to public/.
// Returns { data, filename, source } or null.
//   source: 'backend' → came from /api/ertms.xlsx (SharePoint-backed)
//   source: 'folder'  → came from public/ (static fallback, dev-only)
export async function tryLoadFromFolder() {
  // 1. Backend API — this is the production path
  try {
    const res = await fetch('/api/ertms.xlsx', { cache: 'no-store' });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return { data: parseWorkbook(buf), filename: 'ertms.xlsx', source: 'backend' };
    }
    // If the backend replied with 503 (SharePoint error), don't silently fall back —
    // the user needs to know. Surface the error up so the dashboard can show a banner.
    if (res.status === 503) {
      const err = await res.json().catch(() => ({}));
      throw new BackendError(err?.detail?.message || 'SharePoint indisponible', res.status);
    }
    // Any other non-OK status: fall through to the static fallback
  } catch (e) {
    if (e instanceof BackendError) throw e;
    // Network error (backend down) — silently try the public/ fallback below
  }

  // 2. Static public/ folder — dev fallback when backend isn't running
  for (const name of EXCEL_CANDIDATE_FILES) {
    try {
      const res = await fetch('/' + encodeURIComponent(name), { cache: 'no-store' });
      if (!res.ok) continue;
      // Guard against Vite dev server returning index.html for missing files
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('text/html')) continue;
      const buf = await res.arrayBuffer();
      return { data: parseWorkbook(buf), filename: name, source: 'folder' };
    } catch (e) {
      // Try next candidate
    }
  }
  return null;
}

// Force the backend to re-download the file from SharePoint, then return parsed rows.
// Throws BackendError on any failure — the UI shows the message.
export async function refreshFromSharePoint() {
  let refreshRes;
  try {
    refreshRes = await fetch('/api/refresh', { method: 'POST' });
  } catch (e) {
    throw new BackendError(
      "Impossible de contacter le backend (est-il démarré ? `python main.py` dans backend/)",
      0
    );
  }

  if (!refreshRes.ok) {
    const err = await refreshRes.json().catch(() => ({}));
    throw new BackendError(
      err?.detail?.message || `Échec du rafraîchissement (HTTP ${refreshRes.status})`,
      refreshRes.status
    );
  }

  const meta = await refreshRes.json(); // { ok, size_bytes, last_updated, source }

  // Now re-fetch the freshly cached file and parse it
  const fileRes = await fetch('/api/ertms.xlsx', { cache: 'no-store' });
  if (!fileRes.ok) {
    throw new BackendError(
      `Fichier indisponible après rafraîchissement (HTTP ${fileRes.status})`,
      fileRes.status
    );
  }
  const buf = await fileRes.arrayBuffer();
  return {
    data: parseWorkbook(buf),
    lastUpdated: meta.last_updated,
    sizeBytes: meta.size_bytes,
  };
}

// Fetch backend cache status without triggering a download. Used to show "last updated" on load.
// Returns { cache_exists, last_updated, size_bytes } or null if backend unreachable.
export async function getBackendStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Custom error class so the UI can distinguish backend failures from parse failures
export class BackendError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
  }
}
