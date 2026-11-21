"""
Modal Cloud Serverless OpenFOAM v2512 Transient Karman Vortex Street Solver.

Deploy with:
    modal deploy compute/modal_app.py
"""

import os
import modal

app = modal.App("karman-vortex-openfoam")

# Reuses the exact OpenFOAM v2512 base image already cached on Modal (no VTK needed -> ultra-slim!)
openfoam_image = (
    modal.Image.from_registry("opencfd/openfoam-run:2512", add_python="3.11")
    .pip_install("fastapi[standard]", "numpy")
    .add_local_file("compute/karman_solver.py", "/root/karman_solver.py")
)


@app.function(
    image=openfoam_image,
    cpu=2.0,
    memory=2048,
    timeout=240,
    scaledown_window=30,
    secrets=[modal.Secret.from_name("karman-cfd-secrets")],
)
@modal.asgi_app()
def fastapi_app():
    import sys

    sys.path.insert(0, "/root")
    from fastapi import FastAPI, Header, HTTPException
    from karman_solver import KarmanParams, run_karman_simulation

    web = FastAPI(title="Karman Vortex Street OpenFOAM Cloud")

    @web.get("/health")
    def health():
        return {"status": "ok", "solver": "icoFoam", "engine": "openfoam2512"}

    @web.post("/simulate")
    @web.post("/")
    def simulate(payload: dict, authorization: str | None = Header(default=None)):
        expected = os.environ.get("COMPUTE_AUTH_TOKEN", "")
        if expected:
            provided = (authorization or "").replace("Bearer ", "").strip()
            if provided != expected:
                raise HTTPException(status_code=401, detail="Unauthorized compute request")

        params = KarmanParams(
            shape=str(payload.get("shape", "cylinder")),
            reynolds=float(payload.get("reynolds", 150.0)),
            angle_deg=float(payload.get("angle_deg", 0.0)),
            wind_speed_ms=float(payload.get("wind_speed_ms", 12.0)),
        ).normalized()

        try:
            result = run_karman_simulation(params)
            return {"status": "ok", "cached": False, "result": result}
        except Exception as exc:
            import traceback
            raise HTTPException(status_code=500, detail=f"{exc}\n{traceback.format_exc()[-800:]}")

    return web
