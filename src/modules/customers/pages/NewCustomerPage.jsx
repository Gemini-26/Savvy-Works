import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { createCustomer } from '../services/customerService'
import { CUSTOMER_TYPE_LABELS as BASE_CUSTOMER_TYPES } from '../../../shared/constants/customerTypes'
import { CURRENCIES, DEFAULT_CURRENCY } from '../../../shared/constants/currencies'
import { COUNTRIES, DEFAULT_COUNTRY } from '../../../shared/constants/countries'
import { GAUTENG_REGIONS, SA_PROVINCES } from '../../../shared/constants/regions'

const STATUSES       = ['Active', 'Inactive']
const DISCOUNT_TYPES = ['Percentage', 'Fixed Amount']
const PAYMENT_TERMS  = ['Immediate', '7 days', '14 days', '30 days', '60 days']

const TABS = ['Customer Details', 'Quotes', 'Jobs', 'Invoices', 'Products', 'Recurring Jobs', 'Recurring Invoices', 'Assets', 'Projects', 'Attachment']

const inputCls   = 'w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'
const readonlyCls = 'w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-gray-50 text-gray-400 cursor-not-allowed'

function Field({ label, required, children, className = '' }) {
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <label className="w-36 shrink-0 pt-1.5 text-sm text-gray-700 text-right">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function PhoneField({ label, value, onChange }) {
  const dashIdx = value.indexOf('-')
  const code = dashIdx !== -1 ? value.slice(0, dashIdx) : '+27'
  const num  = dashIdx !== -1 ? value.slice(dashIdx + 1) : value

  return (
    <Field label={label}>
      <div className="flex gap-1 items-center">
        <select
          value={code}
          onChange={e => onChange(`${e.target.value}-${num}`)}
          className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        >
          <option>+27</option>
          <option>+263</option>
          <option>+267</option>
          <option>+264</option>
          <option>+266</option>
          <option>+268</option>
          <option>+258</option>
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

export default function NewCustomerPage() {
  const navigate  = useNavigate()
  const [activeTab, setActiveTab] = useState('Customer Details')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)

  const [customerTypes, setCustomerTypes] = useState(BASE_CUSTOMER_TYPES)
  const [regions,       setRegions]       = useState(GAUTENG_REGIONS)

  const [form, setForm] = useState({
    // Customer Details
    customer_name:    '',
    customer_type:    '',
    contact_name:     '',
    job_title:        '',
    email:            '',
    telephone:        '+27-',
    mobile:           '+27-',
    fax:              '',
    website:          '',
    status:           'Active',
    // Address
    region:           '',
    address:          '',
    city:             '',
    county:           '',
    postcode:         '',
    country:          DEFAULT_COUNTRY,
    site_notes:       '',
    // Other
    currency:         DEFAULT_CURRENCY,
    credit_limit:     '0.00',
    discount:         '0.00',
    discount_type:    'Percentage',
    sage_ref:         '',
    company_reg:      '',
    vat_no:           '',
    payment_terms:    '30 days',
    assigned_products_only: false,
    notes:            '',
  })

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleAddCustomerType() {
    const value = window.prompt('New customer type name:')
    if (!value || !value.trim()) return
    const trimmed = value.trim()
    setCustomerTypes(prev => prev.includes(trimmed) ? prev : [...prev, trimmed])
    set('customer_type', trimmed)
  }

  function handleAddRegion() {
    const value = window.prompt('New region name:')
    if (!value || !value.trim()) return
    const trimmed = value.trim()
    setRegions(prev => prev.includes(trimmed) ? prev : [...prev, trimmed])
    set('region', trimmed)
  }

  function phoneVal(raw) {
    const dash = raw.indexOf('-')
    return dash !== -1 ? raw.slice(dash + 1) : raw
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createCustomer({
        customer_name: form.customer_name,
        customer_type: form.customer_type ? form.customer_type.toLowerCase() : null,
        contact_name:  form.contact_name  || null,
        job_title:     form.job_title     || null,
        email:         form.email      || null,
        telephone:     phoneVal(form.telephone) || null,
        mobile:        phoneVal(form.mobile)    || null,
        fax:           form.fax        || null,
        website:       form.website    || null,
        status:        form.status.toLowerCase(),
        // address fields — map to whatever columns exist
        region:        form.region     || null,
        address:       form.address    || null,
        city:          form.city       || null,
        county:        form.county     || null,
        postcode:      form.postcode   || null,
        country:       form.country    || null,
        site_notes:    form.site_notes || null,
        notes:         form.notes      || null,
        currency:      form.currency   || null,
        credit_limit:  form.credit_limit || 0,
        discount:      form.discount   || 0,
        discount_type: form.discount_type || null,
        sage_ref:      form.sage_ref   || null,
        vat_no:        form.vat_no     || null,
        company_reg:   form.company_reg || null,
        payment_terms: form.payment_terms || null,
        assigned_products_only: form.assigned_products_only,
      })
      navigate('/contacts/customers')
    } catch (err) {
      setError(err.message || 'Failed to save customer')
      setSaving(false)
    }
  }

  return (
    <PageContainer>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">New Customer</h1>
        <div className="flex gap-2">
          <button
            type="submit"
            form="new-customer-form"
            disabled={saving}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            💾 {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/contacts/customers')}
            className="flex items-center gap-1.5 bg-blue-500 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-600 transition-colors"
          >
            ← Back
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            + Add ▾
          </button>
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-300 mb-0 overflow-x-auto">
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
      <form id="new-customer-form" onSubmit={handleSubmit}>
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6">
          <div className="grid grid-cols-3 gap-8">

            {/* ── Column 1: Customer Details ───────────────────────── */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">
                Customer Details
              </h2>

              <Field label="Customer Name" required>
                <input
                  required
                  value={form.customer_name}
                  onChange={e => set('customer_name', e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Customer Type">
                <div className="flex gap-1">
                  <select
                    value={form.customer_type}
                    onChange={e => set('customer_type', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Select Type —</option>
                    {customerTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button type="button" title="Add new type" onClick={handleAddCustomerType}
                    className="flex-none w-8 h-8 flex items-center justify-center rounded border border-blue-400 bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-lg transition-colors">
                    +
                  </button>
                </div>
              </Field>

              <Field label="Contact Name" required>
                <input
                  required
                  value={form.contact_name}
                  onChange={e => set('contact_name', e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Job Title (Position)">
                <div className="flex gap-1">
                  <select
                    value={form.job_title}
                    onChange={e => set('job_title', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Please Select</option>
                    <option>Director</option>
                    <option>Manager</option>
                    <option>Administrator</option>
                    <option>Engineer</option>
                    <option>Technician</option>
                    <option>Other</option>
                  </select>
                  <button type="button" title="Add new position"
                    className="flex-none w-8 h-8 flex items-center justify-center rounded border border-blue-400 bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-lg transition-colors">
                    +
                  </button>
                </div>
              </Field>

              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  className={inputCls}
                />
              </Field>

              <PhoneField
                label="Telephone"
                value={form.telephone}
                onChange={v => set('telephone', v)}
              />

              <PhoneField
                label="Mobile"
                value={form.mobile}
                onChange={v => set('mobile', v)}
              />

              <Field label="Fax">
                <input
                  value={form.fax}
                  onChange={e => set('fax', e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Website">
                <div className="flex">
                  <span className="px-2 py-1.5 text-sm border border-r-0 border-gray-300 rounded-l bg-gray-50 text-gray-500">http://</span>
                  <input
                    type="url"
                    value={form.website.replace(/^https?:\/\//, '')}
                    onChange={e => set('website', e.target.value ? `https://${e.target.value}` : '')}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-r focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </Field>

              <Field label="Default Catalogue">
                <select className={inputCls}>
                  <option>None</option>
                </select>
              </Field>

              <Field label="Status">
                <select
                  value={form.status}
                  onChange={e => set('status', e.target.value)}
                  className={inputCls}
                >
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>

            {/* ── Column 2: Address Details ────────────────────────── */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">
                Address Details
              </h2>

              <Field label="Region">
                <div className="flex gap-1">
                  <select
                    value={form.region}
                    onChange={e => set('region', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">None</option>
                    {regions.map(r => <option key={r}>{r}</option>)}
                  </select>
                  <button type="button" title="Add region" onClick={handleAddRegion}
                    className="flex-none w-8 h-8 flex items-center justify-center rounded border border-blue-400 bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-lg transition-colors">
                    +
                  </button>
                </div>
              </Field>

              <Field label="Address" required>
                <textarea
                  required
                  rows={5}
                  value={form.address}
                  onChange={e => set('address', e.target.value)}
                  placeholder="Address"
                  className={`${inputCls} resize-none`}
                />
              </Field>

              <Field label="City">
                <input
                  value={form.city}
                  onChange={e => set('city', e.target.value)}
                  placeholder="City"
                  className={inputCls}
                />
              </Field>

              <Field label="Province">
                <select
                  value={form.county}
                  onChange={e => set('county', e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Select Province —</option>
                  {SA_PROVINCES.map(p => <option key={p}>{p}</option>)}
                </select>
              </Field>

              <Field label="Postcode">
                <div className="flex gap-1 items-center">
                  <input
                    value={form.postcode}
                    onChange={e => set('postcode', e.target.value)}
                    placeholder="Postcode"
                    className={inputCls}
                  />
                  <button type="button" title="Lookup postcode"
                    className="flex-none w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors text-xs">
                    🔍
                  </button>
                  <button type="button" title="Map"
                    className="flex-none w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors text-xs">
                    🌐
                  </button>
                </div>
              </Field>

              <Field label="Country">
                <select
                  value={form.country}
                  onChange={e => set('country', e.target.value)}
                  className={inputCls}
                >
                  {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Site Notes">
                <textarea
                  rows={4}
                  value={form.site_notes}
                  onChange={e => set('site_notes', e.target.value)}
                  className={`${inputCls} resize-none`}
                />
              </Field>
            </div>

            {/* ── Column 3: Other Details ───────────────────────────── */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">
                Other Details
              </h2>

              <Field label="Currency">
                <select
                  value={form.currency}
                  onChange={e => set('currency', e.target.value)}
                  className={inputCls}
                >
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Credit Limit">
                <div className="flex">
                  <span className="px-2 py-1.5 text-sm border border-r-0 border-gray-300 rounded-l bg-gray-50 text-gray-600 font-medium">R</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.credit_limit}
                    onChange={e => set('credit_limit', e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-r focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </Field>

              <Field label="Discount">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discount}
                  onChange={e => set('discount', e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Discount Type">
                <select
                  value={form.discount_type}
                  onChange={e => set('discount_type', e.target.value)}
                  className={inputCls}
                >
                  {DISCOUNT_TYPES.map(d => <option key={d}>{d}</option>)}
                </select>
              </Field>

              <Field label="Sage Ref.">
                <input
                  value={form.sage_ref}
                  onChange={e => set('sage_ref', e.target.value)}
                  placeholder="Sage Reference (if any)"
                  className={inputCls}
                />
              </Field>

              <Field label="Company Reg">
                <input
                  value={form.company_reg}
                  onChange={e => set('company_reg', e.target.value)}
                  placeholder="Company Reg"
                  className={inputCls}
                />
              </Field>

              <Field label="VAT / Tax No.">
                <input
                  value={form.vat_no}
                  onChange={e => set('vat_no', e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Payment Terms">
                <div className="flex items-center gap-2">
                  <select
                    value={form.payment_terms}
                    onChange={e => set('payment_terms', e.target.value)}
                    className={inputCls}
                  >
                    {PAYMENT_TERMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </Field>

              <Field label="Assigned Products Only">
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-700">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="assigned_products"
                      checked={form.assigned_products_only}
                      onChange={() => set('assigned_products_only', true)}
                    /> Yes
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="assigned_products"
                      checked={!form.assigned_products_only}
                      onChange={() => set('assigned_products_only', false)}
                    /> No
                  </label>
                </div>
              </Field>

              <Field label="Notes">
                <div className="space-y-1">
                  <div className="flex justify-end">
                    <button type="button" className="text-xs text-blue-600 hover:underline">
                      Insert Auto Text
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={form.notes}
                    onChange={e => set('notes', e.target.value)}
                    className={`${inputCls} resize-none`}
                  />
                </div>
              </Field>

              <Field label="Default Products Tax">
                <select className={inputCls}>
                  <option value="">Please Select</option>
                  <option>Standard Rate (15%)</option>
                  <option>Zero Rate (0%)</option>
                  <option>Exempt</option>
                </select>
              </Field>

              <Field label="Default Services Tax">
                <select className={inputCls}>
                  <option value="">Please Select</option>
                  <option>Standard Rate (15%)</option>
                  <option>Zero Rate (0%)</option>
                  <option>Exempt</option>
                </select>
              </Field>
            </div>

          </div>
        </div>
      </form>

    </PageContainer>
  )
}
