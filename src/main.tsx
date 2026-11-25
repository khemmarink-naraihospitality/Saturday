import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import App from './App.tsx'
import { SsoPage } from './pages/SsoPage.tsx'
import './styles/index.css'

// /sso is the landing page for a ticket from the NHG portal (nhgspace.com): it
// stands alone, with no app, auth listener or analytics running beside it.
const path = window.location.pathname.replace(/\/+$/, '')
const isSsoLanding = path === '/sso'
// /api-docs is the API's documentation: public, for developers of other
// systems, so it too stands alone (and loads only when asked for).
const isApiDocs = path === '/api-docs'
const ApiDocsPage = lazy(() => import('./pages/ApiDocsPage.tsx'))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isSsoLanding ? (
      <SsoPage />
    ) : isApiDocs ? (
      <Suspense fallback={null}>
        <ApiDocsPage />
      </Suspense>
    ) : (
      <>
        <App />
        <Analytics />
        <SpeedInsights />
      </>
    )}
  </React.StrictMode>,
)

