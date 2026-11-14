"""
Entrypoint to launch the NASA SPHEREx & Planet X Python Backend (FastAPI + Uvicorn + Astropy)
Usage:
    python run_backend.py
"""

import uvicorn

if __name__ == "__main__":
    print("=" * 72)
    print(" NASA SPHEREx & Planet X — Python Backend (FastAPI + Astropy + NumPy)")
    print(" Local Application URL : http://localhost:8080")
    print(" Swagger API Docs      : http://localhost:8080/docs")
    print(" Health Check          : http://localhost:8080/api/health")
    print("=" * 72)
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8080, reload=False)
