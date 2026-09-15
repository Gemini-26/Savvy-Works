import { jsPDF } from 'jspdf'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'
import { loadBrandingImages, drawPdfHeader } from '../../finance/utils/pdfHeader'

const MARGIN = 40
const PAGE_W = 595.28 // A4 pt
const CONTENT_W = PAGE_W - MARGIN * 2

export async function buildQuotePdf(quote, lineItems) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const branding = await loadBrandingImages()

  let y = drawPdfHeader(doc, branding, {
    title: 'QUOTATION',
    ref: quote.quote_ref,
    marginX: MARGIN,
    pageW: PAGE_W,
    marginTop: MARGIN,
  })

  // ── Customer / Quote Details ────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text('CUSTOMER', MARGIN, y)
  doc.text('QUOTE DETAILS', MARGIN + CONTENT_W / 2, y)
  y += 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(20, 20, 20)
  const customerLines = [
    quote.customers?.customer_name || '—',
    quote.site_address,
    [quote.site_city, quote.site_county].filter(Boolean).join(', '),
    quote.site_postcode,
  ].filter(Boolean)
  customerLines.forEach((line, i) => doc.text(line, MARGIN, y + i * 14))

  const detailLines = [
    ['Title', quote.title || '—'],
    ['Status', (quote.status || '—').toUpperCase()],
    ['Issue Date', formatDate(quote.issue_date)],
    ['Valid Until', quote.valid_until ? formatDate(quote.valid_until) : '—'],
  ]
  detailLines.forEach(([label, value], i) => {
    doc.setTextColor(100, 100, 100)
    doc.text(label, MARGIN + CONTENT_W / 2, y + i * 14)
    doc.setTextColor(20, 20, 20)
    doc.text(value, MARGIN + CONTENT_W / 2 + 80, y + i * 14)
  })

  y += Math.max(customerLines.length, detailLines.length) * 14 + 20

  // ── Line items table ──────────────────────────────────────────────────────
  const colX = {
    desc: MARGIN,
    qty:  MARGIN + 260,
    unit: MARGIN + 300,
    price: MARGIN + 350,
    tax:  MARGIN + 420,
    total: PAGE_W - MARGIN,
  }

  function tableHeader() {
    doc.setFillColor(245, 245, 245)
    doc.rect(MARGIN, y, CONTENT_W, 20, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.text('DESCRIPTION', colX.desc + 4, y + 13)
    doc.text('QTY',   colX.qty, y + 13)
    doc.text('UNIT',  colX.unit, y + 13)
    doc.text('PRICE', colX.price, y + 13)
    doc.text('TAX%',  colX.tax, y + 13)
    doc.text('TOTAL', colX.total - 4, y + 13, { align: 'right' })
    y += 20
  }

  tableHeader()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(20, 20, 20)

  const items = lineItems && lineItems.length > 0 ? lineItems : []
  if (items.length === 0) {
    doc.setTextColor(150, 150, 150)
    doc.text('No line items.', colX.desc + 4, y + 14)
    y += 24
  } else {
    items.forEach((it, i) => {
      if (y > 760) { doc.addPage(); y = MARGIN; tableHeader() }
      const lineTotal = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
      if (i % 2 === 1) {
        doc.setFillColor(250, 250, 250)
        doc.rect(MARGIN, y, CONTENT_W, 18, 'F')
      }
      doc.setTextColor(20, 20, 20)
      doc.text(String(it.description || ''), colX.desc + 4, y + 13, { maxWidth: 250 })
      doc.text(String(it.quantity), colX.qty, y + 13)
      doc.text(String(it.unit || ''), colX.unit, y + 13)
      doc.text(formatCurrency(it.unit_price), colX.price, y + 13)
      doc.text(`${it.tax_rate}%`, colX.tax, y + 13)
      doc.text(formatCurrency(lineTotal), colX.total - 4, y + 13, { align: 'right' })
      y += 18
    })
    y += 6
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 220)
  doc.line(MARGIN + CONTENT_W - 200, y, PAGE_W - MARGIN, y)
  y += 16

  const totalsRows = [
    ['Subtotal', formatCurrency(quote.subtotal)],
    ['Tax',      formatCurrency(quote.tax_total)],
  ]
  totalsRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(label, PAGE_W - MARGIN - 200, y)
    doc.setTextColor(20, 20, 20)
    doc.text(value, PAGE_W - MARGIN, y, { align: 'right' })
    y += 16
  })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Total', PAGE_W - MARGIN - 200, y)
  doc.text(formatCurrency(quote.total), PAGE_W - MARGIN, y, { align: 'right' })
  y += 30

  // ── Notes / Terms ────────────────────────────────────────────────────────
  if (quote.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('NOTES', MARGIN, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20, 20, 20)
    doc.text(quote.notes, MARGIN, y, { maxWidth: CONTENT_W })
    y += 30
  }
  if (quote.terms) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('TERMS', MARGIN, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20, 20, 20)
    doc.text(quote.terms, MARGIN, y, { maxWidth: CONTENT_W })
  }

  return doc
}

export async function downloadQuotePdf(quote, lineItems) {
  const doc = await buildQuotePdf(quote, lineItems)
  doc.save(`${quote.quote_ref || 'quote'}.pdf`)
}

// Opens the PDF in a new tab for on-screen review before committing to a download —
// same document, just output('bloburl') instead of save().
export async function previewQuotePdf(quote, lineItems) {
  // Open the tab synchronously (before the await) so popup blockers don't kill it.
  const tab = window.open('', '_blank')
  const doc = await buildQuotePdf(quote, lineItems)
  if (tab) tab.location.href = doc.output('bloburl')
}
