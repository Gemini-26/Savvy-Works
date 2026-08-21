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

// Shared letterhead: logo + accreditation marks + document title/ref on the
// left, company details on the right. Used by both the invoice and purchase
// order PDFs so the two documents share the same overhead format.
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

  // Company details, right-aligned, at the top.
  let ry = y
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(20, 20, 20)
  doc.text('SAVVY CIVILS & PLUMBING', pageW - marginX, ry, { align: 'right' })
  ry += 12

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  const companyLines = [
    '13 Bartlett Road,',
    'Beyers Park,',
    'Boksburg',
    'Johannesburg',
    'South Africa',
    '1459',
    'Tel: +27-11 894 3942/087 806 6262',
  ]
  companyLines.forEach(line => { doc.text(line, pageW - marginX, ry, { align: 'right' }); ry += 10 })
  ry += 4

  const companyMeta = [
    'Email: sales@savvyplumbing.co.za',
    'Web: sales@savvyplumbing.co.za',
    'Company Reg: 2018/397154/07',
    'VAT No: 4050292590',
  ]
  companyMeta.forEach(line => { doc.text(line, pageW - marginX, ry, { align: 'right' }); ry += 10 })

  y = Math.max(ly, ry) + 10
  doc.setDrawColor(220, 220, 220)
  doc.line(marginX, y, pageW - marginX, y)
  y += 25

  return y
}
