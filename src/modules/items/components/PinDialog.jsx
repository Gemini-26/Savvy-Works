import { useState } from 'react'

export default function PinDialog({ title, onCancel, onConfirm, saving, error }) {
  const [pin, setPin] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-xs p-4 space-y-3 text-center">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          maxLength={4} placeholder="----"
          className="w-full text-center text-2xl tracking-[0.5em] font-mono px-3 py-2 rounded-lg border border-gray-200" />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600">Cancel</button>
          <button disabled={saving || pin.length !== 4} onClick={() => onConfirm(pin)}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
