import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Bell } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import ProgressBar from '../components/ProgressBar'
import AddPoliciesDialog from '../components/AddPoliciesDialog'
import { fetchPolicyOverviewData, remindPeople, POLICIES_CHANGED } from '../services/policyService'
import { buildOverview, percent, AUDIENCE_LABELS } from '../policyStats'
import { formatDate } from '../../../shared/utils/formatDate'

const TABS = ['Documents', 'By person']

function Stat({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// File Manager > Policies & Signatures. Publish a document, then see at a glance
// who has signed it and who hasn't — per document, and per person.
export default function PoliciesAdminPage() {
  const navigate = useNavigate()
  const { profile, loading: userLoading, isAdmin } = useCurrentUser()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('Documents')
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState(null)
  const [reminding, setReminding] = useState(null)   // person id, or 'all'

  const load = useCallback(() => {
    fetchPolicyOverviewData()
      .then(d => { setData(d); setError(null) })
      .catch(err => setError(err.message || 'Could not load documents'))
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    load()
    window.addEventListener(POLICIES_CHANGED, load)
    return () => window.removeEventListener(POLICIES_CHANGED, load)
  }, [isAdmin, load])

  const overview = useMemo(() => (data ? buildOverview(data) : null), [data])

  async function handleRemind(people) {
    setReminding(people.length === 1 ? people[0].id : 'all')
    setError(null)
    try {
      const sent = await remindPeople(people, data.docs, data.signatures)
      setNotice(sent ? `Reminder sent to ${sent} ${sent === 1 ? 'person' : 'people'}.` : 'Nobody has anything outstanding.')
    } catch (err) {
      setError(err.message || 'Could not send the reminder')
    } finally {
      setReminding(null)
    }
  }

  if (userLoading) return <PageContainer><p className="text-sm text-gray-400">Loading…</p></PageContainer>
  if (!profile || !isAdmin) {
    return <PageContainer><p className="text-sm text-gray-600">Only admins can manage policies and signatures.</p></PageContainer>
  }

  const active = overview?.byDoc.filter(d => d.doc.status === 'active') || []
  const older = overview?.byDoc.filter(d => d.doc.status !== 'active') || []
  const owing = overview?.byPerson.filter(p => p.outstanding.length > 0) || []
  const needle = search.trim().toLowerCase()
  const people = (overview?.byPerson || []).filter(p => !needle || p.person.full_name?.toLowerCase().includes(needle))

  return (
    <PageContainer>
      <PageHeader
        title="Policies & Signatures"
        subtitle="Publish policies and procedures — as many as you like at once — then see who has read, agreed and signed them."
        actions={
          <button type="button" onClick={() => setAdding(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
            + Add documents
          </button>
        }
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      {notice && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-lg flex items-start justify-between gap-3">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-green-700 shrink-0" aria-label="Dismiss">✕</button>
        </div>
      )}
      {!data && !error && <p className="text-sm text-gray-400">Loading…</p>}

      {overview && active.length === 0 && older.length === 0 && (
        <EmptyState
          title="No documents yet"
          description="Add Word documents (policies, procedures, codes of conduct — several at once is fine) and everyone they apply to will be asked to read and sign them."
          action={<button type="button" onClick={() => setAdding(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">+ Add documents</button>}
        />
      )}

      {overview && (active.length > 0 || older.length > 0) && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Documents to sign" value={active.length} />
            <Stat label="Signatures collected" value={`${overview.totalSigned} of ${overview.totalNeeded}`} sub={`${percent(overview.totalSigned, overview.totalNeeded)}% complete`} />
            <Stat label="Fully signed" value={`${overview.peopleComplete} of ${overview.byPerson.length}`} sub="people with nothing left to sign" />
            <Stat label="Still outstanding" value={overview.totalNeeded - overview.totalSigned} sub="signatures missing" />
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-gray-300">
            <div className="flex overflow-x-auto">
              {TABS.map(t => (
                <button key={t} type="button" onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${t === tab ? 'border-blue-600 text-white bg-blue-600' : 'border-transparent text-gray-600 hover:text-blue-600 hover:border-blue-300'}`}>
                  {t}
                </button>
              ))}
            </div>
            {owing.length > 0 && (
              <button type="button" disabled={reminding === 'all'} onClick={() => handleRemind(owing.map(p => p.person))}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 disabled:opacity-50 pb-1">
                <Bell size={13} /> {reminding === 'all' ? 'Sending…' : `Remind ${owing.length} ${owing.length === 1 ? 'person' : 'people'} who still owe a signature`}
              </button>
            )}
          </div>

          {tab === 'Documents' && (
            <div className="space-y-3">
              {active.length === 0 && <p className="text-sm text-gray-500">Nothing is waiting for a signature right now.</p>}
              {active.map(({ doc, total, signed, notSigned }) => (
                <button key={doc.id} type="button" onClick={() => navigate(`/files/policies/${doc.id}`)}
                  className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 break-words">{doc.title}</p>
                      <p className="text-xs text-gray-500">Version {doc.version} · {AUDIENCE_LABELS[doc.audience]} · published {formatDate(doc.created_at)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">{signed} of {total} signed</p>
                      {notSigned > 0
                        ? <p className="text-xs font-semibold text-red-600">{notSigned} not signed</p>
                        : <p className="text-xs font-semibold text-green-600 flex items-center justify-end gap-1"><CheckCircle2 size={12} /> Everyone has signed</p>}
                    </div>
                  </div>
                  <ProgressBar done={signed} total={total} className="mt-3" />
                </button>
              ))}

              {older.length > 0 && (
                <details className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-600">Earlier versions &amp; archived ({older.length})</summary>
                  <ul className="divide-y divide-gray-100 mt-2">
                    {older.map(({ doc, signed }) => (
                      <li key={doc.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                        <Link to={`/files/policies/${doc.id}`} className="text-blue-600 font-medium hover:underline min-w-0 break-words">
                          {doc.title} <span className="text-gray-400 font-normal">v{doc.version}</span>
                        </Link>
                        <span className="text-xs text-gray-500 shrink-0">
                          {doc.status === 'superseded' ? 'Replaced' : 'Archived'} · {signed} signature{signed === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {tab === 'By person' && (
            <div className="space-y-3">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…"
                className="w-full max-w-sm px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {people.length === 0 && <p className="p-4 text-sm text-gray-500">No one to show.</p>}
                {people.map(({ person, done, total, outstanding }) => (
                  <div key={person.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="sm:w-56 shrink-0">
                      <p className="text-sm font-bold text-gray-900">{person.full_name}</p>
                      <p className="text-xs text-gray-500 capitalize">{person.role}</p>
                    </div>
                    <div className="sm:w-48 shrink-0">
                      <p className="text-sm font-semibold text-gray-900">{done} of {total} signed</p>
                      <ProgressBar done={done} total={total} className="mt-1" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                      {outstanding.length === 0
                        ? <span className="text-xs font-semibold text-green-600 flex items-center gap-1"><CheckCircle2 size={12} /> All signed</span>
                        : outstanding.map(d => (
                            <Link key={d.id} to={`/files/policies/${d.id}`} className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full hover:bg-red-100">
                              {d.title}
                            </Link>
                          ))}
                    </div>
                    {outstanding.length > 0 && (
                      <button type="button" disabled={reminding === person.id} onClick={() => handleRemind([person])}
                        className="text-xs font-semibold text-blue-600 shrink-0 disabled:opacity-50">
                        {reminding === person.id ? 'Sending…' : 'Remind'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {adding && (
        <AddPoliciesDialog
          existingTitles={(data?.docs || []).filter(d => d.status === 'active').map(d => d.title)}
          onClose={() => setAdding(false)}
          onPublished={ids => {
            setAdding(false)
            if (ids.length === 1) navigate(`/files/policies/${ids[0]}`)
            else setNotice(`Published ${ids.length} documents. Everyone they apply to has been asked to read and sign.`)
          }}
        />
      )}
    </PageContainer>
  )
}
