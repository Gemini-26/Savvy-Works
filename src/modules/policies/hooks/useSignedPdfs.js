import { useCallback, useEffect, useRef, useState } from 'react'
import { createSignedPdf, buildSignedZip, saveBlob } from '../services/signedCopies'

// The View / Download / "Download all" buttons for signed policy PDFs, with the
// progress, messages and cancel they need. Shared by the admin screens.
export function useSignedPdfs() {
  const [busyId, setBusyId] = useState(null)   // the signature being opened or downloaded
  const [job, setJob] = useState(null)         // a ZIP being made: { done, total, name }
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const abort = useRef(null)

  // Leaving the page stops a batch that is still being made.
  useEffect(() => () => abort.current?.abort(), [])

  // Opens the PDF in a new tab. The tab has to be opened straight from the click
  // (before any waiting) or the browser treats it as a pop-up and blocks it.
  const view = useCallback(async signatureId => {
    const tab = window.open('', '_blank')
    try { tab?.document.write('<p style="font-family:sans-serif;color:#555;padding:24px">Preparing the PDF…</p>') } catch { /* cross-origin about:blank is fine to skip */ }
    setBusyId(signatureId)
    setError(null)
    try {
      const { pdf } = await createSignedPdf(signatureId)
      const url = pdf.output('bloburl')
      if (tab) tab.location.href = url
      else window.open(url, '_blank')
    } catch (err) {
      tab?.close()
      setError(err.message || 'Could not make the PDF.')
    } finally {
      setBusyId(null)
    }
  }, [])

  const download = useCallback(async signatureId => {
    setBusyId(signatureId)
    setError(null)
    try {
      const { pdf, fileName } = await createSignedPdf(signatureId)
      pdf.save(fileName)
    } catch (err) {
      setError(err.message || 'Could not make the PDF.')
    } finally {
      setBusyId(null)
    }
  }, [])

  // entries: [{ signatureId, documentId }]
  const downloadZip = useCallback(async (entries, { fileName, grouping = 'by-person' }) => {
    if (!entries.length || abort.current) return
    const controller = new AbortController()
    abort.current = controller
    setError(null)
    setNotice(null)
    setJob({ done: 0, total: entries.length, name: '' })
    try {
      const result = await buildSignedZip(entries, {
        grouping,
        signal: controller.signal,
        onProgress: p => setJob(j => ({ ...(j || {}), ...p })),
      })
      if (result.blob) saveBlob(result.blob, fileName)
      const parts = []
      if (result.made) parts.push(`${result.made} PDF${result.made === 1 ? '' : 's'} saved in ${fileName}.`)
      if (result.cancelled) parts.push('Stopped early — only the PDFs made so far are in it.')
      if (parts.length) setNotice(parts.join(' '))
      if (result.failed.length) {
        const first = result.failed.slice(0, 3).map(f => `${f.name} (${f.message})`).join('; ')
        setError(`${result.failed.length} PDF${result.failed.length === 1 ? '' : 's'} could not be made: ${first}${result.failed.length > 3 ? '…' : ''}`)
      }
      if (!result.made && !result.failed.length) setNotice('Nothing to download.')
    } catch (err) {
      setError(err.message || 'Could not make the ZIP.')
    } finally {
      abort.current = null
      setJob(null)
    }
  }, [])

  const cancel = useCallback(() => abort.current?.abort(), [])
  const dismiss = useCallback(() => setNotice(null), [])

  return { busyId, job, error, notice, view, download, downloadZip, cancel, dismiss }
}
