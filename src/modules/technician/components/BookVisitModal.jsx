import { useState } from 'react'
import { toDateStr, todayStr } from '../../../shared/utils/formatDate'

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

function hhmm(iso, fallback) {
  if (!iso) return fallback
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Lets a technician book another day on the job they're already working —
// for work that runs past today. Starts on tomorrow at the same hours as the
// visit they're looking at, which is usually what a multi-day job needs.
export default function BookVisitModal({ appointment, onConfirm, onClose }) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [date, setDate] = useState(toDateStr(tomorrow))
  const [startTime, setStartTime] = useState(hhmm(appointment?.scheduled_start, '08:00'))
  const [endTime, setEndTime] = useState(hhmm(appointment?.scheduled_end, '16:00'))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onConfirm({ date, startTime, endTime, notes })
    } catch (err) {
      setError(err.message || 'Could not book the visit')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Book another day</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-500">
            Adds another visit to this job for you. You'll clock in and upload that day's before and after pictures when you get there.
          </p>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Day</label>
            <input required type="date" min={todayStr()} value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start</label>
              <input required type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End</label>
              <input required type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What's left to do? (optional)"
              className={`${inputCls} resize-none`}
            />
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50"
          >
            {saving ? 'Booking…' : 'Book Visit'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 text-sm font-medium border border-gray-300 text-gray-600 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
