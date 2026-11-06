import { jsPDF } from 'jspdf'
import { cleanHtml } from '../sanitizeHtml'
import { effectiveFields, fillBlanksForPrint } from '../policyBlanks'
import { loadBrandingImages, COMPANY_NAME } from '../../finance/utils/pdfHeader'

// A signed policy as a PDF: the document's own wording, each fill-in line showing
// what that person typed, their drawn signature on any signature line, and a
// signature record (who, when, what they agreed to, the wording's fingerprint)
// at the end.
//
// It is real text laid out page by page, not a screenshot of the page, so the PDFs
// are small, sharp and searchable. jsPDF has no HTML layout of its own, so the
// small Flow class below walks the (already sanitised) policy HTML — headings,
// paragraphs, lists, tables, pictures — and places it.
//
// Two steps so a batch is quick: preparePolicy() does the per-DOCUMENT work once
// (sanitise, load pictures, find the fill-in lines); buildSignedPolicyPdf() then
// does the per-PERSON work (answers, signature, record).

const PAGE_W = 595.28
const PAGE_H = 841.89
const MX = 50
const TOP = 70
const BOTTOM = PAGE_H - 56
const CONTENT_W = PAGE_W - MX * 2
const CONTENT_H = BOTTOM - TOP

const BODY = 10
const TABLE = 9
const LH = 1.38
// Measuring a phrase word by word can come out a hair wider than measuring it whole;
// without this a column sized to fit "Item 10" would still wrap it.
const FIT = 0.8

const INK = [25, 25, 25]
const MUTED = [110, 110, 110]
const RULE = [215, 215, 215]
const ANSWER_INK = [18, 48, 140]
const LINK_INK = [20, 80, 190]

const HEADING_SIZE = { 1: 17, 2: 14, 3: 12, 4: 11, 5: 10.5, 6: 10 }
const BLOCK_TAGS = new Set(['p', 'div', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'hr'])

// ── Text the standard PDF fonts can draw ─────────────────────────────────────
// Helvetica covers Latin-1 plus the Windows "smart" punctuation Word loves
// (curly quotes, dashes, bullet, ellipsis…). Everything else is swapped for the
// closest plain character rather than printed as garbage.

const WIN_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
const SWAPS = {
  '‐': '-', '‑': '-', '‒': '-', '−': '-', '⁃': '-',
  '→': '->', '←': '<-', '⇒': '=>', '≤': '<=', '≥': '>=',
  '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x', '●': '•', '▪': '•', '◦': '-', '‣': '•',
  'ﬁ': 'fi', 'ﬂ': 'fl', '′': "'", '″': '"', '‛': "'", '‟': '"',
  // Letters that have no "base letter + accent" form to fall back on.
  'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ı': 'i', 'ħ': 'h', 'Ħ': 'H',
}

export function pdfText(input) {
  let out = ''
  for (const ch of String(input ?? '').normalize('NFC')) {
    const code = ch.codePointAt(0)
    if (code === 0x00ad || (code >= 0x200b && code <= 0x200f) || code === 0x2060 || code === 0xfeff || code === 0x2028 || code === 0x2029) continue
    if (code === 0x00a0 || code === 0x202f || (code >= 0x2000 && code <= 0x200a) || code === 0x3000) { out += ' '; continue }
    if (code < 0x20) { if (code === 0x09 || code === 0x0a) out += ' '; continue }
    if (code <= 0xff || WIN_EXTRA.has(ch)) { out += ch; continue }
    if (SWAPS[ch]) { out += SWAPS[ch]; continue }
    const base = ch.normalize('NFD')[0]
    out += base && base.codePointAt(0) <= 0xff ? base : '?'
  }
  return out
}

const squash = s => s.replace(/\s+/g, ' ')
const clampInt = (v, min, max) => Math.min(max, Math.max(min, parseInt(v, 10) || min))

// ── Pictures ─────────────────────────────────────────────────────────────────

let probe = null
const probePdf = () => (probe ||= new jsPDF())

