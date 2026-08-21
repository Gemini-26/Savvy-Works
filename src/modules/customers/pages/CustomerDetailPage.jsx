import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { fetchCustomer, updateCustomer, deleteCustomer } from '../services/customerService'
import { CURRENCIES } from '../../../shared/constants/currencies'
import { COUNTRIES } from '../../../shared/constants/countries'
import { GAUTENG_REGIONS, SA_PROVINCES } from '../../../shared/constants/regions'

const CUSTOMER_TYPES = ['General Customer', 'Insurance', 'Maintenance', 'Private']
const STATUSES       = ['Active', 'Inactive']
const DISCOUNT_TYPES = ['Percentage', 'Fixed Amount']
const PAYMENT_TERMS  = ['Immediate', '7 days', '14 days', '30 days', '60 days']
const TABS           = ['Customer Details', 'Quotes', 'Jobs', 'Invoices', 'Products', 'Recurring Jobs', 'Recurring Invoices', 'Assets', 'Projects', 'Attachment']

const inputCls    = 'w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'
const readonlyCls = 'w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-gray-50 text-gray-500 cursor-not-allowed'

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

function PhoneField({ label, value = '', onChange, readOnly }) {
  const dashIdx = value.indexOf('-')
  const code = dashIdx !== -1 ? value.slice(0, dashIdx) : '+27'
  const num  = dashIdx !== -1 ? value.slice(dashIdx + 1) : value

  if (readOnly) {
    return (
      <Field label={label}>
        <input readOnly value={value} className={readonlyCls} />
      </Field>
    )
  }

  return (
    <Field label={label}>
      <div className="flex gap-1 items-center">
        <select
          value={code}
          onChange={e => onChange(`${e.target.value}-${num}`)}
          className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        >
          <option>+27</option><option>+263</option><option>+267</option>
          <option>+264</option><option>+266</option><option>+268</option><option>+258</option>
        </select>
        <span className="text-gray-400 text-sm">-</span>
        <input
          type="tel"
          value={num}
          onChange={e => onChange(`${code}-${e.target.value}`)}
          className={inputCls}
        />
      </div>
    </Field>
  )
}

function toFormPhone(raw) {
  if (!raw) return '+27-'
  if (raw.startsWith('+')) return raw
  return `+27-${raw}`
}

function fromFormPhone(val) {
  const dash = val.indexOf('-')
  return dash !== -1 ? val.slice(dash + 1) : val
}

