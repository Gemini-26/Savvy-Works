import { useState } from 'react'
import { X } from 'lucide-react'

// ISO instant <-> the local "YYYY-MM-DDTHH:mm" a datetime-local input uses.
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : null
}

function fmt(iso) {
  return iso ? new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

// Admin correction of a clock-in/clock-out pair — used for both the on-site
// clock (per job) and the day-shift clock. Works mid-shift too: leave
// clock-out empty and the person stays clocked in.
export default function ClockTimesModal({
  title = 'Edit clock times',
  personName,
  startLabel = 'Clock in',
  endLabel = 'Clock out',
  openLabel = 'Still clocked in',
  start: initialStart,
  end: initialEnd,
  originalStart,
  originalEnd,
  note,
  onSubmit,
  onClose,
}) {
  const [start, setStart] = useState(toLocalInput(initialStart))
  const [end, setEnd] = useState(toLocalInput(initialEnd))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const maxValue = toLocalInput(new Date().toISOString())
  const durationMs = start && end ? new Date(end) - new Date(start) : null

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ start: fromLocalInput(start), end: fromLocalInput(end), reason })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save clock times')
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={handleSave} onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">{title}</h2>
            {personName && <p className="text-xs text-gray-500 mt-0.5">{personName}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{startLabel}</label>
            <input type="datetime-local" value={start} max={maxValue} onChange={e => setStart(e.target.value)} className={inputCls} />
            {originalStart && <p className="text-[11px] text-gray-400 mt-1">Originally tapped: {fmt(originalStart)}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-600">{endLabel}</label>
              {end && (
                <button type="button" onClick={() => setEnd('')} className="text-[11px] text-blue-600 hover:text-blue-700">
                  Clear — {openLabel.toLowerCase()}
                </button>
              )}
            </div>
            <input type="datetime-local" value={end} min={start || undefined} max={maxValue} onChange={e => setEnd(e.target.value)} className={inputCls} />
            {!end && <p className="text-[11px] text-gray-400 mt-1">Empty means: {openLabel.toLowerCase()}.</p>}
            {originalEnd && <p className="text-[11px] text-gray-400 mt-1">Originally tapped: {fmt(originalEnd)}</p>}
          </div>

          {durationMs != null && durationMs > 0 && (
            <p className="text-sm text-gray-700">
              Total: <span className="font-semibold">{Math.floor(durationMs / 3_600_000)}h {String(Math.floor(durationMs / 60_000) % 60).padStart(2, '0')}m</span>
            </p>
          )}

          {note && <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">{note}</p>}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Reason <span className="font-normal text-gray-400">(kept with the change)</span></label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Arrived 07:30, forgot to clock in" className={inputCls} />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving || (!start && !!end)}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : 'Save times'}
          </button>
        </div>
      </form>
    </div>
  )
}
