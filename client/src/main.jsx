
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './utils/demoWindow.js'
import './index.css'
import './design.css'
import App from './App.jsx'
import { store } from './redux/store.js'
import { Provider } from 'react-redux'
import { applyTheme, getStoredTheme } from './utils/theme.js'

applyTheme(getStoredTheme())
if (import.meta.env.DEV) import('./utils/uiAudit.js').then((m) => m.installAudit())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>     
  </StrictMode>,
)
