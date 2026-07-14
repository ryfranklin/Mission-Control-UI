# web-spa — Mission Control operator console

A Vite + React + TypeScript single-page app. It is a **thin HTTP/SSE client** of
the Mission Control service seam: it renders operator state and streams
telemetry; it holds no business logic and mutates no backend behavior.

## Configuration (env-only, repo-agnostic)

The seam location is injected at runtime — nothing is hardcoded.

```
VITE_MC_SERVICE_BASE_URL   # base URL of the local Mission Control API
```

Copy `.env.example` to `.env.local` and set it for your machine. See
`.env.example` for details. Never commit a real host, account, or secret.

## Develop

```bash
npm install
npm run dev        # Vite dev server on :5173, proxies seam routes to the API
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build locally
```

In dev, Vite proxies the seam routes (`/runs`, `/targets`, `/metrics`,
`/plans`, `/openapi.json`, and their SSE feeds) to `VITE_MC_SERVICE_BASE_URL`,
so the browser talks same-origin (no CORS). In production the app is served
same-origin by FastAPI StaticFiles.

## Typed API client

```bash
npm run gen:api    # openapi-typescript against <seam>/openapi.json -> src/api/schema.d.ts
```

Run this against a **live** seam (not templates). Generation and the typed fetch
wrapper land in a later unit — this scaffold only wires the tooling. The
generated `src/api/schema.d.ts` is git-ignored.

## Design tokens

`tailwind.config.js` defines the NASA/SpaceX console palette: near-black panels
(`console.*`), and semantic status accents — `status.go` (green = GO),
`status.flight` (amber = in-flight / UNRECONCILED), `status.fault` (red = NO-GO
/ fault), `status.telemetry` (cyan = live telemetry). Monospace with tabular
figures is the default so telemetry columns align.

## Scope

This directory is the entire SPA. The Fleet, Run station, Gate, Metrics, and
Planner views are built in later units.
