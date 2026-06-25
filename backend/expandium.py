"""
SQL queries for Expandium KPIs, computed from the gold layer.

All queries read from `gold.fact_*` views via the optimrail_reader account.
Date filtering is applied on `start_time`.
"""
from datetime import date, datetime, timedelta
from typing import Optional
from sqlalchemy import text, bindparam
from db import get_gold_engine
from engine_mapping import get_imsis_for_engine, list_known_engines


def _parse_date(d: Optional[str], default: date) -> date:
    if not d:
        return default
    try:
        return datetime.strptime(d, "%Y-%m-%d").date()
    except ValueError:
        return default


def _date_range(date_from: Optional[str], date_to: Optional[str]) -> tuple[date, date]:
    """Default to last 7 days, ending today."""
    today = date.today()
    if not date_from and not date_to:
        return (today - timedelta(days=7), today + timedelta(days=1))
    df = _parse_date(date_from, today - timedelta(days=7))
    dt = _parse_date(date_to, today) + timedelta(days=1)  # inclusive end
    return (df, dt)


# ============================================================================
# KPI 1 — Nombre d'appels ETCS
# ============================================================================
def kpi_etcs_calls(df: date, dt: date) -> dict:
    sql = text("""
        SELECT COUNT(*) AS nb
        FROM gold.fact_etcs_call
        WHERE start_time >= :df AND start_time < :dt
    """)
    with get_gold_engine().connect() as conn:
        row = conn.execute(sql, {"df": df, "dt": dt}).fetchone()
    return {"value": int(row.nb or 0)}


# ============================================================================
# KPI 2 — Taux de succès des handovers (%)
# ============================================================================
def kpi_ho_success_rate(df: date, dt: date) -> dict:
    """
    ⚠️ PLACEHOLDER FILTER — TO VERIFY AND ADJUST
    --------------------------------------------------------------
    Le filtre `handover_end_event ILIKE '%success%'` est UNE SUPPOSITION.
    Tu DOIS vérifier les valeurs réelles dans ta BDD avec :

        SELECT DISTINCT handover_end_event, COUNT(*) AS nb
        FROM gold.fact_handover
        GROUP BY handover_end_event
        ORDER BY nb DESC;

    Puis ajuster le ILIKE ci-dessous pour matcher tes vraies valeurs.
    Exemples :
      - Si la valeur succès est 'Normal Release'   → '%normal%release%'
      - Si plusieurs sont des succès (Normal, OK)  → ('Normal Release', 'OK') avec IN
      - Si tu préfères filtrer les ÉCHECS          → inverser la logique
    --------------------------------------------------------------
    """
    sql = text("""
        SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (
            WHERE handover_end_event IN ('HO Complete', 'HO Performed')
        ) AS successful
        FROM gold.fact_handover
        WHERE start_time >= :df
        AND start_time < :dt;
    """)
    with get_gold_engine().connect() as conn:
        row = conn.execute(sql, {"df": df, "dt": dt}).fetchone()

    total = int(row.total or 0)
    successful = int(row.successful or 0)
    rate = round(100.0 * successful / total, 2) if total > 0 else None
    return {"value": rate, "total": total, "successful": successful}


# ============================================================================
# KPI 3 — Durée moyenne de handover (ms)
# ============================================================================
def kpi_ho_avg_duration(df: date, dt: date) -> dict:
    sql = text("""
        SELECT
            ROUND(AVG(handover_duration_ms))::INTEGER AS avg_ms,
            COUNT(*) FILTER (WHERE handover_duration_ms IS NOT NULL) AS samples
        FROM gold.fact_handover
        WHERE start_time >= :df AND start_time < :dt
    """)
    with get_gold_engine().connect() as conn:
        row = conn.execute(sql, {"df": df, "dt": dt}).fetchone()
    return {
        "value": int(row.avg_ms) if row.avg_ms is not None else None,
        "samples": int(row.samples or 0),
    }


# ============================================================================
# KPI 4 — Erreurs HDLC
# ============================================================================
def kpi_hdlc_errors(df: date, dt: date) -> dict:
    sql = text("""
        SELECT COUNT(*) AS nb
        FROM gold.fact_frame_error
        WHERE start_time >= :df AND start_time < :dt
    """)
    with get_gold_engine().connect() as conn:
        row = conn.execute(sql, {"df": df, "dt": dt}).fetchone()
    return {"value": int(row.nb or 0)}


# ============================================================================
# KPI 5 — Transactions
# ============================================================================
def kpi_transactions(df: date, dt: date) -> dict:
    sql = text("""
        SELECT COUNT(*) AS nb
        FROM gold.fact_transaction
        WHERE start_time >= :df AND start_time < :dt
    """)
    with get_gold_engine().connect() as conn:
        row = conn.execute(sql, {"df": df, "dt": dt}).fetchone()
    return {"value": int(row.nb or 0)}


