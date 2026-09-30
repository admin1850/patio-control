import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { listPending } from './lib/outbox.js'
import App from './App.jsx'
import './index.css'

async function swShouldWait() {
  if (window.__PATIO_CAPTURE_OPEN) return true
  try {
    const pending = await listPending()
    return pending.length > 0
  } catch {
    return false
  }
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void resolveSwRefresh()
  },
  onRegisteredSW(_url, registration) {
    if (registration) {
      registration.update()
      setInterval(() => {
        registration.update()
      }, 30000)
    }
  },
})

async function resolveSwRefresh() {
  if (await swShouldWait()) {
    window.__PATIO_SW_UPDATE = () => {
      if (window.__PATIO_CAPTURE_OPEN) return
      updateSW(true)
    }
    window.__PATIO_SW_WAITING = true
    window.dispatchEvent(new CustomEvent('patio-sw-update'))
    return
  }
  updateSW(true)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
