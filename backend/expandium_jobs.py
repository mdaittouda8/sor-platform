"""
Async refresh jobs for the Expandium pipeline.

Launches the scheduler.py script in a background thread. The frontend polls
/api/expandium/refresh/status to track progress.

Note: jobs are stored in an in-memory dict. If the backend restarts during
a job, the state is lost but the underlying script keeps running. Acceptable
for an internal single-server usage. For multi-server, move to a DB table.
"""
import os
import subprocess
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional


_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()

_running_job_id: Optional[str] = None
_running_lock = threading.Lock()


def _get_pipeline_script() -> Path:
    raw = os.getenv("PIPELINE_SCRIPT_PATH", "")
    if not raw:
        raise RuntimeError(
            "PIPELINE_SCRIPT_PATH not set in environment. Add it to backend/.env"
        )
    path = Path(raw)
    if not path.exists():
        raise RuntimeError(f"Pipeline script not found at {path}")
    return path


def _get_python_executable() -> str:
    custom = os.getenv("PIPELINE_PYTHON", "")
    if custom and Path(custom).exists():
        return custom
    return "python"


def _run_pipeline_in_background(job_id: str) -> None:
    global _running_job_id
    try:
        script = _get_pipeline_script()
        python_exe = _get_python_executable()
    except Exception as exc:
        with _jobs_lock:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["finished_at"] = datetime.now().isoformat()
            _jobs[job_id]["error"] = f"{type(exc).__name__}: {exc}"
        with _running_lock:
            _running_job_id = None
        return

    with _jobs_lock:
        _jobs[job_id]["status"] = "running"
        _jobs[job_id]["started_at"] = datetime.now().isoformat()

    try:
        # Build a clean environment for the subprocess. We force UTF-8 everywhere
        # because Python 3.14 on Windows defaults to CP1252 for stdout/stderr in
        # subprocesses, which crashes the moment any non-ASCII character (✅, →,
        # accented log message) is logged. PYTHONIOENCODING fixes that.
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"  # Python 3.7+ : force UTF-8 mode globally

        result = subprocess.run(
            [python_exe, str(script)],
            cwd=str(script.parent),
            timeout=3600,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
        )

        # ─── DEBUG TEMPORAIRE : afficher la sortie complète du subprocess ───
        # À retirer une fois le diagnostic terminé.
        print("=" * 70)
        print(f"[refresh job {job_id}]")
        print(f"  exit_code: {result.returncode}")
        print(f"  STDOUT (last 3000 chars):")
        print(result.stdout[-3000:] if result.stdout else "(empty)")
        print(f"  STDERR (last 3000 chars):")
        print(result.stderr[-3000:] if result.stderr else "(empty)")
        print("=" * 70)
        # ─── FIN DEBUG ───

        with _jobs_lock:
            _jobs[job_id]["finished_at"] = datetime.now().isoformat()
            if result.returncode == 0:
                _jobs[job_id]["status"] = "success"
                _jobs[job_id]["stdout_tail"] = (result.stdout or "")[-2000:]
            else:
                _jobs[job_id]["status"] = "failed"
                _jobs[job_id]["exit_code"] = result.returncode
                # ENRICHI : on garde aussi stdout en cas d'échec (utile pour debug)
                _jobs[job_id]["stdout_tail"] = (result.stdout or "")[-2000:]
                _jobs[job_id]["stderr_tail"] = (result.stderr or "")[-2000:]
    except subprocess.TimeoutExpired:
        with _jobs_lock:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["finished_at"] = datetime.now().isoformat()
            _jobs[job_id]["error"] = "timeout (>1h)"
    except Exception as exc:
        with _jobs_lock:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["finished_at"] = datetime.now().isoformat()
            _jobs[job_id]["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        with _running_lock:
            if _running_job_id == job_id:
                _running_job_id = None


def start_refresh_job() -> dict:
    """Start a new refresh job in the background. Refuses if one is already running."""
    global _running_job_id

    with _running_lock:
        if _running_job_id is not None:
            return {
                "ok": False,
                "error": "another_job_running",
                "running_job_id": _running_job_id,
            }
        job_id = f"refresh_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        _running_job_id = job_id

    with _jobs_lock:
        _jobs[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "created_at": datetime.now().isoformat(),
            "started_at": None,
            "finished_at": None,
        }

    thread = threading.Thread(
        target=_run_pipeline_in_background,
        args=(job_id,),
        daemon=True,
    )
    thread.start()

    return {"ok": True, "job_id": job_id, "status": "queued"}


def get_job_status(job_id: str) -> Optional[dict]:
    with _jobs_lock:
        return dict(_jobs[job_id]) if job_id in _jobs else None


def get_running_job() -> Optional[dict]:
    with _running_lock:
        rj = _running_job_id
    if not rj:
        return None
    return get_job_status(rj)