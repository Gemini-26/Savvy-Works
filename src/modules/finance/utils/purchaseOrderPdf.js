import { jsPDF } from 'jspdf'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'

const MARGIN = 40
const PAGE_W = 595.28 // A4 pt
const CONTENT_W = PAGE_W - MARGIN * 2

function drawLogo(doc, x, y) {
  // Red rounded square with white "S" — mirrors the in-app header mark.
  doc.setFillColor(0xCC, 0x25, 0x25)
  doc.roundedRect(x, y, 32, 32, 4, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('S', x + 16, y + 22, { align: 'center' })
}

export function downloadPurchaseOrderPdf(po, lineItems) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let y = MARGIN

  // ── Header: logo + company name, PO ref on the right ────────────────────
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
  doc.text('PURCHASE ORDER', PAGE_W - MARGIN, y + 15, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90, 90, 90)
  doc.text(po.po_ref || '—', PAGE_W - MARGIN, y + 30, { align: 'right' })

  y += 55
  doc.setDrawColor(220, 220, 220)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 25

  // ── Supplier / Order Details ─────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text('SUPPLIER', MARGIN, y)
  doc.text('ORDER DETAILS', MARGIN + CONTENT_W / 2, y)
  y += 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(20, 20, 20)
  const supplierLines = [po.supplier_name || '—'].filter(Boolean)
  supplierLines.forEach((line, i) => doc.text(line, MARGIN, y + i * 14))

  const detailLines = [
    ['Title', po.title || '—'],
    ['Status', (po.status || '—').toUpperCase().replace(/_/g, ' ')],
    ['Issue Date', formatDate(po.issue_date)],
    ['Due Date', po.due_date ? formatDate(po.due_date) : '—'],
  ]
  detailLines.forEach(([label, value], i) => {
    doc.setTextColor(100, 100, 100)
    doc.text(label, MARGIN + CONTENT_W / 2, y + i * 14)
    doc.setTextColor(20, 20, 20)
    doc.text(value, MARGIN + CONTENT_W / 2 + 80, y + i * 14)
  })

  y += Math.max(supplierLines.length, detailLines.length) * 14 + 20

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
    ['Subtotal', formatCurrency(po.subtotal)],
    ['Tax',      formatCurrency(po.tax_total)],
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
  doc.text(formatCurrency(po.total), PAGE_W - MARGIN, y, { align: 'right' })
  y += 30

  // ── Notes / Terms ─────────────────────────────────────────────────────────
  if (po.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('NOTES', MARGIN, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20, 20, 20)
    doc.text(po.notes, MARGIN, y, { maxWidth: CONTENT_W })
    y += 30
  }
  if (po.terms) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('TERMS', MARGIN, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20, 20, 20)
    doc.text(po.terms, MARGIN, y, { maxWidth: CONTENT_W })
  }

  doc.save(`${po.po_ref || 'purchase-order'}.pdf`)
}
