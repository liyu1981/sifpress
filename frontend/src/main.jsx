import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

function getAppBasePath() {
  const meta = document.querySelector('meta[name="app-base-path"]')
  if (meta?.content) {
    return meta.content.replace(/\/+$/, '')
  }

  // Fallback for development with Vite.
  return ''
}

function apiUrl(path) {
  const base = getAppBasePath()
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function App() {
  const [apiMessage, setApiMessage] = useState('Loading...')
  const [time, setTime] = useState(null)

  useEffect(() => {
    fetch(apiUrl('/api/hello'))
      .then((response) => response.json())
      .then((data) => setApiMessage(data.message))
      .catch(() => setApiMessage('API request failed'))

    fetch(apiUrl('/api/time'))
      .then((response) => response.json())
      .then((data) => setTime(data.iso))
      .catch(() => {})
  }, [])

  const base = getAppBasePath()
  const href = (path) => `${base}${path}`

  return (
    <main className="app">
      <section className="card">
        <div className="badge">PHP + React</div>

        <h1>Single-file SPA</h1>

        <p>
          This application can be installed at the domain root or at any
          subdirectory without changing the generated PHP file.
        </p>

        <div className="panel">
          <strong>Application base path</strong>
          <div>{base || '/'}</div>
        </div>

        <div className="panel">
          <strong>API response</strong>
          <div>{apiMessage}</div>
        </div>

        <div className="panel">
          <strong>Server time</strong>
          <div>{time ?? 'Loading...'}</div>
        </div>

        <nav>
          <a href={href('/')}>Home</a>
          <a href={href('/editor/123')}>Editor</a>
          <a href={href('/settings')}>Settings</a>
        </nav>

        <p className="hint">
          This same build works at /, /myapp/, or any deeper URL.
        </p>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
