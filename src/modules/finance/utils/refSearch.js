import { fetchQuotes } from '../../quotes/services/quoteService'
import { fetchJobs } from '../../jobs/services/jobService'
import { fetchInvoices } from '../services/invoiceService'

// Adapters for RefPicker — normalize each document type's search result into
// the { id, ref, title } shape RefPicker expects, so it stays generic.
export async function searchQuotesForRef(term) {
  const { data } = await fetchQuotes(null, 0, term)
  return data.map(q => ({ id: q.id, ref: q.quote_ref, title: q.title }))
}

export async function searchJobsForRef(term) {
  const { data } = await fetchJobs(null, 0, term)
  return data.map(j => ({ id: j.id, ref: j.job_ref, title: j.title }))
}

export async function searchInvoicesForRef(term) {
  const { data } = await fetchInvoices(null, 0, term)
  return data.map(i => ({ id: i.id, ref: i.invoice_ref, title: i.title }))
}
