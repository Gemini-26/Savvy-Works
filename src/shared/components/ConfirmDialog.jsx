export default function ConfirmDialog({ title = 'Are you sure?', message, confirmLabel = 'Confirm', busy, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 space-y-1">
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {message && <p className="text-sm text-gray-500">{message}</p>}
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 bg-indigo-600 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
