import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { createJob } from '../services/jobService'
import { supabase } from '../../../lib/supabase'
import { CUSTOMER_TYPE_LABELS as BASE_CUSTOMER_TYPES } from '../../../shared/constants/customerTypes'
import { JOB_TYPES } from '../../../shared/constants/jobTypes'
import { useCustomers } from '../../../shared/hooks/useCustomers'
import { CURRENCIES, DEFAULT_CURRENCY } from '../../../shared/constants/currencies'
import { COUNTRIES, DEFAULT_COUNTRY } from '../../../shared/constants/countries'
import { GAUTENG_REGIONS, SA_PROVINCES } from '../../../shared/constants/regions'

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
const STATUSES    = ['Active', 'Inactive']

function generateJobRef() {
  const year = new Date().getFullYear()
  const rand = Math.floor(Math.random() * 90000) + 10000
  return `JB-${year}-${rand}`
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// `scheduled_for` is a timestamptz column — a bare "YYYY-MM-DDTHH:mm" string
// (no offset) gets interpreted by Postgres as UTC, shifting local (SAST) times
// forward by 2 hours. Parse as local time, then serialize with the offset baked in.
function localDateTimeToISO(value) {
  if (!value) return null
  const [datePart, timePart] = value.split('T')
  const [y, m, d]  = datePart.split('-').map(Number)
  const [hh, mm]   = timePart.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm).toISOString()
}

