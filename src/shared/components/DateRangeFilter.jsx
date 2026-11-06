import { RANGE_PRESETS, rangeForPreset } from '../utils/dateRange'

const inputCls = 'px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

// Preset buttons plus a custom from/to. `value` is { preset, from, to } — build
// it with makeRange() from utils/dateRange.
export default function DateRangeFilter({ value, onChange }) {
  function pick(key) {
    if (key === 'custom') onChange({ ...value, preset: 'custom' })
    else onChange({ preset: key, ...rangeForPreset(key) })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {RANGE_PRESETS.map(p => (
        <button
          key={p.key}
          type="button"
          onClick={() => pick(p.key)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            value.preset === p.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {p.label}
        </button>
      ))}
      {value.preset === 'custom' && (
        <span className="flex items-center gap-2 text-xs text-gray-500">
          <input
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={e => onChange({ ...value, from: e.target.value })}
            className={inputCls}
            aria-label="From date"
          />
          to
          <input
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={e => onChange({ ...value, to: e.target.value })}
            className={inputCls}
            aria-label="To date"
          />
        </span>
      )}
    </div>
  )
}
