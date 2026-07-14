import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'

import App from './App.tsx'
import { queryClient } from './lib/queryClient.ts'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Mission Control: #root element not found')
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
