import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, MapPin, Phone, Clock, Camera, Trash2, Paperclip, Loader2, CalendarPlus, RotateCcw } from 'lucide-react'
import { fetchMyAppointment, fetchMyJobVisits, bookFollowUpVisit, respondToAppointment, updateAppointmentStatus, clockIn, clockOut, PENDING_RESPONSE_STATUSES } from '../services/technicianService'
import { useRefreshOnFocus } from '../../../shared/hooks/useRefreshOnFocus'
import { APPOINTMENT_STATUS_META, TECH_UPDATABLE_STATUSES, PAUSED_STATUSES } from '../../../shared/constants/appointmentStatuses'
import { fetchJobPhotos, uploadJobPhotos, deleteJobPhoto, fetchJobDocuments, uploadJobDocument, deleteJobDocument } from '../../jobs/services/jobService'
import { fetchAssignmentTeamMembers, setAssignmentTeamMembers } from '../../users/services/teamMembersService'
import CompleteJobModal from '../../jobs/components/CompleteJobModal'
import SelectTeamModal from '../components/SelectTeamModal'
import BookVisitModal from '../components/BookVisitModal'
import ConfirmDialog from '../../../shared/components/ConfirmDialog'
import PhotoPicker from '../../../shared/components/PhotoPicker'
import { formatDateLong, formatTime, toDateStr } from '../../../shared/utils/formatDate'
import { dayKeyFor, pictureDayKeys, pictureDayLabel } from '../../../shared/utils/photoDays'
import { formatHoursDuration } from '../../../shared/utils/shiftSummary'
import { technicianGeoNotice } from '../../../shared/utils/geoCheck'
import { isSitePinConfirmed } from '../../../shared/utils/siteLocation'
import { isReturnVisit } from '../../../shared/utils/returnVisit'
import SiteLocationCard from '../components/SiteLocationCard'

