import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, PenLine, ChevronRight, Smartphone } from 'lucide-react'
import { DocumentsShell } from '../../documents/components/DocumentsWorkspace'
import ProgressBar from '../components/ProgressBar'
import { fetchMyPolicies, fetchTeamSigningQueue, POLICIES_CHANGED } from '../services/policyService'
import { formatDate } from '../../../shared/utils/formatDate'

// "Policies & Procedures" as the person who has to sign them sees it: every
// document they've been asked to sign, how many are done, and what's left.
// Used by technicians (phone layout) and admins (normal layout) alike.
export default function MyPoliciesPage({ profile }) {
  const compact = profile?.role === 'technician'
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [team, setTeam] = useState(null)   // team members waiting to sign, for whoever can hand a phone over
  const canRecordForTeam = profile?.role === 'admin' || profile?.role === 'technician'

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    function load() {
      fetchMyPolicies(profile)
        .then(r => { if (!cancelled) { setData(r); setError(null) } })
        .catch(err => { if (!cancelled) setError(err.message || 'Could not load your documents') })
      if (canRecordForTeam) {
        fetchTeamSigningQueue()
          .then(q => { if (!cancelled) setTeam(q) })
          .catch(() => { if (!cancelled) setTeam(null) })   // the list above still works without this
      }
    }
    load()
    window.addEventListener(POLICIES_CHANGED, load)
    return () => { cancelled = true; window.removeEventListener(POLICIES_CHANGED, load) }
  }, [profile, canRecordForTeam])

  // Waiting first (newest on top), then the ones already signed.
  const items = data
    ? [...data.items].sort((a, b) =>
        (a.signature ? 1 : 0) - (b.signature ? 1 : 0)
        || new Date(b.doc.created_at) - new Date(a.doc.created_at))
    : []

  return (
    <DocumentsShell compact={compact}>
      <div>
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 mb-2">
          <ArrowLeft size={14} /> Profile
        </Link>
        <h1 className={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-gray-900`}>Policies &amp; Procedures</h1>
        <p className="text-sm text-gray-500 mt-0.5">Read each document, tick “I understand and agree”, then sign it.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      {!data && !error && <p className="text-sm text-gray-400">Loading…</p>}

      {data && data.total === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-sm font-semibold text-gray-700">Nothing to sign right now</p>
          <p className="text-xs text-gray-400 mt-1">When a policy is published for you, it will show up here.</p>
        </div>
      )}

      {data && data.total > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 max-w-2xl">
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{data.signed}</p>
              <p className="text-xs text-gray-500">Signed</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className={`text-2xl font-bold ${data.outstanding ? 'text-amber-600' : 'text-gray-400'}`}>{data.outstanding}</p>
              <p className="text-xs text-gray-500">Not signed yet</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{data.total}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 max-w-2xl">
            <ProgressBar done={data.signed} total={data.total} />
            {data.outstanding === 0 ? (
              <p className="flex items-center gap-1 text-sm font-semibold text-green-600"><CheckCircle2 size={16} /> You're all up to date</p>
            ) : (
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-amber-600">{data.outstanding} to go.</span> Tap a document below, read it, then sign.
              </p>
            )}
          </div>

          {[
            { title: 'Waiting for your signature', rows: items.filter(i => !i.signature) },
            { title: 'Signed', rows: items.filter(i => i.signature) },
          ].filter(g => g.rows.length > 0).map(group => (
            <div key={group.title} className="space-y-2 max-w-2xl">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{group.title} ({group.rows.length})</h2>
              {group.rows.map(({ doc, signature }) => (
                <Link
                  key={doc.id}
                  to={`/profile/policies/${doc.id}`}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 hover:border-blue-300 transition-colors"
                >
                  {signature
                    ? <CheckCircle2 size={22} className="text-green-500 shrink-0" />
                    : <PenLine size={22} className="text-amber-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 break-words">{doc.title}</p>
                    {doc.description && <p className="text-xs text-gray-500 line-clamp-2">{doc.description}</p>}
                    <p className={`text-xs mt-0.5 font-medium ${signature ? 'text-green-600' : 'text-amber-600'}`}>
                      {signature ? `Signed ${formatDate(signature.signed_at)}` : 'Read & sign'}
                      <span className="text-gray-400 font-normal"> · Version {doc.version}</span>
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-gray-400 shrink-0" />
                </Link>
              ))}
            </div>
          ))}
        </>
      )}

      {team?.pending.length > 0 && (
        <div className="space-y-2 max-w-2xl">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Team members waiting to sign ({team.pending.length})
          </h2>
          <p className="text-xs text-gray-500">
            Team members have no login. Tap a document, hand them your phone, and they read it and sign with their finger. It is saved under their name and shows you recorded it.
          </p>
          {team.pending.map(({ member, docs }) => (
            <div key={member.id} className="bg-white rounded-xl border border-gray-200">
              <p className="px-4 pt-3 pb-1 text-sm font-bold text-gray-900">
                {member.full_name} <span className="text-xs font-normal text-amber-600">· {docs.length} to sign</span>
              </p>
              <ul className="divide-y divide-gray-100">
                {docs.map(doc => (
                  <li key={doc.id}>
                    <Link to={`/profile/policies/${doc.id}/for/${member.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                      <Smartphone size={18} className="text-blue-500 shrink-0" />
                      <span className="flex-1 min-w-0 text-sm text-gray-900 break-words">{doc.title}</span>
                      <span className="text-xs font-semibold text-blue-600 shrink-0">Sign in person</span>
                      <ChevronRight size={16} className="text-gray-400 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </DocumentsShell>
  )
}
