import { Check } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

// Colour-theme chooser. Swatches are painted from each theme's own preview
// colours, so they look right no matter which theme is currently active.
//   variant="tiles"  – larger previews, for the profile pages
//   variant="menu"   – compact 2×2 grid, for the user dropdown
export default function ThemePicker({ variant = 'tiles' }) {
  const { theme, setTheme, themes } = useTheme()
  const compact = variant === 'menu'

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={compact ? 'grid grid-cols-2 gap-1 px-3' : 'grid grid-cols-2 sm:grid-cols-4 gap-2'}
    >
      {themes.map(t => {
        const selected = t.id === theme
        const p = t.preview
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={`${t.label} — ${t.blurb}`}
            onClick={() => setTheme(t.id)}
            className={`group relative flex flex-col items-center gap-1.5 rounded-lg border text-center transition-colors
              ${compact ? 'p-1.5' : 'p-2'}
              ${selected ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
          >
            <span
              className={`relative block w-full overflow-hidden rounded-md border ${compact ? 'h-7' : 'h-14'}`}
              style={{ background: p.page, borderColor: p.line }}
            >
              <span className="block h-1/4" style={{ background: p.card, borderBottom: `1px solid ${p.line}` }} />
              <span
                className="absolute rounded-sm"
                style={{ left: '12%', right: '12%', top: '40%', height: '30%', background: p.card, border: `1px solid ${p.line}` }}
              />
              <span
                className="absolute rounded-full"
                style={{ left: '20%', width: '28%', top: '50%', height: compact ? 3 : 5, background: p.accent }}
              />
            </span>
            <span className={`font-semibold text-gray-800 ${compact ? 'text-[11px]' : 'text-xs'}`}>{t.label}</span>
            {!compact && <span className="text-[11px] leading-tight text-gray-500">{t.blurb}</span>}
            {selected && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white">
                <Check size={10} strokeWidth={3} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