// jsPDF only embeds PNG and JPEG; anything else a browser can show (GIF, WebP,
// SVG…) goes through a canvas first. Very large photos are shrunk, since the same
// picture is repeated in every person's copy.
async function loadPicture(src) {
  if (!src) return null
  try {
    let dataUrl = src
    let direct = /^data:image\/(png|jpe?g);base64,/i.test(src)
    let props = null
    if (direct) props = probePdf().getImageProperties(dataUrl)

    const tooBig = props && (props.width > 1600 || dataUrl.length > 700_000)
    if (!direct || tooBig) {
      if (typeof document === 'undefined') return null
      const img = new Image()
      img.src = src
      await img.decode()
      const scale = Math.min(1, 1400 / img.naturalWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      direct = true
      props = probePdf().getImageProperties(dataUrl)
    }
    const format = /jpe?g/i.test(props.fileType) ? 'JPEG' : 'PNG'
    return { dataUrl, format, w: props.width * 0.75, h: props.height * 0.75 }
  } catch {
    return null
  }
}

// ── Step 1: the per-document work ────────────────────────────────────────────

// `doc` needs content_html and fill_fields (a row of policy_documents).
export async function preparePolicy(doc) {
  const safe = cleanHtml(doc.content_html)
  const body = new DOMParser().parseFromString(`<body>${safe}</body>`, 'text/html').body
  const images = []
  const pictures = [...body.querySelectorAll('img')]
  for (const [i, img] of pictures.entries()) {
    img.setAttribute('data-pdf-img', String(i))
    images[i] = await loadPicture(img.getAttribute('src'))
  }
  return {
    html: body.innerHTML,
    images,
    // The lines people were asked to fill in, found exactly as the signing page finds them.
    fields: effectiveFields(doc.content_html, doc.fill_fields),
  }
}

// ── Inline text ──────────────────────────────────────────────────────────────

const baseStyle = (extra = {}) => ({ bold: false, italic: false, underline: false, strike: false, script: null, color: INK, link: null, answer: false, ...extra })
const styleKey = s => `${+s.bold}${+s.italic}${+s.underline}${+s.strike}${s.script || '-'}${s.color.join(',')}${s.link || ''}${+s.answer}`

function pushText(text, style, out) {
  const clean = squash(pdfText(text))
  if (!clean) return
  for (const part of clean.split(/( )/)) {
    if (part === '') continue
    out.push(part === ' ' ? { t: 'sp', st: style } : { t: 'w', s: part, st: style })
  }
}

function safeUrl(href) {
  return /^(https?:|mailto:|tel:)/i.test(href || '') ? href : null
}

function collectInline(nodes, style, out, env) {
  for (const node of nodes) {
    if (node.nodeType === 3) { pushText(node.nodeValue, style, out); continue }
    if (node.nodeType !== 1) continue
    const tag = node.tagName.toLowerCase()

    if (tag === 'br') { out.push({ t: 'br' }); continue }
    if (tag === 'img') {
      const pic = env.prepared.images[node.getAttribute('data-pdf-img')]
      if (pic) out.push({ t: 'img', pic })
      else if (node.getAttribute('alt')) pushText(`[${node.getAttribute('alt')}]`, style, out)
      continue
    }
    if (node.hasAttribute('data-pdf-signature')) {
      out.push(env.signaturePic ? { t: 'img', pic: env.signaturePic, signature: true } : { t: 'w', s: '(signed)', st: style })
      continue
    }
    if (node.hasAttribute('data-pdf-answer')) {
      pushText(node.textContent, { ...style, answer: true, underline: true, color: ANSWER_INK }, out)
      continue
    }

    let next = style
    switch (tag) {
      case 'strong': case 'b': next = { ...style, bold: true }; break
      case 'em': case 'i': next = { ...style, italic: true }; break
      case 'u': next = { ...style, underline: true }; break
      case 's': next = { ...style, strike: true }; break
      case 'sup': next = { ...style, script: 'sup' }; break
      case 'sub': next = { ...style, script: 'sub' }; break
      case 'a': {
        const url = safeUrl(node.getAttribute('href'))
        if (url) next = { ...style, link: url, underline: true, color: LINK_INK }
        break
      }
      default: break
    }
    collectInline(node.childNodes, next, out, env)
  }
}

// Spaces at either end of a paragraph are never drawn.
function trimItems(items) {
  while (items.length && items[0].t === 'sp') items.shift()
  while (items.length && items[items.length - 1].t === 'sp') items.pop()
  return items
}

const hasContent = items => items.some(i => i.t === 'w' || i.t === 'img' || i.t === 'br')

function applyStyle(pdf, st, size) {
  const weight = st.bold && st.italic ? 'bolditalic' : st.bold ? 'bold' : st.italic ? 'italic' : 'normal'
  pdf.setFont('helvetica', weight)
  pdf.setFontSize(st.script ? size * 0.7 : size)
  pdf.setTextColor(...st.color)
}

// A picture is never wider than its column nor taller than a page.
function fitPicture(pic, maxW, maxH) {
  const k = Math.min(1, maxW / pic.w, maxH / pic.h)
  return { w: pic.w * k, h: pic.h * k }
}

// ── Layout ───────────────────────────────────────────────────────────────────

class Flow {
  // measure: work out heights without drawing. paged: may start a new page (the
  // main flow only — table cells never split across pages).
  constructor(pdf, env, { measure = false, paged = true } = {}) {
    this.pdf = pdf
    this.env = env
    this.measure = measure
    this.paged = paged
    this.y = paged ? TOP : 0
    this.pending = 0      // gap wanted before the next thing (collapses, like CSS margins)
    this.fresh = true     // nothing placed yet: no gap above the first thing
    this.marker = null    // list bullet/number waiting for its first line
  }

  gap(n) { this.pending = Math.max(this.pending, n) }

  flushGap() {
    if (!this.fresh) this.y += this.pending
    this.pending = 0
  }

  newPage() {
    if (!this.measure) this.pdf.addPage()
    this.y = TOP
    this.fresh = true
    this.pending = 0
  }

  ensure(h) {
    if (this.paged && this.y + h > BOTTOM && this.y > TOP + 1) this.newPage()
  }

  // Everything inside `nodes`, top to bottom.
  blocks(nodes, ctx) {
    let run = []
    const flush = () => {
      if (run.length) this.paragraphFrom(run, ctx)
      run = []
    }
    for (const node of nodes) {
      if (node.nodeType === 1 && BLOCK_TAGS.has(node.tagName.toLowerCase())) {
        flush()
        this.block(node, ctx)
      } else {
        run.push(node)
      }
    }
    flush()
  }

  block(el, ctx) {
    const tag = el.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) return this.heading(el, Number(tag[1]), ctx)
    switch (tag) {
      case 'ul': case 'ol': return this.list(el, ctx)
      case 'table': return this.table(el, ctx)
      case 'hr': {
        this.gap(8); this.flushGap(); this.ensure(6)
        if (!this.measure) {
          this.pdf.setDrawColor(...RULE); this.pdf.setLineWidth(0.6)
          this.pdf.line(ctx.x, this.y + 2, ctx.x + ctx.width, this.y + 2)
        }
        this.y += 6; this.fresh = false; this.gap(8)
        return undefined
      }
      case 'blockquote': {
        this.gap(5)
        this.blocks(el.childNodes, { ...ctx, x: ctx.x + 18, width: ctx.width - 18 })
        this.gap(5)
        return undefined
      }
      case 'p': case 'li': {
        this.gap(ctx.paraGap)
        this.blocks(el.childNodes, ctx)
        this.gap(ctx.paraGap)
        return undefined
      }
      default:   // div and anything else block-like: no margin of its own
        this.blocks(el.childNodes, ctx)
        return undefined
    }
  }

  paragraphFrom(nodes, ctx, extra = {}) {
    const items = []
    collectInline(nodes, baseStyle({ bold: !!ctx.bold, ...extra }), items, this.env)
    trimItems(items)
    if (!hasContent(items)) return
    this.paragraph(items, ctx)
  }

  heading(el, level, ctx) {
    const size = HEADING_SIZE[level]
    const items = []
    collectInline(el.childNodes, baseStyle({ bold: true }), items, this.env)
    trimItems(items)
    if (!hasContent(items)) return
    const lines = this.breakLines(items, ctx.width, size)
    const total = lines.reduce((n, l) => n + l.h, 0)
    this.gap(level <= 2 ? 12 : 9)
    this.flushGap()
    this.ensure(total + BODY * LH * 2)   // a heading never sits alone at the foot of a page
    this.drawLines(lines, ctx.x, size)
    this.gap(4)
  }

  paragraph(items, ctx) {
    const lines = this.breakLines(items, ctx.width, ctx.size)
    this.flushGap()
    this.drawLines(lines, ctx.x, ctx.size)
  }

  drawLines(lines, x, size) {
    for (const line of lines) {
      this.ensure(line.h)
      if (!this.measure) this.drawLine(line, x, size)
      this.marker = null
      this.y += line.h
      this.fresh = false
    }
  }

  // Splits inline items into lines no wider than `width`.
  breakLines(items, width, size) {
    const pdf = this.pdf
    const lines = []
    let line = { parts: [], w: 0, h: size * LH, size }

    const finish = () => {
      while (line.parts.length && line.parts[line.parts.length - 1].item.t === 'sp') line.w -= line.parts.pop().w
      lines.push(line)
      line = { parts: [], w: 0, h: size * LH, size }
    }
    const add = (item, w, h = 0) => {
      line.parts.push({ item, w, ph: h })
      line.w += w
      if (h) line.h = Math.max(line.h, h + 3)
    }

    for (const item of items) {
      if (item.t === 'br') { finish(); continue }

      if (item.t === 'img') {
        const { w, h } = fitPicture(item.pic, item.signature ? 120 : width, item.signature ? 40 : CONTENT_H - 20)
        if (line.w + w > width && line.parts.length) finish()
        add(item, w, h)
        continue
      }

      applyStyle(pdf, item.st, size)
      const w = pdf.getTextWidth(item.t === 'sp' ? ' ' : item.s)
      if (item.t === 'sp') {
        if (!line.parts.length) continue
        if (line.w + w > width + FIT) { finish(); continue }
        add(item, w)
        continue
      }
      if (line.w + w > width + FIT && line.parts.length) finish()
      if (w > width + FIT) {
        // A single word wider than the column (a long web address): cut it.
        let piece = ''
        for (const ch of item.s) {
          applyStyle(pdf, item.st, size)
          if (pdf.getTextWidth(piece + ch) > width && piece) {
            add({ ...item, s: piece }, pdf.getTextWidth(piece))
            finish()
            piece = ''
          }
          piece += ch
        }
        if (piece) { applyStyle(pdf, item.st, size); add({ ...item, s: piece }, pdf.getTextWidth(piece)) }
        continue
      }
      add(item, w)
    }
    if (line.parts.length || !lines.length) finish()
    return lines
  }

  drawLine(line, x, size) {
    const pdf = this.pdf
    const baseline = this.y + line.h - size * 0.3
    let cx = x

    if (this.marker) {
      const m = this.marker
      pdf.setTextColor(...INK)
      if (m.ordered) {
        applyStyle(pdf, baseStyle(), size)
        pdf.text(m.text, m.x, baseline, { align: 'right' })
      } else {
        const r = size * 0.14
        pdf.setFillColor(...INK); pdf.setDrawColor(...INK); pdf.setLineWidth(0.6)
        if (m.level % 2 === 0) pdf.circle(m.x - 2, baseline - size * 0.3, r * 1.2, 'F')
        else pdf.line(m.x - 5, baseline - size * 0.3, m.x - 1, baseline - size * 0.3)
      }
    }

    // Neighbouring pieces in the same style are drawn as one run, so the PDF's
    // text reads (and copies) naturally.
    let run = null
    const flushRun = () => {
      if (!run) return
      const st = run.st
      const size2 = st.script ? size * 0.7 : size
      const by = baseline + (st.script === 'sup' ? -size * 0.33 : st.script === 'sub' ? size * 0.12 : 0)
      applyStyle(pdf, st, size)
      pdf.text(run.text, run.x, by)
      const w = pdf.getTextWidth(run.text)
      pdf.setDrawColor(...st.color); pdf.setLineWidth(0.5)
      if (st.underline) pdf.line(run.x, by + 1.6, run.x + w, by + 1.6)
      if (st.strike) pdf.line(run.x, by - size2 * 0.3, run.x + w, by - size2 * 0.3)
      if (st.link) pdf.link(run.x, by - size2, w, size2 * 1.3, { url: st.link })
      run = null
    }

    for (const part of line.parts) {
      const { item, w } = part
      if (item.t === 'img') {
        flushRun()
        // `w` and `ph` are the size it was given when the line was laid out.
        pdf.addImage(item.pic.dataUrl, item.pic.format, cx, baseline - part.ph + 2, w, part.ph, item.pic.alias, 'FAST')
        cx += w
        continue
      }
      const text = item.t === 'sp' ? ' ' : item.s
      if (run && styleKey(run.st) === styleKey(item.st)) {
        run.text += text
      } else {
        flushRun()
        run = { text, st: item.st, x: cx }
      }
      cx += w
    }
    flushRun()
  }

  list(el, ctx) {
    const ordered = el.tagName === 'OL'
    const indent = 20
    let n = 1
    this.gap(ctx.depth === 0 ? 5 : 2)
    for (const li of el.children) {
      if (li.tagName !== 'LI') continue
      this.gap(2)
      this.flushGap()
      this.marker = { text: `${n}.`, x: ctx.x + indent - 5, ordered, level: ctx.depth, size: ctx.size }
      n += 1
      this.blocks(li.childNodes, { ...ctx, x: ctx.x + indent, width: ctx.width - indent, depth: ctx.depth + 1 })
      this.marker = null
    }
    this.gap(ctx.depth === 0 ? 5 : 2)
  }

  // Height of some HTML laid out in a column of the given width, without drawing it.
  heightOf(nodes, ctx) {
    const f = new Flow(this.pdf, this.env, { measure: true, paged: false })
    f.blocks(nodes, ctx)
    return f.y
  }

  table(el, ctx) {
    const pdf = this.pdf
    const PAD = 4
    const rows = [...el.querySelectorAll(':scope > tr, :scope > * > tr')]
    if (!rows.length) return

    // Which cell sits in which grid square (colspan / rowspan).
    const grid = []
    const cells = []
    rows.forEach((tr, r) => {
      grid[r] ||= []
      let c = 0
      for (const td of tr.children) {
        if (!/^(TD|TH)$/.test(td.tagName)) continue
        while (grid[r][c]) c += 1
        const cs = clampInt(td.getAttribute('colspan'), 1, 24)
        const rs = Math.min(clampInt(td.getAttribute('rowspan'), 1, 200), rows.length - r)
        const cell = { el: td, r, c, cs, rs, header: td.tagName === 'TH' }
        cells.push(cell)
        for (let i = 0; i < rs; i++) {
          grid[r + i] ||= []
          for (let j = 0; j < cs; j++) grid[r + i][c + j] = cell
        }
        c += cs
      }
    })
    if (!cells.length) return
    const nCols = Math.max(...cells.map(c => c.c + c.cs))
    const nRows = rows.length

    // Column widths: every column gets at least its longest word, and what is left
    // is shared out by how much more text each wants (like a browser's auto layout).
    const col = Array.from({ length: nCols }, () => ({ min: 0, max: 0 }))
    for (const cell of cells) {
      if (cell.cs !== 1) continue
      applyStyle(pdf, baseStyle({ bold: cell.header }), TABLE)
      const text = squash(pdfText(cell.el.textContent)).trim()
      const longest = text.split(' ').reduce((m, w) => Math.max(m, pdf.getTextWidth(w)), 0)
      const hasObject = !!cell.el.querySelector('img, table, [data-pdf-signature]')
      col[cell.c].min = Math.max(col[cell.c].min, (hasObject ? 40 : longest) + PAD * 2)
      col[cell.c].max = Math.max(col[cell.c].max, (hasObject ? 120 : pdf.getTextWidth(text)) + PAD * 2 + 2)
    }
    for (const k of col) {
      k.min = Math.max(k.min, 28)
      k.max = Math.max(k.max, k.min)
    }
    // Short columns (a price, an item number) get all the room their text wants, so
    // they never wrap needlessly; the wider columns share what is left.
    const share = (cols, total) => {
      const sMin = cols.reduce((n, k) => n + k.min, 0)
      const sMax = cols.reduce((n, k) => n + k.max, 0)
      if (sMax <= total) return cols.map(k => k.max + (total - sMax) / cols.length)
      if (sMin >= total) return cols.map(k => (k.min * total) / sMin)
      return cols.map(k => k.min + ((total - sMin) * (k.max - k.min)) / (sMax - sMin))
    }
    const shortLimit = Math.min(120, ctx.width * 0.22)
    const isShort = col.map(k => k.max <= shortLimit)
    const longCols = col.filter((_, i) => !isShort[i])
    const shortTotal = col.reduce((n, k, i) => n + (isShort[i] ? k.max : 0), 0)
    let widths
    if (longCols.length && longCols.length < nCols && ctx.width - shortTotal >= longCols.reduce((n, k) => n + k.min, 0)) {
      const longWidths = share(longCols, ctx.width - shortTotal)
      let li = 0
      widths = col.map((k, i) => (isShort[i] ? k.max : longWidths[li++]))
    } else {
      widths = share(col, ctx.width)
    }
    const colX = widths.map((_, i) => widths.slice(0, i).reduce((n, w) => n + w, 0))
    const spanW = cell => widths.slice(cell.c, cell.c + cell.cs).reduce((n, w) => n + w, 0)
    const cellCtx = cell => ({ x: 0, width: spanW(cell) - PAD * 2, size: TABLE, paraGap: 3, depth: 0, bold: cell.header })

    // Row heights, then stretch the last row of any row-spanning cell that needs more.
    const rowH = new Array(nRows).fill(15)
    const need = new Map(cells.map(cell => [cell, this.heightOf(cell.el.childNodes, cellCtx(cell)) + PAD * 2]))
    for (const cell of cells) if (cell.rs === 1) rowH[cell.r] = Math.max(rowH[cell.r], need.get(cell))
    for (const cell of cells) {
      if (cell.rs === 1) continue
      const have = rowH.slice(cell.r, cell.r + cell.rs).reduce((n, h) => n + h, 0)
      if (need.get(cell) > have) rowH[cell.r + cell.rs - 1] += need.get(cell) - have
    }

    // A page break may only fall between rows that no cell reaches across.
    const reach = new Array(nRows).fill(0).map((_, i) => i)
    for (const cell of cells) reach[cell.r] = Math.max(reach[cell.r], cell.r + cell.rs - 1)

    // Draws rows `from`..`to` (a block no page break may split) at the current position.
    const place = (from, to) => {
      const height = rowH.slice(from, to + 1).reduce((n, h) => n + h, 0)
      if (!this.measure) {
        const tops = []
        let acc = this.y
        for (let i = from; i <= to; i++) { tops[i] = acc; acc += rowH[i] }
        for (const cell of cells.filter(c => c.r >= from && c.r <= to)) {
          const x = ctx.x + colX[cell.c]
          const w = spanW(cell)
          const top = tops[cell.r]
          const h = rowH.slice(cell.r, cell.r + cell.rs).reduce((n, v) => n + v, 0)
          pdf.setDrawColor(190, 190, 190); pdf.setLineWidth(0.5)
          if (cell.header) { pdf.setFillColor(240, 240, 240); pdf.rect(x, top, w, h, 'FD') } else pdf.rect(x, top, w, h, 'S')
          const f = new Flow(pdf, this.env, { measure: false, paged: false })
          f.y = top + PAD
          f.blocks(cell.el.childNodes, { ...cellCtx(cell), x: x + PAD })
        }
      }
      this.y += height
      this.fresh = false
    }

    // A first row made only of header cells is repeated when the table runs onto another page.
    const repeatHeader = nRows > 2 && reach[0] === 0 && cells.filter(c => c.r === 0).every(c => c.header)

    this.gap(6)
    this.flushGap()
    let r = 0
    while (r < nRows) {
      let end = r
      for (let i = r; i <= end; i++) end = Math.max(end, reach[i])
      const unitH = rowH.slice(r, end + 1).reduce((n, h) => n + h, 0)

      if (unitH > CONTENT_H) {
        // Taller than a page: give up on the grid and just run the contents down the page.
        for (const cell of cells.filter(c => c.r >= r && c.r <= end)) {
          this.blocks(cell.el.childNodes, { x: ctx.x, width: ctx.width, size: TABLE, paraGap: 3, depth: 0, bold: cell.header })
          this.gap(4)
        }
        r = end + 1
        continue
      }

      const pagesBefore = this.measure ? 0 : pdf.getNumberOfPages()
      this.ensure(unitH)
      if (repeatHeader && r > 0 && !this.measure && pdf.getNumberOfPages() !== pagesBefore && this.y + rowH[0] + unitH <= BOTTOM) {
        place(0, 0)
      }
      place(r, end)
      r = end + 1
    }
    this.gap(8)
  }
}

