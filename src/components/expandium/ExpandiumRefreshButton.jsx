import React, { useCallback, useEffect, useRef, useState } from "react";
import { triggerRefresh, fetchJobStatus, fetchRunningJob } from "../../lib/expandium";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 1200; // ~1h max

/**
 * Refresh button with background polling.
 * Calls `onSuccess` when a job ends successfully so the parent can reload KPIs.
 */
export default function ExpandiumRefreshButton({ onSuccess }) {
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | queued | running | success | failed
  const [errorMsg, setErrorMsg] = useState(null);
  const pollCountRef = useRef(0);

  // On mount, check if a job is already running (from another tab maybe)
  useEffect(() => {
    let cancelled = false;
    fetchRunningJob()
      .then((running) => {
        if (cancelled || !running) return;
        setJobId(running.job_id);
        setStatus(running.status || "running");
      })
      .catch(() => {
        /* ignore — backend might be down */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Polling effect: as long as we have a job in queued/running state
  useEffect(() => {
    if (!jobId || (status !== "queued" && status !== "running")) return;

    let stopped = false;
    pollCountRef.current = 0;

    const tick = async () => {
      if (stopped) return;
      pollCountRef.current += 1;
      if (pollCountRef.current > MAX_POLLS) {
        setStatus("failed");
        setErrorMsg("Délai d'attente dépassé (>1h)");
        return;
      }
      try {
        const job = await fetchJobStatus(jobId);
        if (stopped) return;
        if (!job) {
          setStatus("failed");
          setErrorMsg("Job introuvable");
          return;
        }
        setStatus(job.status);
        if (job.status === "success") {
          if (onSuccess) onSuccess(job);
          return;
        }
        if (job.status === "failed") {
          setErrorMsg(job.error || job.stderr_tail || "Échec du pipeline");
          return;
        }
        // Still running, schedule next poll
        setTimeout(tick, POLL_INTERVAL_MS);
      } catch {
        if (stopped) return;
        // Network glitch — retry once
        setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
    };
  }, [jobId, status, onSuccess]);

  const handleClick = useCallback(async () => {
    setErrorMsg(null);
    try {
      const result = await triggerRefresh();
      setJobId(result.job_id);
      setStatus(result.status || "queued");
    } catch (err) {
      if (err.status === 409 && err.body?.running_job_id) {
        // Another job already running — pick it up
        setJobId(err.body.running_job_id);
        setStatus("running");
      } else {
        setStatus("failed");
        setErrorMsg(err.message || "Erreur de lancement");
      }
    }
  }, []);

  const isBusy = status === "queued" || status === "running";
  const label =
    status === "queued"
      ? "En file d'attente…"
      : status === "running"
      ? "Synchronisation en cours…"
      : status === "success"
      ? "Synchronisé"
      : "Synchroniser Expandium";

  return (
    <div className="exp-refresh-wrapper">
      <button
        type="button"
        className={`exp-refresh-btn ${isBusy ? "is-busy" : ""} ${
          status === "failed" ? "is-failed" : ""
        }`}
        onClick={handleClick}
        disabled={isBusy}
        title={
          isBusy
            ? "Un refresh est déjà en cours, merci de patienter."
            : "Lance le pipeline ETL Expandium en arrière-plan (peut prendre plusieurs minutes)"
        }
      >
        {isBusy && <span className="exp-spinner" aria-hidden="true" />}
        <span>{label}</span>
      </button>
      {status === "failed" && errorMsg && (
        <div className="exp-refresh-error" title={errorMsg}>
          ⚠ {errorMsg.length > 60 ? errorMsg.slice(0, 60) + "…" : errorMsg}
        </div>
      )}
    </div>
  );
}