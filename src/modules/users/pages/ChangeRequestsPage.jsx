import { useEffect, useState } from 'react'
import { ShieldCheck, Check, X } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import { getCurrentProfile } from '../../../services/authService'
import { requestSystemChange, fetchSystemChangeRequests, resolveSystemChangeRequest } from '../services/systemChangeRequestService'
import { formatDate, formatTime } from '../../../shared/utils/formatDate'

const STATUS_COLORS = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function ChangeRequestsPage() {
  const [profile, setProfile] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState(null)

  function load() {
    return fetchSystemChangeRequests().then(setRequests)
  }

  useEffect(() => {
    Promise.all([getCurrentProfile(), load()])
      .then(([p]) => setProfile(p))
      .catch(err => setError(err.message || 'Failed to load requests'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await requestSystemChange({ title: title.trim(), description: description.trim() })
      setTitle('')
      setDescription('')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResolve(req, status) {
    setBusyId(req.id)
    try {
      await resolveSystemChangeRequest(req.id, status, {
        requestedBy: req.requested_by,
        title: req.title,
      })
      await load()
    } catch (err) {
      setError(err.message || 'Failed to update request')
    } finally {
      setBusyId(null)
    }
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <PageContainer>
      <PageHeader
        title="Change Requests"
        subtitle="Request approval from an admin before making important system changes — like the security team recommends."
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mt-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 mt-4">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <ShieldCheck size={16} /> Request Approval for a Change
        </div>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="What change do you want to make?"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
          required
        />
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Details (optional) — what's changing and why"
          rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
        />
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-400 mt-4">Loading…</p>
      ) : requests.length === 0 ? (
        <EmptyState title="No requests yet" description="Submitted change requests will show up here." />
      ) : (
        <div className="space-y-3 mt-4">
          {requests.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">{r.title}</p>
                  {r.description && <p className="text-sm text-gray-600 mt-1">{r.description}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {r.requested_by_profile?.full_name || 'Someone'} · {formatDate(r.requested_at)} {formatTime(r.requested_at)}
                  </p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize shrink-0 ${STATUS_COLORS[r.status]}`}>
                  {r.status}
                </span>
              </div>

              {isAdmin && r.status === 'pending' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    disabled={busyId === r.id}
                    onClick={() => handleResolve(r, 'approved')}
                    className="flex items-center gap-1.5 bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    disabled={busyId === r.id}
                    onClick={() => handleResolve(r, 'rejected')}
                    className="flex items-center gap-1.5 bg-white border border-gray-200 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
