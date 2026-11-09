import { useEffect } from 'react'
import { X } from 'lucide-react'

// Full-screen look at a profile picture. Closes on the X, a click outside the
// picture, or the Escape key. `title` is the person's name.
export default function PhotoViewer({ url, title, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!url) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ? `${title}'s photo` : 'Profile photo'}
      onClick={onClose}
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-3 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10"
      >
        <X size={22} />
      </button>
      <img
        src={url}
        alt={title ? `${title}'s photo` : 'Profile photo'}
        onClick={e => e.stopPropagation()}
        className="rounded-2xl shadow-2xl bg-gray-200 object-cover"
        style={{ width: 'min(90vw, 70vh, 420px)', aspectRatio: '1 / 1' }}
      />
      {title && <p className="text-sm font-semibold text-white">{title}</p>}
    </div>
  )
}
