import { useState, useEffect, Fragment } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { fetchPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder } from '../services/purchaseOrderService'
import { useItems } from '../../quotes/hooks/useItems'
import LineItemsEditor from '../../quotes/components/LineItemsEditor'
import { downloadPurchaseOrderPdf } from '../utils/purchaseOrderPdf'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'

const STATUSES = ['draft', 'awaiting_approval', 'approved', 'rejected', 'actioned', 'paid']

const STATUS_LABELS = {
  draft: 'Draft', awaiting_approval: 'Awaiting Approval', approved: 'Approved',
  rejected: 'Rejected', actioned: 'Actioned', paid: 'Paid',
}

const STATUS_COLORS = {
  draft:             'bg-gray-100 text-gray-600',
  awaiting_approval: 'bg-yellow-100 text-yellow-700',
  approved:          'bg-green-100 text-green-700',
  rejected:          'bg-red-100 text-red-600',
  actioned:          'bg-blue-100 text-blue-700',
  paid:              'bg-teal-100 text-teal-700',
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

export default function PurchaseOrderDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { items: catalogue } = useItems()

  const [editing,       setEditing]       = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,         setError]         = useState(null)
  const [form,          setForm]          = useState(null)
  const [lineItems,     setLineItems]     = useState([])

  useEffect(() => {
    load()
  }, [id])

  function load() {
    setLoading(true)
    fetchPurchaseOrder(id)
      .then(data => {
        setForm(data)
        setLineItems((data.purchase_order_items || []).map(li => ({
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
      await updatePurchaseOrder(id, {
        supplier_name: form.supplier_name || null,
        title:         form.title         || null,
        status:        form.status,
        issue_date:    form.issue_date    || null,
        due_date:      form.due_date      || null,
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
      await deletePurchaseOrder(id)
      navigate('/finance/po/draft')
    } catch (err) {
      setError(err.message || 'Failed to delete purchase order')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading) return <PageContainer><p className="text-sm text-gray-400 mt-8">Loading purchase order…</p></PageContainer>
  if (!form)   return <PageContainer><p className="text-sm text-red-500 mt-8">{error || 'Purchase order not found.'}</p></PageContainer>

  const ro = !editing

  return (
    <PageContainer>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{form.title || 'Purchase Order'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ref: <span className="font-mono">{form.po_ref || '—'}</span></p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <Fragment key="editing-actions">
              <button type="submit" form="po-detail-form" disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : '💾 Save'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setError(null); load() }}
                className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </Fragment>
          ) : (
            <Fragment key="view-actions">
              <button type="button" onClick={() => setEditing(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors">
                ✏️ Edit
              </button>
              <button type="button" onClick={() => downloadPurchaseOrderPdf(form, lineItems)}
                className="bg-gray-700 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-gray-800 transition-colors">
                ⬇ Download PDF
              </button>
            </Fragment>
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
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form id="po-detail-form" onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">Purchase Order Details</h2>

            <Field label="Status">
              {ro
                ? <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[form.status] ?? 'bg-gray-100 text-gray-600'}`}>{STATUS_LABELS[form.status] ?? form.status}</span>
                : <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
              }
            </Field>

            <Field label="Supplier">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.supplier_name || '—'}</p>
                : <input value={form.supplier_name || ''} onChange={e => set('supplier_name', e.target.value)} className={inputCls} />
              }
            </Field>

            <Field label="Title">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.title || '—'}</p>
                : <input value={form.title || ''} onChange={e => set('title', e.target.value)} className={inputCls} />
              }
            </Field>

            <Field label="Issue Date">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{formatDate(form.issue_date)}</p>
                : <input type="date" value={form.issue_date || ''} onChange={e => set('issue_date', e.target.value)} className={inputCls} />
              }
            </Field>

            <Field label="Due Date">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.due_date ? formatDate(form.due_date) : '—'}</p>
                : <input type="date" value={form.due_date || ''} onChange={e => set('due_date', e.target.value)} className={inputCls} />
              }
            </Field>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">Notes</h2>
            {ro
              ? <p className="text-sm text-gray-800 whitespace-pre-line">{form.notes || '—'}</p>
              : <textarea rows={5} value={form.notes || ''} onChange={e => set('notes', e.target.value)} className={inputCls + ' resize-none'} />
            }
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

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
          <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">Terms</h2>
          {ro
            ? <p className="text-sm text-gray-800 whitespace-pre-line">{form.terms || '—'}</p>
            : <textarea rows={3} value={form.terms || ''} onChange={e => set('terms', e.target.value)} className={inputCls + ' resize-none'} />
          }
        </div>
      </form>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Delete Purchase Order?</h3>
            <p className="text-sm text-gray-600">
              This will permanently delete <span className="font-semibold">{form.title || form.po_ref}</span> and cannot be undone.
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
