import { useState, useEffect, Fragment } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { fetchJob, updateJob, deleteJob, fetchJobPhotos, uploadJobPhoto, deleteJobPhoto, confirmJobComplete, fetchJobItems, updateJobItems } from '../services/jobService'
import { useCustomers } from '../../../shared/hooks/useCustomers'
import { fetchAppointmentsForJob, clockInAssignment, clockOutAssignment } from '../../planner/services/appointmentService'
import AppointmentModal from '../../planner/components/AppointmentModal'
import CompleteJobModal from '../components/CompleteJobModal'
import { createInvoiceFromJob, findInvoiceForJob } from '../../finance/services/invoiceService'
import { fetchJobActivity } from '../../../shared/services/activityService'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { formatDateTime } from '../../../shared/utils/formatDate'
import { useItems } from '../../quotes/hooks/useItems'
import LineItemsEditor from '../../quotes/components/LineItemsEditor'

const JOB_TYPES  = ['New Job', 'Maintenance', 'Emergency', 'Inspection', 'Installation', 'Repair', 'Other']
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
const STATUSES   = ['New', 'Assigned', 'Scheduled', 'In Progress', 'On Hold', 'Pending Confirmation', 'Completed', 'Invoiced', 'Cancelled']
const COUNTRIES  = ['South Africa', 'Zimbabwe', 'Botswana', 'Namibia', 'Lesotho', 'Eswatini', 'Mozambique']
const TABS       = ['Job Details', 'Materials', 'Appointments', 'Activity', 'Attachments', 'Sign-off']

const inputCls    = 'w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'
const readonlyCls = 'w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-gray-50 text-gray-500 cursor-not-allowed'

const STATUS_COLORS = {
  new:         'bg-blue-100 text-blue-700',
  assigned:    'bg-purple-100 text-purple-700',
  scheduled:   'bg-indigo-100 text-indigo-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  on_hold:     'bg-gray-100 text-gray-600',
  pending_confirmation: 'bg-amber-100 text-amber-700',
  completed:   'bg-green-100 text-green-700',
  invoiced:    'bg-teal-100 text-teal-700',
  cancelled:   'bg-red-100 text-red-600',
}

const ACTIVITY_DOT_COLORS = {
  job_created:               'bg-blue-500',
  job_updated:                'bg-gray-400',
  technician_assigned:        'bg-indigo-500',
  technician_reassigned:      'bg-indigo-500',
  technician_accepted:        'bg-blue-500',
  technician_declined:        'bg-red-500',
  clocked_in:                 'bg-purple-500',
  clocked_out:                'bg-purple-500',
  photo_uploaded:             'bg-teal-500',
  photo_deleted:              'bg-red-400',
  job_completed_by_technician: 'bg-amber-500',
  job_confirmed_complete:     'bg-green-500',
}

