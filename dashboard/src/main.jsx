import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import HistoryPage from './HistoryPage.jsx'
import KioskPage from './KioskPage.jsx'

const path = window.location.pathname
const Page =
  path.startsWith('/admin/history') || path.startsWith('/history')
    ? HistoryPage
    : path.startsWith('/admin')
      ? App
      : KioskPage

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
