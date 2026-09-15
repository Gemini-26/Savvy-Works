import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

const inputCls = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

// Generic "search an existing document and link to it" field — used for the
// Quote Ref / Job Ref / Invoice Ref cross-links on a Purchase Order. Stays
// unaware of quotes/jobs/invoices specifically; the caller supplies
// `searchFn(term) => [{ id, ref, title }]` for whichever document type.
export default function RefPicker({ label, placeholder, value, onChange, searchFn }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (!open) return
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        setResults(await searchFn(term))
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [term, open, searchFn])

  if (value) {
    return (
      <div>
        {label && <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>}
        <div className="flex items-center justify-between px-3 py-2 text-sm rounded border border-gray-300 bg-gray-50">
          <span className="truncate">
            <span className="font-mono text-xs text-gray-500 mr-2">{value.ref}</span>
            {value.title}
          </span>
          <button type="button" onClick={() => onChange(null)} className="text-gray-400 hover:text-gray-600 shrink-0 ml-2">
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={boxRef} className="relative">
      {label && <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>}
      <div className="relative">
        <input
          value={term}
          onChange={e => setTerm(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={inputCls + ' pr-8'}
        />
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
          {searching ? (
            <p className="px-3 py-2 text-xs text-gray-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">No matches.</p>
          ) : (
            results.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => { onChange(r); setOpen(false); setTerm('') }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0"
              >
                <span className="font-mono text-xs text-gray-500 mr-2">{r.ref}</span>
                {r.title}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
