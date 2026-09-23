import { useNavigate } from 'react-router-dom'
import { APPOINTMENT_STATUS_META } from '../../../shared/constants/appointmentStatuses'

const PRIORITY_DOT = {
  low:    'bg-gray-300',
  normal: 'bg-blue-400',
  high:   'bg-orange-400',
  urgent: 'bg-red-500',
}

function formatTimeRange(startIso, endIso) {
  const opts = { hour: '2-digit', minute: '2-digit' }
  const start = new Date(startIso).toLocaleTimeString('en-ZA', opts)
  const end   = new Date(endIso).toLocaleTimeString('en-ZA', opts)
  return `${start} – ${end}`
}

export default function AppointmentPreviewModal({ appointment, onClose, onEdit }) {
  const navigate = useNavigate()
  const meta  = APPOINTMENT_STATUS_META[appointment.status] || APPOINTMENT_STATUS_META.not_dispatched
  const job   = appointment.jobs
  const title = job?.title || job?.job_ref || 'Appointment'
  const techs = (appointment.appointment_assignments || []).map(a => a.profiles).filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">{title}</h2>
            {job?.job_ref && job?.title && (
              <p className="text-xs text-gray-400">{job.job_ref}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0 ml-3"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Status + priority */}
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.dot }} />
              {meta.label}
            </span>
            {job?.priority && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 capitalize">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[job.priority] ?? 'bg-gray-300'}`} />
                {job.priority} priority
              </span>
            )}
          </div>

          {/* Customer */}
          {job?.customers?.customer_name && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-0.5">Customer</div>
              <div className="text-sm text-gray-800">{job.customers.customer_name}</div>
            </div>
          )}

          {/* Time */}
          <div>
            <div className="text-xs font-medium text-gray-500 mb-0.5">Time</div>
            <div className="text-sm text-gray-800">
              {formatTimeRange(appointment.scheduled_start, appointment.scheduled_end)}
            </div>
          </div>

          {/* Technicians */}
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1.5">Assigned Technicians</div>
            {techs.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Unassigned</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {techs.map(t => (
                  <div key={t.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full pl-1 pr-2.5 py-1">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: t.color || '#6b7280' }}
                    >
                      {t.full_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-xs font-medium text-gray-700">{t.full_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          {appointment.notes && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-0.5">Notes</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{appointment.notes}</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => onEdit(appointment)}
              className="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Edit Appointment
            </button>
            {job?.id && (
              <button
                type="button"
                onClick={() => navigate(`/jobs/${job.id}`)}
                className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                View Job
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