export default function CustomerDetailPage() {
  const { id }    = useParams()
  const navigate  = useNavigate()

  const [editing,   setEditing]   = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,     setError]     = useState(null)
  const [activeTab, setActiveTab] = useState('Customer Details')

  const [form, setForm] = useState(null)

  useEffect(() => {
    fetchCustomer(id)
      .then(data => {
        setForm(dbToForm(data))
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Failed to load customer')
        setLoading(false)
      })
  }, [id])

  function dbToForm(d) {
    return {
      customer_name:          d.customer_name          ?? '',
      customer_type:          toDisplayType(d.customer_type),
      contact_name:           d.contact_name           ?? '',
      job_title:              d.job_title              ?? '',
      email:                  d.email                  ?? '',
      telephone:              toFormPhone(d.telephone),
      mobile:                 toFormPhone(d.mobile),
      fax:                    d.fax                    ?? '',
      website:                d.website                ?? '',
      status:                 toDisplayStatus(d.status),
      region:                 d.region                 ?? '',
      address:                d.address                ?? '',
      city:                   d.city                   ?? '',
      county:                 d.county                 ?? '',
      postcode:               d.postcode               ?? '',
      country:                d.country                ?? 'South Africa (+27)',
      site_notes:             d.site_notes             ?? '',
      currency:               d.currency               ?? 'South African Rand - RAND',
      credit_limit:           d.credit_limit           ?? '0.00',
      discount:               d.discount               ?? '0.00',
      discount_type:          d.discount_type          ?? 'Percentage',
      sage_ref:               d.sage_ref               ?? '',
      company_reg:            d.company_reg            ?? '',
      vat_no:                 d.vat_no                 ?? '',
      payment_terms:          d.payment_terms          ?? '30 days',
      assigned_products_only: d.assigned_products_only ?? false,
      notes:                  d.notes                  ?? '',
    }
  }

  function toDisplayType(raw) {
    if (!raw) return 'General Customer'
    const map = { insurance: 'Insurance', maintenance: 'Maintenance', private: 'Private', general: 'General Customer' }
    return map[raw] ?? 'General Customer'
  }

  function toDisplayStatus(raw) {
    if (!raw) return 'Active'
    return raw === 'on_hold' ? 'On Hold' : raw.charAt(0).toUpperCase() + raw.slice(1)
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateCustomer(id, {
        customer_name: form.customer_name,
        customer_type: form.customer_type.toLowerCase().replace('general customer', 'general').trim(),
        contact_name:  form.contact_name  || null,
        job_title:     form.job_title     || null,
        email:         form.email         || null,
        telephone:     fromFormPhone(form.telephone) || null,
        mobile:        fromFormPhone(form.mobile)    || null,
        fax:           form.fax           || null,
        website:       form.website       || null,
        status:        form.status.toLowerCase().replace(' ', '_'),
        region:        form.region        || null,
        address:       form.address       || null,
        city:          form.city          || null,
        county:        form.county        || null,
        postcode:      form.postcode      || null,
        country:       form.country       || null,
        site_notes:    form.site_notes    || null,
        currency:      form.currency      || null,
        credit_limit:  form.credit_limit  || null,
        discount:      form.discount      || null,
        discount_type: form.discount_type || null,
        sage_ref:      form.sage_ref      || null,
        company_reg:   form.company_reg   || null,
        vat_no:        form.vat_no        || null,
        payment_terms: form.payment_terms || null,
        assigned_products_only: form.assigned_products_only,
        notes:         form.notes         || null,
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
      await deleteCustomer(id)
      navigate('/contacts/customers')
    } catch (err) {
      setError(err.message || 'Failed to delete customer')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading) return (
    <PageContainer>
      <p className="text-sm text-gray-400 mt-8">Loading customer…</p>
    </PageContainer>
  )

  if (!form) return (
    <PageContainer>
      <p className="text-sm text-red-500 mt-8">{error || 'Customer not found.'}</p>
    </PageContainer>
  )

  const ro = !editing

  return (
    <PageContainer>

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">
          {form.customer_name || 'Customer'}
        </h1>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                type="submit"
                form="customer-detail-form"
                disabled={saving}
                className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                💾 {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setError(null) }}
                className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              ✏️ Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 bg-blue-500 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-600 transition-colors"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-red-700 transition-colors"
          >
            🗑 Delete
          </button>
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-300 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => tab === 'Customer Details' && setActiveTab(tab)}
            className={[
              'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
              tab === activeTab
                ? 'border-blue-600 text-white bg-blue-600'
                : tab === 'Customer Details'
                  ? 'border-transparent text-gray-600 hover:text-blue-600 hover:border-blue-300'
                  : 'border-transparent text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mt-3">
          {error}
        </div>
      )}

      {/* ── Form body ─────────────────────────────────────────────────── */}
      <form id="customer-detail-form" onSubmit={handleSave}>
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6">
          <div className="grid grid-cols-3 gap-8">

            {/* ── Column 1: Customer Details ───────────────────────── */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">Customer Details</h2>

              <Field label="Customer Name" required>
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800 font-medium">{form.customer_name || '—'}</p>
                  : <input required value={form.customer_name} onChange={e => set('customer_name', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Customer Type">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.customer_type || '—'}</p>
                  : <select value={form.customer_type} onChange={e => set('customer_type', e.target.value)} className={inputCls}>
                      {CUSTOMER_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                }
              </Field>

              <Field label="Contact Name" required>
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.contact_name || '—'}</p>
                  : <input required value={form.contact_name} onChange={e => set('contact_name', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Job Title">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.job_title || '—'}</p>
                  : <select value={form.job_title} onChange={e => set('job_title', e.target.value)} className={inputCls}>
                      <option value="">Please Select</option>
                      <option>Director</option><option>Manager</option><option>Administrator</option>
                      <option>Engineer</option><option>Technician</option><option>Other</option>
                    </select>
                }
              </Field>

              <Field label="Email">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.email || '—'}</p>
                  : <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} />
                }
              </Field>

              <PhoneField label="Telephone" value={form.telephone} onChange={v => set('telephone', v)} readOnly={ro} />
              <PhoneField label="Mobile"    value={form.mobile}    onChange={v => set('mobile', v)}    readOnly={ro} />

              <Field label="Fax">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.fax || '—'}</p>
                  : <input value={form.fax} onChange={e => set('fax', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Website">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">
                      {form.website
                        ? <a href={form.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{form.website}</a>
                        : '—'}
                    </p>
                  : <div className="flex">
                      <span className="px-2 py-1.5 text-sm border border-r-0 border-gray-300 rounded-l bg-gray-50 text-gray-500">http://</span>
                      <input
                        type="url"
                        value={form.website.replace(/^https?:\/\//, '')}
                        onChange={e => set('website', e.target.value ? `https://${e.target.value}` : '')}
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-r focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                }
              </Field>

              <Field label="Status">
                {ro
                  ? <span className={[
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      form.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
                    ].join(' ')}>{form.status}</span>
                  : <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                }
              </Field>
            </div>

            {/* ── Column 2: Address Details ────────────────────────── */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">Address Details</h2>

              <Field label="Region">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.region || '—'}</p>
                  : <select value={form.region} onChange={e => set('region', e.target.value)} className={inputCls}>
                      <option value="">None</option>
                      {GAUTENG_REGIONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                }
              </Field>

              <Field label="Address" required>
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800 whitespace-pre-line">{form.address || '—'}</p>
                  : <textarea required rows={5} value={form.address} onChange={e => set('address', e.target.value)}
                      className={`${inputCls} resize-none`} />
                }
              </Field>

              <Field label="City">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.city || '—'}</p>
                  : <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="City" className={inputCls} />
                }
              </Field>

              <Field label="Province">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.county || '—'}</p>
                  : <select value={form.county} onChange={e => set('county', e.target.value)} className={inputCls}>
                      <option value="">— Select Province —</option>
                      {SA_PROVINCES.map(p => <option key={p}>{p}</option>)}
                    </select>
                }
              </Field>

              <Field label="Postcode">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.postcode || '—'}</p>
                  : <input value={form.postcode} onChange={e => set('postcode', e.target.value)} placeholder="Postcode" className={inputCls} />
                }
              </Field>

              <Field label="Country">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.country || '—'}</p>
                  : <select value={form.country} onChange={e => set('country', e.target.value)} className={inputCls}>
                      {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                }
              </Field>

              <Field label="Site Notes">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800 whitespace-pre-line">{form.site_notes || '—'}</p>
                  : <textarea rows={4} value={form.site_notes} onChange={e => set('site_notes', e.target.value)}
                      className={`${inputCls} resize-none`} />
                }
              </Field>
            </div>

            {/* ── Column 3: Other Details ───────────────────────────── */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">Other Details</h2>

              <Field label="Currency">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.currency || '—'}</p>
                  : <select value={form.currency} onChange={e => set('currency', e.target.value)} className={inputCls}>
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                }
              </Field>

              <Field label="Credit Limit">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">R {form.credit_limit || '0.00'}</p>
                  : <div className="flex">
                      <span className="px-2 py-1.5 text-sm border border-r-0 border-gray-300 rounded-l bg-gray-50 text-gray-600 font-medium">R</span>
                      <input type="number" min="0" step="0.01" value={form.credit_limit}
                        onChange={e => set('credit_limit', e.target.value)}
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-r focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                }
              </Field>

              <Field label="Discount">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.discount || '0.00'}</p>
                  : <input type="number" min="0" step="0.01" value={form.discount}
                      onChange={e => set('discount', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Discount Type">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.discount_type || '—'}</p>
                  : <select value={form.discount_type} onChange={e => set('discount_type', e.target.value)} className={inputCls}>
                      {DISCOUNT_TYPES.map(d => <option key={d}>{d}</option>)}
                    </select>
                }
              </Field>

              <Field label="Sage Ref.">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.sage_ref || '—'}</p>
                  : <input value={form.sage_ref} onChange={e => set('sage_ref', e.target.value)}
                      placeholder="Sage Reference (if any)" className={inputCls} />
                }
              </Field>

              <Field label="Company Reg">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.company_reg || '—'}</p>
                  : <input value={form.company_reg} onChange={e => set('company_reg', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="VAT / Tax No.">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.vat_no || '—'}</p>
                  : <input value={form.vat_no} onChange={e => set('vat_no', e.target.value)} className={inputCls} />
                }
              </Field>

              <Field label="Payment Terms">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.payment_terms || '—'}</p>
                  : <select value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} className={inputCls}>
                      {PAYMENT_TERMS.map(p => <option key={p}>{p}</option>)}
                    </select>
                }
              </Field>

              <Field label="Assigned Products Only">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800">{form.assigned_products_only ? 'Yes' : 'No'}</p>
                  : <div className="flex items-center gap-4 mt-1 text-sm text-gray-700">
                      <label className="flex items-center gap-1.5">
                        <input type="radio" name="assigned_products" checked={form.assigned_products_only}
                          onChange={() => set('assigned_products_only', true)} /> Yes
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="radio" name="assigned_products" checked={!form.assigned_products_only}
                          onChange={() => set('assigned_products_only', false)} /> No
                      </label>
                    </div>
                }
              </Field>

              <Field label="Notes">
                {ro
                  ? <p className="py-1.5 text-sm text-gray-800 whitespace-pre-line">{form.notes || '—'}</p>
                  : <textarea rows={4} value={form.notes} onChange={e => set('notes', e.target.value)}
                      className={`${inputCls} resize-none`} />
                }
              </Field>
            </div>

          </div>
        </div>
      </form>

      {/* ── Delete confirmation modal ──────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Delete Customer?</h3>
            <p className="text-sm text-gray-600">
              This will permanently delete <span className="font-semibold">{form.customer_name}</span> and cannot be undone.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2 rounded text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2 rounded text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </PageContainer>
  )
}
