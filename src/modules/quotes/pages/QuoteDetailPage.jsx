import { useState, useEffect, Fragment } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { fetchQuote, updateQuote, deleteQuote, convertQuoteToJob } from '../services/quoteService'
import { useCustomers } from '../../../shared/hooks/useCustomers'
import { useProfiles } from '../../../shared/hooks/useProfiles'
import { useItems } from '../hooks/useItems'
import LineItemsEditor from '../components/LineItemsEditor'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'

const STATUSES = ['draft', 'sent', 'actioned', 'accepted', 'rejected', 'converted']

const STATUS_LABELS = {
  draft: 'Draft', sent: 'Sent', actioned: 'Actioned',
  accepted: 'Accepted', rejected: 'Rejected', converted: 'Converted',
}

const STATUS_COLORS = {
  draft:     'bg-gray-100 text-gray-600',
  sent:      'bg-blue-100 text-blue-700',
  actioned:  'bg-yellow-100 text-yellow-700',
  accepted:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-600',
  converted: 'bg-teal-100 text-teal-700',
}

const inputCls = 'w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'

function Field({ label, children }) {
  return (
    <div className="flex items-start gap-3">
      <label className="w-32 shrink-0 pt-1.5 text-sm text-gray-600 text-right">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

export default function QuoteDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { customers } = useCustomers()
  const { profiles } = useProfiles()
  const { items: catalogue } = useItems()

  const [editing,       setEditing]       = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [converting,    setConverting]    = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,         setError]         = useState(null)
  const [form,          setForm]          = useState(null)
  const [lineItems,     setLineItems]     = useState([])

  useEffect(() => {
    load()
  }, [id])

  function load() {
    setLoading(true)
    fetchQuote(id)
      .then(data => {
        setForm(data)
        setLineItems((data.quote_items || []).map(li => ({
          item_id: li.item_id || '', description: li.description,
          quantity: li.quantity, unit: li.unit, unit_price: li.unit_price, tax_rate: li.tax_rate,
        })))
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateQuote(id, {
        customer_id:   form.customer_id   || null,
        assigned_to:   form.assigned_to   || null,
        title:         form.title         || null,
        status:        form.status,
        issue_date:    form.issue_date    || null,
        valid_until:   form.valid_until   || null,
        site_address:  form.site_address  || null,
        site_city:     form.site_city     || null,
        site_county:   form.site_county   || null,
        site_postcode: form.site_postcode || null,
        notes:         form.notes         || null,
        terms:         form.terms         || null,
      }, lineItems)
      setEditing(false)
      load()
    } catch (err) {
      setError(err.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteQuote(id)
      navigate('/quotes/draft')
    } catch (err) {
      setError(err.message || 'Failed to delete quote')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleConvert() {
    setConverting(true)
    setError(null)
    try {
      const job = await convertQuoteToJob(form)
      navigate(`/jobs/${job.id}`)
    } catch (err) {
      setError(err.message || 'Failed to convert quote to job')
      setConverting(false)
    }
  }

  if (loading) return <PageContainer><p className="text-sm text-gray-400 mt-8">Loading quote…</p></PageContainer>
  if (!form)   return <PageContainer><p className="text-sm text-red-500 mt-8">{error || 'Quote not found.'}</p></PageContainer>

  const ro = !editing
  const canConvert = form.status === 'accepted' && !form.job_id

  return (
    <PageContainer>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{form.title || 'Quote'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ref: <span className="font-mono">{form.quote_ref || '—'}</span></p>
        </div>
        <div className="flex gap-2">
          {canConvert && (
            <button type="button" onClick={handleConvert} disabled={converting}
              className="bg-teal-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {converting ? 'Converting…' : '➜ Convert to Job'}
            </button>
          )}
          {editing ? (
            <Fragment key="editing-actions">
              <button type="submit" form="quote-detail-form" disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : '💾 Save'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setError(null); load() }}
                className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </Fragment>
          ) : (
            <button key="view-actions" type="button" onClick={() => setEditing(true)}
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

      <div className="mb-4">
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[form.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[form.status] ?? form.status}
        </span>
        {form.job_id && (
          <button onClick={() => navigate(`/jobs/${form.job_id}`)} className="ml-3 text-xs text-teal-600 hover:underline">
            View converted job →
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form id="quote-detail-form" onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">Quote Details</h2>

            <Field label="Status">
              {ro
                ? <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[form.status] ?? 'bg-gray-100 text-gray-600'}`}>{STATUS_LABELS[form.status] ?? form.status}</span>
                : <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
              }
            </Field>

            <Field label="Customer">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.customers?.customer_name || '—'}</p>
                : <select value={form.customer_id || ''} onChange={e => set('customer_id', e.target.value)} className={inputCls}>
                    <option value="">— None —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.customer_name}</option>)}
                  </select>
              }
            </Field>

            <Field label="Title">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.title || '—'}</p>
                : <input value={form.title || ''} onChange={e => set('title', e.target.value)} className={inputCls} />
              }
            </Field>

            <Field label="Technician">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.profiles?.full_name || '—'}</p>
                : <select value={form.assigned_to || ''} onChange={e => set('assigned_to', e.target.value)} className={inputCls}>
                    <option value="">— Unassigned —</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
              }
            </Field>

            <Field label="Issue Date">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{formatDate(form.issue_date)}</p>
                : <input type="date" value={form.issue_date || ''} onChange={e => set('issue_date', e.target.value)} className={inputCls} />
              }
            </Field>

            <Field label="Valid Until">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{formatDate(form.valid_until)}</p>
                : <input type="date" value={form.valid_until || ''} onChange={e => set('valid_until', e.target.value)} className={inputCls} />
              }
            </Field>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">Site Address</h2>

            <Field label="Address">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800 whitespace-pre-line">{form.site_address || '—'}</p>
                : <textarea rows={2} value={form.site_address || ''} onChange={e => set('site_address', e.target.value)} className={`${inputCls} resize-none`} />
              }
            </Field>

            <Field label="City">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.site_city || '—'}</p>
                : <input value={form.site_city || ''} onChange={e => set('site_city', e.target.value)} className={inputCls} />
              }
            </Field>

            <Field label="County">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.site_county || '—'}</p>
                : <input value={form.site_county || ''} onChange={e => set('site_county', e.target.value)} className={inputCls} />
              }
            </Field>

            <Field label="Postcode">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.site_postcode || '—'}</p>
                : <input value={form.site_postcode || ''} onChange={e => set('site_postcode', e.target.value)} className={inputCls} />
              }
            </Field>
          </div>
        </div>

        {ro ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2 mb-3">Line Items</h2>
            {lineItems.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No line items.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="text-left pb-2">Description</th>
                    <th className="text-right pb-2 w-20">Qty</th>
                    <th className="text-left pb-2 w-20">Unit</th>
                    <th className="text-right pb-2 w-28">Unit Price</th>
                    <th className="text-right pb-2 w-20">Tax %</th>
                    <th className="text-right pb-2 w-28">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((it, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="py-1.5">{it.description}</td>
                      <td className="py-1.5 text-right">{it.quantity}</td>
                      <td className="py-1.5">{it.unit}</td>
                      <td className="py-1.5 text-right">{formatCurrency(it.unit_price)}</td>
                      <td className="py-1.5 text-right">{it.tax_rate}%</td>
                      <td className="py-1.5 text-right font-medium">{formatCurrency((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex justify-end pt-3 mt-3 border-t border-gray-100">
              <div className="w-56 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(form.subtotal)}</span></div>
                <div className="flex justify-between text-gray-600"><span>Tax</span><span>{formatCurrency(form.tax_total)}</span></div>
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-100"><span>Total</span><span>{formatCurrency(form.total)}</span></div>
              </div>
            </div>
          </div>
        ) : (
          <LineItemsEditor items={lineItems} catalogue={catalogue} onChange={setLineItems} />
        )}

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">Notes</h2>
            {ro
              ? <p className="text-sm text-gray-800 whitespace-pre-line">{form.notes || '—'}</p>
              : <textarea rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} className={inputCls + ' resize-none'} />
            }
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">Terms</h2>
            {ro
              ? <p className="text-sm text-gray-800 whitespace-pre-line">{form.terms || '—'}</p>
              : <textarea rows={3} value={form.terms || ''} onChange={e => set('terms', e.target.value)} className={inputCls + ' resize-none'} />
            }
          </div>
        </div>
      </form>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Delete Quote?</h3>
            <p className="text-sm text-gray-600">
              This will permanently delete <span className="font-semibold">{form.title || form.quote_ref}</span> and cannot be undone.
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
