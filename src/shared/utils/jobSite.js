// How a clock-in remembers the job it was for. The job picker hands back either
// an existing job ({ id, job_ref, site_address, site_city, title }) or text the
// person typed for a job that isn't on the system ({ id: null, site_text }).
// The rows keep both the link and a readable label, so the history still reads
// properly if the job is later archived or its address edited.

export function jobLabel(job) {
  if (!job) return null
  const place = [job.site_address, job.site_city].filter(Boolean).join(', ')
  return [job.job_ref, place || job.title].filter(Boolean).join(' · ') || null
}

// { job_id, site_label } for an insert — both null when nothing was picked or typed.
export function jobSiteFields(job) {
  if (job?.id) return { job_id: job.id, site_label: jobLabel(job) }
  const typed = (job?.site_text || '').trim().slice(0, 200)
  return { job_id: null, site_label: typed || null }
}
