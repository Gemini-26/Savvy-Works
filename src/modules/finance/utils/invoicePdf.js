import { jsPDF } from 'jspdf'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'

const MARGIN = 40
const PAGE_W = 595.28 // A4 pt
const CONTENT_W = PAGE_W - MARGIN * 2

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
}

function drawLogo(doc, x, y) {
  // Red rounded square with white "S" — mirrors the in-app header mark.
  doc.setFillColor(0xCC, 0x25, 0x25)
  doc.roundedRect(x, y, 32, 32, 4, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('S', x + 16, y + 22, { align: 'center' })
}

export function buildInvoicePdf(invoice, lineItems, technicians) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let y = MARGIN

  // ── Header: logo + company name, invoice ref on the right ──────────────
  drawLogo(doc, MARGIN, y)
  doc.setTextColor(20, 20, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('SAVVY CIVILS', MARGIN + 40, y + 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text('AND PLUMBING', MARGIN + 40, y + 25)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(20, 20, 20)
  doc.text('INVOICE', PAGE_W - MARGIN, y + 15, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90, 90, 90)
  doc.text(invoice.invoice_ref || '—', PAGE_W - MARGIN, y + 30, { align: 'right' })

  y += 55
  doc.setDrawColor(220, 220, 220)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 25

  // ── Bill To / Dates ──────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text('BILL TO', MARGIN, y)
  doc.text('INVOICE DETAILS', MARGIN + CONTENT_W / 2, y)
  y += 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(20, 20, 20)
  const billLines = [
    invoice.customers?.customer_name || '—',
    invoice.site_address,
    [invoice.site_city, invoice.site_county].filter(Boolean).join(', '),
    invoice.site_postcode,
  ].filter(Boolean)
  billLines.forEach((line, i) => doc.text(line, MARGIN, y + i * 14))

  const detailLines = [
    ['Title', invoice.title || '—'],
    ['Status', (invoice.status || '—').toUpperCase()],
    ['Issue Date', formatDate(invoice.issue_date)],
    ['Due Date', invoice.due_date ? formatDate(invoice.due_date) : '—'],
  ]
  detailLines.forEach(([label, value], i) => {
    doc.setTextColor(100, 100, 100)
    doc.text(label, MARGIN + CONTENT_W / 2, y + i * 14)
    doc.setTextColor(20, 20, 20)
    doc.text(value, MARGIN + CONTENT_W / 2 + 80, y + i * 14)
  })

  y += Math.max(billLines.length, detailLines.length) * 14 + 20

  // ── Technicians (who did the work) ──────────────────────────────────────
  if (technicians && technicians.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('TECHNICIANS', MARGIN, y)
    y += 12

    const techColX = [MARGIN, MARGIN + 130, MARGIN + 280, MARGIN + 400]
    doc.setFontSize(8)
    doc.text('Technician', techColX[0], y)
    doc.text('Appointed Start', techColX[1], y)
    doc.text('Started', techColX[2], y)
    doc.text('Finished', techColX[3], y)
    y += 4
    doc.setDrawColor(230, 230, 230)
    doc.line(MARGIN, y, PAGE_W - MARGIN, y)
    y += 12

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20, 20, 20)
    technicians.forEach(t => {
      doc.text(t.technician_name || '—', techColX[0], y)
      doc.text(formatDateTime(t.scheduled_start), techColX[1], y)
      doc.text(formatDateTime(t.actual_start), techColX[2], y)
      doc.text(formatDateTime(t.actual_end), techColX[3], y)
      y += 14
    })
    y += 12
  }

  // ── Line items table ─────────────────────────────────────────────────────
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

  // ── Totals ───────────────────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 220)
  doc.line(MARGIN + CONTENT_W - 200, y, PAGE_W - MARGIN, y)
  y += 16

  const totalsRows = [
    ['Subtotal', formatCurrency(invoice.subtotal)],
    ['Tax',      formatCurrency(invoice.tax_total)],
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
  doc.text(formatCurrency(invoice.total), PAGE_W - MARGIN, y, { align: 'right' })
  y += 30

  // ── Notes / Terms ────────────────────────────────────────────────────────
  if (invoice.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('NOTES', MARGIN, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20, 20, 20)
    doc.text(invoice.notes, MARGIN, y, { maxWidth: CONTENT_W })
    y += 30
  }
  if (invoice.terms) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('TERMS', MARGIN, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20, 20, 20)
    doc.text(invoice.terms, MARGIN, y, { maxWidth: CONTENT_W })
  }

  return doc
}

export function downloadInvoicePdf(invoice, lineItems, technicians) {
  buildInvoicePdf(invoice, lineItems, technicians).save(`${invoice.invoice_ref || 'invoice'}.pdf`)
}

// Opens the PDF in a new tab for on-screen review before the user commits
// to downloading it — same document, just `output('bloburl')` instead of `save()`.
export function previewInvoicePdf(invoice, lineItems, technicians) {
  const doc = buildInvoicePdf(invoice, lineItems, technicians)
  window.open(doc.output('bloburl'), '_blank')
}
