"""
Read-only PostgreSQL connection to the GSM-R Data Warehouse.

Uses the dedicated `optimrail_reader` account which only has SELECT rights
on the `gold` schema. This isolates OptimRail from any accidental writes
or access to bronze/silver layers.
"""
import os
from functools import lru_cache
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import QueuePool


@lru_cache(maxsize=1)
def get_gold_engine() -> Engine:
    """Return a singleton SQLAlchemy engine pointing at the gold schema."""
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    name = os.getenv("DB_NAME", "gsmr_dwh")
    user = os.getenv("DB_USER", "optimrail_reader")
    password = os.getenv("DB_PASSWORD", "")
    schema = os.getenv("DB_SCHEMA_GOLD", "gold")

    if not password:
        raise RuntimeError("DB_PASSWORD not set in backend/.env")

    url = f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{name}"

    engine = create_engine(
        url,
        future=True,
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        connect_args={"options": f"-csearch_path={schema},public"},
    )
    return engine


def healthcheck() -> dict:
    """Quick check that the DB is reachable and gold is accessible."""
    try:
        engine = get_gold_engine()
        with engine.connect() as conn:
            row = conn.execute(text("SELECT 1 AS ok")).fetchone()
            return {"ok": bool(row), "reachable": True}
    except Exception as exc:
        return {"ok": False, "reachable": False, "error": str(exc)}