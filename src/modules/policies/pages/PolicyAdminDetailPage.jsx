import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bell, CheckCircle2, X } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import ConfirmDialog from '../../../shared/components/ConfirmDialog'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import ProgressBar from '../components/ProgressBar'
import PolicyContent from '../components/PolicyContent'
import PublishPolicyDialog from '../components/PublishPolicyDialog'
import {
  fetchPolicy, fetchPolicyOverviewData, fetchSignatureImage, remindPeople,
  setPolicyStatus, updatePolicyDetails, deletePolicy, POLICIES_CHANGED,
} from '../services/policyService'
import { buildOverview, AUDIENCE_LABELS } from '../policyStats'
import { formatDateTime } from '../../../shared/utils/formatDate'

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

const STATUS_CHIP = {
  active:     'bg-green-50 text-green-700',
  superseded: 'bg-gray-100 text-gray-600',
  archived:   'bg-gray-100 text-gray-600',
}
const STATUS_LABEL = { active: 'Active', superseded: 'Replaced by a newer version', archived: 'Archived' }

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[92vh] flex flex-col`}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function EditDetails({ doc, onClose, onSaved }) {
  const [title, setTitle] = useState(doc.title)
  const [description, setDescription] = useState(doc.description || '')
  const [audience, setAudience] = useState(doc.audience)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await updatePolicyDetails(doc.id, { title, description, audience })
      onSaved()
    } catch (err) {
      setError(err.message || 'Could not save')
      setBusy(false)
    }
  }

  return (
    <Modal title="Edit details" onClose={onClose}>
      <div className="space-y-3">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
        <p className="text-xs text-gray-500">The wording of a published document can't be changed — upload a new version for that.</p>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Short description</label>
          <input value={description} onChange={e => setDescription(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Who has to sign it</label>
          <select value={audience} onChange={e => setAudience(e.target.value)} className={inputCls}>
            {Object.entries(AUDIENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600">Cancel</button>
          <button type="button" disabled={busy || !title.trim()} onClick={save} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SignatureModal({ signatureId, onClose }) {
  const [sig, setSig] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchSignatureImage(signatureId)
      .then(s => { if (!cancelled) setSig(s) })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load the signature') })
    return () => { cancelled = true }
  }, [signatureId])

  return (
    <Modal title="Signature record" onClose={onClose}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!sig && !error && <p className="text-sm text-gray-400">Loading…</p>}
      {sig && (
        <div className="space-y-3">
          <img src={sig.signature_image} alt={`Signature of ${sig.signer_name}`} className="w-full max-h-48 object-contain bg-white border border-gray-200 rounded-lg p-2" />
          <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-gray-500">Signed by</dt><dd className="font-semibold text-gray-900">{sig.signer_name}</dd>
            <dt className="text-gray-500">Date &amp; time</dt><dd className="text-gray-900">{formatDateTime(sig.signed_at)}</dd>
            <dt className="text-gray-500">Document</dt><dd className="text-gray-900">{sig.document_title} (version {sig.document_version})</dd>
            <dt className="text-gray-500">Agreed to</dt><dd className="text-gray-900">“{sig.statement}”</dd>
            {sig.ip_address && <><dt className="text-gray-500">IP address</dt><dd className="text-gray-900">{sig.ip_address}</dd></>}
            <dt className="text-gray-500">Fingerprint</dt><dd className="text-[11px] text-gray-600 break-all">{sig.content_hash}</dd>
          </dl>
          <p className="text-[11px] text-gray-400">The fingerprint identifies the exact wording that was signed; it changes if a single character does.</p>
        </div>
      )}
    </Modal>
  )
}

export default function PolicyAdminDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, loading: userLoading, isAdmin } = useCurrentUser()
  const [doc, setDoc] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState(null)   // 'preview' | 'edit' | 'version' | 'archive' | 'delete' | { signatureId }

  const load = useCallback(() => {
    Promise.all([fetchPolicy(id), fetchPolicyOverviewData()])
      .then(([d, o]) => { setDoc(d); setData(o); setError(null) })
      .catch(err => setError(err.message || 'Could not load this document'))
  }, [id])

  useEffect(() => {
    if (!isAdmin) return
    load()
    window.addEventListener(POLICIES_CHANGED, load)
    return () => window.removeEventListener(POLICIES_CHANGED, load)
  }, [isAdmin, load])

  const overview = useMemo(() => (data ? buildOverview(data) : null), [data])
  const row = useMemo(() => overview?.byDoc.find(d => d.doc.id === id) ?? null, [overview, id])
  // The versions that came before / after this one.
  const history = useMemo(() => {
    if (!data || !doc) return []
    const byId = new Map(data.docs.map(d => [d.id, d]))
    let top = doc
    while (top.replaces_id && byId.has(top.replaces_id)) top = byId.get(top.replaces_id)
    const chain = [top]
    for (;;) {
      const nextDoc = data.docs.find(d => d.replaces_id === chain[chain.length - 1].id)
      if (!nextDoc) break
      chain.push(nextDoc)
    }
    return chain
  }, [data, doc])

  async function run(fn) {
    setBusy(true)
    setError(null)
    try { await fn() } catch (err) { setError(err.message || 'Something went wrong') } finally { setBusy(false) }
  }

  if (userLoading) return <PageContainer><p className="text-sm text-gray-400">Loading…</p></PageContainer>
  if (!profile || !isAdmin) return <PageContainer><p className="text-sm text-gray-600">Only admins can manage policies and signatures.</p></PageContainer>

  const back = (
    <Link to="/files/policies" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600">
      <ArrowLeft size={14} /> Policies &amp; Signatures
    </Link>
  )
  if (error && !doc) return <PageContainer>{back}<p className="text-sm text-red-600">{error}</p></PageContainer>
  if (!doc || !row) return <PageContainer>{back}<p className="text-sm text-gray-400">Loading…</p></PageContainer>

  const unsigned = row.rows.filter(r => !r.signature)
  const signed = row.rows.filter(r => r.signature)
  const isActive = doc.status === 'active'

  return (
    <PageContainer>
      <div className="space-y-2">
        {back}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 break-words">{doc.title}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Version {doc.version} · {AUDIENCE_LABELS[doc.audience]} · published {formatDateTime(doc.created_at)}
              {doc.source_file_name ? ` · from ${doc.source_file_name}` : ''}
            </p>
            {doc.description && <p className="text-sm text-gray-600 mt-1">{doc.description}</p>}
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CHIP[doc.status]}`}>{STATUS_LABEL[doc.status]}</span>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      {notice && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-lg flex items-start justify-between gap-3">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-green-700 shrink-0" aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setDialog('preview')} className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 bg-white">Read the document</button>
        <button type="button" onClick={() => setDialog('edit')} className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 bg-white">Edit details</button>
        {doc.status !== 'superseded' && (
          <button type="button" onClick={() => setDialog('version')} className="px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white">Upload a new version</button>
        )}
        {isActive && (
          <button type="button" onClick={() => setDialog('archive')} className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 bg-white">Archive</button>
        )}
        {doc.status === 'archived' && (
          <button type="button" disabled={busy} onClick={() => run(() => setPolicyStatus(doc.id, 'active'))} className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 bg-white">Make active again</button>
        )}
        {signed.length === 0 && (
          <button type="button" onClick={() => setDialog('delete')} className="px-3 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 bg-white">Delete</button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-2xl font-bold text-gray-900">
            {row.signed} <span className="text-base font-medium text-gray-500">of {row.total} signed</span>
          </p>
          {unsigned.length > 0 ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-red-600">{unsigned.length} not signed</span>
              {isActive && (
                <button type="button" disabled={busy} onClick={() => run(async () => {
                  const sent = await remindPeople(unsigned.map(r => r.person), data.docs, data.signatures)
                  setNotice(`Reminder sent to ${sent} ${sent === 1 ? 'person' : 'people'}.`)
                })} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 disabled:opacity-50">
                  <Bell size={13} /> Remind them
                </button>
              )}
            </div>
          ) : row.total > 0 ? (
            <span className="flex items-center gap-1 text-sm font-semibold text-green-600"><CheckCircle2 size={16} /> Everyone has signed</span>
          ) : null}
        </div>
        <ProgressBar done={row.signed} total={row.total} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border border-gray-200">
          <h2 className="px-4 py-3 text-sm font-bold text-red-700 border-b border-gray-100">Not signed ({unsigned.length})</h2>
          {unsigned.length === 0 ? <p className="p-4 text-sm text-gray-500">No one.</p> : (
            <ul className="divide-y divide-gray-100">
              {unsigned.map(({ person }) => (
                <li key={person.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-900">{person.full_name}</span>
                  <span className="text-xs text-gray-500 capitalize">{person.role}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200">
          <h2 className="px-4 py-3 text-sm font-bold text-green-700 border-b border-gray-100">Signed ({signed.length})</h2>
          {signed.length === 0 ? <p className="p-4 text-sm text-gray-500">No one yet.</p> : (
            <ul className="divide-y divide-gray-100">
              {signed.map(({ person, signature }) => (
                <li key={person.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{person.full_name}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(signature.signed_at)}</p>
                  </div>
                  <button type="button" onClick={() => setDialog({ signatureId: signature.id })} className="text-xs font-semibold text-blue-600 shrink-0">View signature</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {history.length > 1 && (
        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-2">Version history</h2>
          <ul className="divide-y divide-gray-100">
            {history.map(h => {
              const hrow = overview.byDoc.find(d => d.doc.id === h.id)
              return (
                <li key={h.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  {h.id === doc.id
                    ? <span className="font-semibold text-gray-900">Version {h.version} (this one)</span>
                    : <Link to={`/files/policies/${h.id}`} className="font-medium text-blue-600 hover:underline">Version {h.version}</Link>}
                  <span className="text-xs text-gray-500">{formatDateTime(h.created_at)} · {hrow?.signed ?? 0} signed · {STATUS_LABEL[h.status]}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {dialog === 'preview' && (
        <Modal title={doc.title} wide onClose={() => setDialog(null)}>
          <PolicyContent html={doc.content_html} />
        </Modal>
      )}
      {dialog === 'edit' && <EditDetails doc={doc} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load() }} />}
      {dialog === 'version' && (
        <PublishPolicyDialog replacing={doc} onClose={() => setDialog(null)}
          onPublished={newId => { setDialog(null); navigate(`/files/policies/${newId}`) }} />
      )}
      {dialog === 'archive' && (
        <ConfirmDialog title="Archive this document?" confirmLabel="Archive" busy={busy}
          message="Nobody will be asked to sign it any more. Signatures already given are kept, and you can make it active again later."
          onCancel={() => setDialog(null)}
          onConfirm={() => run(async () => { await setPolicyStatus(doc.id, 'archived'); setDialog(null) })} />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog title="Delete this document?" confirmLabel="Delete" busy={busy}
          message="No one has signed it yet, so it can be removed. This can't be undone."
          onCancel={() => setDialog(null)}
          onConfirm={() => run(async () => { await deletePolicy(doc.id); navigate('/files/policies') })} />
      )}
      {dialog?.signatureId && <SignatureModal signatureId={dialog.signatureId} onClose={() => setDialog(null)} />}
    </PageContainer>
  )
}
