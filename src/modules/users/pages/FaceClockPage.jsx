import { useEffect, useMemo, useState } from 'react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import ConfirmDialog from '../../../shared/components/ConfirmDialog'
import FaceEnrolFlow from '../../../shared/components/FaceEnrolFlow'
import { fetchProfiles } from '../services/profileService'
import { fetchTeamMembers } from '../services/teamMembersService'
import {
  fetchFaceChecks, fetchFaceCheckPhotoUrls, fetchFaceEnrolment, reviewFaceCheck, removeFace,
} from '../../../shared/services/faceService'
import { FACE_STATUS, FACE_KIND_LABEL, describeSkipReason, isFaceFlagged } from '../../../shared/utils/faceCheck'
import { formatDateTime } from '../../../shared/utils/formatDate'

const TONE = {
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-800',
  gray:  'bg-gray-100 text-gray-600',
}

const TABS = [
  { id: 'review', label: 'To review' },
  { id: 'all',    label: 'All checks' },
  { id: 'people', label: 'Who is set up' },
]

function CheckCard({ check, photoUrl, onReviewed }) {
  const [reviewing, setReviewing] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const status = FACE_STATUS[check.status] || FACE_STATUS.not_enrolled
  const name = check.profiles?.full_name || check.team_members?.full_name || 'Unknown'
  const flagged = isFaceFlagged(check)

  async function handleReview() {
    setBusy(true)
    setError(null)
    try {
      await reviewFaceCheck(check.id, note)
      await onReviewed()
    } catch (err) {
      setError(err.message || 'Failed to save review')
      setBusy(false)
    }
  }

  return (
    <div className={`bg-white rounded-xl border p-3 flex gap-3 ${flagged ? 'border-amber-300' : 'border-gray-200'}`}>
      {photoUrl ? (
        <a href={photoUrl} target="_blank" rel="noreferrer" className="shrink-0">
          <img src={photoUrl} alt={`Selfie of ${name}`} className="w-20 h-20 rounded-lg object-cover bg-gray-100" />
        </a>
      ) : (
        <div className="w-20 h-20 rounded-lg bg-gray-100 text-gray-400 text-[11px] flex items-center justify-center text-center shrink-0 px-1">
          {check.status === 'skipped' ? 'No selfie' : 'No photo'}
        </div>
      )}

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
          <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TONE[status.tone]}`}>{status.label}</span>
        </div>
        <p className="text-xs text-gray-500">
          {FACE_KIND_LABEL[check.kind] || check.kind} · {formatDateTime(check.created_at)}
          {check.kind === 'team_in' && check.recorded_by_name && <> · scanned on {check.recorded_by_name}’s phone</>}
        </p>

        <div className="text-[11px] space-y-0.5">
          {check.distance != null && (
            <p className="text-gray-500">Difference from the face on file: {Number(check.distance).toFixed(2)} (under 0.50 counts as the same person)</p>
          )}
          {check.liveness === false && <p className="text-amber-700">Blink test was bypassed</p>}
          {check.status === 'skipped' && check.skip_reason && (
            <p className="text-amber-700">Skipped: {describeSkipReason(check.skip_reason)}</p>
          )}
        </div>

        {check.reviewed_at && (
          <p className="text-[11px] text-green-700">
            ✓ Reviewed by {check.reviewed_by_name || 'an admin'} · {formatDateTime(check.reviewed_at)}
            {check.review_note && <span className="text-gray-600"> — “{check.review_note}”</span>}
          </p>
        )}

        {flagged && !reviewing && (
          <button type="button" onClick={() => setReviewing(true)} className="text-[11px] font-semibold text-blue-600 hover:text-blue-700">
            Mark reviewed
          </button>
        )}

        {reviewing && (
          <div className="pt-1 space-y-1.5">
            <input
              autoFocus
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Note (optional) — e.g. phone camera was dirty, confirmed in person"
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
    </div>
  )
}

function PersonRow({ name, sub, enrolment, onSetUp, onRemove }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
        <p className="text-xs text-gray-500 truncate">{sub}</p>
      </div>
      <div className="text-xs text-right text-gray-500 hidden sm:block">
        {enrolment
          ? <>Set up {formatDateTime(enrolment.o_enrolled_at)}<br />by {enrolment.o_enrolled_by_name}</>
          : 'Not set up'}
      </div>
      <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${enrolment ? TONE.green : TONE.gray}`}>
        {enrolment ? 'Set up' : 'Not yet'}
      </span>
      <div className="flex gap-3 shrink-0">
        <button type="button" onClick={onSetUp} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
          {enrolment ? 'Redo' : 'Set up'}
        </button>
        {enrolment && (
          <button type="button" onClick={onRemove} className="text-xs font-semibold text-red-600 hover:text-red-700">
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

// Admin view of face clock-in: the checks that need a look, every check with
// its selfie, and who has a face on file. Raw face data is never shown (or
// readable) — only whether it exists.
export default function FaceClockPage() {
  const [tab, setTab] = useState('review')
  const [review, setReview] = useState([])
  const [all, setAll] = useState([])
  const [photos, setPhotos] = useState({})
  const [people, setPeople] = useState([])
  const [team, setTeam] = useState([])
  const [enrolment, setEnrolment] = useState({ rows: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [enrolling, setEnrolling] = useState(null)   // { kind: 'profile' | 'team', row }
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)

  // Bumped to reload everything after a review, set-up or removal.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey(k => k + 1)

  useEffect(() => {
    let cancelled = false
    async function fetchEverything() {
      const [flagged, recent, overview, profiles, members] = await Promise.all([
        fetchFaceChecks({ flaggedOnly: true, limit: 200 }),
        fetchFaceChecks({ limit: 200 }),
        fetchFaceEnrolment(),
        fetchProfiles(true),
        fetchTeamMembers(true),
      ])
      const photoUrls = await fetchFaceCheckPhotoUrls([...flagged, ...recent].map(c => c.photo_path))
      return { flagged, recent, overview, profiles, members, photoUrls }
    }
    fetchEverything()
      .then(d => {
        if (cancelled) return
        setReview(d.flagged)
        setAll(d.recent)
        setEnrolment(d.overview)
        setPeople(d.profiles.data || [])
        setTeam(d.members)
        setPhotos(d.photoUrls)
        setError(null)
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load face checks') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reloadKey])

  const enrolmentFor = useMemo(() => {
    const byProfile = new Map(enrolment.rows.filter(r => r.o_profile_id).map(r => [r.o_profile_id, r]))
    const byTeam = new Map(enrolment.rows.filter(r => r.o_team_member_id).map(r => [r.o_team_member_id, r]))
    return { profile: id => byProfile.get(id), team: id => byTeam.get(id) }
  }, [enrolment])

  async function handleRemove() {
    setBusy(true)
    try {
      await removeFace(removing.kind === 'profile' ? { profileId: removing.row.id } : { teamMemberId: removing.row.id })
      setRemoving(null)
      reload()
    } catch (err) {
      setError(err.message || 'Failed to remove the face')
      setRemoving(null)
    } finally {
      setBusy(false)
    }
  }

  const list = tab === 'review' ? review : all

  return (
    <PageContainer>
      <PageHeader
        title="Face Clock-in"
        subtitle="Selfie checks from clock-ins. Wrong faces and skipped checks are flagged here; nothing ever blocks someone from clocking in."
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mt-4">{error}</div>
      )}

      <div className="flex gap-1 border-b border-gray-200 mt-4">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
            {t.id === 'review' && review.length > 0 && (
              <span className="ml-1.5 text-[11px] bg-amber-500 text-white rounded-full px-1.5 py-0.5 align-middle">{review.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 mt-4">Loading…</p>
      ) : tab === 'people' ? (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-gray-500">
            Setting up someone here uses this device’s camera. Technicians can also set up their own face the first time they clock in, and team members from the clock-in screen on a technician’s phone.
          </p>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            <p className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-gray-500 bg-gray-50 rounded-t-xl">Users</p>
            {people.map(p => (
              <PersonRow
                key={p.id}
                name={p.full_name}
                sub={p.role}
                enrolment={enrolmentFor.profile(p.id)}
                onSetUp={() => setEnrolling({ kind: 'profile', row: p })}
                onRemove={() => setRemoving({ kind: 'profile', row: p })}
              />
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            <p className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-gray-500 bg-gray-50 rounded-t-xl">Team members</p>
            {team.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No active team members.</p>}
            {team.map(m => (
              <PersonRow
                key={m.id}
                name={m.full_name}
                sub={m.role_title || 'Team member'}
                enrolment={enrolmentFor.team(m.id)}
                onSetUp={() => setEnrolling({ kind: 'team', row: m })}
                onRemove={() => setRemoving({ kind: 'team', row: m })}
              />
            ))}
          </div>
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title={tab === 'review' ? 'Nothing to review' : 'No face checks yet'}
          description={tab === 'review'
            ? 'Every face check so far matched, or has been reviewed.'
            : 'They appear here as people clock in with their face.'}
        />
      ) : (
        <div className="mt-4 space-y-2">
          {list.map(c => (
            <CheckCard key={c.id} check={c} photoUrl={photos[c.photo_path]} onReviewed={reload} />
          ))}
        </div>
      )}

      {enrolling && (
        <FaceEnrolFlow
          name={enrolling.row.full_name}
          profileId={enrolling.kind === 'profile' ? enrolling.row.id : null}
          teamMemberId={enrolling.kind === 'team' ? enrolling.row.id : null}
          self={false}
          onEnrolled={() => { setEnrolling(null); reload() }}
          onCancel={() => setEnrolling(null)}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.row.full_name}'s face?`}
          message="Their face data is deleted. Past selfies stay in the checks list. They can set it up again at any time."
          confirmLabel="Remove"
          busy={busy}
          onConfirm={handleRemove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </PageContainer>
  )
}
