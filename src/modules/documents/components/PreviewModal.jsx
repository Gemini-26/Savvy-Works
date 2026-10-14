import { useEffect, useState } from 'react'
import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { FileGlyph } from './ItemIcon'
import { fileKind } from './fileKinds'
import { downloadBlob, formatBytes } from '../services/documentsService'

// Full-screen viewer for photos, videos, audio and PDFs, with previous/next
// through the files in the folder being looked at. Anything it can't draw
// (Word, Excel, zip …) gets a Download button instead.
// Browsers without a built-in PDF viewer (the Android app's WebView, for one)
// would show an empty box, so there the PDF gets a Download button instead.
const CAN_SHOW_PDF = typeof navigator === 'undefined' || navigator.pdfViewerEnabled !== false

export default function PreviewModal({ files, index, resolveUrl, onDownload, onIndex, onClose }) {
  const file = files[index]
  const kind = fileKind(file)
  const inline = kind === 'image' || kind === 'video' || kind === 'audio' || (kind === 'pdf' && CAN_SHOW_PDF)
  const [media, setMedia] = useState({ id: null, url: null, error: false })

  // Keyed on the file's id/path (not the row object) so a background refresh of
  // the folder doesn't reload the file being looked at.
  const fileId = file.id
  const storagePath = file.storage_path
  useEffect(() => {
    let cancelled = false
    let objectUrl = null
    const target = { storage_path: storagePath }
    ;(async () => {
      try {
        let url = null
        if (!inline) {
          url = null
        } else if (kind === 'pdf') {
          const blob = await downloadBlob(target)
          objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
          url = objectUrl
        } else if (kind === 'image' || kind === 'video' || kind === 'audio') {
          url = await resolveUrl(target)
        }
        if (!cancelled) setMedia({ id: fileId, url, error: false })
      } catch {
        if (!cancelled) setMedia({ id: fileId, url: null, error: true })
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileId, storagePath, kind, inline, resolveUrl])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      else if (e.key === 'ArrowRight' && index < files.length - 1) onIndex(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, files.length, onIndex, onClose])

  const ready = media.id === file.id
  const url = ready ? media.url : null
  const failed = ready && media.error
  const needsMedia = inline

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 text-white" onClick={e => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{file.file_name}</p>
          <p className="text-xs text-white/60">{index + 1} of {files.length} · {formatBytes(file.file_size)}</p>
        </div>
        <button type="button" onClick={() => onDownload(file)} className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded text-xs font-semibold">
          <Download size={14} /> Download
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded hover:bg-white/15">
          <X size={20} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-4 pb-4" onClick={e => e.stopPropagation()}>
        {index > 0 && (
          <button type="button" aria-label="Previous" onClick={() => onIndex(index - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70">
            <ChevronLeft size={22} />
          </button>
        )}
        {index < files.length - 1 && (
          <button type="button" aria-label="Next" onClick={() => onIndex(index + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70">
            <ChevronRight size={22} />
          </button>
        )}

        {url && kind === 'image' && <img src={url} alt={file.file_name} className="max-w-full max-h-full object-contain" onError={() => setMedia({ id: file.id, url: null, error: true })} />}
        {url && kind === 'video' && <video key={url} src={url} controls autoPlay playsInline className="max-w-full max-h-full" />}
        {url && kind === 'audio' && <audio key={url} src={url} controls autoPlay />}
        {url && kind === 'pdf' && <iframe key={url} src={url} title={file.file_name} className="w-full h-full bg-white rounded" />}

        {needsMedia && !url && !failed && <p className="text-sm text-white/70">Loading…</p>}
        {(!needsMedia || failed) && (
          <div className="flex flex-col items-center gap-3 text-white/80">
            <FileGlyph file={file} size={64} />
            <p className="text-sm">{failed ? 'This file can\'t be previewed here.' : 'No preview for this type of file.'}</p>
            <button type="button" onClick={() => onDownload(file)} className="flex items-center gap-1.5 bg-white text-gray-900 px-4 py-2 rounded text-sm font-semibold">
              <Download size={14} /> Download
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
