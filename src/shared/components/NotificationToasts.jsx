import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Bell, X } from 'lucide-react'

const AUTO_DISMISS_MS = 9000

function Toast({ toast, onOpen, onDismiss }) {
  // The turn-on prompt waits for an answer; a notification fades away on its own.
  useEffect(() => {
    if (toast.kind === 'prompt') return
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast.id, toast.kind, onDismiss])

  return (
    <div
      role="status"
      className="pointer-events-auto flex items-start gap-3 bg-white border border-gray-200 border-l-4 border-l-red-600 rounded-lg shadow-xl px-3 py-2.5"
    >
      <div className="mt-0.5 w-7 h-7 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
        <Bell size={14} />
      </div>
      <div className="flex-1 min-w-0">
        {toast.kind === 'prompt' ? (
          <>
            <p className="text-sm font-semibold text-gray-900">Get alerts when something comes in?</p>
            <p className="text-xs text-gray-500 mt-0.5">A sound and a pop-up in your notification bar, even when this app is closed.</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => toast.onAccept()}
                className="px-3 py-1 rounded-md bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
              >
                Turn on
              </button>
              <button
                onClick={() => onDismiss(toast.id)}
                className="px-3 py-1 rounded-md text-gray-600 text-xs font-medium hover:bg-gray-100"
              >
                Not now
              </button>
            </div>
          </>
        ) : (
          <button onClick={() => onOpen(toast)} className="block w-full text-left">
            <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
            {toast.body && <p className="text-xs text-gray-600 mt-0.5 line-clamp-3">{toast.body}</p>}
          </button>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-1 -mr-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 shrink-0"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}

// Portalled to <body>: the headers these live in are sticky/positioned, and a
// fixed child can be trapped inside one of those instead of the screen.
export default function NotificationToasts({ toasts, onOpen, onDismiss }) {
  if (toasts.length === 0) return null
  return createPortal(
    <div className="fixed z-[100] top-3 left-3 right-3 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  )
}
