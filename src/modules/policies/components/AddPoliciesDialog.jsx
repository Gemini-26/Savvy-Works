import { useRef, useState } from 'react'
import { FileUp, X, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, FileText } from 'lucide-react'
import PolicyContent from './PolicyContent'
import FillInLinesPicker from './FillInLinesPicker'
import { docxToHtml, publishPolicies, titleFromFileName } from '../services/policyService'
import { detectBlanks, persistableFields } from '../policyBlanks'
import { AUDIENCE_LABELS } from '../policyStats'

const MAX_FILES = 25
const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-500'

let rowCounter = 0

// Add several policies / procedures at once. Pick (or drop) as many Word files as
// you like; each is read and gets its own title, audience and preview, then they
// are all published together. Every person gets ONE notification for the lot.
// (A new *version* of an existing document is a different job — see
// PublishPolicyDialog, which replaces exactly one.)
export default function AddPoliciesDialog({ existingTitles = [], onClose, onPublished }) {
  const fileInput = useRef(null)
  const publishedIds = useRef([])
  const [rows, setRows] = useState([])
  const [defaultAudience, setDefaultAudience] = useState('all')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)   // { type: 'error' | 'info', text }
  const [dragging, setDragging] = useState(false)

  const patch = (key, changes) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...changes } : r)))

  async function addFiles(list) {
    const incoming = [...list]
    if (!incoming.length || busy) return
    setNotice(null)

    // The same file picked twice (same name and size) is only added once.
    const seen = new Set(rows.map(r => `${r.file.name}|${r.file.size}`))
    const fresh = []
    let repeats = 0
    for (const file of incoming) {
      const sig = `${file.name}|${file.size}`
      if (seen.has(sig)) { repeats += 1; continue }
      seen.add(sig)
      fresh.push(file)
    }
    const take = fresh.slice(0, Math.max(0, MAX_FILES - rows.length))
    const over = fresh.length - take.length

    const notes = []
    if (repeats) notes.push(`${repeats} file${repeats === 1 ? ' was' : 's were'} already in the list and skipped.`)
    if (over) notes.push(`Only ${MAX_FILES} documents can be added at a time — ${over} left out.`)
    if (notes.length) setNotice({ type: 'info', text: notes.join(' ') })
    if (!take.length) return

    const added = take.map(file => ({
      key: ++rowCounter,
      file,
      status: 'reading',   // reading | ready | unreadable | publishing | published | failed
      html: '',
      warnings: [],
      fields: [],      // the document's "______" lines, and which of them people fill in
      title: titleFromFileName(file.name),
      description: '',
      audience: defaultAudience,
      error: null,
      open: false,
    }))
    setRows(rs => [...rs, ...added])

    // Read them two at a time so a big batch doesn't freeze the page.
    const queue = [...added]
    async function worker() {
      while (queue.length) {
        const row = queue.shift()
        try {
          const { html, warnings } = await docxToHtml(row.file)
          patch(row.key, { status: 'ready', html, warnings, fields: detectBlanks(html) })
        } catch (err) {
          patch(row.key, { status: 'unreadable', error: err.message || 'Could not read that file.' })
        }
      }
    }
    await Promise.all([worker(), worker()])
  }

  function setAllAudiences(value) {
    setDefaultAudience(value)
    setRows(rs => rs.map(r => (r.status === 'published' ? r : { ...r, audience: value })))
  }

  const sendable = rows.filter(r => r.status === 'ready' || r.status === 'failed')
  const stillReading = rows.some(r => r.status === 'reading')
  const unreadable = rows.filter(r => r.status === 'unreadable').length
  const published = rows.filter(r => r.status === 'published').length

  const lowered = sendable.map(r => r.title.trim().toLowerCase())
  const sameTitleInBatch = new Set(lowered.filter((t, i) => t && lowered.indexOf(t) !== i))
  const alreadyPublished = new Set(existingTitles.map(t => t.trim().toLowerCase()))
  const missingTitle = sendable.some(r => !r.title.trim())
  const canPublish = sendable.length > 0 && !stillReading && !busy && !missingTitle && sameTitleInBatch.size === 0

  async function handlePublish() {
    const items = sendable.map(r => ({
      key: r.key, title: r.title.trim(), description: r.description.trim(), audience: r.audience, html: r.html, fileName: r.file.name,
      fillFields: persistableFields(r.fields),
    }))
    setBusy(true)
    setNotice(null)
    setRows(rs => rs.map(r => (items.some(i => i.key === r.key) ? { ...r, status: 'publishing', error: null } : r)))

    const done = await publishPolicies(items, (key, result) => {
      if (result.id) {
        publishedIds.current.push(result.id)
        patch(key, { status: 'published' })
      } else {
        patch(key, { status: 'failed', error: result.error })
      }
    })
    setBusy(false)

    const failed = items.length - done.length
    if (failed === 0) {
      onPublished([...publishedIds.current])
    } else {
      setNotice({
        type: 'error',
        text: `${done.length} published, ${failed} didn't go through. Fix the ones marked in red and publish again — documents already published won't be sent twice.`,
      })
    }
  }

  const noun = n => `${n} document${n === 1 ? '' : 's'}`

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900">Add documents for people to sign</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="text-gray-400 hover:text-gray-600 disabled:opacity-40"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {notice && (
            <div className={`text-sm px-3 py-2 rounded-lg border ${notice.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
              {notice.text}
            </div>
          )}

          <div>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={e => { const list = e.target.files; addFiles(list); e.target.value = '' }}
              className="hidden"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
              className={`w-full flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                rows.length ? 'py-3' : 'py-8'
              } ${dragging ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600'}`}
            >
              <span className="flex items-center gap-2"><FileUp size={18} /> {rows.length ? 'Add more Word documents' : 'Choose Word documents (.docx)'}</span>
              {!rows.length && <span className="text-xs font-normal text-gray-400">Select as many as you like at once, or drop them here</span>}
            </button>
          </div>

          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor="all-audience" className="text-xs font-medium text-gray-500">Who has to sign — apply to all:</label>
              <select id="all-audience" value={defaultAudience} onChange={e => setAllAudiences(e.target.value)} disabled={busy}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                {Object.entries(AUDIENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <span className="text-xs text-gray-400">You can still change it for any one document below.</span>
            </div>
          )}

          <div className="space-y-3">
            {rows.map(row => {
              const locked = busy || row.status === 'publishing'
              const title = row.title.trim().toLowerCase()
              return (
                <div key={row.key} className={`border rounded-lg p-3 ${row.status === 'failed' || row.status === 'unreadable' ? 'border-red-200 bg-red-50/40' : row.status === 'published' ? 'border-green-200 bg-green-50/40' : 'border-gray-200'}`}>
                  <div className="flex items-start gap-2">
                    <FileText size={16} className="text-gray-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-gray-500 min-w-0 flex-1 break-words">{row.file.name}</p>
                    {row.status === 'reading' && <span className="flex items-center gap-1 text-xs text-gray-500 shrink-0"><Loader2 size={12} className="animate-spin" /> Reading…</span>}
                    {row.status === 'publishing' && <span className="flex items-center gap-1 text-xs text-blue-600 shrink-0"><Loader2 size={12} className="animate-spin" /> Publishing…</span>}
                    {row.status === 'published' && <span className="flex items-center gap-1 text-xs font-semibold text-green-700 shrink-0"><CheckCircle2 size={13} /> Published</span>}
                    {row.status !== 'published' && (
                      <button type="button" disabled={locked} onClick={() => setRows(rs => rs.filter(r => r.key !== row.key))}
                        aria-label={`Remove ${row.file.name}`} className="text-gray-400 hover:text-red-600 disabled:opacity-30 shrink-0"><X size={15} /></button>
                    )}
                  </div>

                  {row.status === 'unreadable' && <p className="text-xs text-red-700 mt-2">{row.error} This file will be skipped.</p>}

                  {row.status === 'published' && <p className="text-sm font-semibold text-gray-900 mt-1 break-words">{row.title}</p>}

                  {(row.status === 'ready' || row.status === 'failed' || row.status === 'publishing') && (
                    <div className="mt-2 space-y-2">
                      <div className="grid sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-gray-500 mb-0.5">Title</label>
                          <input value={row.title} disabled={locked} onChange={e => patch(row.key, { title: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-500 mb-0.5">Who has to sign it</label>
                          <select value={row.audience} disabled={locked} onChange={e => patch(row.key, { audience: e.target.value })} className={inputCls}>
                            {Object.entries(AUDIENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-medium text-gray-500 mb-0.5">Short description (optional)</label>
                          <input value={row.description} disabled={locked} onChange={e => patch(row.key, { description: e.target.value })} placeholder="What this document is for" className={inputCls} />
                        </div>
                      </div>

                      {!title && <p className="text-xs text-red-600">Give this document a title.</p>}
                      {title && sameTitleInBatch.has(title) && <p className="text-xs text-red-600">Another document in this list has the same title — give each its own.</p>}
                      {title && !sameTitleInBatch.has(title) && alreadyPublished.has(title) && (
                        <p className="flex gap-1.5 text-xs text-amber-800"><AlertTriangle size={12} className="shrink-0 mt-0.5" />
                          A document called “{row.title.trim()}” is already published. This adds a separate one. To replace it, open that document and use “New version”.</p>
                      )}
                      {row.status === 'failed' && <p className="text-xs text-red-700">{row.error}</p>}

                      {row.warnings.length > 0 && (
                        <details className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <summary className="cursor-pointer font-semibold">Word had {row.warnings.length} thing{row.warnings.length === 1 ? '' : 's'} that could not be carried over — check the preview</summary>
                          <ul className="list-disc pl-5 mt-1 space-y-0.5">{row.warnings.map(w => <li key={w}>{w}</li>)}</ul>
                        </details>
                      )}

                      <FillInLinesPicker fields={row.fields} disabled={locked} onChange={fields => patch(row.key, { fields })} />

                      <button type="button" onClick={() => patch(row.key, { open: !row.open })}
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
                        {row.open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {row.open ? 'Hide preview' : 'Preview exactly what people will read'}
                      </button>
                      {row.open && (
                        <div className="border border-gray-200 rounded-lg p-4 max-h-72 overflow-y-auto bg-white">
                          <PolicyContent html={row.html} fields={row.fields.filter(f => f.include)} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap items-center gap-2 justify-between">
          <p className="text-xs text-gray-500">
            {rows.length === 0 && 'No documents chosen yet.'}
            {rows.length > 0 && stillReading && 'Reading your documents…'}
            {rows.length > 0 && !stillReading && (
              <>
                {noun(sendable.length)} ready
                {published > 0 && ` · ${published} published`}
                {unreadable > 0 && ` · ${unreadable} couldn't be read and will be skipped`}
              </>
            )}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 disabled:opacity-50">
              {published > 0 ? 'Close' : 'Cancel'}
            </button>
            <button type="button" disabled={!canPublish} onClick={handlePublish}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50">
              {busy ? 'Publishing…' : sendable.length > 1 ? `Publish ${sendable.length} documents & ask people to sign` : 'Publish & ask people to sign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
