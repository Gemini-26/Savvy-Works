import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchQuote, convertQuoteToJob } from '../services/quoteService'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'

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

export default function QuotePreviewModal({ quoteId, onClose, onConverted }) {
  const navigate = useNavigate()
  const [quote,      setQuote]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [converting, setConverting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchQuote(quoteId)
      .then(data => { if (!cancelled) setQuote(data) })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load quote') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [quoteId])

  async function handleConvert() {
    setConverting(true)
    setError(null)
    try {
      const job = await convertQuoteToJob(quote)
      onConverted?.()
      onClose()
      navigate(`/jobs/${job.id}`)
    } catch (err) {
      setError(err.message || 'Failed to convert quote to job')
      setConverting(false)
    }
  }

  const canConvert = quote && quote.status === 'accepted' && !quote.job_id

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          <p className="text-sm text-gray-400 p-6">Loading quote…</p>
        ) : !quote ? (
          <p className="text-sm text-red-500 p-6">{error || 'Quote not found.'}</p>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900 truncate">{quote.title || 'Quote'}</h2>
                <p className="text-xs text-gray-400 font-mono">{quote.quote_ref || '—'}</p>
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

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
                  {error}
                </div>
              )}

              {/* Status */}
              <div className="flex items-center flex-wrap gap-2">
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[quote.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[quote.status] ?? quote.status}
                </span>
                {quote.job_id && (
                  <button
                    type="button"
                    onClick={() => navigate(`/jobs/${quote.job_id}`)}
                    className="text-xs text-teal-600 hover:underline"
                  >
                    View converted job →
                  </button>
                )}
                {quote.lead_id && (
                  <button
                    type="button"
                    onClick={() => navigate(`/leads/${quote.lead_id}`)}
                    className="text-xs text-teal-600 hover:underline"
                  >
                    ↩ Converted from Lead {quote.leads?.lead_ref || ''} →
                  </button>
                )}
              </div>

              {/* Customer / technician / dates */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-0.5">Customer</div>
                  <div className="text-sm text-gray-800">{quote.customers?.customer_name || '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-0.5">Technician</div>
                  <div className="text-sm text-gray-800">{quote.profiles?.full_name || '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-0.5">Issue Date</div>
                  <div className="text-sm text-gray-800">{formatDate(quote.issue_date)}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-0.5">Valid Until</div>
                  <div className="text-sm text-gray-800">{formatDate(quote.valid_until)}</div>
                </div>
              </div>

              {/* Site address */}
              {(quote.site_address || quote.site_city) && (
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-0.5">Site Address</div>
                  <div className="text-sm text-gray-800 whitespace-pre-line">
                    {[quote.site_address, quote.site_city, quote.site_county, quote.site_postcode].filter(Boolean).join(', ') || '—'}
                  </div>
                </div>
              )}

              {/* Line items */}
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1.5">Line Items</div>
                {(quote.quote_items || []).length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No line items.</p>
                ) : (
                  <table className="w-full text-sm border border-gray-100 rounded overflow-hidden">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        <th className="text-left px-2.5 py-1.5">Description</th>
                        <th className="text-right px-2.5 py-1.5 w-16">Qty</th>
                        <th className="text-right px-2.5 py-1.5 w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {quote.quote_items.map((it, i) => (
                        <tr key={i}>
                          <td className="px-2.5 py-1.5 text-gray-800">{it.description}</td>
                          <td className="px-2.5 py-1.5 text-right text-gray-600">{it.quantity}</td>
                          <td className="px-2.5 py-1.5 text-right font-medium text-gray-900">
                            {formatCurrency((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="flex justify-end pt-2 mt-1">
                  <div className="w-48 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(quote.subtotal)}</span></div>
                    <div className="flex justify-between text-gray-600"><span>Tax</span><span>{formatCurrency(quote.tax_total)}</span></div>
                    <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-100"><span>Total</span><span>{formatCurrency(quote.total)}</span></div>
                  </div>
                </div>
              </div>

              {quote.notes && (
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-0.5">Notes</div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{quote.notes}</div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                {canConvert && (
                  <button
                    type="button"
                    onClick={handleConvert}
                    disabled={converting}
                    className="flex-1 bg-teal-600 text-white py-2 rounded text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
                  >
                    {converting ? 'Converting…' : '➜ Convert to Job'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/quotes/${quote.id}`)}
                  className={`${canConvert ? '' : 'flex-1 '}px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors`}
                >
                  Open Full Quote
                </button>
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  )
}
