"""
NASA SPHEREx Benchmark Targets Catalog & Astrometric Proper Motion Propagation
"""

from __future__ import annotations
import math
from typing import Dict, Any, Optional, Tuple

TARGETS: Dict[str, Dict[str, Any]] = {
    "barnard": {
        "name": "Barnard's Star",
        "category": "High Proper Motion Star",
        "test_case": "Proper Motion",
        "ra": 269.452077,
        "dec": 4.693365,
        "epoch": 2000.0,
        "pm_ra_arcsec_yr": -0.8015,
        "pm_dec_arcsec_yr": 10.3624,
        "pm_convention": "pm_ra_cosdec",
        "coordinate_source": "SIMBAD / Hipparcos / Gaia DR3 ICRS propagated to J2000.0 (GJ 699 / HIP 87937)",
        "proper_motion_source": "Gaia DR3 (pmra=-801.551 mas/yr, pmdec=+10362.394 mas/yr)",
        "aliases": [
            "barnard",
            "barnard's star",
            "barnards star",
            "gj 699",
            "hip 87937",
        ],
        "data_status": "verified_local_cache_subset",
        "recommended_detectors": [5, 6],
        "cached_cutout_query_center": {
            "ra_deg": 269.446294,
            "dec_deg": 4.767881,
            "propagated_to_mjd": 61000.0,
            "propagated_epoch_jyear": 2025.887748,
            "fov_deg": 0.1,
        },
        "provenance_audit": {
            "verification_status": "verified_local_cache_subset",
            "cached_fits_count": 30,
            "complete_sia_catalog_cached": False,
            "collections_verified_in_cache": {"spherex_dr1": 19, "spherex_qr3": 11},
            "by_detector_in_cache": {5: 16, 6: 14},
            "mjd_min": 60902.865381,
            "mjd_max": 61305.628658,
            "baseline_days": 402.76,
            "visit_groups_30d_in_cache": {"D5": 3, "D6": 4},
            "note": (
                "30 NASA/IPAC IRSA SPHEREx Level-2 FITS cutouts (Detectors 5 & 6) are cached "
                "and SHA-256 verified in backend/cache/. Detectors 1-4 and full SIA row counts "
                "require a live IRSA query."
            ),
        },
    },
    "eps_ind_b": {
        "name": "Epsilon Indi B",
        "category": "Binary Brown Dwarf System",
        "test_case": "Brown Dwarf Binary System",
        "ra": 331.044147,
        "dec": -56.782844,
        "epoch": 2000.0,
        "pm_ra_arcsec_yr": 3.9614,
        "pm_dec_arcsec_yr": -2.5383,
        "pm_convention": "pm_ra_cosdec",
        "coordinate_source": "SIMBAD / Scholz et al. (2003) ICRS J2000.0 (HD 209100 B)",
        "proper_motion_source": "Scholz et al. (2003, A&A, 398, L29) / Gaia DR3",
        "aliases": [
            "eps_ind_b",
            "epsilon indi b",
            "eps ind b",
            "hd 209100 b",
        ],
        "data_status": "unverified_offline",
        "recommended_detectors": [5, 6],
        "provenance_audit": {
            "verification_status": "unverified_offline",
            "cached_fits_count": 0,
            "complete_sia_catalog_cached": False,
            "note": (
                "No FITS cutouts or SIA query results are cached in this repository. "
                "Run backend/diagnostics/audit_benchmark_targets.py with live IRSA access to verify."
            ),
        },
    },
    "wise0855": {
        "name": "WISE 0855-0714",
        "category": "Fast-Moving Y-type Brown Dwarf (~250 K)",
        "test_case": "Fast-moving Brown Dwarf",
        "ra": 133.795129,
        "dec": -7.245147,
        "epoch": 2010.5,
        "pm_ra_arcsec_yr": -8.118,
        "pm_dec_arcsec_yr": 0.680,
        "pm_convention": "pm_ra_cosdec",
        "coordinate_source": "Luhman (2014, ApJ, 786, L18) WISE discovery epoch J2010.5 (08h55m10.831s -07d14m42.53s)",
        "proper_motion_source": "Luhman & Esplin (2016, AJ, 152, 78) / Kirkpatrick et al. (2021)",
        "aliases": [
            "wise0855",
            "wise 0855",
            "wise 0855-0714",
            "wise j085510.83-071442.5",
            "wise j0855-0714",
        ],
        "data_status": "unverified_offline",
        "recommended_detectors": [5, 6],
        "provenance_audit": {
            "verification_status": "unverified_offline",
            "cached_fits_count": 0,
            "complete_sia_catalog_cached": False,
            "historical_notebook_reference": {
                "source": "notebooks/NASA_backend_exploration.ipynb (Cells 8, 31, 36)",
                "collection_queried": "spherex_dr1",
                "total_sia_rows_reported": 263,
                "d5_d6_frames_reported": 94,
                "baseline_days_reported": 373.6,
                "verified_in_local_cache": False,
            },
            "note": (
                "Exploratory notebook recorded 263 spherex_dr1 SIA rows during an earlier session, "
                "but no FITS cutouts or SIA JSON files for WISE 0855-0714 are cached in backend/cache/."
            ),
        },
    },
    "rw_aur": {
        "name": "RW Aurigae",
        "category": "T Tauri Variable Star",
        "test_case": "Variable Star",
        "ra": 76.956526,
        "dec": 30.401438,
        "epoch": 2000.0,
        "pm_ra_arcsec_yr": 0.003,
        "pm_dec_arcsec_yr": -0.024,
        "pm_convention": "pm_ra_cosdec",
        "coordinate_source": "SIMBAD / Gaia DR3 ICRS J2000.0 (HD 240764)",
        "proper_motion_source": "Gaia DR3 (pmra=+3.34 mas/yr, pmdec=-24.16 mas/yr)",
        "aliases": [
            "rw_aur",
            "rw aurigae",
            "rw aur",
            "hd 240764",
        ],
        "data_status": "unverified_offline",
        "recommended_detectors": [1, 2, 3, 4, 5, 6],
        "provenance_audit": {
            "verification_status": "unverified_offline",
            "cached_fits_count": 0,
            "complete_sia_catalog_cached": False,
            "note": (
                "No FITS cutouts or SIA query results are cached in this repository. "
                "Previous static uniform counts ({1: 57, ..., 6: 57}) were removed as unverified."
            ),
        },
    },
    "r_dra": {
        "name": "R Draconis",
        "category": "Mira Cet Variable Star",
        "test_case": "Variable Star",
        "ra": 248.167611,
        "dec": 66.754979,
        "epoch": 2000.0,
        "pm_ra_arcsec_yr": -0.006,
        "pm_dec_arcsec_yr": -0.033,
        "pm_convention": "pm_ra_cosdec",
        "coordinate_source": "SIMBAD / Gaia DR3 ICRS J2000.0 (HD 150072)",
        "proper_motion_source": "Gaia DR3 (pmra=-5.92 mas/yr, pmdec=-33.14 mas/yr)",
        "aliases": [
            "r_dra",
            "r draconis",
            "r dra",
            "hd 150072",
        ],
        "data_status": "unverified_offline",
        "recommended_detectors": [1, 2, 3, 4, 5, 6],
        "provenance_audit": {
            "verification_status": "unverified_offline",
            "cached_fits_count": 0,
            "complete_sia_catalog_cached": False,
            "note": (
                "No FITS cutouts or SIA query results are cached in this repository. "
                "Run backend/diagnostics/audit_benchmark_targets.py with live IRSA access to verify."
            ),
        },
    },
}


