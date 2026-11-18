import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, FileX2 } from 'lucide-react'
import PolicySigner from '../components/PolicySigner'
import { fetchPolicyByLink, signByLink } from '../services/policyService'
import { formatDate, formatDateTime } from '../../../shared/utils/formatDate'

// What a team member sees when they open the signing link they were sent. No
// login: the secret in the link is the whole key, and it opens one document for
// one person. Lives outside the app's menus on purpose.
export default function PolicyLinkSignPage() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)       // { state: 'open' | 'signed', ... }
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchPolicyByLink(token)
      .then(r => { if (!cancelled) setInfo(r) })
      .catch(err => { if (!cancelled) setError(plainMessage(err)) })
    return () => { cancelled = true }
  }, [token, attempt])

  async function handleSign(drawn, typed) {
    try {
      await signByLink(token, drawn, typed)
    } catch (err) {
      const { message, retry } = plainMessage(err)
      throw new Error(retry ? 'Could not save your signature. Check your internet connection and try again.' : message, { cause: err })
    }
    setDone(true)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <p className="font-black text-gray-900 text-base uppercase tracking-tight">Savvy Civils</p>
          <p className="text-xs text-gray-500">Document to read and sign</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {!info && !error && <p className="text-sm text-gray-400">Loading…</p>}

        {error && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center space-y-3">
            <FileX2 size={32} className="mx-auto text-gray-300" />
            <p className="text-sm font-semibold text-gray-900">{error.message}</p>
            {error.retry && (
              <button type="button" onClick={() => { setError(null); setInfo(null); setAttempt(n => n + 1) }} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                Try again
              </button>
            )}
          </div>
        )}

        {info?.state === 'signed' && !done && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-1">
            <p className="flex items-center gap-2 text-sm font-bold text-green-800"><CheckCircle2 size={18} /> Already signed</p>
            <p className="text-sm text-green-800">
              {info.signer_name} signed “{info.document_title}” on {formatDateTime(info.signed_at)}. There is nothing more to do.
            </p>
          </div>
        )}

        {done && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-1">
            <p className="flex items-center gap-2 text-sm font-bold text-green-800"><CheckCircle2 size={18} /> Thank you, {info.signer_name}</p>
            <p className="text-sm text-green-800">Your signature has been saved. You can close this page.</p>
          </div>
        )}

        {info?.state === 'open' && !done && (
          <>
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-gray-900 break-words">{info.document.title}</h1>
              <p className="text-xs text-gray-500">Version {info.document.version} · published {formatDate(info.document.created_at)}</p>
              {info.document.description && <p className="text-sm text-gray-600">{info.document.description}</p>}
              <p className="text-sm text-gray-700 pt-1">
                Hello <span className="font-semibold">{info.signer_name}</span> — please read this document to the end, then sign at the bottom.
                This link is only for you.
              </p>
            </div>
            <PolicySigner doc={info.document} canSign signerName={info.signer_name} onSign={handleSign} recordNote="Signed through a link sent to you." />
          </>
        )}
      </main>
    </div>
  )
}

// The database words its refusals for the person (expired, not valid, already
// signed…). Anything else is a network or server problem, which is not the
// person's fault and is worth trying again.
function plainMessage(err) {
  const text = err?.message || ''
  if (/^(This|You|Tick|Draw|Your)\b/.test(text)) return { message: text, retry: false }
  return { message: 'Could not open this page. Check your internet connection and try again.', retry: true }
}
