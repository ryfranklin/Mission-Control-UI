# Mission Control UI

The operator front-end for [Mission Control](https://github.com/ryfranklin/Mission-Control)
— the durable, observable, cost-aware runtime for coding agents.

Mission Control's design is **one seam, many clients**: a FastAPI service wraps
the runtime, and every client (CLI, htmx UI, a planned Slack app) drives it over
the same HTTP API without re-implementing any orchestration. This repo is the
browser-native **control room** — another thin client of that seam. It renders
operator state and streams telemetry; it **decides nothing** (the Flight Director
orchestrates, the go/no-go gate gates, the graph stays durable).

## What's here

| Path | What it is |
|---|---|
| [`web-spa/`](./web-spa/) | The operator console — a Vite + React + TypeScript SPA. Fleet board, Run station (live SSE timeline + go/no-go gate), Planner console, and Metrics. **See [`web-spa/README.md`](./web-spa/README.md) for setup, the typed API client, and the view inventory.** |
| [`aidlc-docs/`](./aidlc-docs/) | AI-DLC **INCEPTION** artifacts for this front-end — the [Planner overview](./aidlc-docs/planner.md), captured [requirements](./aidlc-docs/inception/requirements.md), and the machine-managed `flight-plan.yaml` (authored via the planner, not by hand). |

## Quickstart

The SPA is a thin client of a **live** Mission Control seam — stand that up first,
then run the console against it:

```bash
# 1) start the seam (in the Mission-Control repo)
python -m mission_control.service          # FastAPI on 127.0.0.1:8000

# 2) run the console (here)
cd web-spa
npm install
cp .env.example .env.local                 # set VITE_MC_SERVICE_BASE_URL to the seam
npm run dev                                 # Vite dev server on :5173
```

Full details — configuration, the OpenAPI-generated typed client, SSE feeds,
design tokens, and each view — live in [`web-spa/README.md`](./web-spa/README.md).

## Status

Demo-grade alongside the runtime it fronts: the seam is **localhost, no auth** in
v1, so this console assumes a same-origin, single-operator context. Identity/auth
on every client is the runtime's graduation gate to production.
