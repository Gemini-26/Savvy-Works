import { useRef, useState } from 'react'
import { Check, Copy, MessageCircle, X } from 'lucide-react'
import { formatDateTime } from '../../../shared/utils/formatDate'
import { whatsappNumber } from '../utils/whatsappNumber'

// Shown right after an admin makes a signing link for a team member. The secret
// in the link is displayed only here — it is not stored anywhere readable — so
// the admin copies it or sends it from this window.
export default function SignLinkDialog({ person, link, onClose }) {
  const input = useRef(null)
  const [copied, setCopied] = useState(null)   // true | false (failed) | null

  const text = link ? `Hi ${person.full_name}, please read and sign “${link.documentTitle}” here: ${link.url}` : ''
  const number = whatsappNumber(person.phone || link?.memberPhone)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
    } catch {
      // Some browsers refuse clipboard access; the link is selected so it can be copied by hand.
      input.current?.select()
      setCopied(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900 break-words">Signing link for {person.full_name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {!link ? (
            <p className="text-sm text-gray-500">Making the link…</p>
          ) : (
            <>
              <p className="text-sm text-gray-700">
                Send this to {person.full_name}. It opens <span className="font-semibold">“{link.documentTitle}”</span> on their phone — no login needed — and they read it and sign with their finger.
              </p>

              <div className="flex gap-2">
                <input ref={input} readOnly value={link.url} onFocus={e => e.target.select()} aria-label="Signing link"
                  className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border border-gray-300 bg-gray-50 text-gray-700" />
                <button type="button" onClick={copy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white shrink-0">
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              {copied === false && <p className="text-xs text-amber-700">Your browser wouldn't copy it automatically. The link is selected — copy it by hand.</p>}

              {number ? (
                <a href={`https://wa.me/${number}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-green-300 text-green-800 bg-green-50 hover:bg-green-100">
                  <MessageCircle size={15} /> Open WhatsApp to send it
                </a>
              ) : (
                <p className="text-xs text-gray-500">
                  {person.phone ? `${person.full_name}'s number (${person.phone}) isn't one WhatsApp can open from here — copy the link and send it yourself.` : `${person.full_name} has no phone number saved, so copy the link and send it yourself.`}
                </p>
              )}

              <ul className="text-xs text-gray-500 space-y-1 list-disc pl-4">
                <li>It works only for {person.full_name} and only for this document, until {formatDateTime(link.expiresAt)} or until they have signed.</li>
                <li>Anyone who has the link can sign as {person.full_name}, so send it to them only.</li>
                <li>This is the only time the link is shown. Making another link cancels this one.</li>
              </ul>
            </>
          )}

          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600">Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}
