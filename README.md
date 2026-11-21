# Kármán Vortex Street Cloud Lab — OpenFOAM `icoFoam` + Starry Night CFD ($0/month)

100% cloud-computed transient **Kármán Vortex Street** simulation powered by **OpenFOAM v2512 (`icoFoam`) on Modal Serverless**, cached globally on **Cloudflare Workers + KV**, and rendered at 60 FPS with **Van Gogh *Starry Night* flowing brushstroke particles**.

## Supported Cross-Sections
- **Classic Circular Cylinder** ($St \approx 0.19$)
- **Melbourne Bolte Bridge** Twin-Pylon Section
- **Melbourne West Gate Bridge** Trapezoidal Box-Girder Deck
- **Melbourne Eureka Tower** Chamfered Skyscraper Section

## Architecture ($0/month)
- `compute/` — Modal Serverless OpenFOAM v2512 transient `icoFoam` solver (48 frames + FFT Strouhal number + zlib compression)
- `worker/` — Cloudflare Worker + `KARMAN_KV` cache + per-IP rate limiting
- `frontend/` — Vite + React + TypeScript 60 FPS animated vorticity & brushstroke renderer on Cloudflare Workers Static Assets
