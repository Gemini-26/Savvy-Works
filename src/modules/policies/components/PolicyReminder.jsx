import { Link, useLocation } from 'react-router-dom'
import { PenLine, ChevronRight } from 'lucide-react'
import { usePolicyProgress } from '../hooks/usePolicyProgress'

// A slim bar that sits under the header until everything has been signed.
export default function PolicyReminder({ profile, className = '' }) {
  const { outstanding, total, first } = usePolicyProgress(profile)
  const { pathname } = useLocation()
  // No point nagging while they are already on the page that fixes it.
  if (!outstanding || pathname.startsWith('/profile/policies')) return null

  const to = outstanding === 1 && first ? `/profile/policies/${first.id}` : '/profile/policies'
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors ${className}`}
    >
      <PenLine size={18} className="shrink-0 text-amber-600" />
      <span className="flex-1 min-w-0 text-sm">
        <span className="font-bold">
          {outstanding === 1 ? '1 document needs' : `${outstanding} documents need`} your signature
        </span>
        <span className="text-amber-800"> · {total - outstanding} of {total} signed</span>
      </span>
      <span className="text-xs font-semibold shrink-0 flex items-center gap-0.5">Read &amp; sign <ChevronRight size={14} /></span>
    </Link>
  )
}
