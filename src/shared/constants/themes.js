// Colour themes a person can pick from. `id` is written to <html data-theme="…">
// and the matching palette lives in src/themes.css — add a theme in both places.
// 'light' has no block in themes.css: it is the stock Tailwind palette the app
// was built with. `preview` only paints the little swatches in the picker, and
// `metaColor` tints the browser / phone status bar.
export const THEME_STORAGE_KEY = 'savvy-theme'
export const DEFAULT_THEME = 'light'

export const THEMES = [
  {
    id: 'light',
    label: 'Daylight',
    blurb: 'Bright and clean',
    metaColor: '#CC2525',
    preview: { page: '#f9fafb', card: '#ffffff', line: '#e5e7eb', accent: '#2563eb' },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    blurb: 'Dark, easy on the eyes',
    metaColor: '#0b1220',
    preview: { page: '#0b1220', card: '#121b2e', line: '#26334d', accent: '#3b82f6' },
  },
  {
    id: 'savvy',
    label: 'Savvy',
    blurb: 'Black with brand red',
    metaColor: '#000000',
    preview: { page: '#0a0a0a', card: '#151515', line: '#2d2d2d', accent: '#cc2525' },
  },
  {
    id: 'forest',
    label: 'Forest',
    blurb: 'Calm greens, soft paper',
    metaColor: '#0f7a5f',
    preview: { page: '#f3f5f0', card: '#ffffff', line: '#dfe4d8', accent: '#0f7a5f' },
  },
]
