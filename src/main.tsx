import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.tsx'
import { setupServiceWorker } from './lib/pwa'
import { normalizeEntryPath } from './lib/router'
import { init } from './lib/store'

normalizeEntryPath()
void init()
setupServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
