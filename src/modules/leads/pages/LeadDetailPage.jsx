import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { fetchLead, updateLead, deleteLead } from '../services/leadService'
import { useCustomers } from '../../../shared/hooks/useCustomers'

const SOURCES  = ['None', 'Phone', 'Email', 'Website', 'Referral', 'Walk-in', 'Social Media', 'Other']
const STATUSES = ['contact_later', 'new', 'actioned', 'rejected', 'converted']

const STATUS_LABELS = {
  contact_later: 'Contact Later',
  new:           'New',
  actioned:      'Actioned',
  rejected:      'Rejected',
  converted:     'Converted',
}

const STATUS_COLORS = {
  contact_later: 'bg-gray-100 text-gray-600',
  new:           'bg-blue-100 text-blue-700',
  actioned:      'bg-yellow-100 text-yellow-700',
  rejected:      'bg-red-100 text-red-600',
  converted:     'bg-green-100 text-green-700',
}

const inputCls    = 'w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'
const readonlyCls = 'w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-gray-50 text-gray-500'

function Field({ label, children }) {
  return (
    <div className="flex items-start gap-3">
      <label className="w-36 shrink-0 pt-1.5 text-sm text-gray-600 text-right">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

export default function LeadDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { customers } = useCustomers()

  const [editing,       setEditing]       = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,         setError]         = useState(null)
  const [form,          setForm]          = useState(null)

  useEffect(() => {
    fetchLead(id)
      .then(data => { setForm(data); setLoading(false) })
      .catch(err  => { setError(err.message); setLoading(false) })
  }, [id])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateLead(id, {
        customer_id:         form.customer_id         || null,
        full_name:           form.full_name           || null,
        company_name:        form.company_name        || null,
        email:               form.email               || null,
        telephone:           form.telephone           || null,
        mobile:              form.mobile              || null,
        website:             form.website             || null,
        address:             form.address             || null,
        city:                form.city                || null,
        county:              form.county              || null,
        postcode:            form.postcode            || null,
        title:               form.title               || null,
        source:              form.source === 'None' ? null : form.source?.toLowerCase(),
        status:              form.status,
        assigned_to:         form.assigned_to         || null,
        preferred_call_date: form.preferred_call_date || null,
        preferred_call_time: form.preferred_call_time || null,
      })
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteLead(id)
      navigate('/leads/all')
    } catch (err) {
      setError(err.message || 'Failed to delete lead')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading) return <PageContainer><p className="text-sm text-gray-400 mt-8">Loading lead…</p></PageContainer>
  if (!form)   return <PageContainer><p className="text-sm text-red-500 mt-8">{error || 'Lead not found.'}</p></PageContainer>

  const ro = !editing

  return (
    <PageContainer>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{form.full_name || form.company_name || 'Lead'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ref: <span className="font-mono">{form.lead_ref || '—'}</span></p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button type="submit" form="lead-detail-form" disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : '💾 Save'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setError(null) }}
                className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setEditing(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors">
              ✏️ Edit
            </button>
          )}
          <button type="button" onClick={() => navigate(-1)}
            className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-600 transition-colors">
            ← Back
          </button>
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="bg-red-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-red-700 transition-colors">
            🗑 Delete
          </button>
        </div>
      </div>

      {/* Status badge */}
      <div className="mb-4">
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[form.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[form.status] ?? form.status}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form id="lead-detail-form" onSubmit={handleSave}>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="grid grid-cols-2 gap-8">

            {/* Column 1 — Lead Details */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">Lead Details</h2>

              <Field label="Status">
                {ro
                  ? <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[form.status] ?? 'bg-gray-100 text-gray-600'}`}>{STATUS_LABELS[form.status] ?? form.status}</span>
                  : <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                      {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                }
              </Field>

              <Field label="Existing Customer">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.customers?.customer_name || '—'}</p>
                  : <select value={form.customer_id || ''} onChange={e => set('customer_id', e.target.value)} className={inputCls}>
                      <option value="">— None (new prospect) —</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.customer_name}</option>)}
                    </select>
                }
              </Field>

              <Field label="Full Name">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.full_name || '—'}</p>
                  : <input value={form.full_name || ''} onChange={e => set('full_name', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Company">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.company_name || '—'}</p>
                  : <input value={form.company_name || ''} onChange={e => set('company_name', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Title">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.title || '—'}</p>
                  : <input value={form.title || ''} onChange={e => set('title', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Email">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.email || '—'}</p>
                  : <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Telephone">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.telephone || '—'}</p>
                  : <input value={form.telephone || ''} onChange={e => set('telephone', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Mobile">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.mobile || '—'}</p>
                  : <input value={form.mobile || ''} onChange={e => set('mobile', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Website">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.website || '—'}</p>
                  : <input value={form.website || ''} onChange={e => set('website', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Source">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800 capitalize">{form.source || '—'}</p>
                  : <select value={form.source || 'None'} onChange={e => set('source', e.target.value)} className={inputCls}>
                      {SOURCES.map(s => <option key={s}>{s}</option>)}
                    </select>
                }
              </Field>
            </div>

            {/* Column 2 — Address + Preferred Call */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">Address & Scheduling</h2>

              <Field label="Address">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800 whitespace-pre-line">{form.address || '—'}</p>
                  : <textarea rows={3} value={form.address || ''} onChange={e => set('address', e.target.value)} className={`${inputCls} resize-none`} />
                }
              </Field>

              <Field label="City">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.city || '—'}</p>
                  : <input value={form.city || ''} onChange={e => set('city', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="County">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.county || '—'}</p>
                  : <input value={form.county || ''} onChange={e => set('county', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Postcode">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.postcode || '—'}</p>
                  : <input value={form.postcode || ''} onChange={e => set('postcode', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Preferred Call Date">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.preferred_call_date || '—'}</p>
                  : <input type="date" value={form.preferred_call_date || ''} onChange={e => set('preferred_call_date', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Preferred Call Time">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.preferred_call_time || '—'}</p>
                  : <input type="time" value={form.preferred_call_time || ''} onChange={e => set('preferred_call_time', e.target.value)} className={inputCls} />
                }
              </Field>
            </div>
          </div>
        </div>
      </form>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Delete Lead?</h3>
            <p className="text-sm text-gray-600">
              This will permanently delete <span className="font-semibold">{form.full_name || form.lead_ref}</span> and cannot be undone.
            </p>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2 rounded text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting ? 'Deleting…' : 'Yes, Delete'}
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
