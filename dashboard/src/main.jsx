import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import HistoryPage from './HistoryPage.jsx'

const path = window.location.pathname
const Page = path.startsWith('/history') ? HistoryPage : App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
