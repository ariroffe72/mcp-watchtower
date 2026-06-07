import React from 'react'
import { createRoot } from 'react-dom/client'
import { DashboardApp } from './app.js'
import './styles.css'

const container = document.getElementById('app')

if (!container) {
  throw new Error('Dashboard root element was not found.')
}

createRoot(container).render(React.createElement(DashboardApp))