function Field({ label, required, children, span }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls     = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const readonlyCls  = 'w-full px-3 py-2 text-sm rounded border border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
const disabledCls  = 'w-full px-3 py-2 text-sm rounded border border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'

function PhoneInput({ value, onChange, placeholder, readOnly }) {
  const parts = value.includes('-') ? value.split(/-(.+)/) : ['+27', value]
  const code  = parts[0]
  const num   = parts[1] ?? ''

  if (readOnly) {
    return (
      <div className="flex gap-1">
        <span className="px-2 py-2 text-sm rounded border border-gray-200 bg-gray-50 text-gray-500">{code}</span>
        <span className="flex items-center text-gray-400 text-sm">-</span>
        <input readOnly value={num} className={readonlyCls + ' flex-1'} />
      </div>
    )
  }

  return (
    <div className="flex gap-1">
      <select
        value={code}
        onChange={e => onChange(`${e.target.value}-${num}`)}
        className="px-2 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        <option>+27</option>
        <option>+263</option>
        <option>+267</option>
        <option>+264</option>
      </select>
      <span className="flex items-center text-gray-400 text-sm">-</span>
      <input
        type="tel"
        value={num}
        onChange={e => onChange(`${code}-${e.target.value}`)}
        placeholder={placeholder}
        className={inputCls + ' flex-1'}
      />
    </div>
  )
}

const BLANK_SITE = {
  site_company:       '',
  site_contact_name:  '',
  site_contact_email: '',
  site_telephone:     '+27-',
  site_mobile:        '+27-',
  site_address:       '',
  site_city:          '',
  site_county:        '',
  site_postcode:      '',
  site_country:       DEFAULT_COUNTRY,
  site_notes:         '',
}

export default function NewJobPage() {
  const navigate = useNavigate()
  const { customers, reload: reloadCustomers } = useCustomers()
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const [contacts,  setContacts]  = useState([])
  const [syncSite,  setSyncSite]  = useState(true)

  const BLANK_NEW_CUSTOMER = {
    customer_name: '', contact_name: '', customer_type: '',
    email: '', telephone: '', mobile: '', fax: '', website: '',
    payment_terms: '30 days', currency: DEFAULT_CURRENCY,
    credit_limit: '0.00', discount: '0.00', vat_no: '', status: 'Active',
    region: '', address: '', city: '', county: '', postcode: '',
    country: DEFAULT_COUNTRY, site_notes: '', sage_ref: '', notes: '',
  }

  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustomer,     setNewCustomer]     = useState(BLANK_NEW_CUSTOMER)
  const [savingCustomer,  setSavingCustomer]  = useState(false)
  const [customerError,   setCustomerError]   = useState(null)
  const [customerTypes,   setCustomerTypes]   = useState(BASE_CUSTOMER_TYPES)
  const [regions,         setRegions]         = useState(GAUTENG_REGIONS)

  const startDate = today()

  const [form, setForm] = useState({
    job_ref:          generateJobRef(),
    status:           'New',
    job_type:         'New Job',
    priority:         'Medium',
    customer_ref:     '',
    customer_job_ref: '',
    po_ref:           '',
    alert_by_email:   false,
    sms_alert:        false,
    start_date:       startDate,
    complete_by:      addDays(startDate, 14),
    scheduled_for:    '',
    title:            '',
    description:      '',
    notes:            '',
    customer_id:       '',
    customer_type:     '',
    contact_name:      '',
    contact_email:     '',
    contact_telephone: '+27-',
    contact_mobile:    '+27-',
    customer_address:  '',
    customer_city:     '',
    customer_county:   '',
    customer_postcode: '',
    customer_country:  DEFAULT_COUNTRY,
    ...BLANK_SITE,
  })

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // Mirror customer fields into site fields whenever syncSite is on
  useEffect(() => {
    if (!syncSite) return
    setForm(prev => ({
      ...prev,
      site_company:        prev.contact_name,
      site_contact_name:   prev.contact_name,
      site_contact_email:  prev.contact_email,
      site_telephone:      prev.contact_telephone,
      site_mobile:         prev.contact_mobile,
      site_address:        prev.customer_address,
      site_city:           prev.customer_city,
      site_county:         prev.customer_county,
      site_postcode:       prev.customer_postcode,
      site_country:        prev.customer_country,
    }))
  }, [
    syncSite,
    form.contact_name, form.contact_email, form.contact_telephone, form.contact_mobile,
    form.customer_address, form.customer_city, form.customer_county, form.customer_postcode, form.customer_country,
  ])

  function handleClearSite() {
    setSyncSite(false)
    setForm(prev => ({ ...prev, ...BLANK_SITE }))
  }

  function handleEditSite() {
    // Unlock the site fields for independent editing without wiping current values
    setSyncSite(false)
  }

  function handleSameAsCustomer() {
    setSyncSite(true)
  }

  function setNC(field, value) {
    setNewCustomer(prev => ({ ...prev, [field]: value }))
  }

  async function handleAddCustomer(e) {
    e.preventDefault()
    setSavingCustomer(true)
    setCustomerError(null)
    try {
      const { error } = await supabase
        .from('customers')
        .insert([{
          customer_name: newCustomer.customer_name,
          contact_name:  newCustomer.contact_name,
          email:         newCustomer.email     || null,
          telephone:     newCustomer.telephone || null,
          mobile:        newCustomer.mobile    || null,
          fax:           newCustomer.fax       || null,
          website:       newCustomer.website   || null,
          customer_type: newCustomer.customer_type || null,
          payment_terms: newCustomer.payment_terms || null,
          currency:      newCustomer.currency  || null,
          credit_limit:  newCustomer.credit_limit || 0,
          discount:      newCustomer.discount  || 0,
          vat_no:        newCustomer.vat_no    || null,
          status:        newCustomer.status.toLowerCase(),
          region:        newCustomer.region    || null,
          address:       newCustomer.address   || null,
          city:          newCustomer.city      || null,
          county:        newCustomer.county    || null,
          postcode:      newCustomer.postcode  || null,
          country:       newCustomer.country   || null,
          site_notes:    newCustomer.site_notes || null,
          sage_ref:      newCustomer.sage_ref  || null,
          notes:         newCustomer.notes     || null,
        }])
      if (error) throw error
      const { data: list } = await supabase.from('customers').select('id').eq('customer_name', newCustomer.customer_name).order('created_at', { ascending: false }).limit(1)
      await reloadCustomers()
      if (list?.[0]) set('customer_id', list[0].id)
      setShowAddCustomer(false)
      setNewCustomer(BLANK_NEW_CUSTOMER)
    } catch (err) {
      setCustomerError(err.message || 'Failed to add customer')
    } finally {
      setSavingCustomer(false)
    }
  }

  useEffect(() => {
    if (!form.customer_id) {
      setContacts([])
      return
    }

    // Fetch full customer record and populate contact fields
    supabase
      .from('customers')
      .select('customer_name, email, telephone, mobile, customer_type, address, city, county, postcode, country')
      .eq('id', form.customer_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setForm(prev => ({
          ...prev,
          contact_name:      data.customer_name ?? '',
          contact_email:     data.email         ?? '',
          contact_telephone: data.telephone ? `+27-${data.telephone}` : '+27-',
          contact_mobile:    data.mobile    ? `+27-${data.mobile}`    : '+27-',
          customer_type:     data.customer_type ?? '',
          customer_address:  data.address   ?? '',
          customer_city:     data.city      ?? '',
          customer_county:   data.county    ?? '',
          customer_postcode: data.postcode  ?? '',
          customer_country:  data.country   ?? DEFAULT_COUNTRY,
        }))
      })

    // Fetch contacts linked to this customer
    supabase
      .from('customer_contacts')
      .select('id, first_name, last_name, email, telephone, mobile')
      .eq('customer_id', form.customer_id)
      .then(({ data }) => { if (data) setContacts(data) })

  }, [form.customer_id])

  function handleContactSelect(e) {
    const c = contacts.find(x => x.id === e.target.value)
    if (!c) return
    setForm(prev => ({
      ...prev,
      contact_name:      [c.first_name, c.last_name].filter(Boolean).join(' '),
      contact_email:     c.email     ?? '',
      contact_telephone: c.telephone ? `+27-${c.telephone}` : '+27-',
      contact_mobile:    c.mobile    ? `+27-${c.mobile}`    : '+27-',
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      // customer_address/city/county/postcode/country only exist on the
      // customers table — the jobs table only has site_* columns.
      const { customer_address, customer_city, customer_county, customer_postcode, customer_country, ...jobForm } = form
      await createJob({
        ...jobForm,
        status:        form.status.toLowerCase().replace(/ /g, '_'),
        priority:      form.priority.toLowerCase(),
        customer_id:   form.customer_id || null,
        quote_id:      null,
        assigned_to:   null,
        scheduled_for: localDateTimeToISO(form.scheduled_for),
        start_date:    form.start_date    || null,
        complete_by:   form.complete_by   || null,
      })
      navigate('/jobs/active')
    } catch (err) {
      setError(err.message || 'Failed to save job')
      setSaving(false)
    }
  }

  return (
    <PageContainer>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">New Job</h1>
        <div className="flex gap-2">
          <button
            type="submit"
            form="new-job-form"
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            💾 {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/jobs/active')}
            className="flex items-center gap-2 bg-blue-500 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-blue-600"
          >
            ← Back
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form id="new-job-form" onSubmit={handleSubmit}>
        <div className="grid grid-cols-3 gap-6">

          {/* ── Column 1: Customer Details ───────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">
              Customer Details
            </h2>

            <div className="grid grid-cols-2 gap-3">

              <Field label="Customer" required span>
                <div className="flex gap-2">
                  <select required value={form.customer_id}
                    onChange={e => set('customer_id', e.target.value)} className={inputCls + ' flex-1'}>
                    <option value="">Select Customer</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.customer_name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setShowAddCustomer(true)}
                    title="Add new customer"
                    className="flex-none w-9 h-9 flex items-center justify-center rounded border border-blue-400 bg-blue-50 text-blue-600 hover:bg-blue-100 text-lg font-bold transition-colors">
                    +
                  </button>
                </div>
              </Field>

              <Field label="Contact" span>
                <select disabled={!form.customer_id} onChange={handleContactSelect}
                  defaultValue="" className={form.customer_id ? inputCls : disabledCls}>
                  <option value="">{form.customer_id ? 'Select Contact' : 'Select Customer First'}</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>
                      {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Type" span>
                <div className="flex gap-1">
                  <select value={form.customer_type} onChange={e => set('customer_type', e.target.value)} className={inputCls + ' flex-1'}>
                    <option value="">— Select Type —</option>
                    {customerTypes.map(t => (
                      <option key={t} value={t.toLowerCase()}>{t}</option>
                    ))}
                  </select>
                  <button type="button" title="Add new type" onClick={() => {
                    const value = window.prompt('New customer type name:')
                    if (!value || !value.trim()) return
                    const trimmed = value.trim()
                    setCustomerTypes(prev => prev.includes(trimmed) ? prev : [...prev, trimmed])
                    set('customer_type', trimmed.toLowerCase())
                  }}
                    className="flex-none w-9 h-9 flex items-center justify-center rounded border border-blue-400 bg-blue-50 text-blue-600 hover:bg-blue-100 text-lg font-bold transition-colors">
                    +
                  </button>
                </div>
              </Field>

              <Field label="Name" required span>
                <input required value={form.contact_name}
                  onChange={e => set('contact_name', e.target.value)}
                  placeholder="Full Name" className={inputCls} />
              </Field>

              <Field label="Email" span>
                <input type="email" value={form.contact_email}
                  onChange={e => set('contact_email', e.target.value)} className={inputCls} />
              </Field>

              <Field label="Telephone" span>
                <PhoneInput value={form.contact_telephone}
                  onChange={v => set('contact_telephone', v)} placeholder="Telephone" />
              </Field>

              <Field label="Mobile" span>
                <PhoneInput value={form.contact_mobile}
                  onChange={v => set('contact_mobile', v)} placeholder="Mobile No." />
              </Field>

              <Field label="Address" span>
                <textarea rows={3} value={form.customer_address}
                  onChange={e => set('customer_address', e.target.value)}
                  placeholder="Address" className={inputCls + ' resize-none'} />
              </Field>

              <Field label="City">
                <input value={form.customer_city} onChange={e => set('customer_city', e.target.value)}
                  placeholder="City" className={inputCls} />
              </Field>

              <Field label="Province">
                <select value={form.customer_county} onChange={e => set('customer_county', e.target.value)} className={inputCls}>
                  <option value="">— Select Province —</option>
                  {SA_PROVINCES.map(p => <option key={p}>{p}</option>)}
                </select>
              </Field>

              <Field label="Postcode" span>
                <input value={form.customer_postcode} onChange={e => set('customer_postcode', e.target.value)}
                  placeholder="Postcode" className={inputCls} />
              </Field>

              <Field label="Country" span>
                <select value={form.customer_country} onChange={e => set('customer_country', e.target.value)} className={inputCls}>
                  {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>

            </div>
          </div>

          {/* ── Column 2: Site Details ───────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">

            {/* Header with sync toggle buttons */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider">
                Site Details
              </h2>
              <div className="flex gap-1.5">
                {syncSite ? (
                  <>
                    <button type="button" onClick={handleEditSite}
                      className="text-xs font-medium text-blue-500 hover:text-blue-700 border border-blue-200 hover:border-blue-400 px-3 py-1 rounded transition-colors">
                      Edit
                    </button>
                    <button type="button" onClick={handleClearSite}
                      className="text-xs font-medium text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1 rounded transition-colors">
                      Clear
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={handleClearSite}
                      className="text-xs font-medium text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1 rounded transition-colors">
                      Clear
                    </button>
                    <button type="button" onClick={handleSameAsCustomer}
                      className="text-xs font-medium text-blue-500 hover:text-blue-700 border border-blue-200 hover:border-blue-400 px-3 py-1 rounded transition-colors">
                      Same as Customer
                    </button>
                  </>
                )}
              </div>
            </div>

            {syncSite && (
              <p className="text-xs text-gray-400 -mt-2">
                Showing customer details — click <span className="text-blue-500 font-medium">Edit</span> to edit them independently, or <span className="text-red-500 font-medium">Clear</span> to enter a different site.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">

              <Field label="Company" span>
                <input value={form.site_company} onChange={e => set('site_company', e.target.value)}
                  placeholder="Site Company Name" readOnly={syncSite}
                  className={syncSite ? readonlyCls : inputCls} />
              </Field>

              <Field label="Contact Name" span>
                <input value={form.site_contact_name} onChange={e => set('site_contact_name', e.target.value)}
                  placeholder="Site Contact Name" readOnly={syncSite}
                  className={syncSite ? readonlyCls : inputCls} />
              </Field>

              <Field label="Email" span>
                <input type="email" value={form.site_contact_email}
                  onChange={e => set('site_contact_email', e.target.value)}
                  placeholder="Site Email" readOnly={syncSite}
                  className={syncSite ? readonlyCls : inputCls} />
              </Field>

              <Field label="Telephone" span>
                <PhoneInput value={form.site_telephone}
                  onChange={v => set('site_telephone', v)}
                  placeholder="Site Telephone" readOnly={syncSite} />
              </Field>

              <Field label="Mobile" span>
                <PhoneInput value={form.site_mobile}
                  onChange={v => set('site_mobile', v)}
                  placeholder="Site Mobile for SMS alert" readOnly={syncSite} />
              </Field>

              <Field label="Address" span>
                <textarea rows={3} value={form.site_address}
                  onChange={e => set('site_address', e.target.value)}
                  placeholder="Site Address" readOnly={syncSite}
                  className={(syncSite ? readonlyCls : inputCls) + ' resize-none'} />
              </Field>

              <Field label="City">
                <input value={form.site_city} onChange={e => set('site_city', e.target.value)}
                  placeholder="Site City" readOnly={syncSite}
                  className={syncSite ? readonlyCls : inputCls} />
              </Field>

              <Field label="Province">
                {syncSite ? (
                  <input readOnly value={form.site_county} className={readonlyCls} />
                ) : (
                  <select value={form.site_county} onChange={e => set('site_county', e.target.value)} className={inputCls}>
                    <option value="">— Select Province —</option>
                    {SA_PROVINCES.map(p => <option key={p}>{p}</option>)}
                  </select>
                )}
              </Field>

              <Field label="Postcode" span>
                <input value={form.site_postcode} onChange={e => set('site_postcode', e.target.value)}
                  placeholder="Site Postcode" readOnly={syncSite}
                  className={syncSite ? readonlyCls : inputCls} />
              </Field>

              <Field label="Country" span>
                {syncSite ? (
                  <input readOnly value={form.site_country} className={readonlyCls} />
                ) : (
                  <select value={form.site_country} onChange={e => set('site_country', e.target.value)} className={inputCls}>
                    {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                )}
              </Field>

              <Field label="Notes" span>
                <textarea rows={3} value={form.site_notes}
                  onChange={e => set('site_notes', e.target.value)}
                  placeholder="Site Notes" className={inputCls + ' resize-none'} />
              </Field>

            </div>
          </div>

          {/* ── Column 3: Job Details ────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">
              Job Details
            </h2>

            <div className="grid grid-cols-2 gap-3">

              <Field label="Job Ref" span>
                <input readOnly value={form.job_ref}
                  className="w-full px-3 py-2 text-sm rounded border border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed" />
              </Field>

              <Field label="Customer Ref" span>
                <input value={form.customer_ref} onChange={e => set('customer_ref', e.target.value)}
                  placeholder="Customer Ref, if any" className={inputCls} />
              </Field>

              <Field label="Customer Job Ref" span>
                <input value={form.customer_job_ref} onChange={e => set('customer_job_ref', e.target.value)}
                  placeholder="Customer Job Ref, if any" className={inputCls} />
              </Field>

              <Field label="Purchase Order Ref" span>
                <input value={form.po_ref} onChange={e => set('po_ref', e.target.value)}
                  placeholder="Purchase Order Ref, if any" className={inputCls} />
              </Field>

              <Field label="Job Type" required span>
                <select required value={form.job_type} onChange={e => set('job_type', e.target.value)} className={inputCls}>
                  {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>

              <Field label="Priority" span>
                <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </Field>

              <Field label="Alert Customer" span>
                <label className="flex items-center gap-2 text-sm text-gray-700 mt-1">
                  <input type="checkbox" checked={form.alert_by_email}
                    onChange={e => set('alert_by_email', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                  By Email
                </label>
              </Field>

              <Field label="On Route SMS Alert" span>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-700">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="sms_alert" checked={form.sms_alert}
                      onChange={() => set('sms_alert', true)} /> Yes
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="sms_alert" checked={!form.sms_alert}
                      onChange={() => set('sms_alert', false)} /> No
                  </label>
                </div>
              </Field>

              <Field label="Start Date" required>
                <input required type="date" value={form.start_date}
                  onChange={e => set('start_date', e.target.value)} className={inputCls} />
              </Field>

              <Field label="Complete By" required>
                <input required type="date" value={form.complete_by}
                  onChange={e => set('complete_by', e.target.value)} className={inputCls} />
              </Field>

              <Field label="Scheduled For" span>
                <input type="datetime-local" value={form.scheduled_for}
                  onChange={e => set('scheduled_for', e.target.value)} className={inputCls} />
              </Field>

              <Field label="Title / Summary" span>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  placeholder="Brief job summary" className={inputCls} />
              </Field>

              <Field label="Description" span>
                <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Detailed description of work required…"
                  className={inputCls + ' resize-none'} />
              </Field>

              <Field label="Internal Notes" span>
                <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="Internal notes (not shown to customer)…"
                  className={inputCls + ' resize-none'} />
              </Field>

            </div>
          </div>

        </div>
      </form>
      {/* ── Add Customer Modal ─────────────────────────────────────────── */}
      {showAddCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">

            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-900">Add New Customer</h3>
              <button type="button" onClick={() => setShowAddCustomer(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {customerError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mb-4">
                {customerError}
              </div>
            )}

            <form id="add-customer-form" onSubmit={handleAddCustomer} className="grid grid-cols-2 gap-x-6 gap-y-4">

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input required autoFocus value={newCustomer.customer_name}
                  onChange={e => setNC('customer_name', e.target.value)}
                  placeholder="Customer or company name"
                  className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Contact Name <span className="text-red-500">*</span>
                </label>
                <input required value={newCustomer.contact_name}
                  onChange={e => setNC('contact_name', e.target.value)}
                  placeholder="Contact name" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Customer Type</label>
                <div className="flex gap-1">
                  <select value={newCustomer.customer_type} onChange={e => setNC('customer_type', e.target.value)} className={inputCls}>
                    <option value="">— Select Type —</option>
                    {customerTypes.map(t => (
                      <option key={t} value={t.toLowerCase()}>{t}</option>
                    ))}
                  </select>
                  <button type="button" title="Add new type" onClick={() => {
                    const value = window.prompt('New customer type name:')
                    if (!value || !value.trim()) return
                    const trimmed = value.trim()
                    setCustomerTypes(prev => prev.includes(trimmed) ? prev : [...prev, trimmed])
                    setNC('customer_type', trimmed.toLowerCase())
                  }}
                    className="flex-none w-9 h-9 flex items-center justify-center rounded border border-blue-400 bg-blue-50 text-blue-600 hover:bg-blue-100 text-lg font-bold transition-colors">
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select value={newCustomer.status} onChange={e => setNC('status', e.target.value)} className={inputCls}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input type="email" value={newCustomer.email}
                  onChange={e => setNC('email', e.target.value)}
                  placeholder="Email address" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Website</label>
                <input type="url" value={newCustomer.website}
                  onChange={e => setNC('website', e.target.value)}
                  placeholder="Website" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Telephone</label>
                <input type="tel" value={newCustomer.telephone}
                  onChange={e => setNC('telephone', e.target.value)}
                  placeholder="Telephone" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Mobile</label>
                <input type="tel" value={newCustomer.mobile}
                  onChange={e => setNC('mobile', e.target.value)}
                  placeholder="Mobile" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Fax</label>
                <input value={newCustomer.fax}
                  onChange={e => setNC('fax', e.target.value)}
                  placeholder="Fax" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Payment Terms</label>
                <select value={newCustomer.payment_terms} onChange={e => setNC('payment_terms', e.target.value)} className={inputCls}>
                  {['Immediate', '7 days', '14 days', '30 days', '60 days'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                <select value={newCustomer.currency} onChange={e => setNC('currency', e.target.value)} className={inputCls}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Credit Limit</label>
                <input type="number" min="0" step="0.01" value={newCustomer.credit_limit}
                  onChange={e => setNC('credit_limit', e.target.value)}
                  className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Discount</label>
                <input type="number" min="0" step="0.01" value={newCustomer.discount}
                  onChange={e => setNC('discount', e.target.value)}
                  className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">VAT / Tax No.</label>
                <input value={newCustomer.vat_no}
                  onChange={e => setNC('vat_no', e.target.value)}
                  placeholder="VAT / Tax No." className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sage Ref.</label>
                <input value={newCustomer.sage_ref}
                  onChange={e => setNC('sage_ref', e.target.value)}
                  placeholder="Sage Reference" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Region</label>
                <div className="flex gap-1">
                  <select value={newCustomer.region} onChange={e => setNC('region', e.target.value)} className={inputCls}>
                    <option value="">None</option>
                    {regions.map(r => <option key={r}>{r}</option>)}
                  </select>
                  <button type="button" title="Add region" onClick={() => {
                    const value = window.prompt('New region name:')
                    if (!value || !value.trim()) return
                    const trimmed = value.trim()
                    setRegions(prev => prev.includes(trimmed) ? prev : [...prev, trimmed])
                    setNC('region', trimmed)
                  }}
                    className="flex-none w-9 h-9 flex items-center justify-center rounded border border-blue-400 bg-blue-50 text-blue-600 hover:bg-blue-100 text-lg font-bold transition-colors">
                    +
                  </button>
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                <textarea rows={2} value={newCustomer.address}
                  onChange={e => setNC('address', e.target.value)}
                  placeholder="Address" className={`${inputCls} resize-none`} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                <input value={newCustomer.city}
                  onChange={e => setNC('city', e.target.value)}
                  placeholder="City" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Province</label>
                <select value={newCustomer.county} onChange={e => setNC('county', e.target.value)} className={inputCls}>
                  <option value="">— Select Province —</option>
                  {SA_PROVINCES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Postcode</label>
                <input value={newCustomer.postcode}
                  onChange={e => setNC('postcode', e.target.value)}
                  placeholder="Postcode" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                <select value={newCustomer.country} onChange={e => setNC('country', e.target.value)} className={inputCls}>
                  {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Site Notes</label>
                <textarea rows={2} value={newCustomer.site_notes}
                  onChange={e => setNC('site_notes', e.target.value)}
                  placeholder="Site Notes" className={`${inputCls} resize-none`} />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <textarea rows={2} value={newCustomer.notes}
                  onChange={e => setNC('notes', e.target.value)}
                  placeholder="Notes" className={`${inputCls} resize-none`} />
              </div>

            </form>

            <div className="flex gap-3 pt-5">
              <button type="submit" form="add-customer-form" disabled={savingCustomer}
                className="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {savingCustomer ? 'Saving…' : 'Add Customer'}
              </button>
              <button type="button" onClick={() => setShowAddCustomer(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2 rounded text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </PageContainer>
  )
}
