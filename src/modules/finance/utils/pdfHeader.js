const BRANDING = {
  logo:  { url: '/branding/logo.png',  format: 'PNG' },
  iopsa: { url: '/branding/iopsa.jpg', format: 'JPEG' },
  bbbee: { url: '/branding/bbbee.jpg', format: 'JPEG' },
}

const imageCache = {}

function loadImageDataUrl(url) {
  if (imageCache[url]) return imageCache[url]
  imageCache[url] = fetch(url)
    .then(res => res.blob())
    .then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    }))
  return imageCache[url]
}

export async function loadBrandingImages() {
  const entries = await Promise.all(
    Object.entries(BRANDING).map(async ([key, { url, format }]) => {
      const dataUrl = await loadImageDataUrl(url)
      return [key, { dataUrl, format }]
    })
  )
  return Object.fromEntries(entries)
}

export const COMPANY_NAME = 'Savvy Civils & Plumbing'

// Registered address — also used as the default "deliver to" block on a
// Purchase Order when no customer/site is picked (i.e. stock delivered to
// our own premises rather than drop-shipped to a customer).
export const COMPANY_ADDRESS_LINES = [
  '13 Bartlett Road,',
  'Beyers Park,',
  'Boksburg',
  'Johannesburg',
  'South Africa',
  '1459',
]

const COMPANY_CONTACT_LINES = [
  'Tel: +27-11 894 3942/087 806 6262',
  'Fax:',
]

const COMPANY_META_LINES = [
  'Email: sales@savvyplumbing.co.za',
  'Web: sales@savvyplumbing.co.za',
  'Company Reg: 2018/397154/07',
  'VAT No: 4050292590',
]

// Right-aligned company details block — the "who this document is from" side
// of the letterhead. Shared by every document's header so the overhead stays
// byte-for-byte identical across invoices, POs and quotes.
export function drawCompanyBlock(doc, { pageW, marginX, marginTop }) {
  let ry = marginTop
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(20, 20, 20)
  doc.text(COMPANY_NAME.toUpperCase(), pageW - marginX, ry, { align: 'right' })
  ry += 12

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  const lines = [...COMPANY_ADDRESS_LINES, ...COMPANY_CONTACT_LINES]
  lines.forEach(line => { doc.text(line, pageW - marginX, ry, { align: 'right' }); ry += 10 })
  ry += 4

  COMPANY_META_LINES.forEach(line => { doc.text(line, pageW - marginX, ry, { align: 'right' }); ry += 10 })

  return ry
}

// Shared letterhead: logo + accreditation marks + document title/ref on the
// left, company details on the right. Used by the invoice PDF (the purchase
// order PDF has its own header layout — see purchaseOrderPdf.js).
export function drawPdfHeader(doc, branding, { title, ref, marginX, pageW, marginTop }) {
  let y = marginTop

  doc.addImage(branding.logo.dataUrl, branding.logo.format, marginX, y, 120, 40)

  // Accreditation marks, side by side, under the logo.
  let ly = y + 44
  doc.addImage(branding.bbbee.dataUrl, branding.bbbee.format, marginX, ly, 50, 20)
  doc.addImage(branding.iopsa.dataUrl, branding.iopsa.format, marginX + 56, ly, 60, 20)
  ly += 20 + 15

  // Document title + ref, left-aligned, under the accreditation marks.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(20, 20, 20)
  doc.text(title, marginX, ly)
  ly += 15
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90, 90, 90)
  doc.text(ref || '—', marginX, ly)
  ly += 15

  const ry = drawCompanyBlock(doc, { pageW, marginX, marginTop: y })

  y = Math.max(ly, ry) + 10
  doc.setDrawColor(220, 220, 220)
  doc.line(marginX, y, pageW - marginX, y)
  y += 25

  return y
}

// Draws a block of text entries starting at (x, y), one below the other —
// but unlike a naive `entries.forEach((line, i) => y + i * lineHeight)`,
// this actually measures how many lines each entry takes before advancing
// the cursor. An entry that's free text (e.g. a site address typed into a
// textarea) can secretly contain an embedded line break, or simply be too
// long for the column — either way the naive fixed-offset approach draws
// the *next* entry right on top of it. Splitting on embedded newlines and
// wrapping to `width` first means the cursor always lands below whatever
// was actually rendered. Returns the y position after the last line drawn,
// so callers can size a two-column block by the taller column's real height.
export function drawTextLines(doc, entries, { x, y, width, lineHeight = 14 }) {
  let cursorY = y
  entries.filter(Boolean).forEach(entry => {
    String(entry).split('\n').forEach(segment => {
      const wrapped = width ? doc.splitTextToSize(segment, width) : [segment]
      wrapped.forEach(line => {
        doc.text(line, x, cursorY)
        cursorY += lineHeight
      })
    })
  })
  return cursorY
}

// Prints a free-text block (terms & conditions, long notes, etc.) starting
// on a fresh page, preserving blank lines already in the text as paragraph
// gaps and wrapping/paginating as needed so long boilerplate flows onto
// extra pages instead of overflowing off whatever page it was appended to.
// Shared by every PDF (quote / invoice / purchase order / job) that has a
// free-text field long enough to need this.
export function drawTermsPage(doc, text, { marginX, pageW, pageH, heading } = {}) {
  const contentW = pageW - marginX * 2
  doc.addPage()
  let y = marginX

  if (heading) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(heading, marginX, y)
    y += 16
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(20, 20, 20)

  text.split('\n').forEach(rawLine => {
    if (!rawLine.trim()) { y += 8; return }
    doc.splitTextToSize(rawLine, contentW).forEach(line => {
      if (y > pageH - marginX) { doc.addPage(); y = marginX }
      doc.text(line, marginX, y)
      y += 13
    })
  })
}
