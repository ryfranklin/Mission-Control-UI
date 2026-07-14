# Requirements

Readiness-gated requirements captured during AI-DLC INCEPTION. Machine-managed by Mission Control — the authoritative copy is `flight-plan.yaml`; edit via the planner, not by hand. Metadata/spec only (no secrets).

## integration_strategy  (ready)

SPA in-repo at web-spa/; Vite dev-proxy to localhost API; prod served same-origin via FastAPI StaticFiles; no CORS, no backend edits until gated

## read_only_constraint  (ready)

No repo modification; port plan authored for operator to run in ~/repos/Mission-Control

## screen_endpoint_map  (ready)

Each htmx template maps to a React view over existing endpoints: Fleet→GET /runs,/targets; Metrics→GET /metrics; Launch→POST /runs; Run station→GET /runs/{id},/changes,/events(SSE),POST approve/reject/scrub/cancel; Plan list→GET/POST /plans; Planner→GET /plans/{id},POST /turns,/turns/stream(SSE),/finalize

## sse_consumption  (ready)

React EventSource over /runs/{id}/events and /plans/{id}/turns/stream JSON-event feeds

## type_generation  (ready)

openapi-typescript run against live /openapi.json (not templates) for typed client
