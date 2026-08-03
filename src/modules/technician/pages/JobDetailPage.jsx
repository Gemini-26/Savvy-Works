import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Phone, Clock, Camera, Trash2, Paperclip } from 'lucide-react'
import { fetchMyAppointment, respondToAppointment, clockIn, clockOut, PENDING_RESPONSE_STATUSES } from '../services/technicianService'
import { fetchJobPhotos, uploadJobPhoto, deleteJobPhoto, fetchJobDocuments, uploadJobDocument, deleteJobDocument } from '../../jobs/services/jobService'
import CompleteJobModal from '../../jobs/components/CompleteJobModal'
import ConfirmDialog from '../../../shared/components/ConfirmDialog'
import { formatDateLong, formatTime } from '../../../shared/utils/formatDate'

export default function JobDetailPage({ profile }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [appt, setAppt] = useState(null)
  const [photos, setPhotos] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [docBusy, setDocBusy] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [confirmClockOut, setConfirmClockOut] = useState(false)
  const [photoTab, setPhotoTab] = useState('before')
  const fileRef = useRef(null)
  const docFileRef = useRef(null)

  async function load() {
    const data = await fetchMyAppointment(id, profile.id)
    setAppt(data)
    if (data?.job_id) {
      setPhotos(await fetchJobPhotos(data.job_id))
      setDocuments(await fetchJobDocuments(data.job_id))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function respond(status) {
    setBusy(true)
    try {
      await respondToAppointment(appt.id, status)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleClockIn() {
    setBusy(true)
    try { await clockIn(appt.assignmentId); await load() } finally { setBusy(false) }
  }

  async function handleClockOut() {
    setBusy(true)
    try {
      await clockOut(appt.assignmentId)
      await load()
    } finally {
      setBusy(false)
      setConfirmClockOut(false)
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      await uploadJobPhoto(appt.job_id, file, photoTab)
      setPhotos(await fetchJobPhotos(appt.job_id))
    } finally {
      setBusy(false)
      e.target.value = ''
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
  if (!appt) return <div className="p-4 text-sm text-red-600">Job not found.</div>

  const job = appt.jobs
  const isPending = PENDING_RESPONSE_STATUSES.includes(appt.status)
  const isAccepted = appt.status === 'accepted' || appt.status === 'on_route' || appt.status === 'on_site'
  const isPendingConfirmation = job?.status === 'pending_confirmation'
  const isCompleted = job?.status === 'completed' || job?.status === 'invoiced'
  const canManagePhotos = !isCompleted
  const beforePhotos = photos.filter(p => (p.stage || 'before') === 'before')
  const afterPhotos = photos.filter(p => p.stage === 'after')
  const hasBeforeAfter = beforePhotos.length > 0 && afterPhotos.length > 0
  const visiblePhotos = photoTab === 'before' ? beforePhotos : afterPhotos

  return (
    <div className="pb-6">
      <div className="sticky top-0 bg-gray-50 px-4 py-3 flex items-center gap-2 border-b border-gray-200 z-10">
        <button onClick={() => navigate(-1)} className="p-1 text-gray-500"><ArrowLeft size={18} /></button>
        <h1 className="text-sm font-bold text-gray-900 truncate">{job?.title || job?.job_ref}</h1>
      </div>

      <div className="p-4 space-y-4">
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
          {appt.notes && <p className="text-sm text-gray-500 pt-1 border-t border-gray-100">{appt.notes}</p>}
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
              <button disabled={busy} onClick={handleClockIn} className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50">
                Clock In
              </button>
            ) : (
              <button
                disabled={busy || !hasBeforeAfter}
                title={!hasBeforeAfter ? 'Upload at least one Before and one After photo to complete the job' : undefined}
                onClick={() => setShowComplete(true)}
                className="flex-1 bg-green-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50"
              >
                Complete Job
              </button>
            )}
          </div>
        )}

        {isAccepted && !isCompleted && !isPendingConfirmation && !hasBeforeAfter && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            You must upload at least one "Before Job" and one "After Job" photo before you can complete this job.
          </p>
        )}

        {isPendingConfirmation && (
          <div className="flex gap-3">
            <button disabled className="flex-1 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold py-2.5 rounded-lg cursor-not-allowed">
              Awaiting admin approval
            </button>
            {!appt.actual_end && (
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
            {!appt.actual_end && (
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
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Photos</p>

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

          {canManagePhotos && (
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-xs font-medium text-blue-600">
              <Camera size={14} /> Add {photoTab === 'before' ? 'Before' : 'After'} Photo
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleUpload} />

          {visiblePhotos.length === 0 ? (
            <p className="text-sm text-gray-400">No {photoTab} photos yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
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
