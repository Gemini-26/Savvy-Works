import { memo, useMemo } from 'react'
import { cleanHtml } from '../sanitizeHtml'

// A published policy, drawn from its HTML. Sanitised again here (it was also
// sanitised when published) so nothing in the database can ever run script.
function PolicyContent({ html }) {
  const safe = useMemo(() => cleanHtml(html), [html])
  return <div className="policy-prose text-sm text-gray-800" dangerouslySetInnerHTML={{ __html: safe }} />
}

export default memo(PolicyContent)