// ── The signature record ─────────────────────────────────────────────────────

const when = iso => {
  if (!iso) return '—'
  const parts = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
  return `${parts} (SAST)`
}

function drawRecord(pdf, flow, sig, signaturePic, answers) {
  const PAD = 12
  const LABEL_W = 96
  const valueW = CONTENT_W - PAD * 2 - LABEL_W

  const rows = [
    ['Signed by', [sig.signer_name, sig.signer_role ? `(${sig.signer_role})` : ''].filter(Boolean).join(' ')],
    ['Date and time', when(sig.signed_at)],
    ['Document', `${sig.document_title}, version ${sig.document_version}`],
    ...answers.map(a => [a.label || `Line ${a.n}`, a.value]),
    ['Agreed to', sig.statement ? `"${sig.statement}"` : ''],
    ['IP address', sig.ip_address || ''],
  ].filter(([, v]) => v).map(([label, value]) => {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5)
    return { label: pdfText(label), lines: pdf.splitTextToSize(pdfText(value), valueW) }
  })

  pdf.setFont('courier', 'normal'); pdf.setFontSize(7.5)
  const hashLines = pdf.splitTextToSize(sig.content_hash || '', valueW)

  const sigBox = signaturePic ? fitPicture(signaturePic, 220, 70) : { w: 0, h: 0 }
  const rowsH = rows.reduce((n, r) => n + r.lines.length * 12.5 + 4, 0)
  const total = PAD + 14 + (sigBox.h ? sigBox.h + 18 : 0) + rowsH + hashLines.length * 9.5 + 4 + PAD

  flow.gap(18)
  flow.flushGap()
  flow.ensure(total)   // the whole record stays together on one page

  const x = MX
  let y = flow.y
  pdf.setDrawColor(170, 170, 170); pdf.setLineWidth(0.8)
  pdf.roundedRect(x, y, CONTENT_W, total, 4, 4, 'S')
  y += PAD + 6
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(...MUTED)
  pdf.text('ELECTRONIC SIGNATURE RECORD', x + PAD, y)
  y += 8

  if (sigBox.h) {
    y += 4
    pdf.addImage(signaturePic.dataUrl, signaturePic.format, x + PAD, y, sigBox.w, sigBox.h, signaturePic.alias, 'FAST')
    y += sigBox.h + 3
    pdf.setDrawColor(...INK); pdf.setLineWidth(0.6)
    pdf.line(x + PAD, y, x + PAD + Math.max(sigBox.w, 160), y)
    y += 12
  }

  for (const row of rows) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
    pdf.text(row.label, x + PAD, y)
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9.5); pdf.setTextColor(...INK)
    row.lines.forEach((l, i) => pdf.text(l, x + PAD + LABEL_W, y + i * 12.5))
    y += row.lines.length * 12.5 + 4
  }

  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
  pdf.text('Fingerprint', x + PAD, y + 1)
  pdf.setFont('courier', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...INK)
  hashLines.forEach((l, i) => pdf.text(l, x + PAD + LABEL_W, y + 1 + i * 9.5))

  flow.y += total
  flow.fresh = false
}

