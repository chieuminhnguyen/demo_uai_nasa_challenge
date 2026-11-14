"""
NASA/IPAC IRSA SPHEREx SIAv2 & Multi-Extension FITS Service
Uses Astropy (astropy.io.fits, astropy.wcs) & NumPy for real scientific processing.
"""

from __future__ import annotations
import csv
import hashlib
import io
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
BACKEND_CACHE_DIR = ROOT_DIR / "backend" / "cache"
LEGACY_CACHE_DIR = ROOT_DIR / "cache"

SIA_CACHE_DIR = BACKEND_CACHE_DIR / "sia"
CUTOUT_CACHE_DIR = BACKEND_CACHE_DIR / "cutouts"

SIA_CACHE_DIR.mkdir(parents=True, exist_ok=True)
CUTOUT_CACHE_DIR.mkdir(parents=True, exist_ok=True)

IRSA_SIA_ENDPOINT = "https://irsa.ipac.caltech.edu/SIA"


def _find_cached_file(relative_subpath: str) -> Optional[Path]:
    """Check both backend/cache/ and legacy cache/ for a cached file."""
    p1 = BACKEND_CACHE_DIR / relative_subpath
    if p1.exists() and p1.stat().st_size > 64:
        return p1
    p2 = LEGACY_CACHE_DIR / relative_subpath
    if p2.exists() and p2.stat().st_size > 64:
        return p2
    return None


async def query_irsa_sia_csv(
    ra: float,
    dec: float,
    radius: float = 0.05,
    collections: Tuple[str, ...] = ("spherex_dr1", "spherex_qr3"),
) -> str:
    """
    Query NASA/IPAC IRSA Simple Image Access v2 (SIAv2) for SPHEREx Level-2 Spectral Images.
    Returns raw CSV text and caches locally in `backend/cache/sia/`.
    """
    cache_name = f"sia_{ra:.4f}_{dec:.4f}_{radius:.3f}.csv"
    existing = _find_cached_file(f"sia/{cache_name}")
    if existing is not None:
        return existing.read_text(encoding="utf-8", errors="replace")

    async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
        last_csv = ""
        for col in collections:
            url = (
                f"{IRSA_SIA_ENDPOINT}?COLLECTION={col}"
                f"&POS=circle+{ra}+{dec}+{radius}&RESPONSEFORMAT=CSV"
            )
            resp = await client.get(
                url,
                headers={"User-Agent": "UAI-NASA-SPHEREx-Explorer/2.0 (Python/Astropy)"},
            )
            if resp.status_code == 200 and "access_url" in resp.text:
                lines = [ln for ln in resp.text.splitlines() if ln.strip()]
                last_csv = resp.text
                if len(lines) > 1:
                    target_path = SIA_CACHE_DIR / cache_name
                    target_path.write_text(resp.text, encoding="utf-8")
                    return resp.text

        if last_csv:
            return last_csv
        raise RuntimeError("NASA IRSA SIAv2 returned no valid table.")


def parse_sia_csv_rows(csv_text: str, target_ra: Optional[float] = None, target_dec: Optional[float] = None) -> List[Dict[str, Any]]:
    """Parse NASA IRSA SIAv2 CSV output into structured Python dictionaries."""
    if not csv_text:
        return []
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    rows: List[Dict[str, Any]] = []
    for r in reader:
        access_url = (r.get("access_url") or "").strip()
        if ".fits" not in access_url:
            continue
        bandpass = (r.get("energy_bandpassname") or "SPHEREx").strip()
        det = 6
        for d in range(1, 7):
            if f"D{d}" in bandpass.upper():
                det = d
                break

        s_ra = float(r.get("s_ra") or 0.0)
        s_dec = float(r.get("s_dec") or 0.0)
        t_min = float(r.get("t_min") or 0.0)
        t_max = float(r.get("t_max") or 0.0)
        em_min = float(r.get("em_min") or 0.0)
        em_max = float(r.get("em_max") or 0.0)

        dist_deg = 0.0
        if target_ra is not None and target_dec is not None:
            d_ra = abs(((s_ra - target_ra + 540.0) % 360.0) - 180.0) * math.cos(math.radians(target_dec))
            d_dec = abs(s_dec - target_dec)
            dist_deg = math.hypot(d_ra, d_dec)

        rows.append(
            {
                "obs_id": (r.get("obs_id") or "").strip(),
                "detector": det,
                "bandpass": bandpass,
                "wl_min_um": round(em_min * 1e6, 2) if em_min > 0 else 0.75,
                "wl_max_um": round(em_max * 1e6, 2) if em_max > 0 else 5.00,
                "s_ra": s_ra,
                "s_dec": s_dec,
                "t_min_mjd": t_min,
                "t_max_mjd": t_max,
                "collection": (r.get("obs_collection") or "spherex_dr1").strip(),
                "access_url": access_url,
                "dist_deg": round(dist_deg, 6),
            }
        )

    rows.sort(key=lambda item: item["dist_deg"])
    return rows


