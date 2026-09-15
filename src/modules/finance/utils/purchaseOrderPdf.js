import { jsPDF } from 'jspdf'
import { format } from 'date-fns'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { loadBrandingImages, drawCompanyBlock, COMPANY_NAME, COMPANY_ADDRESS_LINES } from './pdfHeader'

const MARGIN = 40
const PAGE_W = 595.28 // A4 pt
const PAGE_H = 841.89 // A4 pt
const CONTENT_W = PAGE_W - MARGIN * 2

function formatDateSlash(dateStr) {
  if (!dateStr) return '—'
  return format(new Date(dateStr + 'T00:00:00'), 'dd/MM/yyyy')
}

// A line item's Product/Code come from the catalogue item it was picked
// from (if any) — Description stays whatever free text was typed for this
// specific order line, separate from the catalogue item's own description.
function resolveLineInfo(item, catalogue) {
  const catalogueItem = catalogue.find(c => c.id === item.item_id)
  if (catalogueItem) {
    return { product: catalogueItem.name || '—', code: catalogueItem.item_code || '', description: item.description || '' }
  }
  return { product: item.description || '—', code: '', description: '' }
}

export async function buildPurchaseOrderPdf(po, lineItems, catalogue = []) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const branding = await loadBrandingImages()

  // ── Header: logo + "Purchase Order - REF" / Date / Supplier Ref on the
  // left, our company details on the right (shared with the invoice PDF).
  let y = MARGIN
  doc.addImage(branding.logo.dataUrl, branding.logo.format, MARGIN, y, 120, 40)

  let ly = y + 60
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(20, 20, 20)
  doc.text(`Purchase Order - ${po.po_ref || ''}`, MARGIN, ly)
  ly += 20

  doc.setFontSize(9)
  doc.text(`Date: ${formatDateSlash(po.issue_date)}`, MARGIN, ly)
  ly += 14
  if (po.reference) {
    doc.text(`Supplier Ref: ${po.reference}`, MARGIN, ly)
    ly += 14
  }

  const ry = drawCompanyBlock(doc, { pageW: PAGE_W, marginX: MARGIN, marginTop: y })

  y = Math.max(ly, ry) + 10
  doc.setDrawColor(220, 220, 220)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 25

  // ── Supplier (left) / Delivery Address (right) ─────────────────────────
  const halfW = CONTENT_W / 2
  const rightX = MARGIN + halfW + 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20, 20, 20)
  doc.text(po.suppliers?.name || po.supplier_name || '—', MARGIN, y)
  doc.text('Delivery Address', rightX, y)
  let leftY = y + 16
  let rightY = y + 16

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  const supplierLines = [
    po.suppliers?.contact_name,
    po.suppliers?.address,
    [po.suppliers?.city, po.suppliers?.county].filter(Boolean).join(', '),
    po.suppliers?.postcode,
  ].filter(Boolean)
  supplierLines.forEach(line => { doc.text(line, MARGIN, leftY); leftY += 13 })

  const deliveryLines = po.customers?.customer_name
    ? [
        po.customers.customer_name,
        po.customer_sites?.site_name,
        po.customer_sites?.address_line_1,
        [po.customer_sites?.city, po.customer_sites?.province].filter(Boolean).join(', '),
        po.customer_sites?.postal_code,
      ].filter(Boolean)
    : [COMPANY_NAME, ...COMPANY_ADDRESS_LINES]
  deliveryLines.forEach(line => { doc.text(line, rightX, rightY); rightY += 13 })

  y = Math.max(leftY, rightY) + 20

  // ── Line items table ──────────────────────────────────────────────────────
  const colX = {
    num:     MARGIN,
    product: MARGIN + 15,
    code:    MARGIN + 115,
    desc:    MARGIN + 170,
    qty:     MARGIN + 320,
    price:   MARGIN + 385,
    vat:     MARGIN + 435,
    amount:  PAGE_W - MARGIN,
  }

  function tableHeader() {
    doc.setFillColor(245, 245, 245)
    doc.rect(MARGIN, y, CONTENT_W, 20, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.text('#',           colX.num + 4, y + 13)
    doc.text('PRODUCT',     colX.product, y + 13)
    doc.text('CODE',        colX.code, y + 13)
    doc.text('DESCRIPTION', colX.desc, y + 13)
    doc.text('QTY',         colX.qty, y + 13, { align: 'right' })
    doc.text('UNIT PRICE',  colX.price, y + 13, { align: 'right' })
    doc.text('VAT(%)',      colX.vat, y + 13, { align: 'right' })
    doc.text('NET AMOUNT',  colX.amount - 4, y + 13, { align: 'right' })
    y += 20
  }

  tableHeader()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(20, 20, 20)

  const items = lineItems && lineItems.length > 0 ? lineItems : []
  if (items.length === 0) {
    doc.setTextColor(150, 150, 150)
    doc.text('No line items.', colX.product, y + 14)
    y += 24
  } else {
    items.forEach((it, i) => {
      if (y > PAGE_H - 100) { doc.addPage(); y = MARGIN; tableHeader() }
      const { product, code, description } = resolveLineInfo(it, catalogue)
      const lineTotal = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
      if (i % 2 === 1) {
        doc.setFillColor(250, 250, 250)
        doc.rect(MARGIN, y, CONTENT_W, 18, 'F')
      }
      doc.setTextColor(20, 20, 20)
      doc.text(String(i + 1), colX.num + 4, y + 13)
      doc.text(product, colX.product, y + 13, { maxWidth: 90 })
      doc.text(code, colX.code, y + 13, { maxWidth: 45 })
      doc.text(description, colX.desc, y + 13, { maxWidth: 115 })
      doc.text(String(it.quantity), colX.qty, y + 13, { align: 'right' })
      doc.text(formatCurrency(it.unit_price), colX.price, y + 13, { align: 'right' })
      doc.text(String(it.tax_rate), colX.vat, y + 13, { align: 'right' })
      doc.text(formatCurrency(lineTotal), colX.amount - 4, y + 13, { align: 'right' })
      y += 18
    })
    y += 6
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 220)
  doc.line(MARGIN + CONTENT_W - 220, y, PAGE_W - MARGIN, y)
  y += 16

  const totalsRows = [
    ['Sub Total (exc. VAT)', formatCurrency(po.subtotal)],
    ['VAT',                  formatCurrency(po.tax_total)],
  ]
  totalsRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(label, PAGE_W - MARGIN - 220, y)
    doc.setTextColor(20, 20, 20)
    doc.text(value, PAGE_W - MARGIN, y, { align: 'right' })
    y += 16
  })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Total (inc. VAT)', PAGE_W - MARGIN - 220, y)
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

  // ── Page numbers ─────────────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text(`Page ${p} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 25, { align: 'right' })
  }

  return doc
}

export async function downloadPurchaseOrderPdf(po, lineItems, catalogue = []) {
  const doc = await buildPurchaseOrderPdf(po, lineItems, catalogue)
  doc.save(`${po.po_ref || 'purchase-order'}.pdf`)
}

// Opens the PDF in a new tab for on-screen review before committing to a download —
// same document, just output('bloburl') instead of save().
export async function previewPurchaseOrderPdf(po, lineItems, catalogue = []) {
  // Open the tab synchronously (before the await) so popup blockers don't kill it.
  const tab = window.open('', '_blank')
  const doc = await buildPurchaseOrderPdf(po, lineItems, catalogue)
  if (tab) tab.location.href = doc.output('bloburl')
}