// ── Step 2: one person's signed copy ─────────────────────────────────────────

// `doc`: the policy_documents row. `prepared`: preparePolicy(doc). `signature`: the
// policy_signatures row (with signature_image and field_answers). `branding` is
// optional (loadBrandingImages()); without it the letterhead is text only.
// Returns the jsPDF document.
export function buildSignedPolicyPdf({ doc, prepared, signature, branding = null }) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const answers = (Array.isArray(signature.field_answers) ? signature.field_answers : []).filter(a => a && a.value)
  const values = Object.fromEntries(answers.map(a => [a.n, a.value]))

  // Anything the person typed is shown even if the document's list of lines no longer names it.
  const known = new Set(prepared.fields.map(f => f.n))
  const fields = [...prepared.fields, ...answers.filter(a => !known.has(a.n)).map(a => ({ n: a.n, label: a.label, kind: 'text' }))]

  let signaturePic = null
  try {
    const props = pdf.getImageProperties(signature.signature_image)
    signaturePic = {
      dataUrl: signature.signature_image, format: /jpe?g/i.test(props.fileType) ? 'JPEG' : 'PNG',
      w: props.width * 0.75, h: props.height * 0.75, alias: 'signature',
    }
  } catch { /* an unreadable signature image still leaves a complete record without it */ }

  // Pictures are repeated in every copy; a stable alias makes jsPDF store each once per file.
  const images = prepared.images.map((p, i) => (p ? { ...p, alias: `pic${i}` } : null))
  const env = { prepared: { ...prepared, images }, signaturePic }

  const title = pdfText(signature.document_title || doc.title)
  const subtitle = pdfText(`Version ${signature.document_version} · signed by ${signature.signer_name}`)

  // Title block, then the document.
  const flow = new Flow(pdf, env)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(...MUTED)
  pdf.text('SIGNED COPY', MX, flow.y + 8)
  flow.y += 20
  pdf.setFontSize(18); pdf.setTextColor(...INK)
  const titleLines = pdf.splitTextToSize(title, CONTENT_W)
  titleLines.forEach(l => { pdf.text(l, MX, flow.y + 14); flow.y += 22 })
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(...MUTED)
  pdf.text(subtitle, MX, flow.y + 6)
  flow.y += 16
  pdf.setDrawColor(...RULE); pdf.setLineWidth(0.8)
  pdf.line(MX, flow.y, PAGE_W - MX, flow.y)
  flow.y += 14

  const body = fillBlanksForPrint(prepared.html, fields, values)
  flow.blocks(body.childNodes, { x: MX, width: CONTENT_W, size: BODY, paraGap: 4, depth: 0, bold: false })

  drawRecord(pdf, flow, { ...signature, document_title: signature.document_title || doc.title }, signaturePic, answers)

  // Letterhead and page numbers go on last, once we know how many pages there are.
  const pages = pdf.getNumberOfPages()
  const logo = branding?.logo
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p)
    if (logo) {
      try { pdf.addImage(logo.dataUrl, logo.format, MX, 22, 63, 21, 'logo', 'FAST') } catch { /* text-only header */ }
    }
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTED)
    pdf.text(COMPANY_NAME.toUpperCase(), PAGE_W - MX, 30, { align: 'right' })
    const running = pdf.splitTextToSize(title, CONTENT_W * 0.7)[0]
    pdf.text(running, PAGE_W - MX, 42, { align: 'right' })
    pdf.setDrawColor(...RULE); pdf.setLineWidth(0.6)
    pdf.line(MX, 52, PAGE_W - MX, 52)
    pdf.line(MX, PAGE_H - 42, PAGE_W - MX, PAGE_H - 42)
    pdf.setFontSize(7.5)
    pdf.text(pdfText(`Signed by ${signature.signer_name} · ${when(signature.signed_at)}`), MX, PAGE_H - 30)
    pdf.text(`Page ${p} of ${pages}`, PAGE_W - MX, PAGE_H - 30, { align: 'right' })
  }

  pdf.setProperties({
    title: `${title} — signed by ${signature.signer_name}`,
    subject: 'Signed policy copy',
    author: COMPANY_NAME,
    creator: COMPANY_NAME,
  })
  return pdf
}

// One call for the simple case (a single signature).
export async function signedPolicyPdf({ doc, signature, prepared = null, branding = null }) {
  const prep = prepared || await preparePolicy(doc)
  let brand = branding
  if (!brand) {
    try { brand = await loadBrandingImages() } catch { brand = null }
  }
  return buildSignedPolicyPdf({ doc, prepared: prep, signature, branding: brand })
}

// "Company Policy: Site Hours" + "Sipho M" -> a name safe on Windows, Mac and Android.
export function safeFileName(name, fallback = 'file') {
  const cleaned = pdfText(name)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 110)
  return cleaned || fallback
}
