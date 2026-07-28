import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useProfiles } from '../../../shared/hooks/useProfiles'
import {
  createAppointment,
  updateAppointment,
  updateAppointmentTechnicians,
  deleteAppointment,
} from '../services/appointmentService'

const STATUSES = [
  { value: 'not_dispatched', label: 'Not Dispatched' },
  { value: 'awaiting',       label: 'Awaiting' },
  { value: 'received',       label: 'Received' },
  { value: 'accepted',       label: 'Accepted' },
  { value: 'declined',       label: 'Declined' },
  { value: 'on_route',       label: 'On Route' },
  { value: 'on_site',        label: 'On Site' },
  { value: 'completed',      label: 'Completed' },
  { value: 'follow_on',      label: 'Follow On' },
  { value: 'abandoned',      label: 'Abandoned' },
  { value: 'no_access',      label: 'No Access' },
  { value: 'cancelled',      label: 'Cancelled' },
]

const inputCls = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function AppointmentModal({
  onClose,
  onSaved,
  appointment = null,   // pass for edit mode
  presetJobId = null,
  presetDate  = null,
  presetStartHour = 9,
  presetTechId = null,
}) {
  const isEdit = !!appointment
  const { profiles } = useProfiles()
  const [jobs,     setJobs]     = useState([])
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const defaultDate  = presetDate || new Date().toISOString().split('T')[0]
  const defaultStart = `${String(presetStartHour).padStart(2, '0')}:00`
  const defaultEnd   = `${String(presetStartHour + 1).padStart(2, '0')}:00`

  const [form, setForm] = useState({
    job_id:         presetJobId || appointment?.job_id || '',
    date:           appointment
      ? appointment.scheduled_start.split('T')[0]
      : defaultDate,
    start_time:     appointment
      ? new Date(appointment.scheduled_start).toTimeString().slice(0, 5)
      : defaultStart,
    end_time:       appointment
      ? new Date(appointment.scheduled_end).toTimeString().slice(0, 5)
      : defaultEnd,
    status:         appointment?.status || 'not_dispatched',
    notes:          appointment?.notes || '',
    technician_ids: appointment
      ? (appointment.appointment_assignments || []).map(a => a.technician_id)
      : presetTechId ? [presetTechId] : [],
  })

  useEffect(() => {
    supabase
      .from('jobs')
      .select('id, job_ref, title, customers(customer_name)')
      .is('archived_at', null)
      .not('status', 'in', '(cancelled,completed,invoiced)')
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setJobs(data) })
  }, [])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleTech(id) {
    setForm(prev => {
      const ids = prev.technician_ids.includes(id)
        ? prev.technician_ids.filter(t => t !== id)
        : [...prev.technician_ids, id]
      return { ...prev, technician_ids: ids }
    })
  }

  // Builds a Date from local date/time parts, then serializes to a proper
  // UTC ISO string. `scheduled_start`/`scheduled_end` are `timestamptz`
  // columns — sending a bare "YYYY-MM-DDTHH:mm:00" string (no offset) gets
  // interpreted by Postgres as UTC, silently shifting SAST (UTC+2) times
  // forward by 2 hours. Using Date + toISOString() bakes in the correct offset.
  function toISO(dateStr, timeStr) {
    const [y, m, d]   = dateStr.split('-').map(Number)
    const [hh, mm]    = timeStr.split(':').map(Number)
    return new Date(y, m - 1, d, hh, mm).toISOString()
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const scheduled_start = toISO(form.date, form.start_time)
      const scheduled_end   = toISO(form.date, form.end_time)

      if (new Date(scheduled_end) <= new Date(scheduled_start)) {
        setError('End time must be after start time.')
        setSaving(false)
        return
      }

      if (isEdit) {
        await updateAppointment(appointment.id, {
          job_id: form.job_id || null,
          scheduled_start,
          scheduled_end,
          status: form.status,
          notes:  form.notes,
        })
        await updateAppointmentTechnicians(appointment.id, form.technician_ids)
      } else {
        await createAppointment(
          {
            job_id: form.job_id || null,
            scheduled_start,
            scheduled_end,
            status: form.status,
            notes:  form.notes,
          },
          form.technician_ids
        )
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save appointment')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteAppointment(appointment.id)
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to delete appointment')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {isEdit ? 'Edit Appointment' : 'New Appointment'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSave} className="px-6 py-5 space-y-4">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
              {error}
            </div>
          )}

          <Field label="Job" required={false}>
            <select
              value={form.job_id}
              onChange={e => set('job_id', e.target.value)}
              className={inputCls}
              disabled={!!presetJobId}
            >
              <option value="">— No job linked —</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>
                  {j.job_ref} — {j.title || j.customers?.customer_name || 'Untitled'}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Date" required>
            <input
              required
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Time" required>
              <input
                required
                type="time"
                value={form.start_time}
                onChange={e => set('start_time', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="End Time" required>
              <input
                required
                type="time"
                value={form.end_time}
                onChange={e => set('end_time', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Status">
            <select
              value={form.status}
              onChange={e => set('status', e.target.value)}
              className={inputCls}
            >
              {STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Assign Technicians">
            {profiles.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No active users found. Add users first.</p>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-44 overflow-y-auto">
                {profiles.map(p => (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.technician_ids.includes(p.id)}
                      onChange={() => toggleTech(p.id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    />
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: p.color || '#3B82F6' }}
                    >
                      {p.full_name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{p.full_name}</div>
                      <div className="text-xs text-gray-400 capitalize">{p.role}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </Field>

          <Field label="Notes">
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Optional notes about this appointment…"
              className={`${inputCls} resize-none`}
            />
          </Field>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Appointment'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            {isEdit && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 rounded text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              >
                Delete
              </button>
            )}
          </div>

          {/* Delete confirm */}
          {confirmDelete && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
              <p className="text-sm text-red-700 font-medium">Are you sure you want to delete this appointment?</p>
              <div className="flex gap-2">
                <button type="button" onClick={handleDelete} disabled={deleting}
                  className="bg-red-600 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-red-700 disabled:opacity-50">
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)}
                  className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-xs font-medium hover:bg-white">
                  Cancel
                </button>
              </div>
            </div>
          )}

        </form>
      </div>
    </div>
  )
}
