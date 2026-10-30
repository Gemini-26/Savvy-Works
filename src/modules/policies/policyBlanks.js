// Fill-in lines. Word policies are full of "Name: ________" lines; here each one
// can become a box the signer types into. The document's HTML is never changed
// (it is fingerprinted at publish time) — boxes are swapped in when it is shown,
// and what people type is saved with their signature.
//
// A "blank" is a run of underscores (or a long dotted line). Blanks are numbered
// 1, 2, 3… in reading order, and that number is how a document's chosen lines and
// a person's answers are matched back up, so the way blanks are found and
// numbered must not change once documents have been published.

const BLANK = /_{3,}|\.{8,}|…{4,}/g
const BLANK_ONCE = /_{3,}|\.{8,}|…{4,}/
const BLOCKS = 'p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, div'

// Lines the company fills in when it issues the document, not the person signing it.
const ISSUER = /approved by|approver|authori[sz]ed by|prepared by|issued by|reviewed by|effective date|review date|next review|revision date|date issued|document owner|policy owner|^employer\b|witness/i
// …and the lines that usually sit directly under "Approved by:".
const ISSUER_FOLLOWERS = /^(position|designation|job title|title|date|signature)$/i

// Phrases that only make sense inside a sentence, said as a field name.
const PHRASES = [
  [/(^|\s)signed at$/i, 'Place signed'],
  [/(^|\s)on this$/i, 'Day'],
  [/(^|\s)day of$/i, 'Month and year'],
  [/(^|\s)(my name is|the undersigned)$/i, 'Full name'],
  [/^(i|we|me)$/i, 'Full name'],
]

const squash = s => s.replace(/[\t\u00a0]+/g, ' ').replace(/\s+/g, ' ').trim()
const tidy = s => squash(s).replace(/^[\s:;,.\-–—)\]]+|[\s:;,\-–—([]+$/g, '')
const hasBlank = s => BLANK_ONCE.test(s)

function parse(html) {
  return new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html')
}

// Every blank in the document, in reading order.
function scan(doc) {
  const hits = []
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const m of node.nodeValue.matchAll(BLANK)) hits.push({ node, index: m.index, length: m[0].length })
  }
  return hits
}

function blockOf(node, doc) {
  return node.parentElement?.closest(BLOCKS) || doc.body
}

function textAround(doc, hit, block) {
  const r = doc.createRange()
  r.setStart(block, 0)
  r.setEnd(hit.node, hit.index)
  const before = r.toString()
  r.setStart(hit.node, hit.index + hit.length)
  r.setEnd(block, block.childNodes.length)
  return { before, after: r.toString() }
}

const caption = el => {
  const text = tidy(el?.textContent || '')
  return text && text.length <= 40 && !hasBlank(text) ? text : ''
}

function labelFor(doc, hit, block, n) {
  const { before, after } = textAround(doc, hit, block)

  // What was written just before this blank, back to the previous blank or sentence.
  const lead = before.split(BLANK_ONCE).pop().split(/[.;!?]\s+/).pop()
  const words = tidy(lead).split(' ').filter(Boolean)
  const tail = words.slice(-5).join(' ')
  if (tail) {
    for (const [pattern, label] of PHRASES) if (pattern.test(tail)) return label
    return tail.charAt(0).toUpperCase() + tail.slice(1)
  }

  // Nothing before it on the line: the label is written beside or under it ("______ Employee Name").
  const beside = tidy(after.split(BLANK_ONCE)[0])
  if (beside && beside.length <= 40) return beside

  const inCell = /^(TD|TH)$/.test(block.tagName)
  const label = inCell
    ? caption(block.previousElementSibling) || caption(block.nextElementSibling)
    : caption(block.nextElementSibling) || caption(block.previousElementSibling)
  return label || `Line ${n}`
}

function kindOf(label) {
  if (/\bsignature\b/i.test(label)) return 'signature'
  if (/\bdate\b/i.test(label)) return 'date'
  if (/phone|cell|mobile|\btel\b|contact (no|number)/i.test(label)) return 'phone'
  return 'text'
}

