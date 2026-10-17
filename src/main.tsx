import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'

try {
  const theme = localStorage.getItem('theme')
  if (theme && theme !== 'auto') document.documentElement.setAttribute('data-theme', theme)
} catch {
  // Private mode etc. — fall back to the system theme
}

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
