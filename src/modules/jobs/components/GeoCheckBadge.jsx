import { useState } from 'react'
import { reviewGeoFlag } from '../../planner/services/appointmentService'
import { GEO_STATUS, describeGeoCheck } from '../../../shared/utils/geoCheck'

const TONE = {
  green: { dot: 'bg-green-500', text: 'text-green-700' },
  amber: { dot: 'bg-amber-500', text: 'text-amber-700 font-medium' },
  gray:  { dot: 'bg-gray-300',  text: 'text-gray-400' },
}

function CheckLine({ label, status, distance, fence }) {
  const tone = TONE[GEO_STATUS[status]?.tone] || TONE.gray
  const text = describeGeoCheck(status, distance, fence)
  if (!text) return null
  return (
    <div className={`flex items-start gap-1.5 text-[11px] ${tone.text}`}>
      <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
      <span>{label}: {status === 'outside' && '⚠ '}{text}</span>
    </div>
  )
}

// Where a technician was, against the job's site fence, when they clocked in
// and out. If either was outside the fence it's shown as a flag until an admin
// marks it reviewed (with a note, if they like).
export default function GeoCheckBadge({ assignment: a, isAdmin, onChanged }) {
  const [reviewing, setReviewing] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!a.start_geo_status && !a.end_geo_status) return null

  const flagged = a.start_geo_status === 'outside' || a.end_geo_status === 'outside'

  async function handleReview() {
    setBusy(true)
    setError(null)
    try {
      await reviewGeoFlag(a.id, note)
      setReviewing(false)
      setNote('')
      await onChanged?.()
    } catch (err) {
      setError(err.message || 'Failed to save review')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`mt-1 space-y-0.5 ${flagged && !a.geo_reviewed_at ? 'rounded border border-amber-200 bg-amber-50 px-2 py-1.5' : ''}`}>
      {a.start_geo_status && (
        <CheckLine label="Clock-in" status={a.start_geo_status} distance={a.start_distance_m} fence={a.start_fence_m} />
      )}
      {a.end_geo_status && (
        <CheckLine label="Clock-out" status={a.end_geo_status} distance={a.end_distance_m} fence={a.end_fence_m} />
      )}

      {flagged && a.geo_reviewed_at && (
        <p className="text-[11px] text-green-700">
          ✓ Reviewed by {a.geo_reviewed_by_name || 'an admin'} · {new Date(a.geo_reviewed_at).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
          {a.geo_review_note && <span className="text-gray-600"> — “{a.geo_review_note}”</span>}
        </p>
      )}

      {flagged && !a.geo_reviewed_at && isAdmin && !reviewing && (
        <button type="button" onClick={() => setReviewing(true)}
          className="text-[11px] font-semibold text-blue-600 hover:text-blue-700">
          Mark reviewed
        </button>
      )}

      {reviewing && (
        <div className="pt-1 space-y-1.5">
          <input
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Note (optional) — e.g. customer met them at the back gate"
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
          <div className="flex gap-2">
            <button type="button" onClick={handleReview} disabled={busy}
              className="text-[11px] font-semibold bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
              {busy ? 'Saving…' : 'Save review'}
            </button>
            <button type="button" onClick={() => { setReviewing(false); setNote(''); setError(null) }}
              className="text-[11px] font-semibold text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
