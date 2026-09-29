// "Assigned To" table cell. `names` is a list of staff names; `emptyLabel`
// shows in amber when nobody is assigned (pass null for a plain dash, e.g.
// when the record has no linked job to take technicians from).
export default function AssigneesCell({ names = [], emptyLabel = 'Unassigned' }) {
  return (
    <td className="px-5 py-3">
      {names.length
        ? <span className="text-gray-700">{names.join(', ')}</span>
        : emptyLabel
          ? <span className="text-xs font-medium text-amber-600">{emptyLabel}</span>
          : <span className="text-gray-300">—</span>}
    </td>
  )
}