function Field({ label, required, children }) {
  return (
    <div className="flex items-start gap-3">
      <label className="w-36 shrink-0 pt-1.5 text-sm text-gray-700 text-right">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function toDisplayStatus(raw) {
  if (!raw) return 'New'
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function toDbStatus(display) {
  return display.toLowerCase().replace(/ /g, '_')
}

function toDisplayPriority(raw) {
  if (!raw) return 'Medium'
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function formatDateInput(val) {
  if (!val) return ''
  return val.split('T')[0]
}

export default function JobDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const { customers } = useCustomers()
  const { profile: currentProfile, isAdmin } = useCurrentUser()
  const { items: catalogue } = useItems()

  const [editing,       setEditing]       = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,         setError]         = useState(null)
  const [activeTab,     setActiveTab]     = useState('Job Details')
  const [form,          setForm]          = useState(null)
  const [appointments,  setAppointments]  = useState([])
  const [apptLoading,   setApptLoading]   = useState(false)
  const [apptModal,     setApptModal]     = useState(false)
  const [editingAppt,   setEditingAppt]   = useState(null)
  const [completeModal, setCompleteModal] = useState(false)
  const [invoicing,     setInvoicing]     = useState(false)
  const [existingInvoice, setExistingInvoice] = useState(null)
  const [confirming,    setConfirming]    = useState(false)
  const [photos,        setPhotos]        = useState([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [activity,      setActivity]      = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [jobItems,      setJobItems]      = useState([])
  const [itemsLoading,  setItemsLoading]  = useState(false)
  const [itemsSaving,   setItemsSaving]   = useState(false)
  const [itemsDirty,    setItemsDirty]    = useState(false)

  useEffect(() => {
    fetchJob(id)
      .then(data => { setForm(dbToForm(data)); setLoading(false) })
      .catch(err  => { setError(err.message || 'Failed to load job'); setLoading(false) })
  }, [id])

  useEffect(() => {
    if (activeTab === 'Appointments') loadAppointments()
    if (activeTab === 'Attachments') loadPhotos()
    if (activeTab === 'Activity') loadActivity()
    if (activeTab === 'Materials') loadJobItems()
  }, [activeTab, id])

  async function loadJobItems() {
    setItemsLoading(true)
    try {
      const data = await fetchJobItems(id)
      setJobItems(data)
      setItemsDirty(false)
    } finally {
      setItemsLoading(false)
    }
  }

  function handleJobItemsChange(next) {
    setJobItems(next)
    setItemsDirty(true)
  }

  async function handleSaveJobItems() {
    setItemsSaving(true)
    try {
      await updateJobItems(id, jobItems)
      setItemsDirty(false)
    } catch (err) {
      setError(err.message || 'Failed to save materials')
    } finally {
      setItemsSaving(false)
    }
  }

  async function loadActivity() {
    setActivityLoading(true)
    try {
      const data = await fetchJobActivity(id)
      setActivity(data)
    } catch (_) {
      // silently fail — activity tab will show empty
    } finally {
      setActivityLoading(false)
    }
  }

  async function handleConfirmComplete() {
    setConfirming(true)
    try {
      await confirmJobComplete(id)
      await handleCompleted()
      if (activeTab === 'Activity') await loadActivity()
    } catch (err) {
      setError(err.message || 'Failed to confirm completion')
    } finally {
      setConfirming(false)
    }
  }

  async function loadAppointments() {
    setApptLoading(true)
    try {
      const data = await fetchAppointmentsForJob(id)
      setAppointments(data)
    } catch (_) {
      // silently fail — appointments tab will show empty
    } finally {
      setApptLoading(false)
    }
  }

  async function loadPhotos() {
    setPhotosLoading(true)
    try {
      const data = await fetchJobPhotos(id)
      setPhotos(data)
    } catch (_) {
      // silently fail — attachments tab will show empty
    } finally {
      setPhotosLoading(false)
    }
  }

  async function handlePhotoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoUploading(true)
    try {
      await uploadJobPhoto(id, file)
      await loadPhotos()
    } catch (err) {
      setError(err.message || 'Failed to upload photo')
    } finally {
      setPhotoUploading(false)
      e.target.value = ''
    }
  }

  async function handlePhotoDelete(photo) {
    try {
      await deleteJobPhoto(photo)
      setPhotos(prev => prev.filter(p => p.id !== photo.id))
    } catch (err) {
      setError(err.message || 'Failed to delete photo')
    }
  }

  async function handleCompleted() {
    const data = await fetchJob(id)
    setForm(dbToForm(data))
  }

  async function handleClockIn(assignmentId) {
    try {
      await clockInAssignment(assignmentId)
      await loadAppointments()
    } catch (err) {
      setError(err.message || 'Failed to clock in')
    }
  }

  async function handleClockOut(assignmentId) {
    try {
      await clockOutAssignment(assignmentId)
      await loadAppointments()
    } catch (err) {
      setError(err.message || 'Failed to clock out')
    }
  }

  async function handleCreateInvoice() {
    setInvoicing(true)
    setError(null)
    try {
      const existing = await findInvoiceForJob(id)
      if (existing) {
        setExistingInvoice(existing)
        setInvoicing(false)
        return
      }
      const invoice = await createInvoiceFromJob({ id, ...form })
      navigate(`/finance/invoices/${invoice.id}`)
    } catch (err) {
      setError(err.message || 'Failed to create invoice')
      setInvoicing(false)
    }
  }

  function dbToForm(d) {
    return {
      job_ref:            d.job_ref            ?? '',
      quote_id:           d.quote_id           ?? null,
      status:             toDisplayStatus(d.status),
      job_type:           d.job_type           ?? 'New Job',
      priority:           toDisplayPriority(d.priority),
      customer_id:        d.customer_id        ?? '',
      customer_ref:       d.customer_ref       ?? '',
      customer_job_ref:   d.customer_job_ref   ?? '',
      po_ref:             d.po_ref             ?? '',
      alert_by_email:     d.alert_by_email     ?? false,
      sms_alert:          d.sms_alert          ?? false,
      start_date:         formatDateInput(d.start_date),
      complete_by:        formatDateInput(d.complete_by),
      scheduled_for:      formatDateInput(d.scheduled_for),
      title:              d.title              ?? '',
      description:        d.description        ?? '',
      notes:              d.notes              ?? '',
      contact_name:       d.contact_name       ?? '',
      contact_email:      d.contact_email      ?? '',
      contact_telephone:  d.contact_telephone  ?? '',
      contact_mobile:     d.contact_mobile     ?? '',
      customer_type:      d.customer_type      ?? '',
      site_company:       d.site_company       ?? '',
      site_contact_name:  d.site_contact_name  ?? '',
      site_contact_email: d.site_contact_email ?? '',
      site_telephone:     d.site_telephone     ?? '',
      site_mobile:        d.site_mobile        ?? '',
      site_address:       d.site_address       ?? '',
      site_city:          d.site_city          ?? '',
      site_county:        d.site_county        ?? '',
      site_postcode:      d.site_postcode      ?? '',
      site_country:       d.site_country       ?? 'South Africa',
      site_notes:         d.site_notes         ?? '',
      completion_notes:   d.completion_notes   ?? '',
      materials_used:     d.materials_used     ?? '',
      sign_off_name:      d.sign_off_name      ?? '',
      sign_off_signature: d.sign_off_signature ?? '',
      completed_at:       d.completed_at       ?? '',
    }
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateJob(id, {
        ...form,
        status:      toDbStatus(form.status),
        priority:    form.priority.toLowerCase(),
        customer_id: form.customer_id || null,
        start_date:  form.start_date   || null,
        complete_by: form.complete_by  || null,
        scheduled_for: form.scheduled_for || null,
        customers:   undefined,
        completed_at: undefined,
      }, `Job details updated by ${currentProfile?.full_name || 'admin'}`)
      setEditing(false)
      if (activeTab === 'Activity') await loadActivity()
    } catch (err) {
      setError(err.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteJob(id)
      navigate(-1)
    } catch (err) {
      setError(err.message || 'Failed to delete job')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading) return <PageContainer><p className="text-sm text-gray-400 mt-8">Loading job…</p></PageContainer>
  if (!form)   return <PageContainer><p className="text-sm text-red-500 mt-8">{error || 'Job not found.'}</p></PageContainer>

  const ro        = !editing
  const statusKey = toDbStatus(form.status)

  return (
    <PageContainer>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">
          {form.title || form.job_ref || 'Job'}
        </h1>
        <div className="flex gap-2">
          {editing ? (
            <Fragment key="editing-actions">
              <button type="submit" form="job-detail-form" disabled={saving}
                className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                💾 {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setError(null) }}
                className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </Fragment>
          ) : (
            <button key="view-actions" type="button" onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors">
              ✏️ Edit
            </button>
          )}
          {!editing && !['pending_confirmation', 'completed', 'invoiced', 'cancelled'].includes(statusKey) && (
            <button type="button" onClick={() => setCompleteModal(true)}
              className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-700 transition-colors">
              ✅ Complete Job
            </button>
          )}
          {!editing && statusKey === 'pending_confirmation' && isAdmin && (
            <button type="button" onClick={handleConfirmComplete} disabled={confirming}
              className="flex items-center gap-1.5 bg-amber-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors">
              {confirming ? 'Confirming…' : '✔ Confirm Complete'}
            </button>
          )}
          {!editing && statusKey === 'completed' && (
            <button type="button" onClick={handleCreateInvoice} disabled={invoicing}
              className="flex items-center gap-1.5 bg-teal-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {invoicing ? 'Creating…' : '➜ Create Invoice'}
            </button>
          )}
          <button type="button" onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 bg-blue-500 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-600 transition-colors">
            ← Back
          </button>
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-red-700 transition-colors">
            🗑 Delete
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-300 overflow-x-auto">
        {TABS.filter(tab => tab !== 'Sign-off' || form.sign_off_signature).map(tab => {
          const active  = tab === activeTab
          const enabled = true
          return (
            <button key={tab} type="button"
              onClick={() => enabled && setActiveTab(tab)}
              className={[
                'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                active
                  ? 'border-blue-600 text-white bg-blue-600'
                  : enabled
                    ? 'border-transparent text-gray-600 hover:text-blue-600 hover:border-blue-300'
                    : 'border-transparent text-gray-400 cursor-not-allowed',
              ].join(' ')}>
              {tab}
            </button>
          )
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mt-3">{error}</div>
      )}

      {/* Materials tab panel */}
      {activeTab === 'Materials' && (
        <div className="border border-gray-200 border-t-0 rounded-b-xl p-6 bg-gray-50">
          {itemsLoading ? (
            <p className="text-sm text-gray-400">Loading materials…</p>
          ) : (
            <>
              <LineItemsEditor items={jobItems} catalogue={catalogue} onChange={handleJobItemsChange} />
              <div className="flex justify-end mt-4">
                <button type="button" onClick={handleSaveJobItems} disabled={!itemsDirty || itemsSaving}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {itemsSaving ? 'Saving…' : 'Save Materials'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Appointments tab panel */}
      {activeTab === 'Appointments' && (
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-700">Scheduled Appointments</h2>
            <button
              type="button"
              onClick={() => setApptModal(true)}
              className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              + New Appointment
            </button>
          </div>
          {apptLoading ? (
            <p className="text-sm text-gray-400">Loading appointments…</p>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No appointments scheduled for this job yet.</p>
          ) : (
            <div className="space-y-3">
              {appointments.map(appt => {
                const start = new Date(appt.scheduled_start)
                const end   = new Date(appt.scheduled_end)
                const assignments = appt.appointment_assignments || []
                return (
                  <div key={appt.id} className="border border-gray-100 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between p-3 bg-gray-50">
                      <div className="text-sm font-medium text-gray-800">
                        {start.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        {' · '}
                        {start.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                        {' — '}
                        {end.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                          appt.status === 'completed' ? 'bg-green-100 text-green-700' :
                          appt.status === 'on_site'   ? 'bg-slate-100 text-slate-700' :
                          appt.status === 'cancelled' ? 'bg-gray-100 text-gray-500'  :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {appt.status?.replace(/_/g, ' ')}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingAppt(appt)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                        >
                          Edit
                        </button>
                      </div>
                    </div>

                    {assignments.length === 0 ? (
                      <p className="text-xs text-gray-400 italic px-3 py-2">No technicians assigned to this appointment.</p>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {assignments.map(a => (
                          <div key={a.id} className="flex items-center justify-between px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                style={{ backgroundColor: a.profiles?.color || '#3B82F6' }}
                              >
                                {a.profiles?.full_name?.[0]?.toUpperCase() || '?'}
                              </div>
                              <div>
                                <div className="text-sm text-gray-800">{a.profiles?.full_name || 'Unknown'}</div>
                                <div className="text-xs text-gray-400">
                                  {a.actual_start
                                    ? `Started ${new Date(a.actual_start).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}`
                                    : 'Not started'}
                                  {a.actual_end && ` · Finished ${new Date(a.actual_end).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}`}
                                </div>
                              </div>
                            </div>
                            {!a.actual_start ? (
                              <button type="button" onClick={() => handleClockIn(a.id)}
                                className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-blue-700 transition-colors">
                                Clock In
                              </button>
                            ) : !a.actual_end ? (
                              <button type="button" onClick={() => handleClockOut(a.id)}
                                className="bg-green-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-green-700 transition-colors">
                                Clock Out
                              </button>
                            ) : (
                              <span className="text-xs text-green-600 font-medium">Done</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Activity tab panel */}
      {activeTab === 'Activity' && (
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Activity Timeline</h2>
          {activityLoading ? (
            <p className="text-sm text-gray-400">Loading activity…</p>
          ) : activity.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No activity recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {activity.map(entry => (
                <div key={entry.id} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${ACTIVITY_DOT_COLORS[entry.action] || 'bg-gray-400'}`} />
                  <div>
                    <p className="text-sm text-gray-800">{entry.detail || entry.action}</p>
                    <p className="text-xs text-gray-400">{formatDateTime(entry.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attachments tab panel */}
      {activeTab === 'Attachments' && (
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-700">Photos &amp; Attachments</h2>
            <label className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-blue-700 transition-colors cursor-pointer">
              {photoUploading ? 'Uploading…' : '+ Upload Photo'}
              <input type="file" accept="image/*" className="hidden" disabled={photoUploading} onChange={handlePhotoSelect} />
            </label>
          </div>
          {photosLoading ? (
            <p className="text-sm text-gray-400">Loading photos…</p>
          ) : photos.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No photos uploaded for this job yet.</p>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {photos.map(photo => (
                <div key={photo.id} className="group relative border border-gray-100 rounded-lg overflow-hidden">
                  {photo.url
                    ? <img src={photo.url} alt={photo.file_name} className="w-full h-28 object-cover" />
                    : <div className="w-full h-28 bg-gray-50 flex items-center justify-center text-xs text-gray-400">No preview</div>
                  }
                  <button
                    type="button"
                    onClick={() => handlePhotoDelete(photo)}
                    className="absolute top-1 right-1 bg-red-600 text-white text-xs w-5 h-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                  <p className="text-xs text-gray-500 px-1.5 py-1 truncate">{photo.file_name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sign-off tab panel */}
      {activeTab === 'Sign-off' && (
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Sign-off</h2>
          <div className="max-w-md space-y-4">
            <Field label="Signed Off By">
              <p className="py-1.5 text-sm text-gray-800 font-medium">{form.sign_off_name || '—'}</p>
            </Field>
            <Field label="Date &amp; Time">
              <p className="py-1.5 text-sm text-gray-800">
                {form.completed_at
                  ? new Date(form.completed_at).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
                  : '—'}
              </p>
            </Field>
            <Field label="Signature">
              {form.sign_off_signature
                ? <img src={form.sign_off_signature} alt="Sign-off signature" className="border border-gray-200 rounded bg-white w-full max-w-xs" />
                : <p className="py-1.5 text-sm text-gray-400 italic">No signature captured.</p>
              }
            </Field>
          </div>
        </div>
      )}

      {/* Form */}
      <form id="job-detail-form" onSubmit={handleSave} style={{ display: activeTab === 'Job Details' ? undefined : 'none' }}>
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6">
          <div className="grid grid-cols-3 gap-8">

            {/* Column 1: Customer Details */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">Customer Details</h2>

              <Field label="Customer" required>
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">
                      {customers.find(c => c.id === form.customer_id)?.customer_name || '—'}
                    </p>
                  : <select required value={form.customer_id} onChange={e => set('customer_id', e.target.value)} className={inputCls}>
                      <option value="">Select Customer</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.customer_name}</option>)}
                    </select>
                }
              </Field>

              <Field label="Contact Name">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.contact_name || '—'}</p>
                  : <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Contact Email">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.contact_email || '—'}</p>
                  : <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Telephone">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.contact_telephone || '—'}</p>
                  : <input type="tel" value={form.contact_telephone} onChange={e => set('contact_telephone', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Mobile">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.contact_mobile || '—'}</p>
                  : <input type="tel" value={form.contact_mobile} onChange={e => set('contact_mobile', e.target.value)} className={inputCls} />
                }
              </Field>
            </div>

            {/* Column 2: Site Details */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">Site Details</h2>

              <Field label="Site Company">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.site_company || '—'}</p>
                  : <input value={form.site_company} onChange={e => set('site_company', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Site Contact">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.site_contact_name || '—'}</p>
                  : <input value={form.site_contact_name} onChange={e => set('site_contact_name', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Site Email">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.site_contact_email || '—'}</p>
                  : <input type="email" value={form.site_contact_email} onChange={e => set('site_contact_email', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Site Telephone">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.site_telephone || '—'}</p>
                  : <input type="tel" value={form.site_telephone} onChange={e => set('site_telephone', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Site Mobile">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.site_mobile || '—'}</p>
                  : <input type="tel" value={form.site_mobile} onChange={e => set('site_mobile', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Address">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800 whitespace-pre-line">{form.site_address || '—'}</p>
                  : <textarea rows={3} value={form.site_address} onChange={e => set('site_address', e.target.value)}
                      className={`${inputCls} resize-none`} />
                }
              </Field>

              <Field label="City">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.site_city || '—'}</p>
                  : <input value={form.site_city} onChange={e => set('site_city', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="County">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.site_county || '—'}</p>
                  : <input value={form.site_county} onChange={e => set('site_county', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Postcode">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.site_postcode || '—'}</p>
                  : <input value={form.site_postcode} onChange={e => set('site_postcode', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Country">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.site_country || '—'}</p>
                  : <select value={form.site_country} onChange={e => set('site_country', e.target.value)} className={inputCls}>
                      {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                }
              </Field>

              <Field label="Site Notes">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800 whitespace-pre-line">{form.site_notes || '—'}</p>
                  : <textarea rows={3} value={form.site_notes} onChange={e => set('site_notes', e.target.value)}
                      className={`${inputCls} resize-none`} />
                }
              </Field>
            </div>

            {/* Column 3: Job Details */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">Job Details</h2>

              <Field label="Job Ref">
                <p className="py-1.5 text-sm text-gray-800 font-mono">{form.job_ref || '—'}</p>
              </Field>

              <Field label="Status">
                {ro
                  ? <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[statusKey] ?? 'bg-gray-100 text-gray-600'}`}>
                      {form.status}
                    </span>
                  : <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                }
              </Field>

              <Field label="Job Type">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.job_type || '—'}</p>
                  : <select value={form.job_type} onChange={e => set('job_type', e.target.value)} className={inputCls}>
                      {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                }
              </Field>

              <Field label="Priority">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.priority || '—'}</p>
                  : <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
                      {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                    </select>
                }
              </Field>

              <Field label="Customer Ref">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.customer_ref || '—'}</p>
                  : <input value={form.customer_ref} onChange={e => set('customer_ref', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Customer Job Ref">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.customer_job_ref || '—'}</p>
                  : <input value={form.customer_job_ref} onChange={e => set('customer_job_ref', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="PO Ref">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.po_ref || '—'}</p>
                  : <input value={form.po_ref} onChange={e => set('po_ref', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Start Date">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.start_date || '—'}</p>
                  : <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Complete By">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.complete_by || '—'}</p>
                  : <input type="date" value={form.complete_by} onChange={e => set('complete_by', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Scheduled For">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.scheduled_for || '—'}</p>
                  : <input type="date" value={form.scheduled_for} onChange={e => set('scheduled_for', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Title">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.title || '—'}</p>
                  : <input value={form.title} onChange={e => set('title', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Description">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800 whitespace-pre-line">{form.description || '—'}</p>
                  : <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)}
                      className={`${inputCls} resize-none`} />
                }
              </Field>

              <Field label="Internal Notes">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800 whitespace-pre-line">{form.notes || '—'}</p>
                  : <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
                      className={`${inputCls} resize-none`} />
                }
              </Field>

              <Field label="Email Alert">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.alert_by_email ? 'Yes' : 'No'}</p>
                  : <label className="flex items-center gap-2 text-sm text-gray-700 mt-1">
                      <input type="checkbox" checked={form.alert_by_email}
                        onChange={e => set('alert_by_email', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300" />
                      Send email alert to customer
                    </label>
                }
              </Field>

              <Field label="SMS Alert">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.sms_alert ? 'Yes' : 'No'}</p>
                  : <div className="flex items-center gap-4 mt-1 text-sm text-gray-700">
                      <label className="flex items-center gap-1.5">
                        <input type="radio" name="sms_alert" checked={form.sms_alert}
                          onChange={() => set('sms_alert', true)} /> Yes
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="radio" name="sms_alert" checked={!form.sms_alert}
                          onChange={() => set('sms_alert', false)} /> No
                      </label>
                    </div>
                }
              </Field>
            </div>

          </div>
        </div>
      </form>

      {/* New appointment modal */}
      {apptModal && (
        <AppointmentModal
          presetJobId={id}
          onClose={() => setApptModal(false)}
          onSaved={loadAppointments}
        />
      )}

      {/* Edit appointment modal — updates the existing appointment (e.g. to
          assign a technician) instead of creating a duplicate one */}
      {editingAppt && (
        <AppointmentModal
          appointment={editingAppt}
          presetJobId={id}
          onClose={() => setEditingAppt(null)}
          onSaved={loadAppointments}
        />
      )}

      {/* Complete job modal */}
      {completeModal && (
        <CompleteJobModal
          jobId={id}
          signOffName={currentProfile?.full_name || 'Unknown'}
          onClose={() => setCompleteModal(false)}
          onCompleted={handleCompleted}
        />
      )}

      {/* Duplicate invoice modal */}
      {existingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Invoice Already Exists</h3>
            <p className="text-sm text-gray-600">
              An invoice has already been created for this job — Invoice #
              <span className="font-semibold">{existingInvoice.invoice_number}</span>.
            </p>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => navigate(`/finance/invoices/${existingInvoice.id}`)}
                className="flex-1 bg-teal-600 text-white py-2 rounded text-sm font-semibold hover:bg-teal-700 transition-colors">
                View Invoice
              </button>
              <button type="button" onClick={() => setExistingInvoice(null)}
                className="flex-1 border border-gray-300 text-gray-600 py-2 rounded text-sm font-medium hover:bg-gray-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Delete Job?</h3>
            <p className="text-sm text-gray-600">
              This will remove{' '}
              <span className="font-semibold">{form.title || form.job_ref || 'this job'}</span>{' '}
              from all job lists and move it to Archives, where it can still be found later.
            </p>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2 rounded text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting ? 'Archiving…' : 'Yes, Archive'}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2 rounded text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </PageContainer>
  )
}
