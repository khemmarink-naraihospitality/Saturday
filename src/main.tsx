import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import App from './App.tsx'
import { SsoPage } from './pages/SsoPage.tsx'
import './styles/index.css'

// /sso is the landing page for a ticket from the NHG portal (nhgspace.com): it
// stands alone, with no app, auth listener or analytics running beside it.
const isSsoLanding = window.location.pathname.replace(/\/+$/, '') === '/sso'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isSsoLanding ? (
      <SsoPage />
    ) : (
      <>
        <App />
        <Analytics />
        <SpeedInsights />
      </>
    )}
  </React.StrictMode>,
)

