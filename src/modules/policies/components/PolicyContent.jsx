import { memo, useMemo, useState } from 'react'
import { cleanHtml } from '../sanitizeHtml'
import { renderWithBlanks } from '../policyBlanks'

// A published policy, drawn from its HTML. Sanitised again here (it was also
// sanitised when published) so nothing in the database can ever run script.
//
// Give it `fields` (see effectiveFields in policyBlanks) and the chosen fill-in
// lines become boxes. What is typed stays in the boxes themselves and is
// reported through onValueChange(n, text) — the HTML is not redrawn while
// typing, which would wipe the boxes. `readOnly` + `values` shows a signed copy.
//
// `fields` and `values` must keep the same identity between renders (memoise
// them), or the boxes are redrawn.
function PolicyContent({ html, fields = null, values = null, readOnly = false, onValueChange }) {
  const safe = useMemo(() => cleanHtml(html), [html])
  const [startValues] = useState(values)
  const seed = readOnly ? values : startValues

  const markup = useMemo(
    () => (fields?.length ? renderWithBlanks(safe, fields, { values: seed, readOnly }) : safe),
    [safe, fields, seed, readOnly],
  )

  function handleInput(e) {
    const box = e.target
    if (box.tagName !== 'INPUT' || !box.dataset.blank) return
    onValueChange?.(Number(box.dataset.blank), box.value)
  }

  return <div className="policy-prose text-sm text-gray-800" onInput={handleInput} dangerouslySetInnerHTML={{ __html: markup }} />
}

export default memo(PolicyContent)
