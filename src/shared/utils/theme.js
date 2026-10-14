import { THEMES, DEFAULT_THEME, THEME_STORAGE_KEY } from '../constants/themes'

// The chosen theme is remembered per device (localStorage) and applied as
// <html data-theme="…">. index.html sets the attribute before the first paint
// so a returning visitor never sees a flash of the wrong theme; initTheme()
// then keeps the rest of the page (status-bar colour, other tabs) in step.

const listeners = new Set()

const isTheme = id => THEMES.some(t => t.id === id)

export function getTheme() {
  const current = document.documentElement.dataset.theme
  return isTheme(current) ? current : DEFAULT_THEME
}

export function subscribeTheme(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function applyTheme(id) {
  document.documentElement.dataset.theme = id
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEMES.find(t => t.id === id).metaColor)
  listeners.forEach(fn => fn())
}

export function setTheme(id) {
  if (!isTheme(id)) return
  applyTheme(id)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id)
  } catch {
    // Storage blocked (private mode etc.) — the theme still applies until the page closes.
  }
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function initTheme() {
  applyTheme(readStoredTheme())
  // A change made in another open tab of the app.
  window.addEventListener('storage', e => {
    if (e.key === THEME_STORAGE_KEY) applyTheme(readStoredTheme())
  })
}
