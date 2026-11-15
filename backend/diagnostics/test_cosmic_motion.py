"""Verification suite for P0 Feature #3: Cosmic Motion Animation."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.main import app  # noqa: E402
from backend.targets import TARGETS  # noqa: E402


def check_balanced_delimiters(js_path: Path) -> None:
    """Rough lexical check for balanced (), [], {} outside strings and comments."""
    src = js_path.read_text(encoding="utf-8")
    stack = []
    pairs = {"(": ")", "[": "]", "{": "}"}
    closing = {")": "(", "]": "[", "}": "{"}
    i = 0
    n = len(src)
    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if ch == "/" and nxt == "/":
            nl = src.find("\n", i)
            i = n if nl == -1 else nl + 1
            continue
        if ch == "/" and nxt == "*":
            end = src.find("*/", i + 2)
            assert end != -1, f"Unclosed block comment in {js_path.name}"
            i = end + 2
            continue
        if ch in ("'", '"', "`"):
            quote = ch
            i += 1
            while i < n:
                if src[i] == "\\":
                    i += 2
                    continue
                if quote == "`" and src[i] == "$" and i + 1 < n and src[i + 1] == "{":
                    stack.append("${")
                    i += 2
                    break
                if src[i] == quote:
                    i += 1
                    break
                i += 1
            continue
        if ch in pairs:
            stack.append(ch)
        elif ch in closing:
            assert stack, f"Extra closing {ch!r} in {js_path.name} near offset {i}"
            top = stack.pop()
            if top == "${":
                assert ch == "}", f"Mismatched {ch!r} for template ${{}} in {js_path.name}"
                # resume inside template literal
                i += 1
                while i < n:
                    if src[i] == "\\":
                        i += 2
                        continue
                    if src[i] == "$" and i + 1 < n and src[i + 1] == "{":
                        stack.append("${")
                        i += 2
                        break
                    if src[i] == "`":
                        i += 1
                        break
                    i += 1
                continue
            assert top == closing[ch], f"Mismatched {top!r} vs {ch!r} in {js_path.name} near offset {i}"
        i += 1
    assert not stack, f"Unclosed delimiters in {js_path.name}: {stack}"


def test_frontend_wiring() -> None:
    html = (ROOT_DIR / "index.html").read_text(encoding="utf-8")
    css = (ROOT_DIR / "css" / "styles.css").read_text(encoding="utf-8")
    motion_js = (ROOT_DIR / "js" / "cosmic-motion.js").read_text(encoding="utf-8")
    gif_js = (ROOT_DIR / "js" / "gif-encoder.js").read_text(encoding="utf-8")
    fits_js = (ROOT_DIR / "js" / "fits-parser.js").read_text(encoding="utf-8")
    app_js = (ROOT_DIR / "js" / "app.js").read_text(encoding="utf-8")

    # 1. Check all required DOM IDs exist in index.html
    html_ids = set(re.findall(r'id=["\']([^"\']+)["\']', html))
    required_ids = [
        "btnDockMotionPlayer",
        "btnOpenMotionPlayer",
        "motionSummaryMini",
        "btnModeMotion",
        "viewMotionWrapper",
        "canvasMotionMain",
        "motionCrossfadeWarning",
        "btnMotionPrev",
        "btnMotionPlayPause",
        "btnMotionNext",
        "btnMotionLoop",
        "motionLoadProgress",
        "motionPhysicalTimeline",
        "motionTimelineTooltip",
        "motionTimelineSpanLabel",
        "motionDiscreteSlider",
        "motionDiscreteStepLabel",
        "btnMotionModeBlink",
        "btnMotionModeCrossfade",
        "btnMotionToggleDiff",
        "btnMotionToggleWcs",
        "motionSpeedSlider",
        "motionSpeedLabel",
        "motionHudUtc",
        "motionHudMjd",
        "motionHudBand",
        "motionHudPlaybackRate",
        "motionHudPhysicalDt",
        "motionHudApparentMotion",
        "motionHudDiffStats",
        "btnMotionExportWebm",
        "btnMotionExportGif",
        "motionExportStatus",
    ]
    missing_ids = [rid for rid in required_ids if rid not in html_ids]
    assert not missing_ids, f"Missing required DOM IDs in index.html: {missing_ids}"

    # Verify every document.getElementById('id') in cosmic-motion.js exists in index.html
    motion_dom_refs = set(re.findall(r'document\.getElementById\(\s*["\']([^"\']+)["\']\s*\)', motion_js))
    missing_motion_refs = sorted(motion_dom_refs - html_ids)
    assert not missing_motion_refs, f"DOM IDs referenced in cosmic-motion.js missing in index.html: {missing_motion_refs}"

    # 2. Check mandatory non-observational warning text
    warning_text = "VISUAL CROSS-FADE (NON-OBSERVATIONAL TRANSITION)"
    assert warning_text in html, "Cross-fade warning badge missing in index.html"
    assert warning_text in motion_js, "Cross-fade warning badge missing in cosmic-motion.js"

    # 3. Check script tags & CSS sections
    assert "js/gif-encoder.js" in html and "js/cosmic-motion.js" in html
    assert ".motion-crossfade-warning" in css and ".motion-physical-wrap" in css
    assert "CosmicGifEncoder" in gif_js
    assert "renderFitsToOffscreen" in fits_js and "resampleFitsToSkyGrid" in fits_js and "computeDifferenceMatrix" in fits_js
    assert "ensureMotionSequenceLoaded" in app_js and "syncActiveMotionEpochToWorkspace" in app_js

    # 4. Syntax/delimiter sanity on JS modules
    check_balanced_delimiters(ROOT_DIR / "js" / "gif-encoder.js")
    check_balanced_delimiters(ROOT_DIR / "js" / "cosmic-motion.js")
    check_balanced_delimiters(ROOT_DIR / "js" / "fits-parser.js")
    check_balanced_delimiters(ROOT_DIR / "js" / "app.js")
    print("[PASS] Frontend DOM/CSS/JS wiring and delimiter checks succeeded.")


def test_backend_epochs_and_diff() -> None:
    client = TestClient(app)

    # Static assets
    for path in [
        "/",
        "/css/styles.css",
        "/js/gif-encoder.js",
        "/js/cosmic-motion.js",
        "/js/fits-parser.js",
        "/js/app.js",
    ]:
        res = client.get(path)
        assert res.status_code == 200, f"Static route {path} returned {res.status_code}"
    print("[PASS] Static frontend routes returned HTTP 200.")

    # Test /api/irsa/epochs across all 5 SPHEREx showcase targets
    for key in ["barnard", "wise0855", "eps_ind_b", "rw_aur", "r_dra"]:
        t = TARGETS[key]
        res = client.get(
            "/api/irsa/epochs",
            params={"ra": t["ra"], "dec": t["dec"], "detector": 6, "size": 0.08},
        )
        assert res.status_code == 200, f"/api/irsa/epochs failed for {key}: {res.text}"
        data = res.json()
        epochs = data["epochs"]
        assert data["epoch_count"] == len(epochs)
        assert len(epochs) >= 2, f"Expected >=2 real epochs for {key}, got {len(epochs)}"

        # Validate structure, monotonic MJD, timeline_ratio, zero synthetic frames
        mjds = [ep["mjd"] for ep in epochs]
        assert mjds == sorted(mjds), f"Epochs not sorted by MJD for {key}"
        assert abs(epochs[0]["timeline_ratio"] - 0.0) < 1e-6
        assert abs(epochs[-1]["timeline_ratio"] - 1.0) < 1e-6
        for idx, ep in enumerate(epochs):
            assert ep["epoch_index"] == idx
            assert ep["epoch_id"]
            assert ep["timestamp_utc"].endswith("Z")
            assert ep["detector"] == 6
            assert ep["band"]
            assert ep["cutout_url"].startswith("/api/irsa/cutout?")
            assert ep["access_url"].startswith("http")

        max_gap = max((g["gap_days"] for g in data["data_gaps"]), default=0.0)
        if key == "barnard":
            assert data["data_gaps"], "Expected data gaps for Barnard's Star"
            assert max_gap > 150, f"Expected ~6-month gap for Barnard, got {max_gap}"
            assert data["target_motion_meta"] is not None
            assert data["target_motion_meta"]["total_pm_arcsec_yr"] > 10.0

        print(
            f"[PASS] /api/irsa/epochs {key:10s}: {len(epochs):2d} real epochs | "
            f"baseline={data['baseline_days']:.1f}d | "
            f"max_gap={max_gap:.1f}d"
        )

    # Test /api/irsa/diff on Barnard's Star J2026 coordinates picking well-centered pre-gap vs post-gap epochs
    b_ra, b_dec = 269.446294, 4.767881
    b_res = client.get(
        "/api/irsa/epochs",
        params={"ra": b_ra, "dec": b_dec, "detector": 6, "size": 0.1},
    ).json()
    gap_mjd = b_res["data_gaps"][0]["start_mjd"]
    pre_gap = [ep for ep in b_res["epochs"] if ep["mjd"] <= gap_mjd]
    post_gap = [ep for ep in b_res["epochs"] if ep["mjd"] > gap_mjd]
    ep1 = min(pre_gap, key=lambda e: e["dist_deg"])
    ep2 = min(post_gap, key=lambda e: e["dist_deg"])

    diff_res = client.get(
        "/api/irsa/diff",
        params={
            "access_url_1": ep1["access_url"],
            "access_url_2": ep2["access_url"],
            "ra": b_ra,
            "dec": b_dec,
            "size": 0.1,
            "subtract_zodi": "true",
        },
    )
    assert diff_res.status_code == 200, f"/api/irsa/diff failed: {diff_res.text}"
    dj = diff_res.json()
    assert dj["valid"] is True
    assert dj["wcs_aligned"] is True
    assert dj["dipole_detected"] is True
    assert dj["peak_positive_mjy_sr"] > 100
    assert dj["peak_negative_mjy_sr"] < -100
    assert len(dj["diff_matrix"]) == dj["width"] * dj["height"]
    print(
        f"[PASS] /api/irsa/diff Barnard: wcs_aligned={dj['wcs_aligned']} | "
        f"dipole={dj['dipole_detected']} | "
        f"+{dj['peak_positive_mjy_sr']:.1f} / {dj['peak_negative_mjy_sr']:.1f} MJy/sr | "
        f"sep={dj['dipole_separation_arcsec']:.2f}\" | "
        f"grid={dj['width']}x{dj['height']}"
    )


if __name__ == "__main__":
    test_frontend_wiring()
    test_backend_epochs_and_diff()
    print("\nALL COSMIC MOTION VERIFICATION CHECKS PASSED!")