def strip_epsf_extension_fast(full_fits_bytes: bytes) -> bytes:
    """
    Strip the bulky 3.85 MB `EPSF` BINTABLE extension while preserving the exact
    2880-byte FITS block alignment for PRIMARY, IMAGE, FLAGS, VARIANCE, and ZODI.
    """
    total = len(full_fits_bytes)
    offset = 0
    while offset + 2880 <= total:
        hdu_start = offset
        end_found = False
        extname = ""
        bitpix = 8
        naxis = 0
        axes: List[int] = []
        pcount = 0
        gcount = 1

        while not end_found and offset + 2880 <= total:
            block = full_fits_bytes[offset : offset + 2880].decode("ascii", errors="replace")
            for i in range(0, 2880, 80):
                card = block[i : i + 80]
                key = card[:8].strip()
                if key == "END":
                    end_found = True
                    break
                if "=" in card:
                    rhs = card.split("=", 1)[1].split("/")[0].strip()
                    if key == "EXTNAME":
                        extname = rhs.strip("' ")
                    elif key == "BITPIX":
                        try:
                            bitpix = int(rhs)
                        except ValueError:
                            pass
                    elif key == "NAXIS":
                        try:
                            naxis = int(rhs)
                        except ValueError:
                            pass
                    elif key.startswith("NAXIS") and len(key) > 5 and key[5:].isdigit():
                        try:
                            axes.append(int(rhs))
                        except ValueError:
                            pass
                    elif key == "PCOUNT":
                        try:
                            pcount = int(rhs)
                        except ValueError:
                            pass
                    elif key == "GCOUNT":
                        try:
                            gcount = int(rhs)
                        except ValueError:
                            pass
            offset += 2880

        if extname == "EPSF" and hdu_start > 0:
            return full_fits_bytes[:hdu_start]

        num_elems = 0
        if naxis > 0 and axes:
            prod = 1
            for ax_val in axes[:naxis]:
                prod *= ax_val
            num_elems = gcount * (pcount + prod)

        data_bytes = int(num_elems * (abs(bitpix) // 8))
        padded_data = int(math.ceil(data_bytes / 2880.0) * 2880)
        offset += padded_data

    return full_fits_bytes


async def fetch_irsa_fits_cutout(
    access_url: str,
    ra: float,
    dec: float,
    size: float = 0.1,
    mode: str = "compact",
) -> Tuple[bytes, Path]:
    """
    Fetch a real Multi-Extension FITS cutout from NASA/IPAC IRSA IBE.
    Caches both full `.fits` and compact `.fits` in `backend/cache/cutouts/`.
    """
    if not access_url.startswith("https://irsa.ipac.caltech.edu/ibe/data/spherex/"):
        raise ValueError("Invalid NASA IRSA SPHEREx access_url.")

    irsa_cutout_url = f"{access_url}?center={ra},{dec}&size={size}"
    digest = hashlib.sha256(irsa_cutout_url.encode("utf-8")).hexdigest()[:20]
    full_rel = f"cutouts/cutout_{digest}_full.fits"
    compact_rel = f"cutouts/cutout_{digest}_compact.fits"

    if mode != "full":
        existing_compact = _find_cached_file(compact_rel)
        if existing_compact is not None:
            return existing_compact.read_bytes(), existing_compact

    existing_full = _find_cached_file(full_rel)
    if existing_full is None:
        async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as client:
            resp = await client.get(
                irsa_cutout_url,
                headers={"User-Agent": "UAI-NASA-SPHEREx-Explorer/2.0 (Python/Astropy)"},
            )
            resp.raise_for_status()
            full_bytes = resp.content
        existing_full = CUTOUT_CACHE_DIR / f"cutout_{digest}_full.fits"
        existing_full.write_bytes(full_bytes)
    else:
        full_bytes = existing_full.read_bytes()

    if mode == "full":
        return full_bytes, existing_full

    compact_bytes = strip_epsf_extension_fast(full_bytes)
    compact_path = CUTOUT_CACHE_DIR / f"cutout_{digest}_compact.fits"
    compact_path.write_bytes(compact_bytes)
    return compact_bytes, compact_path


def analyze_fits_with_astropy(
    fits_bytes: bytes,
    target_ra: Optional[float] = None,
    target_dec: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Perform scientific analysis of a NASA SPHEREx Multi-Extension FITS cutout
    using `astropy.io.fits`, `astropy.wcs.WCS`, and `numpy`.
    """
    with fits.open(io.BytesIO(fits_bytes), memmap=False) as hdul:
        hdu_summary = [
            {
                "index": idx,
                "name": hdu.name,
                "type": type(hdu).__name__,
                "shape": list(hdu.data.shape) if getattr(hdu, "data", None) is not None else [],
            }
            for idx, hdu in enumerate(hdul)
        ]

        if "IMAGE" not in hdul:
            return {"valid": False, "hdus": hdu_summary}

        img_hdu = hdul["IMAGE"]
        hdr = img_hdu.header
        img_data = np.asarray(img_hdu.data, dtype=np.float64)
        height, width = img_data.shape

        flags_data = (
            np.asarray(hdul["FLAGS"].data, dtype=np.uint32)
            if "FLAGS" in hdul and hdul["FLAGS"].data is not None
            else None
        )
        var_data = (
            np.asarray(hdul["VARIANCE"].data, dtype=np.float64)
            if "VARIANCE" in hdul and hdul["VARIANCE"].data is not None
            else None
        )
        zodi_data = (
            np.asarray(hdul["ZODI"].data, dtype=np.float64)
            if "ZODI" in hdul and hdul["ZODI"].data is not None
            else None
        )

        # Compute target pixel coordinates via Astropy WCS if available
        cx, cy = width // 2, height // 2
        wcs_pixel = None
        if target_ra is not None and target_dec is not None:
            try:
                wcs = WCS(hdr)
                px, py = wcs.wcs_world2pix(target_ra, target_dec, 0)
                if np.isfinite(px) and np.isfinite(py):
                    wcs_pixel = {"x": round(float(px), 2), "y": round(float(py), 2)}
                    cx = int(np.clip(round(float(px)), 0, width - 1))
                    cy = int(np.clip(round(float(py)), 0, height - 1))
            except Exception:
                pass

        finite_img = img_data[np.isfinite(img_data)]
        p10, p50, p99 = (
            np.percentile(finite_img, [10, 50, 99.2]).tolist()
            if finite_img.size > 0
            else [0.0, 0.0, 1.0]
        )

        # Measure peak surface brightness & quality bitmask in a 7x7 aperture around (cx, cy)
        y0, y1 = max(0, cy - 3), min(height, cy + 4)
        x0, x1 = max(0, cx - 3), min(width, cx + 4)
        aperture = img_data[y0:y1, x0:x1]
        peak_flux = float(np.nanmax(aperture)) if aperture.size > 0 else float(p50)

        center_var = (
            float(np.nanmedian(var_data[y0:y1, x0:x1]))
            if var_data is not None and var_data[y0:y1, x0:x1].size > 0
            else 0.02
        )
        mean_zodi = (
            float(np.nanmean(zodi_data))
            if zodi_data is not None and np.isfinite(zodi_data).any()
            else float(p50)
        )
        aperture_mask = (
            int(np.bitwise_or.reduce(flags_data[y0:y1, x0:x1].ravel()))
            if flags_data is not None and flags_data[y0:y1, x0:x1].size > 0
            else 0
        )

        noise_sigma = math.sqrt(max(1e-6, center_var))
        snr = max(1.0, (peak_flux - p50) / noise_sigma)

        return {
            "valid": True,
            "engine": "Python Astropy + NumPy",
            "astropy_version": fits.__package__,
            "width": width,
            "height": height,
            "detector": int(hdr.get("DETECTOR", 6)),
            "obs_id": str(hdr.get("OBSID", "SPHEREx_L2")),
            "date_obs": str(hdr.get("DATE-OBS", "")),
            "bunit": str(hdr.get("BUNIT", "MJy / sr")),
            "psf_fwhm_arcsec": round(float(hdr.get("PSF_FWHM", 6.2)), 2),
            "l1_dqa_flag": str(hdr.get("L1DQAFLG", "Pass")),
            "l2_dqa_flag": str(hdr.get("L2DQAFLG", "Pass")),
            "astrometry_matched_stars": int(hdr.get("MATCH_NSTARS", 0)),
            "wcs_target_pixel": wcs_pixel,
            "center_peak_flux_mjy_sr": round(peak_flux, 3),
            "background_median_mjy_sr": round(float(p50), 3),
            "mean_zodi_mjy_sr": round(mean_zodi, 3),
            "net_zodi_subtracted_peak_mjy_sr": round(peak_flux - mean_zodi, 3),
            "median_variance_mjy_sr2": round(center_var, 4),
            "snr": round(snr, 1),
            "aperture_flag_hex": f"0x{aperture_mask:04X}",
            "hdus": hdu_summary,
        }
