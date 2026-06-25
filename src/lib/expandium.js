/**
 * Expandium API client.
 *
 * All calls go through the Vite dev proxy /api -> http://localhost:8000.
 * In production, the proxy will be replaced by a reverse-proxy.
 */

const BASE = "/api/expandium";

/**
 * Fetch the 5 KPIs + top intervals for the given period.
 * If dateFrom/dateTo are omitted, the backend defaults to last 7 days.
 */
export async function fetchKpis({ dateFrom, dateTo } = {}) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const res = await fetch(`${BASE}/kpis${qs}`);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

/**
 * Trigger a background refresh of the Expandium pipeline.
 * Returns immediately with { ok: true, job_id, status }.
 * Throws { status: 409 } if another refresh is already running.
 */
export async function triggerRefresh() {
  const res = await fetch(`${BASE}/refresh`, { method: "POST" });
  if (!res.ok) {
    const err = new Error(`Refresh failed: ${res.status}`);
    err.status = res.status;
    try {
      err.body = await res.json();
    } catch {
      /* ignore */
    }
    throw err;
  }
  return res.json();
}

/**
 * Poll the status of a refresh job. Returns null on 404.
 */
export async function fetchJobStatus(jobId) {
  const res = await fetch(`${BASE}/refresh/status?job_id=${encodeURIComponent(jobId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return res.json();
}

/**
 * Get the currently-running refresh job (if any), without a known job_id.
 * Useful at mount time to detect a job started by another tab.
 */
export async function fetchRunningJob() {
  const res = await fetch(`${BASE}/refresh/status`);
  if (!res.ok) throw new Error(`Running job check failed: ${res.status}`);
  const body = await res.json();
  return body.running || null;
}

/**
 * Quick health check that the backend can reach the gold DB.
 */
export async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) return { ok: false };
    return res.json();
  } catch {
    return { ok: false };
  }
}