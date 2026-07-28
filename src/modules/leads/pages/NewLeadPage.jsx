import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import { createLead } from '../services/leadService'
import { useCustomers } from '../../../shared/hooks/useCustomers'

const SOURCES = ['None', 'Phone', 'Email', 'Website', 'Referral', 'Walk-in', 'Social Media', 'Other']
const STATUSES = ['Contact Later', 'New', 'Actioned', 'Rejected', 'Converted']

function generateLeadRef() {
  const year = new Date().getFullYear()
  const rand = Math.floor(Math.random() * 90000) + 10000
  return `LD-${year}-${rand}`
}

export default function NewLeadPage() {
  const navigate = useNavigate()
  const { customers } = useCustomers()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const [form, setForm] = useState({
    lead_ref:            generateLeadRef(),
    customer_id:         '',
    full_name:           '',
    company_name:        '',
    email:               '',
    telephone:           '',
    mobile:              '',
    website:             '',
    address:             '',
    city:                '',
    county:              '',
    postcode:            '',
    title:               '',
    source:              'None',
    status:              'Contact Later',
    assigned_to:         '',
    preferred_call_date: '',
    preferred_call_time: '',
  })

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createLead({
        ...form,
        source:              form.source === 'None' ? null : form.source.toLowerCase(),
        status:              form.status.toLowerCase().replace(' ', '_'),
        assigned_to:         form.assigned_to || null,
        customer_id:         form.customer_id || null,
        preferred_call_date: form.preferred_call_date || null,
        preferred_call_time: form.preferred_call_time || null,
      })
      navigate('/leads/all')
    } catch (err) {
      setError(err.message || 'Failed to save lead')
      setSaving(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader title="New Lead" subtitle="Capture a new incoming lead" />

      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Lead meta */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Lead Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Lead Ref.</label>
              <input
                value={form.lead_ref}
                readOnly
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Existing Customer</label>
              <select
                value={form.customer_id}
                onChange={e => set('customer_id', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Not Linked —</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.customer_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Title / Job Description</label>
              <input
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="e.g. Burst pipe repair at warehouse"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Assign To</label>
              <select
                value={form.assigned_to}
                onChange={e => set('assigned_to', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Not Assigned —</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
              <select
                value={form.source}
                onChange={e => set('source', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Preferred Call Date</label>
              <input
                type="date"
                value={form.preferred_call_date}
                onChange={e => set('preferred_call_date', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Preferred Call Time</label>
              <input
                type="time"
                value={form.preferred_call_time}
                onChange={e => set('preferred_call_time', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Contact Information</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                required
                value={form.full_name}
                onChange={e => set('full_name', e.target.value)}
                placeholder="Full Name"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Company Name</label>
              <input
                value={form.company_name}
                onChange={e => set('company_name', e.target.value)}
                placeholder="Company Name"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="Email Address"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Telephone <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="tel"
                value={form.telephone}
                onChange={e => set('telephone', e.target.value)}
                placeholder="Telephone"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Mobile</label>
              <input
                type="tel"
                value={form.mobile}
                onChange={e => set('mobile', e.target.value)}
                placeholder="Mobile"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Website</label>
              <input
                type="url"
                value={form.website}
                onChange={e => set('website', e.target.value)}
                placeholder="https://"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Address</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
              <input
                value={form.address}
                onChange={e => set('address', e.target.value)}
                placeholder="Street address"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
              <input
                value={form.city}
                onChange={e => set('city', e.target.value)}
                placeholder="City"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">County</label>
              <input
                value={form.county}
                onChange={e => set('county', e.target.value)}
                placeholder="County / Province"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Postcode</label>
              <input
                value={form.postcode}
                onChange={e => set('postcode', e.target.value)}
                placeholder="Postcode"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Lead'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/leads/all')}
            className="px-6 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>

      </form>
    </PageContainer>
  )
}
