"""
UAI NASA SPACE APPS CHALLENGE — SPHEREx & PLANET X PYTHON BACKEND
FastAPI + Astropy + NumPy + HTTPX Live NASA/IPAC IRSA Gateway
"""

from __future__ import annotations
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.targets import TARGETS, propagate_proper_motion, resolve_target_by_name
from backend.services.irsa_client import (
    analyze_fits_with_astropy,
    fetch_irsa_fits_cutout,
    parse_sia_csv_rows,
    query_irsa_sia_csv,
    resolve_name_astronomical,
    reverse_lookup_simbad,
)

ROOT_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(
    title="NASA SPHEREx & Planet X — Interactive Sky Map Backend",
    description=(
        "Python Backend (FastAPI + Astropy + NumPy) connecting live NASA/IPAC IRSA "
        "SPHEREx SIAv2 catalogs and Multi-Extension FITS cutouts."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def disable_static_browser_cache(request: Request, call_next):
    """Ensure browser always loads latest JS/CSS/HTML during live development."""
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith(("/js/", "/css/")):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


@app.get("/api/health")
async def health_check():
    """Health check endpoint confirming Python + Astropy + NumPy backend status."""
    import astropy
    import numpy as np
    import sys

    return {
        "status": "ok",
        "backend": "Python FastAPI + Astropy",
        "python_version": sys.version.split()[0],
        "astropy_version": astropy.__version__,
        "numpy_version": np.__version__,
        "benchmark_targets_count": len(TARGETS),
    }


@app.get("/api/targets")
async def get_benchmark_targets(mjd: Optional[float] = Query(default=61000.0)):
    """
    Return the 5 NASA Benchmark Targets (`barnard`, `eps_ind_b`, `wise0855`, `rw_aur`, `r_dra`)
    with astrometric proper motion propagated to `mjd` (default MJD 61000.0 ~ 2025.89).
    """
    enriched = {}
    for key, t in TARGETS.items():
        prop_ra, prop_dec, prop_jyear = propagate_proper_motion(
            ra_deg=t["ra"],
            dec_deg=t["dec"],
            pm_ra_arcsec_yr=t["pm_ra_arcsec_yr"],
            pm_dec_arcsec_yr=t["pm_dec_arcsec_yr"],
            epoch0_jyear=t["epoch"],
            target_mjd=mjd or 61000.0,
        )
        enriched[key] = {
            **t,
            "propagated": {
                "ra_deg": prop_ra,
                "dec_deg": prop_dec,
                "mjd": mjd or 61000.0,
                "epoch_jyear": prop_jyear,
            },
        }
    return {"targets": enriched}


@app.get("/api/targets/resolve")
async def resolve_target_endpoint(q: str = Query(..., description="Target name or alias")):
    """Resolve a target name or alias against the NASA Benchmark Targets catalog."""
    found = resolve_target_by_name(q)
    if not found:
        raise HTTPException(status_code=404, detail=f"Target '{q}' not found in benchmark catalog.")
    return {"found": True, "target": found}


@app.get("/api/astro/reverse")
async def astro_reverse_lookup(
    ra: float = Query(..., ge=0.0, le=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    radius: float = Query(default=0.08, ge=0.005, le=1.0),
):
    """
    Live Astronomical Reverse Coordinate Lookup via Harvard/CDS SIMBAD TAP.
    Given any (RA, Dec) in the sky, identifies the star/celestial object at that coordinate.
    """
    try:
        star_obj = await reverse_lookup_simbad(ra=ra, dec=dec, radius_deg=radius)
        if star_obj is None:
            return JSONResponse({"found": False})
        return JSONResponse({"found": True, "source": "SIMBAD_TAP", "object": star_obj})
    except Exception as exc:
        return JSONResponse({"found": False, "error": str(exc)})


@app.get("/api/astro/resolve")
async def astro_resolve_name(q: str = Query(..., description="Celestial object name")):
    """
    Live Astronomical Name Resolver via CDS Sesame + SIMBAD TAP Canonicalizer.
    Returns the exact same canonical object structure as `/api/astro/reverse`.
    """
    try:
        star_obj = await resolve_name_astronomical(q)
        if star_obj is None:
            return JSONResponse({"found": False})
        return JSONResponse({"found": True, "source": "SESAME_SIMBAD_CANONICAL", "object": star_obj})
    except Exception as exc:
        return JSONResponse({"found": False, "error": str(exc)})


@app.get("/api/irsa/sia")
async def irsa_sia_proxy(
    ra: float = Query(default=269.446294, ge=0.0, le=360.0),
    dec: float = Query(default=4.767881, ge=-90.0, le=90.0),
    radius: float = Query(default=0.05, ge=0.005, le=2.0),
    format: str = Query(default="csv"),
):
    """
    Query NASA/IPAC IRSA SIAv2 for real SPHEREx Level-2 spectral images covering (RA, Dec).
    Supports both raw CSV response (for frontend `SpherexFitsParser.parseSiaCsv`) and JSON.
    """
    try:
        csv_text = await query_irsa_sia_csv(ra=ra, dec=dec, radius=radius)
        if format.lower() == "json":
            rows = parse_sia_csv_rows(csv_text, target_ra=ra, target_dec=dec)
            return JSONResponse({"count": len(rows), "ra": ra, "dec": dec, "rows": rows})
        return Response(content=csv_text, media_type="text/csv; charset=utf-8")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/irsa/cutout")
async def irsa_cutout_proxy(
    access_url: str = Query(..., description="NASA IRSA IBE access_url"),
    ra: float = Query(default=269.446294, ge=0.0, le=360.0),
    dec: float = Query(default=4.767881, ge=-90.0, le=90.0),
    size: float = Query(default=0.1, ge=0.01, le=1.0),
    mode: str = Query(default="compact", description="'compact' (fast 85KB) or 'full' (4MB raw NASA FITS)"),
):
    """
    Download and serve a real Multi-Extension FITS cutout from NASA/IPAC IRSA IBE.
    """
    try:
        fits_bytes, cached_path = await fetch_irsa_fits_cutout(
            access_url=access_url,
            ra=ra,
            dec=dec,
            size=size,
            mode=mode,
        )
        headers = {
            "X-Powered-By": "Python-FastAPI-Astropy",
            "X-Cache-File": cached_path.name,
        }
        if mode == "full":
            headers["Content-Disposition"] = (
                f'attachment; filename="spherex_irsa_ra{ra:.4f}_dec{dec:.4f}.fits"'
            )
        return Response(content=fits_bytes, media_type="application/fits", headers=headers)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve)) from ve
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/irsa/analyze")
async def irsa_astropy_analyze(
    access_url: str = Query(..., description="NASA IRSA IBE access_url"),
    ra: float = Query(default=269.446294, ge=0.0, le=360.0),
    dec: float = Query(default=4.767881, ge=-90.0, le=90.0),
    size: float = Query(default=0.1, ge=0.01, le=1.0),
):
    """
    Analyze a NASA SPHEREx Multi-Extension FITS cutout on the Python backend
    using `astropy.io.fits`, `astropy.wcs.WCS`, and `numpy`.
    """
    try:
        fits_bytes, _ = await fetch_irsa_fits_cutout(
            access_url=access_url,
            ra=ra,
            dec=dec,
            size=size,
            mode="compact",
        )
        analysis = analyze_fits_with_astropy(fits_bytes, target_ra=ra, target_dec=dec)
        return JSONResponse(analysis)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# Mount Static Frontend Directories
app.mount("/css", StaticFiles(directory=str(ROOT_DIR / "css")), name="css")
app.mount("/js", StaticFiles(directory=str(ROOT_DIR / "js")), name="js")


@app.get("/")
async def serve_index():
    """Serve the main Interactive Sky Map application."""
    return FileResponse(ROOT_DIR / "index.html")
