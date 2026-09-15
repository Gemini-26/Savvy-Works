const MARGIN = 40
const PAGE_W = 595.28  // A4 pt
const PAGE_H = 841.89  // A4 pt
const CONTENT_W = PAGE_W - MARGIN * 2

const BLACK = [20, 20, 20]
const RED   = [190, 20, 20]

const COVID_NOTICE =
  "Savvy Civils and Plumbing has implemented various protective measures to combat the spread of the Covid-19 virus. All employees have received training on how to implement these measures. We also implemented a Covid-19 Health and Safety Policy, and a zero-tolerance attitude is adopted by the policy by any employee. Savvy Civils and Plumbing has taken all reasonable steps to protect both our employees and clients from the spread of the COVID-19 virus. Considering the aforesaid in consideration, we do not accept any liability should the virus be contracted by any client, and all clients indemnify Savvy Civils and Plumbing insofar as it may be necessary."

const WARRANTY_INTRO =
  "Our limited labour warranty in regard to correcting defects in our workmanship is 30 days. We Do Not Do Callouts on Defective Repairs. If a fault is owing to a manufacturer's defect, however, our labour is covered for just 30 days. There is no warranty against faults that may occur, or against incidental damages. Parts carry the manufacturer's warranty, which is usually 30-90 days dependent on the manufacturer."

const ELECTRONICS_DISCLAIMER =
  "No guarantee on any electronic parts e.g., transformers, daylight cells, geyser thermostats, stove thermostats, surge arrestors, or any damage caused by nature i.e. lightning damage and/or power surges. As well as drain, basin, shower, and toilet blockages. The Company takes absolutely no responsibility for any damages caused by faulty factory parts."

const KWIKOT_CLAUSE =
  "Kwikot will be responsible for the geyser parts, element, thermostat, safety valve, vacuum breakers and pressure valves for one year."

const FUEL_COD_TERMS =
  "To manage volatile global fuel prices, Savvy Holdings Group is transitioning from a flat-rate call-out fee to a combined travel-cost model. New Billing Structure Every service visit will now be invoiced based on two components: Standard Call-Out Fee: A base charge for the service request. Running Travel Charge: A per-kilometer (km) rate calculated from the nearest operational base to the site and back. Calculations: Distances are determined using standard mapping systems to ensure fair and transparent pricing. This is a temporary measure. We will revert to our standard fee structure once fuel markets stabilize. Acceptance of any quote or service booking constitutes agreement to these adjusted terms. This adjustment allows us to maintain high service standards and operational sustainability despite rising transport overheads. Please note terms are strictly COD, EFT is accepted provided that proof of payment is received before the electrician and/or plumber leaves the site via SMS confirmation or email. Our Plumber/Electrician will not leave the premises until full payment/POP has been made/received. If payment is delayed/withheld there will be a standing time charge of R650 per hour. All Clients paying through EFT Facilities need to provide an address where the job was done or a job number. All material installed stays the property of the Company until such time that the account is settled in full. In the event that the account is not settled as per our COD terms, all material will be removed, and the Client will be held responsible for the labour to install and to remove, as well as all legal costs."

const LATE_PAYMENT_TERMS =
  "Kindly note all general maintenance payments are to be paid immediately after the work is done. Please note that a 2.5% interest will be charged on outstanding invoices older than 30 days for account customers. All clients who fail to pay will be put on the Accountability Systems as Default Payer which is linked to the Credit Bureau."

const BANK_DETAILS = [
  'Savvy Civils & Plumbing (Pty) Ltd',
  'Capitec Business Account',
  'Account: 1055 466 843',
  'Branch Code: 450 105',
]

// Fixed company T's & C's / warranty / banking details — the same on every
// invoice, so it's a dedicated last PDF page rather than the per-invoice
// "terms" textarea (which stays free text for job-specific notes).
export function drawInvoiceTermsPage(doc) {
  doc.addPage()
  let y = MARGIN

  function paragraph(text, { bold = false, color = BLACK, size = 8.5, gap = 14 } = {}) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(text, CONTENT_W)
    lines.forEach(line => {
      if (y > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN }
      doc.text(line, MARGIN, y)
      y += size + 2.5
    })
    y += gap
  }

  function heading(text, { size = 10.5, underline = false, gap = 8 } = {}) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(size)
    doc.setTextColor(...BLACK)
    doc.text(text, MARGIN, y)
    if (underline) {
      const w = doc.getTextWidth(text)
      doc.setDrawColor(...BLACK)
      doc.line(MARGIN, y + 2, MARGIN + w, y + 2)
    }
    y += size + gap
  }

  paragraph(COVID_NOTICE)
  heading('30-day Warranty on Workmanship')
  paragraph(WARRANTY_INTRO)
  paragraph(ELECTRONICS_DISCLAIMER)
  paragraph(KWIKOT_CLAUSE)
  heading('Terms:')
  paragraph(FUEL_COD_TERMS, { color: RED })
  paragraph(LATE_PAYMENT_TERMS, { color: RED, gap: 18 })

  heading('BANKING DETAILS', { underline: true, gap: 10 })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...BLACK)
  BANK_DETAILS.forEach(line => {
    if (y > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN }
    doc.text(line, MARGIN, y)
    const w = doc.getTextWidth(line)
    doc.line(MARGIN, y + 2, MARGIN + w, y + 2)
    y += 14
  })
}
