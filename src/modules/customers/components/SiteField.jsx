import { useState, useEffect } from 'react'
import { useCustomers } from '../../../shared/hooks/useCustomers'
import { fetchCustomerSites, createCustomerSite } from '../services/customerSiteService'
import { supabase } from '../../../lib/supabase'

const inputCls = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

const emptySiteDraft = { site_name: '', address_line_1: '', city: '', province: '', postal_code: '' }

// Customer + delivery-site picker for Purchase Orders — "customer_sites"
// existed in the schema but nothing ever read or wrote it. No customer
// selected = deliver to our own premises (shown for reference, not editable
// here); picking a customer loads their sites, with an inline "+ Add Site"
// since no site-creation UI existed anywhere before this either.
export default function SiteField({ customerId, siteId, expectedDeliveryDate, onCustomerChange, onSiteChange, onDateChange }) {
  const { customers } = useCustomers()
  const [sites, setSites] = useState([])
  const [company, setCompany] = useState(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(emptySiteDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (customerId) {
      fetchCustomerSites(customerId).then(setSites).catch(() => setSites([]))
    } else {
      setSites([])
    }
  }, [customerId])

  useEffect(() => {
    supabase.from('companies').select('name, address, city, postcode').limit(1).maybeSingle()
      .then(({ data }) => setCompany(data))
  }, [])

  const selectedSite = sites.find(s => s.id === siteId) || null

  function setDraftField(field, value) {
    setDraft(prev => ({ ...prev, [field]: value }))
  }

  async function handleCreate() {
    if (!draft.site_name.trim()) {
      setError('Site name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const site = await createCustomerSite(customerId, draft)
      setSites(prev => [...prev, site])
      onSiteChange(site.id)
      setCreating(false)
      setDraft(emptySiteDraft)
    } catch (err) {
      setError(err.message || 'Failed to create site')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Customer</label>
        <div className="flex items-center gap-2">
          <select
            value={customerId || ''}
            onChange={e => onCustomerChange(e.target.value || null)}
            className={inputCls}
          >
            <option value="">— Deliver to our own premises —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.customer_name}</option>)}
          </select>
          <button type="button" onClick={() => window.open('/contacts/customers/new', '_blank')} title="New Customer"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100">
            +
          </button>
        </div>
      </div>

      {!customerId && company && (
        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded p-2">
          <p className="font-medium text-gray-700">{company.name}</p>
          {company.address && <p>{company.address}</p>}
          {(company.city || company.postcode) && <p>{[company.city, company.postcode].filter(Boolean).join(', ')}</p>}
        </div>
      )}

      {customerId && !creating && (
        <div>
          <label className={labelCls}>Site</label>
          <div className="flex items-center gap-2">
            <select value={siteId || ''} onChange={e => onSiteChange(e.target.value || null)} className={inputCls}>
              <option value="">— Select Site —</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </select>
            <button type="button" onClick={() => setCreating(true)} title="New Site"
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100">
              +
            </button>
          </div>
          {selectedSite && (
            <div className="mt-2 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded p-2 space-y-0.5">
              {selectedSite.address_line_1 && <p>{selectedSite.address_line_1}</p>}
              {(selectedSite.city || selectedSite.province || selectedSite.postal_code) && (
                <p>{[selectedSite.city, selectedSite.province, selectedSite.postal_code].filter(Boolean).join(', ')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {customerId && creating && (
        <div className="border border-gray-200 rounded p-3 space-y-2 bg-gray-50">
          <p className="text-xs font-semibold text-gray-600">New Site</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <input placeholder="Site name" value={draft.site_name} onChange={e => setDraftField('site_name', e.target.value)} className={inputCls} />
          <input placeholder="Address" value={draft.address_line_1} onChange={e => setDraftField('address_line_1', e.target.value)} className={inputCls} />
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="City" value={draft.city} onChange={e => setDraftField('city', e.target.value)} className={inputCls} />
            <input placeholder="Province" value={draft.province} onChange={e => setDraftField('province', e.target.value)} className={inputCls} />
            <input placeholder="Postal Code" value={draft.postal_code} onChange={e => setDraftField('postal_code', e.target.value)} className={inputCls} />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={handleCreate} disabled={saving} className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Site'}
            </button>
            <button type="button" onClick={() => { setCreating(false); setError(null) }} className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div>
        <label className={labelCls}>Expected Delivery On</label>
        <input type="date" value={expectedDeliveryDate || ''} onChange={e => onDateChange(e.target.value)} className={inputCls} />
      </div>
    </div>
  )
}
