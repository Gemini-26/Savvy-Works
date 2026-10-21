import DOMPurify from 'dompurify'

// Policy text comes from a Word file, so it is turned into HTML in the browser
// and then shown to everybody. It is run through DOMPurify with a short list of
// allowed tags both when it is published and again when it is displayed, so a
// crafted document can never run script or load anything for the reader.
const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'div', 'span', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
  'ul', 'ol', 'li',
  'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'a', 'img',
]
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'colspan', 'rowspan']

let hooked = false
function addHooks() {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName !== 'A') return
    const href = node.getAttribute('href')
    // In-document jumps (a table of contents) point at ids we strip, so they
    // would go nowhere — leave the text, drop the dead link.
    if (!href || href.startsWith('#')) {
      node.removeAttribute('href')
      return
    }
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  })
}

export function cleanHtml(html) {
  addHooks()
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  })
}