def mjd_to_jyear(mjd: float) -> float:
    """Convert Modified Julian Date (MJD) to Julian Epoch year (J2000.0 = MJD 51544.5)."""
    return 2000.0 + (mjd - 51544.5) / 365.25


def propagate_proper_motion(
    ra_deg: float,
    dec_deg: float,
    pm_ra_arcsec_yr: float,
    pm_dec_arcsec_yr: float,
    epoch0_jyear: float = 2000.0,
    target_mjd: float = 61000.0,
) -> Tuple[float, float, float]:
    """
    Propagate astrometric coordinates (RA, Dec) from reference epoch `epoch0_jyear`
    to `target_mjd` using standard `pm_ra_cosdec` convention.
    Returns (propagated_ra_deg, propagated_dec_deg, target_jyear).
    """
    target_jyear = mjd_to_jyear(target_mjd)
    dt_yr = target_jyear - epoch0_jyear

    dec_rad = math.radians(dec_deg)
    cos_dec = max(1e-6, math.cos(dec_rad))

    delta_ra_deg = (pm_ra_arcsec_yr * dt_yr / 3600.0) / cos_dec
    delta_dec_deg = pm_dec_arcsec_yr * dt_yr / 3600.0

    new_ra = (ra_deg + delta_ra_deg) % 360.0
    new_dec = max(-90.0, min(90.0, dec_deg + delta_dec_deg))
    return round(new_ra, 6), round(new_dec, 6), round(target_jyear, 6)


def resolve_target_by_name(query: str) -> Optional[Dict[str, Any]]:
    """Resolve a target from TARGETS by key, name, or alias."""
    q = query.strip().lower()
    if not q:
        return None
    for key, t in TARGETS.items():
        if key == q or t["name"].lower() == q:
            return {"key": key, **t}
        for alias in t.get("aliases", []):
            if alias.lower() == q or q in alias.lower():
                return {"key": key, **t}
    return None
