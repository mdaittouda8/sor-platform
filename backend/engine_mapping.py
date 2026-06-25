"""
Table de référence IMSI → Engin (NID Engine + Motrice).

Source : table de référence ONCF — 22 engins × 2 IMSI = 44 entrées.

Cette table vit ici plutôt qu'en BDD pour 3 raisons :
  - Aucune modification de la couche gold ni du pipeline
  - Versionnée avec le code (traçabilité Git)
  - Modification = édition du fichier + redémarrage backend (rapide)

Pour ajouter / corriger un engin : édite IMSI_TO_ENGINE ci-dessous
puis redémarre uvicorn.
"""
from typing import Optional

# ============================================================================
# Mapping IMSI → "<NID> <Motrice>"
# Les IMSI sont des BIGINT (15 chiffres) — pas des strings.
# ============================================================================
IMSI_TO_ENGINE: dict[int, str] = {
    # 1201
    604070051701040: "1201 M1",
    604070051701041: "1201 M1",
    604070051701012: "1201 M2",
    604070051701013: "1201 M2",
    # 1202
    604070051701026: "1202 M1",
    604070051701027: "1202 M1",
    604070051701014: "1202 M2",
    604070051701015: "1202 M2",
    # 1204
    604070051701036: "1204 M1",
    604070051701037: "1204 M1",
    604070051701018: "1204 M2",
    604070051701019: "1204 M2",
    # 1205
    604070051706217: "1205 M1",
    604070051706218: "1205 M1",
    604070051701067: "1205 M2",
    604070051701069: "1205 M2",
    # 1206
    604070051701038: "1206 M1",
    604070051701039: "1206 M1",
    604070051701024: "1206 M2",
    604070051701025: "1206 M2",
    # 1207
    604070051701044: "1207 M1",
    604070051701045: "1207 M1",
    604070051701030: "1207 M2",
    604070051701031: "1207 M2",
    # 1208
    604070051701020: "1208 M1",
    604070051701021: "1208 M1",
    604070051701028: "1208 M2",
    604070051701029: "1208 M2",
    # 1209
    604070051701022: "1209 M1",
    604070051701023: "1209 M1",
    604070051701016: "1209 M2",
    604070051701017: "1209 M2",
    # 1210
    604070051701034: "1210 M1",
    604070051701035: "1210 M1",
    604070051701004: "1210 M2",
    604070051701056: "1210 M2",
    # 1211
    604070051706194: "1211 M1",
    604070051706195: "1211 M1",
    604070111600122: "1211 M2",
    604070111600123: "1211 M2",
    # 1212
    604070051706198: "1212 M1",
    604070051706206: "1212 M1",
    604070051701006: "1212 M2",
    604070051701007: "1212 M2",
}


# ============================================================================
# Reverse lookup : engine_label → list[imsi]
# Construit une seule fois au chargement du module (perf optimale).
# ============================================================================
def _build_reverse() -> dict[str, list[int]]:
    rev: dict[str, list[int]] = {}
    for imsi, label in IMSI_TO_ENGINE.items():
        rev.setdefault(label, []).append(imsi)
    return rev


ENGINE_TO_IMSIS: dict[str, list[int]] = _build_reverse()


# ============================================================================
# Public helpers
# ============================================================================
def get_engine_label(imsi: Optional[int]) -> Optional[str]:
    """Returns 'XXXX MX' or None if the IMSI isn't in the table."""
    if imsi is None:
        return None
    return IMSI_TO_ENGINE.get(int(imsi))


def get_imsis_for_engine(engine_label: str) -> list[int]:
    """Returns the list of IMSI for a given engine label (empty if unknown)."""
    return ENGINE_TO_IMSIS.get(engine_label, [])


def list_known_engines() -> list[str]:
    """Returns the sorted list of known engine labels."""
    return sorted(ENGINE_TO_IMSIS.keys())