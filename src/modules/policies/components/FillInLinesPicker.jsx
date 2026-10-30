import { PenLine } from 'lucide-react'

// Which of a Word document's "______" lines the person signing should type into.
// Everything found is listed with a guess already made (lines the company fills
// in, like "Approved by", start unticked); the label is what the answer is saved
// as, so it can be reworded.
export default function FillInLinesPicker({ fields, onChange, disabled = false, note = null }) {
  if (!fields?.length) return null
  const chosen = fields.filter(f => f.include).length

  const patch = (n, changes) => onChange(fields.map(f => (f.n === n ? { ...f, ...changes } : f)))

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50/60">
      <div className="px-3 py-2 border-b border-gray-200 flex items-start gap-2">
        <PenLine size={14} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-900">
            Fill-in lines — {chosen} of {fields.length} for people to type into
          </p>
          <p className="text-[11px] text-gray-500">
            The lines found in this document. People type their answer (name, ID number, date…) on the ticked ones, then sign.
            Untick a line to leave it as printed.
          </p>
        </div>
      </div>
      {note && <p className="px-3 pt-2 text-[11px] text-amber-800">{note}</p>}
      <ul className="divide-y divide-gray-100">
        {fields.map(f => (
          <li key={f.n} className="px-3 py-1.5 flex items-center gap-2">
            <input
              type="checkbox" checked={f.include} disabled={disabled}
              onChange={e => patch(f.n, { include: e.target.checked })}
              aria-label={`People fill in: ${f.label}`} className="h-4 w-4 shrink-0"
            />
            <input
              value={f.label} disabled={disabled || !f.include} maxLength={120}
              onChange={e => patch(f.n, { label: e.target.value })}
              aria-label="Name of this line"
              className="w-40 sm:w-48 shrink-0 px-2 py-1 text-xs rounded border border-gray-300 bg-white disabled:bg-transparent disabled:border-transparent disabled:text-gray-400"
            />
            <span className="text-[11px] text-gray-400 truncate" title={f.context}>{f.context}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
