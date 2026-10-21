// "3 of 5" as a bar. Green once everything is done, amber while something is outstanding.
export default function ProgressBar({ done, total, className = '' }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const complete = total > 0 && done >= total
  return (
    <div
      role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
      className={`h-2 rounded-full bg-gray-200 overflow-hidden ${className}`}
    >
      <div className={`h-full rounded-full transition-all ${complete ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
