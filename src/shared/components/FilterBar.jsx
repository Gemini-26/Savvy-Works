import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, X, ChevronDown, Info, Search } from 'lucide-react'
import SearchBar from './SearchBar'
import { isFilterActive } from '../utils/listFilters'

const inputCls = 'w-full min-w-0 px-2.5 py-1.5 text-sm border border-gray-300 rounded-md bg-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500'

// Search box + a collapsible "Search Filter" panel for list pages. `fields`
// describes what can be filtered on; `values` / `onChange` hold the applied
// filters as { [key]: value }. The panel edits a draft, applied with the
// Search button (or Enter) and reset with Clear.
//
//   fields = [
//     { key: 'ref',    label: 'Job Ref', type: 'text', placeholder: 'Job ref' },
//     { key: 'status', label: 'Status',  type: 'multi', options: [{ value, label }] },
//     { key: 'method', label: 'Method',  type: 'select', options: [...] },
//     { key: 'issued', label: 'Issued',  type: 'dateRange' },   // { from, to }
//     { key: 'total',  label: 'Total',   type: 'numberRange' }, // { min, max }
//   ]
// Any field can carry `hint` (shown as an ⓘ tooltip on its label).
export default function FilterBar({ search, onSearchChange, placeholder, fields = [], values = {}, onChange, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const [draft, setDraft] = useState(values)

  // Chips removed outside the panel update `values` — keep the draft in step.
  const [syncedValues, setSyncedValues] = useState(values)
  if (syncedValues !== values) {
    setSyncedValues(values)
    setDraft(values)
  }

  const active = fields.filter(f => isFilterActive(values[f.key]))

  function apply(e) {
    e?.preventDefault()
    onChange(draft)
  }

  function clearPanel() {
    setDraft({})
    onChange({})
  }

  function clearAll() {
    onChange({})
    onSearchChange?.('')
  }

  function removeFilter(key) {
    const next = { ...values }
    delete next[key]
    onChange(next)
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px]">
          <SearchBar value={search} onChange={onSearchChange} placeholder={placeholder} />
        </div>

        {fields.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              open || active.length ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal size={15} />
            {open ? 'Hide Filters' : 'Filters'}
            {active.length > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">
                {active.length}
              </span>
            )}
          </button>
        )}

        {children}
      </div>

      {open && fields.length > 0 && (
        <form onSubmit={apply} className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50 border-b border-gray-200 rounded-t-xl">
            <span className="text-sm font-semibold text-gray-800">Search Filter</span>
            <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-gray-500 hover:text-gray-700">
              Hide Search Filter
            </button>
          </div>

          <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-3.5">
            {fields.map(f => (
              <div key={f.key} className="flex items-center gap-3 min-w-0">
                <label className="w-28 shrink-0 text-right text-sm font-semibold text-gray-700 flex items-center justify-end gap-1">
                  {f.label}:
                  {f.hint && (
                    <span title={f.hint} className="text-gray-400 cursor-help"><Info size={13} /></span>
                  )}
                </label>
                <div className="flex-1 min-w-0">
                  <FilterField field={f} value={draft[f.key]} onChange={v => setDraft(d => ({ ...d, [f.key]: v }))} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-2 px-5 pb-5">
            <button type="submit" className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
              <Search size={14} /> Search
            </button>
            <button type="button" onClick={clearPanel} className="px-5 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Clear
            </button>
          </div>
        </form>
      )}

      {(active.length > 0 || search) && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <Chip label={`“${search}”`} onRemove={() => onSearchChange('')} />
          )}
          {active.map(f => (
            <Chip key={f.key} label={`${f.label}: ${describe(f, values[f.key])}`} onRemove={() => removeFilter(f.key)} />
          ))}
          <button type="button" onClick={clearAll} className="text-xs font-medium text-gray-500 hover:text-gray-700">
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

function FilterField({ field, value, onChange }) {
  if (field.type === 'dateRange' || field.type === 'numberRange') {
    const isDate = field.type === 'dateRange'
    const [a, b] = isDate ? ['from', 'to'] : ['min', 'max']
    const v = value || {}
    return (
      <div className="flex items-center gap-1.5">
        <input
          type={isDate ? 'date' : 'number'} min={isDate ? undefined : 0}
          value={v[a] ?? ''} placeholder={isDate ? undefined : 'Min'}
          onChange={e => onChange({ ...v, [a]: e.target.value })}
          className={`${inputCls} px-1.5`}
        />
        <span className="text-xs font-semibold text-gray-500">to</span>
        <input
          type={isDate ? 'date' : 'number'} min={isDate ? undefined : 0}
          value={v[b] ?? ''} placeholder={isDate ? undefined : 'Max'}
          onChange={e => onChange({ ...v, [b]: e.target.value })}
          className={`${inputCls} px-1.5`}
        />
      </div>
    )
  }

  if (field.type === 'multi') {
    return <MultiSelect options={field.options ?? []} value={value ?? []} onChange={onChange} />
  }

  if (field.type === 'select') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={inputCls}>
        <option value="">-All-</option>
        {(field.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }

  return (
    <input type="text" value={value ?? ''} placeholder={field.placeholder ?? field.label} onChange={e => onChange(e.target.value)} className={inputCls} />
  )
}

// Dropdown of checkboxes, searchable when the list is long.
function MultiSelect({ options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.filter(o => value.includes(o.value))
  const shown = term ? options.filter(o => o.label.toLowerCase().includes(term.toLowerCase())) : options

  function toggle(v) {
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${inputCls} flex items-center justify-between gap-2 text-left`}
      >
        <span className={`truncate ${selected.length ? 'text-gray-900' : 'text-gray-400'}`}>
          {!selected.length ? '-All-' : selected.length <= 2 ? selected.map(o => o.label).join(', ') : `${selected.length} selected`}
        </span>
        <ChevronDown size={14} className="shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-40 mt-1 min-w-[12rem] bg-white rounded-lg border border-gray-200 shadow-lg">
          {options.length > 6 && (
            <div className="p-2 border-b border-gray-100">
              <input
                autoFocus type="text" value={term} onChange={e => setTerm(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
                placeholder="Search…" className={inputCls}
              />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {shown.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No matches</p>}
            {shown.map(o => (
              <label key={o.value} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
          {value.length > 0 && (
            <div className="px-3 py-1.5 border-t border-gray-100">
              <button type="button" onClick={() => onChange([])} className="text-xs font-medium text-blue-600 hover:text-blue-700">Clear selection</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Chip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-xs font-medium text-blue-700">
      {label}
      <button type="button" onClick={onRemove} className="p-0.5 rounded-full hover:bg-blue-100" aria-label={`Remove ${label}`}>
        <X size={12} />
      </button>
    </span>
  )
}

function describe(field, v) {
  if (field.type === 'dateRange' || field.type === 'numberRange') {
    const [a, b] = field.type === 'dateRange' ? [v.from, v.to] : [v.min, v.max]
    const fmt = x => field.type === 'numberRange' ? `R${x}` : x
    if (a && b) return `${fmt(a)} – ${fmt(b)}`
    return a ? `from ${fmt(a)}` : `up to ${fmt(b)}`
  }
  const label = x => field.options?.find(o => o.value === x)?.label ?? x
  if (Array.isArray(v)) return v.length <= 2 ? v.map(label).join(', ') : `${v.length} selected`
  if (field.type === 'select') return label(v)
  return `“${v}”`
}
