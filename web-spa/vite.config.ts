import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The SPA is a thin HTTP/SSE client of the Mission Control service seam.
 * The seam base URL is injected at runtime via `VITE_MC_SERVICE_BASE_URL`
 * (see `.env.example`) — never hardcode a host, account, or external system.
 * A localhost default keeps a fresh clone runnable without any config.
 */
const DEV_SEAM_FALLBACK = 'http://localhost:8000'

// Seam route prefixes the SPA calls. In dev these are proxied to the seam so
// the browser talks same-origin (no CORS); in prod FastAPI serves both.
const SEAM_ROUTES = ['/runs', '/targets', '/metrics', '/plans', '/openapi.json']

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const seamBaseUrl = env.VITE_MC_SERVICE_BASE_URL || DEV_SEAM_FALLBACK

  const routeProxy: ProxyOptions = {
    target: seamBaseUrl,
    changeOrigin: true,
    // Server-Sent Events must stream, not buffer through gzip.
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('Accept-Encoding', 'identity')
      })
    },
  }

  const proxy: Record<string, ProxyOptions> = Object.fromEntries(
    SEAM_ROUTES.map((route) => [route, routeProxy]),
  )

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy,
    },
  }
})
