import { useEffect, useRef, useState } from 'react'
import { suggestAddresses, suggestionPatch } from '../../../shared/utils/addressSuggest'
import { locationSearchKey } from '../../../shared/utils/siteLocation'

const KIND_TAG = {
  house: { text: 'Exact address', cls: 'text-green-700 bg-green-50 border-green-200' },
  place: { text: 'Named place', cls: 'text-green-700 bg-green-50 border-green-200' },
  street: { text: 'Street only', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  area: { text: 'Area', cls: 'text-gray-500 bg-gray-50 border-gray-200' },
}

// A named place (a clinic, a hotel) is precise, but it isn't a street address.
const tagOf = item => (item.kind === 'house' && !item.place.houseNumber ? 'place' : item.kind)

// The site Address box with Google-Maps-style suggestions: as the address is
// typed, matching places drop down underneath; picking one fills in the street,
// town, province, postcode and country and places the pin.
//
//   value     the job form: reads site_address, and the other site_* fields
//   onChange  called with a partial patch of those fields
//   onPicked  called with { key, kind, label } for a picked suggestion, so the map
//             can keep that exact point (and describe it) instead of searching the
//             new text again
export default function SiteAddressInput({ value, onChange, onPicked, readOnly = false, className = '', rows = 3, placeholder }) {
  const text = value.site_address || ''
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const focused = useRef(false)
  // The text a pick just wrote shouldn't open another list.
  const skipNext = useRef(false)

  useEffect(() => {
    if (readOnly) return
    if (skipNext.current) {
      skipNext.current = false
      return
    }
    if (!focused.current) return

    const controller = new AbortController()
    // Short debounce: the list follows the typing without a request per keystroke,
    // and anything still in flight when the next letter lands is cancelled.
    const timer = setTimeout(async () => {
      const found = await suggestAddresses(text, { city: value.site_city, province: value.site_county, signal: controller.signal })
      if (controller.signal.aborted) return
      setItems(found)
      setActive(-1)
      setOpen(found.length > 0)
    }, 250)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, readOnly])

  function pick(item) {
    const patch = suggestionPatch(text, item.place, { city: value.site_city, province: value.site_county, centre: item.centre })
    skipNext.current = true
    setOpen(false)
    setItems([])
    onChange(patch)
    onPicked?.({ key: locationSearchKey({ ...value, ...patch }), kind: item.kind, label: item.place.label })
  }

  function handleKeyDown(e) {
    if (!open || !items.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => (i <= 0 ? items.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault() // pick it, rather than adding a line break
      pick(items[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <textarea
        rows={rows}
        value={text}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={e => onChange({ site_address: e.target.value })}
        onFocus={() => { focused.current = true; if (items.length) setOpen(true) }}
        // Delayed so a click on a suggestion lands before the list goes away.
        onBlur={() => { focused.current = false; setTimeout(() => setOpen(false), 150) }}
        onKeyDown={handleKeyDown}
        className={className}
        autoComplete="off"
      />
      {open && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-[1100] bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto">
          {items.map((item, i) => (
            <li
              key={item.id}
              onMouseDown={e => { e.preventDefault(); pick(item) }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 cursor-pointer border-b border-gray-50 ${i === active ? 'bg-blue-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900 truncate">{item.primary}</span>
                <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${KIND_TAG[tagOf(item)].cls}`}>
                  {KIND_TAG[tagOf(item)].text}
                </span>
              </div>
              {item.secondary && <div className="text-xs text-gray-500 truncate">{item.secondary}</div>}
            </li>
          ))}
          <li className="px-3 py-1 text-[10px] text-gray-400">Suggestions from OpenStreetMap — if your house isn't listed, type it in and drag the pin onto it.</li>
        </ul>
      )}
    </div>
  )
}
