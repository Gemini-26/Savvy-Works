import { Link } from 'react-router-dom'
import { PenLine, ChevronRight } from 'lucide-react'
import { usePolicyProgress } from '../hooks/usePolicyProgress'
import ProgressBar from './ProgressBar'

// The "Policies & Procedures" entry on a person's profile / documents page,
// with their count. Always shown, so there is always somewhere to go.
export default function PolicyCard({ profile, className = '' }) {
  const { loading, error, signed, total, outstanding } = usePolicyProgress(profile)

  let line = 'Loading…'
  if (error) line = 'Could not load — tap to try again'
  else if (!loading && total === 0) line = 'Nothing to sign right now'
  else if (!loading) line = `${signed} of ${total} signed${outstanding ? ` · ${outstanding} still to sign` : ' · all done'}`

  return (
    <Link to="/profile/policies" className={`bg-white rounded-xl border border-gray-200 flex items-center gap-3 hover:border-blue-300 transition-colors ${className}`}>
      <PenLine size={20} className={`shrink-0 ${outstanding ? 'text-amber-500' : 'text-green-500'}`} />
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm font-bold text-gray-900">Policies &amp; Procedures</p>
        <p className={`text-xs ${error ? 'text-red-600' : outstanding ? 'text-amber-600 font-medium' : 'text-gray-500'}`}>{line}</p>
        {total > 0 && <ProgressBar done={signed} total={total} />}
      </div>
      <ChevronRight size={16} className="text-gray-400 shrink-0" />
    </Link>
  )
}
