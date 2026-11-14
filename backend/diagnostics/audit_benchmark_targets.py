"""
NASA SPHEREx Benchmark Targets Live IRSA Provenance Auditor
Run:
    python -m backend.diagnostics.audit_benchmark_targets
"""

from __future__ import annotations
import asyncio
from collections import Counter
from typing import Any, Dict

from backend.targets import TARGETS, propagate_proper_motion
from backend.services.irsa_client import parse_sia_csv_rows, query_irsa_sia_csv


async def audit_all_targets() -> Dict[str, Any]:
    print("=" * 74)
    print(" NASA SPHEREx BENCHMARK TARGETS — LIVE IRSA SIAv2 PROVENANCE AUDIT")
    print("=" * 74)
    results: Dict[str, Any] = {}

    for key, target in TARGETS.items():
        if "cached_cutout_query_center" in target:
            q_ra = target["cached_cutout_query_center"]["ra_deg"]
            q_dec = target["cached_cutout_query_center"]["dec_deg"]
        else:
            q_ra, q_dec, _ = propagate_proper_motion(
                target["ra"],
                target["dec"],
                target["pm_ra_arcsec_yr"],
                target["pm_dec_arcsec_yr"],
                target["epoch"],
                61000.0,
            )

        try:
            csv_text = await query_irsa_sia_csv(ra=q_ra, dec=q_dec, radius=0.05)
            rows = parse_sia_csv_rows(csv_text, target_ra=q_ra, target_dec=q_dec)
            det_counts = Counter(r["detector"] for r in rows)
            col_counts = Counter(r["collection"] for r in rows)
            mjds = [r["t_min_mjd"] for r in rows if r["t_min_mjd"] > 0]
            baseline = round(max(mjds) - min(mjds), 2) if len(mjds) >= 2 else 0.0

            results[key] = {
                "name": target["name"],
                "query_ra": q_ra,
                "query_dec": q_dec,
                "total_sia_frames": len(rows),
                "by_detector": dict(sorted(det_counts.items())),
                "by_collection": dict(col_counts),
                "baseline_days": baseline,
            }
            print(
                f"[PASS] {key:10s} | {target['name']:18s} | "
                f"RA={q_ra:10.6f}, Dec={q_dec:+10.6f} | "
                f"Frames={len(rows):3d} | Baseline={baseline:6.1f}d | Dets={dict(sorted(det_counts.items()))}"
            )
        except Exception as exc:
            results[key] = {"name": target["name"], "error": str(exc)}
            print(f"[FAIL] {key:10s} | {target['name']:18s} | Error: {exc}")

    print("=" * 74)
    return results


if __name__ == "__main__":
    asyncio.run(audit_all_targets())