// The blanks in a document, each: { n, label, kind, include, context }.
// `include` is the starting guess for "should the person signing fill this in".
export function detectBlanks(html) {
  const doc = parse(html)
  let issuerRun = false
  return scan(doc).map((hit, i) => {
    const n = i + 1
    const block = blockOf(hit.node, doc)
    const label = labelFor(doc, hit, block, n)
    const kind = kindOf(label)

    issuerRun = ISSUER.test(label) || (issuerRun && ISSUER_FOLLOWERS.test(label))

    const { before, after } = textAround(doc, hit, block)
    const lead = squash(before).slice(-36)
    const trail = squash(after.split(BLANK_ONCE)[0]).slice(0, 18)
    return { n, label, kind, include: !issuerRun, context: `${lead} ____ ${trail}`.trim() }
  })
}

// What gets saved with a document: only the lines people fill in. `null` means
// "this document has no blanks" and `[]` means "it has some, and none are for the
// signer" — which is why the two must not be mixed up (null falls back to the guess).
export function persistableFields(blanks) {
  if (!blanks?.length) return null
  return blanks.filter(b => b.include).map(({ n, label, kind }) => ({ n, label: label.trim() || `Line ${n}`, kind }))
}

// The lines to show as boxes for a document: what its admin chose, or — for a
// document published before there was a choice — the guess.
export function effectiveFields(html, stored) {
  const found = detectBlanks(html)
  if (!Array.isArray(stored)) return found.filter(b => b.include)
  const chosen = new Map(stored.map(f => [f.n, f]))
  return found.filter(b => chosen.has(b.n)).map(b => {
    const f = chosen.get(b.n)
    const label = f.label || b.label
    return { ...b, label, kind: f.kind || kindOf(label), include: true }
  })
}

// The same, for the admin's tick-list: every blank, ticked if it is in use.
export function pickerFields(html, stored) {
  const found = detectBlanks(html)
  if (!Array.isArray(stored)) return found
  const chosen = new Map(stored.map(f => [f.n, f]))
  return found.map(b => {
    const f = chosen.get(b.n)
    if (!f) return { ...b, include: false }
    const label = f.label || b.label
    return { ...b, label, kind: f.kind || kindOf(label), include: true }
  })
}

// Today, the way a person would write it.
export const todayLong = () => new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })

// Answers a person starts with: date lines begin as today (they can change it).
export function startingAnswers(fields) {
  const answers = {}
  for (const f of fields) if (f.kind === 'date') answers[f.n] = todayLong()
  return answers
}

// Lines that need an answer before signing.
export const isTyped = f => f.kind !== 'signature'
export const isRequired = f => isTyped(f) && !/\(optional\)/i.test(f.label)

// The document HTML with a box in place of each chosen blank. `values` is
// { n: text }; `readOnly` shows the answers as fixed text (a signed copy).
export function renderWithBlanks(html, fields, { values = null, readOnly = false } = {}) {
  const doc = parse(html)
  const byN = new Map(fields.map(f => [f.n, f]))
  const hits = scan(doc).map((hit, i) => ({ ...hit, n: i + 1 }))

  // Latest first, so splitting a text node never shifts a blank still to come.
  for (const hit of hits.reverse()) {
    const field = byN.get(hit.n)
    if (!field) continue

    let el
    if (field.kind === 'signature') {
      el = doc.createElement('span')
      el.className = 'policy-blank-sig'
      el.textContent = readOnly ? 'Signed' : 'Sign in the box below'
    } else {
      el = doc.createElement('input')
      el.setAttribute('type', 'text')
      el.setAttribute('class', 'policy-blank')
      el.setAttribute('data-blank', String(hit.n))
      el.setAttribute('aria-label', field.label)
      el.setAttribute('placeholder', field.label)
      el.setAttribute('maxlength', '200')
      el.setAttribute('autocomplete', 'off')
      el.setAttribute('inputmode', field.kind === 'phone' ? 'tel' : 'text')
      // As long as the line it replaces, but never too short to read its own name.
      const width = Math.max(Math.round(hit.length * 0.75), field.label.length + 3, 12)
      el.setAttribute('style', `width:${Math.min(width, 34)}ch`)
      if (readOnly) el.setAttribute('readonly', '')
      const value = values?.[hit.n]
      if (value) el.setAttribute('value', value)
    }

    const rest = hit.node.splitText(hit.index)
    rest.splitText(hit.length)
    rest.replaceWith(el)
  }
  return doc.body.innerHTML
}
