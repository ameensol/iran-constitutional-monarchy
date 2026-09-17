import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/newsreader/latin-400.css'
import '@fontsource/newsreader/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/noto-naskh-arabic/arabic-400.css'
import '@fontsource/noto-naskh-arabic/arabic-600.css'
import '@fontsource/vazirmatn/arabic-400.css'
import '@fontsource/vazirmatn/arabic-600.css'
import './i18n'
import './theme.css'
import RootApp from './RootApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