export default function JobDetailPage({ profile }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [appt, setAppt] = useState(null)
  const [photos, setPhotos] = useState([])
  // This technician's visits on the same job — drives the picture-day tabs and
  // the "booked next" list.
  const [visits, setVisits] = useState([])
  const [documents, setDocuments] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [docBusy, setDocBusy] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [showSelectTeam, setShowSelectTeam] = useState(false)
  const [showEditTeam, setShowEditTeam] = useState(false)
  const [confirmClockOut, setConfirmClockOut] = useState(false)
  const [photoTab, setPhotoTab] = useState('before')
  // Which day's pictures are showing; null means today.
  const [photoDay, setPhotoDay] = useState(null)
  const [showBookVisit, setShowBookVisit] = useState(false)
  // Photos still uploading: local previews shown straight away in the grid.
  const [pendingPhotos, setPendingPhotos] = useState([])
  const [photoProgress, setPhotoProgress] = useState(null)
  const [photoError, setPhotoError] = useState(null)
  // Shown after a clock-in/out whose location check wasn't clean.
  const [geoNotice, setGeoNotice] = useState(null)
  const docFileRef = useRef(null)

  async function load() {
    const data = await fetchMyAppointment(id, profile.id)
    setAppt(data)
    if (data?.job_id) {
      setPhotos(await fetchJobPhotos(data.job_id))
      setDocuments(await fetchJobDocuments(data.job_id))
      setVisits(await fetchMyJobVisits(data.job_id, profile.id).catch(() => []))
    }
    if (data?.assignmentId) {
      setTeamMembers(await fetchAssignmentTeamMembers(data.assignmentId))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])
  // Only the assignment itself, not photos/docs — enough to notice the visit
  // was deleted or this technician taken off it while the page was open.
  useRefreshOnFocus(() => {
    fetchMyAppointment(id, profile.id).then(setAppt).catch(() => {})
  })

  async function respond(status) {
    setBusy(true)
    try {
      await respondToAppointment(appt.id, status)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function updateStatus(status) {
    setBusy(true)
    try {
      await updateAppointmentStatus(appt.id, status)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleClockInConfirm(selectedTeamMemberIds) {
    setBusy(true)
    try {
      const geo = await clockIn(appt.assignmentId)
      setGeoNotice(technicianGeoNotice(geo, 'clocked in', isSitePinConfirmed(appt.jobs)))
      await setAssignmentTeamMembers(appt.assignmentId, selectedTeamMemberIds)
      if (appt.status !== 'on_site') {
        await updateAppointmentStatus(appt.id, 'on_site')
      }
      await load()
    } finally {
      setBusy(false)
      setShowSelectTeam(false)
    }
  }

  async function handleEditTeamConfirm(selectedTeamMemberIds) {
    setBusy(true)
    try {
      await setAssignmentTeamMembers(appt.assignmentId, selectedTeamMemberIds)
      await load()
      setShowEditTeam(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleClockOut() {
    setBusy(true)
    try {
      const geo = await clockOut(appt.assignmentId)
      setGeoNotice(technicianGeoNotice(geo, 'clocked out', isSitePinConfirmed(appt.jobs)))
      await load()
    } finally {
      setBusy(false)
      setConfirmClockOut(false)
    }
  }

  async function handlePhotoFiles(files) {
    const stage = photoTab
    const previews = files.map((file, i) => ({ key: `${Date.now()}_${i}`, stage, url: URL.createObjectURL(file) }))
    setPendingPhotos(prev => [...prev, ...previews])
    setPhotoError(null)
    setPhotoProgress({ done: 0, total: files.length })
    try {
      const { failed } = await uploadJobPhotos(appt.job_id, files, stage, (done, total) => setPhotoProgress({ done, total }))
      setPhotos(await fetchJobPhotos(appt.job_id))
      if (failed.length) {
        setPhotoError(`${failed.length} of ${files.length} photo${files.length === 1 ? '' : 's'} failed to upload — check your signal and try again.`)
      }
    } catch (err) {
      setPhotoError(err.message || 'Photo upload failed')
    } finally {
      previews.forEach(p => URL.revokeObjectURL(p.url))
      setPendingPhotos(prev => prev.filter(p => !previews.includes(p)))
      setPhotoProgress(null)
    }
  }

  async function handleDeletePhoto(photo) {
    setBusy(true)
    try {
      await deleteJobPhoto(photo)
      setPhotos(await fetchJobPhotos(appt.job_id))
    } finally {
      setBusy(false)
    }
  }

  async function handleBookVisit(values) {
    await bookFollowUpVisit({
      jobId: appt.job_id,
      technicianId: profile.id,
      jobLabel: appt.jobs?.title || appt.jobs?.job_ref,
      ...values,
    })
    setVisits(await fetchMyJobVisits(appt.job_id, profile.id).catch(() => visits))
    setShowBookVisit(false)
  }

  async function handleDocUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setDocBusy(true)
    try {
      await uploadJobDocument(appt.job_id, file)
      setDocuments(await fetchJobDocuments(appt.job_id))
    } finally {
      setDocBusy(false)
      e.target.value = ''
    }
  }

  async function handleDeleteDocument(doc) {
    setDocBusy(true)
    try {
      await deleteJobDocument(doc)
      setDocuments(await fetchJobDocuments(appt.job_id))
    } finally {
      setDocBusy(false)
    }
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading…</div>
  if (!appt) return <div className="p-4 text-sm text-gray-600">This job is no longer assigned to you — it may have been removed or reassigned by the office.</div>

  const job = appt.jobs
  const statusMeta = APPOINTMENT_STATUS_META[appt.status]
  const isPending = PENDING_RESPONSE_STATUSES.includes(appt.status)
  // Paused statuses (On Hold, No Access…) stay actionable so the technician
  // can resume, or complete, the job once the blocker is cleared.
  const isPaused = PAUSED_STATUSES.includes(appt.status)
  const isAccepted = appt.status === 'accepted' || appt.status === 'on_route' || appt.status === 'on_site' || isPaused
  // A visit booked on a job that was already signed off is worked like a new
  // job, so the job's earlier sign-off must not lock it.
  const isReturn = isReturnVisit(job, appt.status, [appt.actual_start])
  const isPendingConfirmation = job?.status === 'pending_confirmation' && !isReturn
  const isCompleted = (job?.status === 'completed' || job?.status === 'invoiced') && !isReturn
  const canManagePhotos = !isCompleted
  // Pictures are filed by the day they were taken. Each day needs its own
  // before and after, so completing the job looks at today's only.
  const todayKey = toDateStr(new Date())
  const isBefore = p => (p.stage || 'before') === 'before'
  const isAfter = p => p.stage === 'after'
  const photosByDay = new Map()
  for (const p of photos) {
    const key = dayKeyFor(p.created_at, todayKey)
    photosByDay.set(key, [...(photosByDay.get(key) || []), p])
  }
  const todaysPhotos = photosByDay.get(todayKey) || []
  const hasBeforeAfter = todaysPhotos.some(isBefore) && todaysPhotos.some(isAfter)
  const photoDayKeys = pictureDayKeys(photos, visits, todayKey)
  const activeDay = photoDay && photoDayKeys.includes(photoDay) ? photoDay : todayKey
  const isToday = activeDay === todayKey
  const dayPhotos = photosByDay.get(activeDay) || []
  const beforePhotos = dayPhotos.filter(isBefore)
  const afterPhotos = dayPhotos.filter(isAfter)
  const visiblePhotos = photoTab === 'before' ? beforePhotos : afterPhotos
  const visiblePending = isToday ? pendingPhotos.filter(p => p.stage === photoTab) : []
  const canBookVisit = isAccepted && !isCompleted && !isPendingConfirmation
  const bookedNext = visits.filter(v => v.id !== appt.id && toDateStr(v.scheduled_start) >= todayKey)
  const visitsBase = location.pathname.startsWith('/my-jobs') ? '/my-jobs' : '/jobs'
  // Team members clock in and out with the technician, so everyone on this
  // assignment shares one on-site window.
  const onSiteMs = appt.actual_start && appt.actual_end
    ? new Date(appt.actual_end) - new Date(appt.actual_start)
    : null
  const onSiteLabel = appt.actual_start
    ? `${formatTime(appt.actual_start)} – ${appt.actual_end ? formatTime(appt.actual_end) : 'now'}${onSiteMs !== null ? ` · ${formatHoursDuration(onSiteMs)}` : ''}`
    : null

  return (
    <div className="pb-6">
      <div className="sticky top-0 bg-gray-50 px-4 py-3 flex items-center gap-2 border-b border-gray-200 z-10">
        <button onClick={() => navigate(-1)} className="p-1 text-gray-500"><ArrowLeft size={18} /></button>
        <h1 className="text-sm font-bold text-gray-900 truncate flex-1">{job?.title || job?.job_ref}</h1>
        {statusMeta && (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full text-white shrink-0" style={{ backgroundColor: statusMeta.dot }}>
            {statusMeta.label}
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {geoNotice && (
          <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
            geoNotice.tone === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-800'
              : geoNotice.tone === 'green' ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}>
            <MapPin size={14} className="mt-0.5 shrink-0" />
            <p className="flex-1">{geoNotice.text}</p>
            <button type="button" onClick={() => setGeoNotice(null)} className="text-xs font-semibold shrink-0">Dismiss</button>
          </div>
        )}

        {isReturn && (
          <div className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">
            <RotateCcw size={14} className="mt-0.5 shrink-0" />
            <p className="flex-1">
              <span className="font-semibold">Return visit.</span>{' '}
              This job was signed off{job.completed_at ? ` on ${formatDateLong(job.completed_at)}` : ''}, and you're booked back on it. Work it like a new job: clock in, take today's before and after pictures, and sign it off again when you're done. Earlier days' pictures stay under their own tab.
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <p className="text-sm font-bold text-gray-900">{job?.customers?.customer_name}</p>
          {(job?.customers?.mobile || job?.customers?.telephone) && (
            <a href={`tel:${job.customers.mobile || job.customers.telephone}`} className="flex items-center gap-2 text-sm text-blue-600">
              <Phone size={14} /> {job.customers.mobile || job.customers.telephone}
            </a>
          )}
          {job?.site_address && (
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin size={14} className="mt-0.5 shrink-0" />
              <span>{job.site_address}{job.site_city ? `, ${job.site_city}` : ''}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock size={14} />
            {formatDateLong(appt.scheduled_start)}, {formatTime(appt.scheduled_start)}–{formatTime(appt.scheduled_end)}
          </div>
          {job && !isCompleted && <SiteLocationCard job={job} />}
          {appt.notes && <p className="text-sm text-gray-500 pt-1 border-t border-gray-100">{appt.notes}</p>}
          {(appt.actual_start || teamMembers.length > 0) && (
            <div className="pt-2 border-t border-gray-100 space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">On site</p>
              {appt.actual_start && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-800 truncate">{profile.full_name} <span className="text-xs text-gray-400">· you</span></span>
                  <span className="text-xs text-gray-500 shrink-0">{onSiteLabel}</span>
                </div>
              )}
              {appt.actual_start && !isCompleted && !isPendingConfirmation && (
                <button type="button" onClick={() => setShowEditTeam(true)} className="text-xs font-semibold text-blue-600">
                  + Add / edit team members
                </button>
              )}
              {teamMembers.map(m => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-800 truncate">
                    {m.full_name}
                    {m.is_casual && <span className="ml-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 align-middle">Casual</span>}
                    {m.role_title && <span className="text-xs text-gray-400"> · {m.role_title}</span>}
                  </span>
                  <span className="text-xs text-gray-500 shrink-0">{appt.actual_start ? onSiteLabel : 'Not clocked in'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {isPending && (
          <div className="flex gap-3">
            <button disabled={busy} onClick={() => respond('accepted')} className="flex-1 bg-green-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50">
              Accept Job
            </button>
            <button disabled={busy} onClick={() => respond('declined')} className="flex-1 bg-white border border-red-300 text-red-600 text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50">
              Decline
            </button>
          </div>
        )}

        {isAccepted && !isCompleted && !isPendingConfirmation && (
          <div className="flex gap-3">
            {!appt.actual_start ? (
              <button disabled={busy} onClick={() => setShowSelectTeam(true)} className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50">
                Clock In
              </button>
            ) : (
              <button
                disabled={busy || !hasBeforeAfter}
                title={!hasBeforeAfter ? "Upload at least one Before and one After photo today to complete the job" : undefined}
                onClick={() => setShowComplete(true)}
                className="flex-1 bg-green-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50"
              >
                Complete Job
              </button>
            )}
          </div>
        )}

        {isAccepted && !isCompleted && !isPendingConfirmation && (
          <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Update Status</p>
            {isPaused && (
              <button
                disabled={busy}
                onClick={() => updateStatus(appt.actual_start ? 'on_site' : 'accepted')}
                className="w-full bg-green-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50"
              >
                Resume Job
              </button>
            )}
            {appt.status === 'accepted' && (
              <button
                disabled={busy}
                onClick={() => updateStatus('on_route')}
                className="w-full bg-orange-500 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50"
              >
                🚐 On Route — Notify Customer
              </button>
            )}
            <select
              disabled={busy}
              value=""
              onChange={e => e.target.value && updateStatus(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-600"
            >
              <option value="">More status options…</option>
              {TECH_UPDATABLE_STATUSES.filter(s => s !== appt.status).map(s => (
                <option key={s} value={s}>{APPOINTMENT_STATUS_META[s].label}</option>
              ))}
            </select>
          </div>
        )}

        {isAccepted && !isCompleted && !isPendingConfirmation && !hasBeforeAfter && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            You must upload at least one "Before Job" and one "After Job" photo today before you can complete this job.
          </p>
        )}

        {canBookVisit && (
          <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Work continues another day?</p>
            {bookedNext.length > 0 && (
              <div className="space-y-1">
                {bookedNext.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => navigate(`${visitsBase}/${v.id}`)}
                    className="w-full flex items-center justify-between text-sm text-left bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <span className="text-gray-800">{formatDateLong(v.scheduled_start)}</span>
                    <span className="text-xs text-gray-500">{formatTime(v.scheduled_start)}–{formatTime(v.scheduled_end)}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowBookVisit(true)}
              className="w-full flex items-center justify-center gap-1.5 bg-white border border-blue-300 text-blue-600 text-sm font-semibold py-2.5 rounded-lg"
            >
              <CalendarPlus size={16} /> Book Another Day
            </button>
          </div>
        )}

        {isPendingConfirmation && (
          <div className="flex gap-3">
            <button disabled className="flex-1 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold py-2.5 rounded-lg cursor-not-allowed">
              Awaiting admin approval
            </button>
            {appt.actual_start && !appt.actual_end && (
              <button
                disabled={busy}
                onClick={() => setConfirmClockOut(true)}
                className="flex-1 bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50"
              >
                Clock Out
              </button>
            )}
          </div>
        )}

        {isCompleted && (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-lg">
              Job completed{job.sign_off_name ? ` — signed off by ${job.sign_off_name}` : ''}
            </div>
            {appt.actual_start && !appt.actual_end && (
              <button
                disabled={busy}
                onClick={() => setConfirmClockOut(true)}
                className="w-full bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50"
              >
                Clock Out
              </button>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pictures</p>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {photoDayKeys.map(key => {
              const count = (photosByDay.get(key) || []).length
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPhotoDay(key)}
                  className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap ${key === activeDay ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
                >
                  {pictureDayLabel(key, todayKey)}{count > 0 && ` (${count})`}
                </button>
              )
            })}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setPhotoTab('before')}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border ${photoTab === 'before' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              Before Job {beforePhotos.length > 0 && `(${beforePhotos.length})`}
            </button>
            <button
              onClick={() => setPhotoTab('after')}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border ${photoTab === 'after' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              After Job {afterPhotos.length > 0 && `(${afterPhotos.length})`}
            </button>
          </div>

          {canManagePhotos && isToday && (
            <div className="flex items-center justify-between gap-2">
              <PhotoPicker onFiles={handlePhotoFiles} className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 py-1">
                <Camera size={16} /> Add {photoTab === 'before' ? 'Before' : 'After'} Photos
              </PhotoPicker>
              {photoProgress && (
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Loader2 size={13} className="animate-spin" />
                  Uploading {Math.min(photoProgress.done + 1, photoProgress.total)} of {photoProgress.total}…
                </span>
              )}
            </div>
          )}
          {!isToday && (
            <p className="text-xs text-gray-500">Past days are view-only. New pictures are added under Today's Pictures.</p>
          )}
          {photoError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{photoError}</p>
          )}

          {visiblePhotos.length === 0 && visiblePending.length === 0 ? (
            <p className="text-sm text-gray-400">
              No {photoTab} photos {isToday ? 'yet' : 'were added on this day'}.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {visiblePending.map(p => (
                <div key={p.key} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                  <img src={p.url} alt="Uploading" className="w-full h-full object-cover opacity-60" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 size={22} className="animate-spin text-white drop-shadow" />
                  </div>
                </div>
              ))}
              {visiblePhotos.map(photo => {
                const isAdminPhoto = photo.profiles?.role === 'admin'
                const isOwnPhoto = photo.uploaded_by === profile.id
                return (
                  <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                    {photo.url && <img src={photo.url} alt={photo.file_name} className="w-full h-full object-cover" />}
                    <span className={`absolute bottom-1 left-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${isAdminPhoto ? 'bg-purple-600/90 text-white' : 'bg-blue-600/90 text-white'}`}>
                      {isAdminPhoto ? 'Admin' : 'Technician'}
                    </span>
                    {canManagePhotos && isOwnPhoto && (
                      <button
                        onClick={() => handleDeletePhoto(photo)}
                        className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Documents</p>

          <button onClick={() => docFileRef.current?.click()} className="flex items-center gap-1 text-xs font-medium text-blue-600">
            <Paperclip size={14} /> Add Document
          </button>
          <input ref={docFileRef} type="file" className="hidden" onChange={handleDocUpload} />

          {documents.length === 0 ? (
            <p className="text-sm text-gray-400">No documents yet.</p>
          ) : (
            <div className="space-y-1.5">
              {documents.map(doc => {
                const isAdminDoc = doc.profiles?.role === 'admin'
                const isOwnDoc = doc.uploaded_by === profile.id
                return (
                  <div key={doc.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                    <a href={doc.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 truncate flex-1 min-w-0">
                      📄 {doc.file_name}
                    </a>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ml-2 shrink-0 ${isAdminDoc ? 'bg-purple-600/90 text-white' : 'bg-blue-600/90 text-white'}`}>
                      {isAdminDoc ? 'Admin' : 'Technician'}
                    </span>
                    {isOwnDoc && (
                      <button
                        disabled={docBusy}
                        onClick={() => handleDeleteDocument(doc)}
                        className="ml-2 text-gray-400 hover:text-red-600 shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {showComplete && (
        <CompleteJobModal
          jobId={appt.job_id}
          signOffName={profile.full_name}
          onClose={() => setShowComplete(false)}
          onCompleted={load}
        />
      )}

      {showSelectTeam && (
        <SelectTeamModal
          busy={busy}
          onConfirm={handleClockInConfirm}
          onClose={() => setShowSelectTeam(false)}
        />
      )}

      {showEditTeam && (
        <SelectTeamModal
          busy={busy}
          existing={teamMembers}
          onConfirm={handleEditTeamConfirm}
          onClose={() => setShowEditTeam(false)}
        />
      )}

      {showBookVisit && (
        <BookVisitModal
          appointment={appt}
          onConfirm={handleBookVisit}
          onClose={() => setShowBookVisit(false)}
        />
      )}

      {confirmClockOut && (
        <ConfirmDialog
          title="Clock out on site?"
          message="This records the time you finished on site for this job."
          confirmLabel="Clock Out"
          busy={busy}
          onConfirm={handleClockOut}
          onCancel={() => setConfirmClockOut(false)}
        />
      )}
    </div>
  )
}
