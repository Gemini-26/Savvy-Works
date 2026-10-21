import { useRef, useState } from 'react'
import { FileUp, X, AlertTriangle } from 'lucide-react'
import PolicyContent from './PolicyContent'
import { docxToHtml, publishPolicy } from '../services/policyService'
import { AUDIENCE_LABELS } from '../policyStats'

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

// "Health_and-Safety policy.docx" -> "Health and Safety policy"
const titleFromFile = name => name.replace(/\.docx$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

// Pick a Word file, check how it will look to staff, publish it.
// With `replacing` set it publishes the next version of that document instead,
// which everyone has to sign again.
export default function PublishPolicyDialog({ replacing = null, onClose, onPublished }) {
  const fileInput = useRef(null)
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)   // { html, warnings }
  const [title, setTitle] = useState(replacing?.title || '')
  const [description, setDescription] = useState(replacing?.description || '')
  const [audience, setAudience] = useState(replacing?.audience || 'all')
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleFile(e) {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    setError(null)
    setParsed(null)
    setFile(picked)
    setReading(true)
    try {
      setParsed(await docxToHtml(picked))
      if (!title.trim()) setTitle(titleFromFile(picked.name))
    } catch (err) {
      setFile(null)
      setError(err.message || 'Could not read that file.')
    } finally {
      setReading(false)
    }
  }

  async function handlePublish() {
    setBusy(true)
    setError(null)
    try {
      const id = await publishPolicy({
        title, description, audience, html: parsed.html, fileName: file.name, replaces: replacing?.id ?? null,
      })
      onPublished(id)
    } catch (err) {
      setError(err.message || 'Could not publish the document.')
      setBusy(false)
    }
  }

  const nextVersion = replacing ? replacing.version + 1 : 1

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900">
            {replacing ? `New version of “${replacing.title}”` : 'Add a document for people to sign'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

          {replacing && (
            <div className="flex gap-2 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>This becomes version {nextVersion}. Version {replacing.version} is retired and <b>everyone has to read and sign again</b>. Signatures already given on version {replacing.version} are kept.</span>
            </div>
          )}

          <div>
            <input ref={fileInput} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFile} className="hidden" />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={reading || busy}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg py-5 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50">
              <FileUp size={18} />
              {reading ? 'Reading the document…' : file ? `${file.name} — choose a different file` : 'Choose a Word document (.docx)'}
            </button>
          </div>

          {parsed && (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Short description (optional)</label>
                  <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this document is for" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Who has to sign it</label>
                  <select value={audience} onChange={e => setAudience(e.target.value)} className={inputCls}>
                    {Object.entries(AUDIENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>

              {parsed.warnings.length > 0 && (
                <details className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <summary className="cursor-pointer font-semibold">Word had {parsed.warnings.length} thing{parsed.warnings.length === 1 ? '' : 's'} that could not be carried over — check the preview</summary>
                  <ul className="list-disc pl-5 mt-1 space-y-0.5">{parsed.warnings.map(w => <li key={w}>{w}</li>)}</ul>
                </details>
              )}

              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">This is exactly what people will read — check it before publishing</p>
                <div className="border border-gray-200 rounded-lg p-4 max-h-80 overflow-y-auto bg-white">
                  <PolicyContent html={parsed.html} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600">Cancel</button>
          <button type="button" disabled={!parsed || !title.trim() || busy} onClick={handlePublish}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50">
            {busy ? 'Publishing…' : replacing ? `Publish version ${nextVersion}` : 'Publish & ask people to sign'}
          </button>
        </div>
      </div>
    </div>
  )
}
