import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { createJob } from '../services/jobService'
import { supabase } from '../../../lib/supabase'
import { CUSTOMER_TYPE_LABELS } from '../../../shared/constants/customerTypes'
import { useCustomers } from '../../../shared/hooks/useCustomers'

const JOB_TYPES = ['New Job', 'Maintenance', 'Emergency', 'Inspection', 'Installation', 'Repair', 'Other']
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
const COUNTRIES  = ['South Africa', 'Zimbabwe', 'Botswana', 'Namibia', 'Lesotho', 'Eswatini', 'Mozambique']

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
  site_country:       'South Africa',
  site_notes:         '',
}

export default function NewJobPage() {
  const navigate = useNavigate()
  const { customers, reload: reloadCustomers } = useCustomers()
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const [contacts,  setContacts]  = useState([])
  const [syncSite,  setSyncSite]  = useState(true)

  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustomer,     setNewCustomer]     = useState({
    customer_name: '', email: '', telephone: '', mobile: '', customer_type: '',
    address: '', city: '', county: '', postcode: '',
  })
  const [savingCustomer,  setSavingCustomer]  = useState(false)
  const [customerError,   setCustomerError]   = useState(null)

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
    ...BLANK_SITE,
  })

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // Mirror customer contact fields into site fields whenever syncSite is on
  useEffect(() => {
    if (!syncSite) return
    setForm(prev => ({
      ...prev,
      site_contact_name:  prev.contact_name,
      site_contact_email: prev.contact_email,
      site_telephone:     prev.contact_telephone,
      site_mobile:        prev.contact_mobile,
      site_address:       prev.site_address, // address is shared — keep as-is
      site_city:          prev.site_city,
      site_county:        prev.site_county,
      site_postcode:      prev.site_postcode,
      site_country:       prev.site_country,
    }))
  }, [syncSite, form.contact_name, form.contact_email, form.contact_telephone, form.contact_mobile])

  function handleClearSite() {
    setSyncSite(false)
    setForm(prev => ({ ...prev, ...BLANK_SITE }))
  }

  function handleSameAsCustomer() {
    setSyncSite(true)
    setForm(prev => ({
      ...prev,
      site_contact_name:  prev.contact_name,
      site_contact_email: prev.contact_email,
      site_telephone:     prev.contact_telephone,
      site_mobile:        prev.contact_mobile,
    }))
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
          email:         newCustomer.email,
          telephone:     newCustomer.telephone,
          mobile:        newCustomer.mobile,
          customer_type: newCustomer.customer_type || null,
          address:       newCustomer.address  || null,
          city:          newCustomer.city     || null,
          county:        newCustomer.county   || null,
          postcode:      newCustomer.postcode || null,
        }])
      if (error) throw error
      const { data: list } = await supabase.from('customers').select('id').eq('customer_name', newCustomer.customer_name).order('created_at', { ascending: false }).limit(1)
      await reloadCustomers()
      if (list?.[0]) set('customer_id', list[0].id)
      setShowAddCustomer(false)
      setNewCustomer({ customer_name: '', email: '', telephone: '', mobile: '', customer_type: '', address: '', city: '', county: '', postcode: '' })
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
          site_address:      data.address   ?? '',
          site_city:         data.city      ?? '',
          site_county:       data.county    ?? '',
          site_postcode:     data.postcode  ?? '',
          site_country:      data.country   ?? 'South Africa',
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
      await createJob({
        ...form,
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
                <select value={form.customer_type} onChange={e => set('customer_type', e.target.value)} className={inputCls}>
                  <option value="">— Select Type —</option>
                  {CUSTOMER_TYPE_LABELS.map(t => (
                    <option key={t} value={t.toLowerCase()}>{t}</option>
                  ))}
                </select>
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
                <textarea rows={3} value={form.site_address}
                  onChange={e => set('site_address', e.target.value)}
                  placeholder="Address" className={inputCls + ' resize-none'} />
              </Field>

              <Field label="City">
                <input value={form.site_city} onChange={e => set('site_city', e.target.value)}
                  placeholder="City" className={inputCls} />
              </Field>

              <Field label="County">
                <input value={form.site_county} onChange={e => set('site_county', e.target.value)}
                  placeholder="County" className={inputCls} />
              </Field>

              <Field label="Postcode" span>
                <input value={form.site_postcode} onChange={e => set('site_postcode', e.target.value)}
                  placeholder="Postcode" className={inputCls} />
              </Field>

              <Field label="Country" span>
                <select value={form.site_country} onChange={e => set('site_country', e.target.value)} className={inputCls}>
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
              {syncSite ? (
                <button type="button" onClick={handleClearSite}
                  className="text-xs font-medium text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1 rounded transition-colors">
                  Clear
                </button>
              ) : (
                <button type="button" onClick={handleSameAsCustomer}
                  className="text-xs font-medium text-blue-500 hover:text-blue-700 border border-blue-200 hover:border-blue-400 px-3 py-1 rounded transition-colors">
                  Same as Customer
                </button>
              )}
            </div>

            {syncSite && (
              <p className="text-xs text-gray-400 -mt-2">
                Showing customer details — click <span className="text-red-500 font-medium">Clear</span> to enter a different site.
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

              <Field label="County">
                <input value={form.site_county} onChange={e => set('site_county', e.target.value)}
                  placeholder="Site County" readOnly={syncSite}
                  className={syncSite ? readonlyCls : inputCls} />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">

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

            <form onSubmit={handleAddCustomer} className="space-y-4">

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
                <label className="block text-xs font-medium text-gray-500 mb-1">Customer Type</label>
                <select value={newCustomer.customer_type} onChange={e => setNC('customer_type', e.target.value)} className={inputCls}>
                  <option value="">— Select Type —</option>
                  {CUSTOMER_TYPE_LABELS.map(t => (
                    <option key={t} value={t.toLowerCase()}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input type="email" value={newCustomer.email}
                  onChange={e => setNC('email', e.target.value)}
                  placeholder="Email address" className={inputCls} />
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
                <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                <textarea rows={2} value={newCustomer.address}
                  onChange={e => setNC('address', e.target.value)}
                  placeholder="Address" className={`${inputCls} resize-none`} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                  <input value={newCustomer.city}
                    onChange={e => setNC('city', e.target.value)}
                    placeholder="City" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">County</label>
                  <input value={newCustomer.county}
                    onChange={e => setNC('county', e.target.value)}
                    placeholder="County" className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Postcode</label>
                <input value={newCustomer.postcode}
                  onChange={e => setNC('postcode', e.target.value)}
                  placeholder="Postcode" className={inputCls} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={savingCustomer}
                  className="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {savingCustomer ? 'Saving…' : 'Add Customer'}
                </button>
                <button type="button" onClick={() => setShowAddCustomer(false)}
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </PageContainer>
  )
}
