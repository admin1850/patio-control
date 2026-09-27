import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

registerSW({
  immediate: true,
  onNeedRefresh(update) {
    update?.(true)
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
