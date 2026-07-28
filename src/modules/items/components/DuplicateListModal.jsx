import { useState } from 'react'

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

export default function DuplicateListModal({ list, technicians, onClose, onConfirm, saving }) {
  const [name, setName] = useState(`${list.name} (copy)`)
  const [assignedTo, setAssignedTo] = useState('')

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">Duplicate "{list.name}"</h2>
        <p className="text-xs text-gray-500">Creates a fresh copy of every item, ready to hand to another technician.</p>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">New list name</label>
          <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Assign to technician</label>
          <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className={inputCls}>
            <option value="">— Unassigned —</option>
            {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600">Cancel</button>
          <button disabled={saving || !name.trim()} onClick={() => onConfirm({ name, assignedTo })}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Duplicating…' : 'Duplicate'}
          </button>
        </div>
      </div>
    </div>
  )
}
