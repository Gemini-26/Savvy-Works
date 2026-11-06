import ProgressBar from './ProgressBar'

// Progress, result and error messages for the signed-PDF buttons (see useSignedPdfs).
export default function PdfStatus({ pdfs }) {
  const { job, error, notice, cancel, dismiss } = pdfs
  return (
    <>
      {job && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-2" role="status">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-blue-900">
              Making PDFs… {Math.min(job.done + 1, job.total)} of {job.total}
            </p>
            <button type="button" onClick={cancel} className="text-xs font-semibold text-blue-700 underline shrink-0">Stop</button>
          </div>
          <ProgressBar done={job.done} total={job.total} />
          {job.name && <p className="text-xs text-blue-800 truncate">{job.name}</p>}
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg break-words">{error}</div>}
      {notice && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-lg flex items-start justify-between gap-3">
          <span>{notice}</span>
          <button type="button" onClick={dismiss} className="text-green-700 shrink-0" aria-label="Dismiss">✕</button>
        </div>
      )}
    </>
  )
}
