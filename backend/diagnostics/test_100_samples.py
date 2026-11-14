"""
End-to-End Live HTTP Verification Suite on http://localhost:8080
Tests all 100 real NASA/IPAC IRSA SPHEREx samples (`GET /api/samples`) plus out-of-sample
live IRSA SPLICES and SIMBAD coordinates against `GET /api/astro/reverse` and `GET /api/astro/resolve`.
"""

from __future__ import annotations
import asyncio
import json
from pathlib import Path
from typing import Any, Dict, List
import httpx

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
REPORT_PATH = ROOT_DIR / "backend" / "data" / "test_100_samples_report.json"
BASE_URL = "http://localhost:8080"


async def run_live_http_verification() -> Dict[str, Any]:
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=15.0) as client:
        health = (await client.get("/api/health")).json()
        samples_resp = (await client.get("/api/samples")).json()
        samples: List[Dict[str, Any]] = samples_resp["samples"]

        print("=" * 90)
        print(f" LIVE HTTP E2E VERIFICATION ON {BASE_URL} ({len(samples)} REAL IRSA SPHEREx SAMPLES)")
        print(f" Backend: {health['backend']} | Python {health['python_version']} | Astropy {health['astropy_version']}")
        print("=" * 90)

        exact_6dec_passed = 0
        rounded_4dec_passed = 0
        name_resolve_passed = 0
        consistency_passed = 0
        failures: List[Dict[str, Any]] = []
        sample_results: List[Dict[str, Any]] = []

        for s in samples:
            idx = s["sample_index"]
            expected_id = s["id"]
            expected_name = s["name"]
            ra6 = float(s["ra"])
            dec6 = float(s["dec"])
            ra4 = round(ra6, 4)
            dec4 = round(dec6, 4)

            r6 = (await client.get("/api/astro/reverse", params={"ra": ra6, "dec": dec6})).json()
            r4 = (await client.get("/api/astro/reverse", params={"ra": ra4, "dec": dec4})).json()
            rn = (await client.get("/api/astro/resolve", params={"q": s["designation"]})).json()

            obj6 = r6.get("object") or {}
            obj4 = r4.get("object") or {}
            objn = rn.get("object") or {}

            ok_6 = bool(r6.get("found")) and obj6.get("id") == expected_id
            ok_4 = bool(r4.get("found")) and obj4.get("id") == expected_id
            ok_n = bool(rn.get("found")) and objn.get("id") == expected_id
            ok_c = (
                ok_6
                and ok_n
                and obj6.get("id") == objn.get("id")
                and obj6.get("name") == objn.get("name")
                and obj6.get("ra") == objn.get("ra")
                and obj6.get("dec") == objn.get("dec")
            )

            if ok_6:
                exact_6dec_passed += 1
            if ok_4:
                rounded_4dec_passed += 1
            if ok_n:
                name_resolve_passed += 1
            if ok_c:
                consistency_passed += 1

            status_str = "PASS" if (ok_6 and ok_4 and ok_n and ok_c) else "FAIL"
            if status_str == "FAIL":
                failures.append(
                    {
                        "sample_index": idx,
                        "expected_id": expected_id,
                        "got_6dec": obj6.get("id"),
                        "got_4dec": obj4.get("id"),
                        "got_name": objn.get("id"),
                    }
                )

            sample_results.append(
                {
                    "sample_index": idx,
                    "id": expected_id,
                    "name": expected_name,
                    "designation": s["designation"],
                    "stype_ml": s.get("stype_ml"),
                    "field": s.get("field"),
                    "ra": ra6,
                    "dec": dec6,
                    "coord_search_6dec_ok": ok_6,
                    "coord_search_4dec_ok": ok_4,
                    "name_search_ok": ok_n,
                    "coord_vs_name_identical": ok_c,
                    "status": status_str,
                }
            )

        # Also test out-of-sample live queries (IRSA Gator SPLICES + SIMBAD TAP)
        extra_tests = [
            ("Out-of-sample IRSA SPLICES (Centaurus C-AGB)", 221.896217, -58.346031),
            ("Out-of-sample SIMBAD (Proxima Centauri)", 217.428942, -62.679489),
            ("Out-of-sample SIMBAD (HD 209458 / Osiris)", 330.794886, 18.884319),
            ("Out-of-sample SIMBAD (51 Pegasi)", 344.366583, 20.768833),
        ]
        extra_results = []
        for label, era, edec in extra_tests:
            er = (await client.get("/api/astro/reverse", params={"ra": era, "dec": edec})).json()
            eobj = er.get("object") or {}
            extra_results.append(
                {
                    "label": label,
                    "ra": era,
                    "dec": edec,
                    "found": bool(er.get("found")),
                    "resolved_name": eobj.get("name"),
                    "category": eobj.get("categoryLabel"),
                }
            )

        print(f" -> Coordinate Search (6-dec exact):   {exact_6dec_passed}/{len(samples)} PASS")
        print(f" -> Coordinate Search (4-dec rounded): {rounded_4dec_passed}/{len(samples)} PASS")
        print(f" -> Name / Designation Search:         {name_resolve_passed}/{len(samples)} PASS")
        print(f" -> Coord vs Name 100% Consistency:    {consistency_passed}/{len(samples)} PASS")
        print("-" * 90)
        for ex in extra_results:
            print(f" [LIVE EXTRA] {ex['label']:45s} -> {ex['resolved_name']} ({ex['category']})")
        print("=" * 90)

        report = {
            "total_samples": len(samples),
            "source_archive": "https://irsa.ipac.caltech.edu/Missions/spherex.html",
            "coord_search_6dec_passed": exact_6dec_passed,
            "coord_search_4dec_passed": rounded_4dec_passed,
            "name_search_passed": name_resolve_passed,
            "coord_vs_name_consistency_passed": consistency_passed,
            "all_passed": len(failures) == 0,
            "extra_live_checks": extra_results,
            "failures": failures,
            "results": sample_results,
        }
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return report


if __name__ == "__main__":
    asyncio.run(run_live_http_verification())
