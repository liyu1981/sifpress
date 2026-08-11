import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

/*
 * ------------------------------------------------------------
 * Rewrite-free routing driven entirely by the ?u= query parameter.
 *
 *   /index.php                    -> "/"
 *   /index.php?u=editor/123       -> "/editor/123"
 *   /index.php?u=settings         -> "/settings"
 *
 * No hash routing, no history-mode rewrites required. Because "u"
 * is just a query parameter, the URLs are real and shareable.
 * ------------------------------------------------------------
 */

// Current route, decoded from ?u=. Returns "/" when absent.
function readRoute() {
  const search = new URLSearchParams(window.location.search)
  const route = search.get('u')
  return route == null || route === '' ? '/' : route
}

// Minimal store so React re-renders when the URL's ?u= changes.
const routeListeners = new Set()

function subscribeRoute(listener) {
  routeListeners.add(listener)
  return () => routeListeners.delete(listener)
}

function routeSnapshot() {
  return readRoute()
}

// Client-side navigation: update ?u= with history.pushState.
function navigate(route, params = {}) {
  const url = new URL(window.location.href)
  const query = new URLSearchParams(url.search)

  // Keep the server-only module param out of SPA navigation.
  query.delete('module')
  query.set('u', route)

  for (const [key, value] of Object.entries(params)) {
    if (value == null) {
      query.delete(key)
    } else {
      query.set(key, value)
    }
  }

  url.search = query.toString()
  window.history.pushState({}, '', url)
  emitRouteChange()
}

function emitRouteChange() {
  routeListeners.forEach((listener) => listener())
}

window.addEventListener('popstate', emitRouteChange)

function useRoute() {
  return useSyncExternalStore(subscribeRoute, routeSnapshot)
}

/*
 * ------------------------------------------------------------
 * API access. The API lives behind the very same index.php, so it
 * is addressed relative to the current document — no base path
 * configuration is needed, regardless of the install directory.
 * ------------------------------------------------------------
 */

function apiUrl(action, params = {}) {
  const query = new URLSearchParams({ module: 'api', action, ...params })
  return `${window.location.pathname}?${query.toString()}`
}

function useApi(action, fallback = null, params = {}) {
  const [state, setState] = useState({
    loading: true,
    data: fallback,
    error: null,
  })

  useEffect(() => {
    let active = true
    setState({ loading: true, data: fallback, error: null })

    fetch(apiUrl(action, params))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`API error ${response.status}`)
        }
        return response.json()
      })
      .then((data) => {
        if (active) setState({ loading: false, data, error: null })
      })
      .catch((error) => {
        if (active) setState({ loading: false, data: fallback, error })
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, JSON.stringify(params)])

  return state
}

/*
 * ------------------------------------------------------------
 * Tiny declarative route table. Route parameters like /editor/123
 * are parsed from the ?u= value.
 * ------------------------------------------------------------
 */

function matchRoute(route) {
  const segments = route.split('/').filter(Boolean)

  const home = segments.length === 0
  const editor = segments[0] === 'editor'
  const settings = segments[0] === 'settings'

  if (home) {
    return { name: 'home', params: {} }
  }
  if (editor) {
    return { name: 'editor', params: { id: segments[1] ?? 'new' } }
  }
  if (settings) {
    return { name: 'settings', params: {} }
  }

  return { name: 'notfound', params: {} }
}

function link(route, params = {}) {
  const query = new URLSearchParams()
  query.set('u', route)
  for (const [key, value] of Object.entries(params)) {
    if (value != null) query.set(key, value)
  }
  return `${window.location.pathname}?${query.toString()}`
}

function NavLink({ to, children }) {
  const current = useRoute()
  const active = readRoute() === to

  return (
    <a
      href={link(to)}
      className={active ? 'active' : ''}
      onClick={(event) => {
        event.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}

/*
 * ------------------------------------------------------------
 * Pages
 * ------------------------------------------------------------
 */

function Home() {
  const hello = useApi('hello')
  const time = useApi('time')

  return (
    <section className="card">
      <div className="badge">PHP + React</div>

      <h1>Single-file SPA</h1>

      <p>
        This application is a single <code>index.php</code>. It works at the
        domain root or any subdirectory, and requires no rewrite rules.
      </p>

      <div className="panel">
        <strong>Current URL</strong>
        <div>{window.location.pathname}</div>
      </div>

      <div className="panel">
        <strong>API response (hello)</strong>
        <div>{hello.loading ? 'Loading...' : hello.data?.message}</div>
      </div>

      <div className="panel">
        <strong>Server time</strong>
        <div>{time.loading ? 'Loading...' : time.data?.iso ?? '—'}</div>
      </div>

      <p className="hint">
        Routes are pure query parameters (u=...). Try:
      </p>
      <nav>
        <NavLink to="/">Home</NavLink>
        <NavLink to="/editor/123">Editor 123</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
    </section>
  )
}

function Editor({ id }) {
  return (
    <section className="card">
      <div className="badge">Route → /u editor</div>
      <h1>Editor</h1>
      <p>You are editing document <strong>{id}</strong>.</p>
      <nav>
        <NavLink to="/">Home</NavLink>
        <NavLink to={`/editor/${Number(id) + 1}`}>Next doc</NavLink>
      </nav>
    </section>
  )
}

function Settings() {
  const [name, setName] = useState('')
  const [created, setCreated] = useState(null)

  function createProject(event) {
    event.preventDefault()
    if (!name.trim()) return

    fetch(apiUrl('projects', {}), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
      .then((response) => response.json())
      .then((data) => {
        setCreated(data)
        setName('')
      })
  }

  return (
    <section className="card">
      <div className="badge">Route → /u settings / POST API</div>
      <h1>Settings</h1>
      <p>Create a project via <code>?module=api&amp;action=projects</code> (POST).</p>

      <form className="form" onSubmit={createProject}>
        <input
          type="text"
          value={name}
          placeholder="Project name"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit">Create</button>
      </form>

      <div className="panel">
        <strong>Last created</strong>
        <div>{created ? `#${created.id} — ${created.name}` : '—'}</div>
      </div>

      <nav>
        <NavLink to="/">Home</NavLink>
        <NavLink to="/editor/123">Editor</NavLink>
      </nav>
    </section>
  )
}

function NotFound() {
  return (
    <section className="card">
      <div className="badge">404</div>
      <h1>Not found</h1>
      <p>The route <strong>{readRoute()}</strong> does not exist.</p>
      <nav>
        <NavLink to="/">Home</NavLink>
      </nav>
    </section>
  )
}

/*
 * ------------------------------------------------------------
 * Entry point
 * ------------------------------------------------------------
 */

function App() {
  const route = useRoute()
  const { name, params } = matchRoute(route)

  useEffect(() => {
    const titles = {
      home: 'Single PHP React SPA',
      editor: `Editor ${params.id}`,
      settings: 'Settings',
      notfound: 'Not found',
    }
    document.title = titles[name]
  }, [name, params.id])

  switch (name) {
    case 'editor':
      return <Editor id={params.id} />
    case 'settings':
      return <Settings />
    case 'notfound':
      return <NotFound />
    default:
      return <Home />
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
