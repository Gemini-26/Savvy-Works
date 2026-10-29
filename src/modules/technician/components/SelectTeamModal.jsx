import { useEffect, useState } from 'react'
import { ScanFace, Check } from 'lucide-react'
import { fetchTeamMembers, createCasualTeamMember } from '../../users/services/teamMembersService'
import { fetchFaceEnrolment, identifyTeamMember } from '../../../shared/services/faceService'
import FaceCaptureModal from '../../../shared/components/FaceCaptureModal'
import FaceEnrolFlow from '../../../shared/components/FaceEnrolFlow'

// Shown right before a technician clocks in on site — lets them say
// who (if anyone) came with them, without forcing a selection. Also reused
// after clock-in (`existing` set) so the team can be corrected on the job.
//
// With `allowFace` (the technician's own phone) a helper can be picked by
// holding the phone up to their face. onConfirm(ids, faceChecks) then also
// carries who was recognised that way — [{ teamMemberId, face }] — so the
// screen can record a face check for each once the clock-in has happened.
export default function SelectTeamModal({ onConfirm, onClose, busy, existing = null, allowFace = false }) {
  const editing = existing !== null
  const [members, setMembers] = useState([])
  const [selected, setSelected] = useState(() => (existing || []).map(m => m.id))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [addingCasual, setAddingCasual] = useState(false)
  const [casualName, setCasualName] = useState('')
  const [savingCasual, setSavingCasual] = useState(false)
  const [enrolledIds, setEnrolledIds] = useState(() => new Set())
  const [scanning, setScanning] = useState(false)
  const [scanNote, setScanNote] = useState(null)       // { tone, text }
  const [enrolling, setEnrolling] = useState(null)     // the member whose face is being set up
  const [faces, setFaces] = useState({})               // teamMemberId -> capture from the camera

  useEffect(() => {
    fetchTeamMembers(true)
      // Casual labourers are inactive, so they'd be missing from the pool —
      // keep anyone already on this clock-in visible and selectable.
      .then(list => setMembers([...list, ...(existing || []).filter(e => !list.some(m => m.id === e.id))]))
      .catch(err => setError(err.message || 'Failed to load team members'))
      .finally(() => setLoading(false))
    if (allowFace) {
      fetchFaceEnrolment().then(e => setEnrolledIds(e.teamMemberIds)).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function select(id) {
    setSelected(prev => prev.includes(id) ? prev : [...prev, id])
  }

  async function handleAddCasual(e) {
    e.preventDefault()
    if (!casualName.trim()) return
    setSavingCasual(true)
    setError(null)
    try {
      const member = await createCasualTeamMember(casualName.trim())
      setMembers(prev => [...prev, member])
      setSelected(prev => [...prev, member.id])
      setCasualName('')
      setAddingCasual(false)
    } catch (err) {
      setError(err.message || 'Failed to add casual labourer')
    } finally {
      setSavingCasual(false)
    }
  }

  async function handleScanned(captured) {
    setScanning(false)
    try {
      const match = await identifyTeamMember(captured.descriptors[0])
      if (!match) {
        setScanNote({ tone: 'amber', text: "That face wasn't recognised. Pick them from the list below, or set up their face." })
        return
      }
      // A helper the technician hasn't loaded yet (e.g. just activated) still counts.
      setMembers(prev => prev.some(m => m.id === match.id) ? prev : [...prev, { id: match.id, full_name: match.name }])
      select(match.id)
      setFaces(prev => ({ ...prev, [match.id]: captured }))
      setScanNote({ tone: 'green', text: `${match.name} recognised and added.` })
    } catch (err) {
      setScanNote({ tone: 'amber', text: err.message || "Couldn't check that face. Pick them from the list instead." })
    }
  }

  function handleEnrolled(member, captured) {
    setEnrolling(null)
    setEnrolledIds(prev => new Set(prev).add(member.id))
    // They're standing right here: the enrolment doubles as their check-in.
    select(member.id)
    setFaces(prev => ({ ...prev, [member.id]: captured }))
    setScanNote({ tone: 'green', text: `${member.full_name}'s face is saved, and they're added.` })
  }

  function handleConfirm() {
    const faceChecks = selected.filter(id => faces[id]).map(id => ({ teamMemberId: id, face: faces[id] }))
    onConfirm(selected, faceChecks)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{editing ? 'Team on this job' : "Who's with you?"}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-500">
            {editing
              ? "Add anyone who joined you on this job. They share the on-site time already clocked."
              : "Select any team members clocking in with you on this job. You can leave this blank if you're on your own."}
          </p>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>}

          {allowFace && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => { setScanNote(null); setScanning(true) }}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white text-sm font-semibold py-2.5 rounded-lg"
              >
                <ScanFace size={16} /> Scan a team member’s face
              </button>
              {scanNote && (
                <p className={`text-xs ${scanNote.tone === 'green' ? 'text-green-700' : 'text-amber-700'}`}>{scanNote.text}</p>
              )}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-400">Loading team members…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-400">No team members registered yet. Ask your admin to add them under Active Team Members.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {members.map(m => {
                const isSelected = selected.includes(m.id)
                const canEnrol = allowFace && !m.is_casual && !enrolledIds.has(m.id)
                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-2 rounded-lg border transition-colors ${isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(m.id)}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left px-3 py-2.5"
                    >
                      <span className={`w-5 h-5 rounded flex items-center justify-center border flex-shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>
                        {isSelected && '✓'}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 truncate">
                          {m.full_name}
                          {m.is_casual && <span className="ml-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 align-middle">Casual</span>}
                          {faces[m.id] && isSelected && <Check size={12} className="inline ml-1.5 text-green-600 align-middle" aria-label="Face recognised" />}
                        </span>
                        {m.role_title && <span className="block text-xs text-gray-500 truncate">{m.role_title}</span>}
                      </span>
                    </button>
                    {canEnrol && (
                      <button
                        type="button"
                        onClick={() => setEnrolling(m)}
                        className="text-[11px] font-semibold text-blue-600 pr-3 shrink-0"
                      >
                        Set up face
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {addingCasual ? (
            <form onSubmit={handleAddCasual} className="flex gap-2 pt-1">
              <input
                autoFocus
                value={casualName}
                onChange={e => setCasualName(e.target.value)}
                placeholder="Casual labourer's name"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={savingCasual || !casualName.trim()}
                className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {savingCasual ? 'Adding…' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => { setAddingCasual(false); setCasualName('') }}
                className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCasual(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 pt-1"
            >
              <span className="text-lg leading-none">+</span> Add daily casual
            </button>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirm}
              className="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {editing
                ? (busy ? 'Saving…' : 'Save Team')
                : busy ? 'Clocking in…' : selected.length > 0 ? `Clock In with ${selected.length} team member${selected.length === 1 ? '' : 's'}` : 'Clock In Alone'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {scanning && (
        <FaceCaptureModal
          mode="identify"
          title="Team member"
          subtitle="Hold the phone up so they can look at the camera."
          onResult={handleScanned}
          onClose={() => setScanning(false)}
        />
      )}

      {enrolling && (
        <FaceEnrolFlow
          name={enrolling.full_name}
          teamMemberId={enrolling.id}
          self={false}
          onEnrolled={captured => handleEnrolled(enrolling, captured)}
          onCancel={() => setEnrolling(null)}
        />
      )}
    </div>
  )
}
