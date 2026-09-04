import { useEffect, useState } from 'react'
import { Users, Phone } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import { fetchTeamMembers, createTeamMember, updateTeamMember, setTeamMemberActive } from '../services/teamMembersService'
import { useCurrentUser } from '../../../hooks/useCurrentUser'

const inputCls = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

export default function ActiveTeamMembersPage({ activeOnly = true }) {
  const { isAdmin } = useCurrentUser()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ full_name: '', phone: '', role_title: '' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', role_title: '' })

  async function load() {
    setLoading(true)
    try {
      const data = await fetchTeamMembers(activeOnly)
      setMembers(data)
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to load team members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [activeOnly])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.full_name.trim()) {
      setError('Full name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createTeamMember(form)
      setForm({ full_name: '', phone: '', role_title: '' })
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to add team member')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(member) {
    try {
      await setTeamMemberActive(member.id, !member.is_active)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to update team member')
    }
  }

  function startEdit(member) {
    setEditingId(member.id)
    setEditForm({ full_name: member.full_name, phone: member.phone || '', role_title: member.role_title || '' })
    setError(null)
  }

  function setEditField(field, value) {
    setEditForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSaveEdit(member) {
    if (!editForm.full_name.trim()) {
      setError('Full name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateTeamMember(member.id, editForm)
      setEditingId(null)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to update team member')
    } finally {
      setSaving(false)
    }
  }

  const title = activeOnly ? 'Active Team Members' : 'Inactive Team Members'

  return (
    <PageContainer>
      <div className="flex items-center justify-between">
        <PageHeader
          title={title}
          subtitle="Labourers and helpers technicians can bring along when they clock in on a job"
        />
        {isAdmin && activeOnly && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            {showForm ? 'Cancel' : '+ Add Team Member'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 p-5 mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Full Name<span className="text-red-500 ml-0.5">*</span></label>
              <input className={inputCls} value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="e.g. John Dube" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
              <input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="e.g. 082 000 0000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Role / Trade</label>
              <input className={inputCls} value={form.role_title} onChange={e => set('role_title', e.target.value)} placeholder="e.g. Labourer" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Adding…' : 'Add Team Member'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mt-4">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 mt-4">Loading team members…</p>
      ) : members.length === 0 ? (
        <EmptyState
          title={activeOnly ? 'No team members registered' : 'No inactive team members'}
          description={activeOnly ? 'Add a labourer or helper so technicians can select them when clocking in on a job.' : ''}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-5 py-3">Role / Trade</th>
                <th className="text-left px-5 py-3">Phone</th>
                <th className="text-left px-5 py-3">Status</th>
                {isAdmin && <th className="text-right px-5 py-3">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.map(m => {
                const isEditing = editingId === m.id
                if (isEditing) {
                  return (
                    <tr key={m.id} className="bg-blue-50/40">
                      <td className="px-5 py-3">
                        <input className={inputCls} value={editForm.full_name} onChange={e => setEditField('full_name', e.target.value)} placeholder="Full Name" />
                      </td>
                      <td className="px-5 py-3">
                        <input className={inputCls} value={editForm.role_title} onChange={e => setEditField('role_title', e.target.value)} placeholder="Role / Trade" />
                      </td>
                      <td className="px-5 py-3">
                        <input className={inputCls} value={editForm.phone} onChange={e => setEditField('phone', e.target.value)} placeholder="Phone" />
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {m.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <button disabled={saving} onClick={() => handleSaveEdit(m)} className="text-xs font-medium text-green-600 hover:text-green-800 mr-3 disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button disabled={saving} onClick={() => setEditingId(null)} className="text-xs font-medium text-gray-500 hover:text-gray-700">
                            Cancel
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                }
                return (
                  <tr key={m.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                          <Users size={14} />
                        </div>
                        <span className="font-medium text-gray-900">{m.full_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{m.role_title || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">
                      {m.phone ? (
                        <span className="flex items-center gap-1"><Phone size={12} className="text-gray-400" />{m.phone}</span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => startEdit(m)}
                          className="text-xs font-medium text-gray-600 hover:text-gray-900 mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(m)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          {m.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  )
}