# ============================================================================
# Top intervalles par nombre de handovers (intra-couche uniquement)
# ============================================================================
def top_intervals_handovers(df: date, dt: date, limit: int = 10) -> list[dict]:
    """
    Group handovers by intra-layer pairs (both Couche 2 OR both Couche 3)
    and return the intervals with the most handovers, formatted as GSMR_XX/YY.
    Inter-layer handovers (e.g. source_ci=215, target_ci=315) are excluded.
    """
    sql = text("""
        WITH ho_mapped AS (
            SELECT
                CASE
                    WHEN source_ci BETWEEN 201 AND 233 THEN source_ci - 200
                    WHEN source_ci BETWEEN 301 AND 333 THEN source_ci - 300
                END AS src_site,
                CASE
                    WHEN target_ci BETWEEN 201 AND 233 THEN target_ci - 200
                    WHEN target_ci BETWEEN 301 AND 333 THEN target_ci - 300
                END AS tgt_site,
                CASE
                    WHEN source_ci BETWEEN 201 AND 233 AND target_ci BETWEEN 201 AND 233 THEN 'C2'
                    WHEN source_ci BETWEEN 301 AND 333 AND target_ci BETWEEN 301 AND 333 THEN 'C3'
                    ELSE 'MIXED'
                END AS layer
            FROM gold.fact_handover
            WHERE start_time >= :df AND start_time < :dt
              AND source_ci IS NOT NULL
              AND target_ci IS NOT NULL
        )
        SELECT
            CONCAT(
                'GSMR_', LPAD(LEAST(src_site, tgt_site)::TEXT, 2, '0'),
                '/',     LPAD(GREATEST(src_site, tgt_site)::TEXT, 2, '0')
            ) AS interval_label,
            layer,
            COUNT(*) AS nb_handovers
        FROM ho_mapped
        WHERE layer IN ('C2', 'C3')
          AND src_site IS NOT NULL
          AND tgt_site IS NOT NULL
          AND src_site != tgt_site
        GROUP BY interval_label, layer
        ORDER BY nb_handovers DESC
        LIMIT :lim
    """)
    with get_gold_engine().connect() as conn:
        rows = conn.execute(sql, {"df": df, "dt": dt, "lim": limit}).fetchall()
    return [
        {"interval": r.interval_label, "layer": r.layer, "count": int(r.nb_handovers)}
        for r in rows
    ]



# ============================================================================
# KPI Engin — Évolution journalière des handovers par cause
# pour un engin spécifique (ex: 1205 M2)
# ============================================================================
def engine_handover_causes(engine_label: str, df: date, dt: date) -> dict:
    """
    Pour un engin donné (ex: '1205 M2'), compte par jour :
      - Better cell handovers
      - Downlink quality handovers

    Robuste : si un engin n'a qu'un seul type de cause sur la période,
    l'autre série est remplie de zéros.
    """
    # Constantes locales — les valeurs EXACTES en BDD (sensibles à la casse)
    BETTER_CELL = "Better cell"
    DOWNLINK_QUALITY = "Downlink quality"

    # 1) Résoudre les IMSI de l'engin via le mapping Python
    imsis = get_imsis_for_engine(engine_label)
    if not imsis:
        return {
            "engine_label": engine_label,
            "days": [],
            "better_cell": [],
            "downlink_quality": [],
            "total_better_cell": 0,
            "total_downlink_quality": 0,
            "error": f"Engin inconnu : {engine_label}",
        }

    # 2) Requête SQL : on passe la liste d'IMSI en paramètre
    sql = text("""
        SELECT
            DATE(start_time) AS day,
            handover_cause,
            COUNT(*) AS nb
        FROM gold.fact_handover
        WHERE imsi IN :imsis
          AND start_time >= :df
          AND start_time < :dt
          AND handover_cause IN ('Better cell', 'Downlink quality')
        GROUP BY DATE(start_time), handover_cause
        ORDER BY day
    """).bindparams(bindparam("imsis", expanding=True))

    with get_gold_engine().connect() as conn:
        rows = conn.execute(sql, {
            "imsis": imsis,
            "df": df,
            "dt": dt,
        }).fetchall()

    # 3) Restructuration robuste : on utilise .get() avec une valeur par défaut
    #    plutôt que d'accéder directement aux clés (qui pourraient ne pas exister).
    #
    # Étape 3a : collecter tous les jours rencontrés
    days_set = set()
    by_day_cause: dict[tuple[str, str], int] = {}
    for row in rows:
        day_str = row.day.isoformat()
        days_set.add(day_str)
        # Clé composite (jour, cause) → comptage
        by_day_cause[(day_str, row.handover_cause)] = int(row.nb)

    # Étape 3b : produire les listes en utilisant .get() — pas de KeyError possible
    sorted_days = sorted(days_set)
    better_cell_series = [by_day_cause.get((d, BETTER_CELL), 0) for d in sorted_days]
    downlink_quality_series = [by_day_cause.get((d, DOWNLINK_QUALITY), 0) for d in sorted_days]

    return {
        "engine_label": engine_label,
        "days": sorted_days,
        "better_cell": better_cell_series,
        "downlink_quality": downlink_quality_series,
        "total_better_cell": sum(better_cell_series),
        "total_downlink_quality": sum(downlink_quality_series),
    }

# ============================================================================
# Aggregate endpoint payload
# ============================================================================
def get_all_kpis(date_from_str: Optional[str], date_to_str: Optional[str]) -> dict:
    df, dt = _date_range(date_from_str, date_to_str)
    return {
        "date_from": df.isoformat(),
        "date_to": (dt - timedelta(days=1)).isoformat(),
        "kpis": {
            "etcs_calls": kpi_etcs_calls(df, dt),
            "ho_success_rate": kpi_ho_success_rate(df, dt),
            "ho_avg_duration_ms": kpi_ho_avg_duration(df, dt),
            "hdlc_errors": kpi_hdlc_errors(df, dt),
            "transactions": kpi_transactions(df, dt),
        },
        "top_intervals": top_intervals_handovers(df, dt, limit=10),
    }