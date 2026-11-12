import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Bell, Clock, X } from 'lucide-react'

const AUTO_DISMISS_MS = 9000
// A "couldn't set that up" notice carries instructions, so it stays longer.
const NOTICE_DISMISS_MS = 20000

function Toast({ toast, onOpen, onDismiss }) {
  // The turn-on prompt and an urgent alert wait for an answer; a notification
  // fades away on its own.
  useEffect(() => {
    if (toast.kind === 'prompt' || toast.kind === 'alarm') return
    const timer = setTimeout(() => onDismiss(toast.id), toast.kind === 'notice' ? NOTICE_DISMISS_MS : AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast.id, toast.kind, onDismiss])

  // Urgent (e.g. "You have been clocked out"): big, red, and it stays put until
  // the person taps OK — which also stops the siren.
  if (toast.kind === 'alarm') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="pointer-events-auto flex items-start gap-3 bg-red-600 text-white rounded-xl shadow-2xl ring-4 ring-red-300 px-4 py-3.5"
      >
        <div className="mt-0.5 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0 animate-pulse">
          <Clock size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold leading-tight">{toast.title}</p>
          {toast.body && <p className="text-sm text-red-50 mt-1">{toast.body}</p>}
          <button
            onClick={() => onDismiss(toast.id)}
            className="mt-2.5 px-4 py-1.5 rounded-md bg-white text-red-700 text-sm font-bold hover:bg-red-50"
          >
            OK
          </button>
        </div>
      </div>
    )
  }

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
        ) : toast.kind === 'notice' ? (
          <>
            <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
            <p className="text-xs text-gray-600 mt-0.5">{toast.body}</p>
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
