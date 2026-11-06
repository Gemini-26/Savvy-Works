import { useMemo, useState } from 'react'
import { Download, Eye } from 'lucide-react'
import PdfStatus from './PdfStatus'
import { useSignedPdfs } from '../hooks/useSignedPdfs'
import { formatDateTime } from '../../../shared/utils/formatDate'

const entryOf = sig => ({ signatureId: sig.id, documentId: sig.document_id })
const today = () => new Date().toISOString().slice(0, 10)
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const btn = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 bg-white hover:border-blue-300 hover:text-blue-700 disabled:opacity-50'

// Admin: everyone's signed policies in one place. Open any as a PDF, download it,
// or download a whole person's — or everybody's — as one ZIP.
export default function SignedCopiesPanel({ data }) {
  const pdfs = useSignedPdfs()
  const [search, setSearch] = useState('')

  // One block per person, each with the documents they signed.
  const groups = useMemo(() => {
    const docs = new Map(data.docs.map(d => [d.id, d]))
    const people = new Map(data.people.map(p => [p.id, p]))
    const byPerson = new Map()
    for (const sig of data.signatures) {
      const key = sig.profile_id || `name:${sig.signer_name}`
      const person = sig.profile_id ? people.get(sig.profile_id) : null
      if (!byPerson.has(key)) {
        byPerson.set(key, { key, name: person?.full_name || sig.signer_name, role: person?.role || sig.signer_role || '', inactive: !person, items: [] })
      }
      byPerson.get(key).items.push({ sig, doc: docs.get(sig.document_id) })
    }
    const out = [...byPerson.values()]
    for (const g of out) {
      g.items.sort((a, b) => (a.sig.document_title || a.doc?.title || '').localeCompare(b.sig.document_title || b.doc?.title || '') || b.sig.document_version - a.sig.document_version)
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  const needle = search.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!needle) return groups
    return groups
      .map(g => (g.name.toLowerCase().includes(needle)
        ? g
        : { ...g, items: g.items.filter(i => (i.sig.document_title || i.doc?.title || '').toLowerCase().includes(needle)) }))
      .filter(g => g.items.length > 0)
  }, [groups, needle])

  const allItems = visible.flatMap(g => g.items)
  const working = !!pdfs.job

  function downloadEverything() {
    const onlyOne = visible.length === 1 ? visible[0].name : null
    pdfs.downloadZip(allItems.map(i => entryOf(i.sig)), {
      fileName: `Signed policies - ${onlyOne || (needle ? 'search results' : 'everyone')} - ${today()}.zip`,
    })
  }

  if (!data.signatures.length) {
    return <p className="text-sm text-gray-500">Nobody has signed anything yet. Signed copies appear here as soon as someone signs.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people or documents…"
          className="w-full max-w-sm px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        <button type="button" disabled={working || allItems.length === 0} onClick={downloadEverything}
          className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
          <Download size={15} /> {needle ? `Download these (${allItems.length})` : `Download all (${allItems.length})`}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {plural(allItems.length, 'signed copy', 'signed copies')} from {plural(visible.length, 'person', 'people')}.
        Each PDF holds the document, what the person typed on its blank lines, their signature, and the signature record. Downloading all gives one ZIP with a folder per person.
      </p>

      <PdfStatus pdfs={pdfs} />

      {visible.length === 0 && <p className="text-sm text-gray-500">Nothing matches “{search}”.</p>}

      {visible.map(group => (
        <section key={group.key} className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 break-words">{group.name}</p>
              <p className="text-xs text-gray-500">
                <span className="capitalize">{group.role || 'Staff'}</span>
                {group.inactive ? ' · no longer active' : ''} · {plural(group.items.length, 'document')} signed
              </p>
            </div>
            {group.items.length > 1 && (
              <button type="button" disabled={working}
                onClick={() => pdfs.downloadZip(group.items.map(i => entryOf(i.sig)), { fileName: `Signed policies - ${group.name} - ${today()}.zip` })}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 disabled:opacity-50">
                <Download size={13} /> Download all ({group.items.length})
              </button>
            )}
          </div>
          <ul className="divide-y divide-gray-100">
            {group.items.map(({ sig, doc }) => {
              const title = sig.document_title || doc?.title || 'Document'
              const older = doc && doc.status !== 'active'
              const busy = pdfs.busyId === sig.id
              return (
                <li key={sig.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 break-words">
                      {title} <span className="text-gray-400 font-normal">v{sig.document_version}</span>
                      {older && (
                        <span className="ml-2 text-[11px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full align-middle">
                          {doc.status === 'superseded' ? 'Replaced by a newer version' : 'Archived'}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">Signed {formatDateTime(sig.signed_at)}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button type="button" disabled={busy || working} onClick={() => pdfs.view(sig.id)} className={btn}>
                      <Eye size={13} /> {busy ? 'Preparing…' : 'View PDF'}
                    </button>
                    <button type="button" disabled={busy || working} onClick={() => pdfs.download(sig.id)} className={btn}>
                      <Download size={13} /> Download
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
