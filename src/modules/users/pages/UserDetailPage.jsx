import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { fetchProfile, updateProfile, deleteProfile, callChangePassword, fetchPendingPasswordRequest, denyPasswordRequest } from '../services/profileService'
import { useCurrentUser } from '../../../hooks/useCurrentUser'

const ROLES  = ['technician', 'admin', 'viewer']
const COLORS = [
  { label: 'Blue',   value: '#3B82F6' },
  { label: 'Green',  value: '#10B981' },
  { label: 'Purple', value: '#8B5CF6' },
  { label: 'Orange', value: '#F59E0B' },
  { label: 'Red',    value: '#EF4444' },
  { label: 'Teal',   value: '#14B8A6' },
  { label: 'Indigo', value: '#6366F1' },
  { label: 'Pink',   value: '#EC4899' },
]

const inputCls    = 'w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'
const readonlyCls = 'w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-gray-50 text-gray-500'

function Field({ label, children }) {
  return (
    <div className="flex items-start gap-3">
      <label className="w-32 shrink-0 pt-1.5 text-sm text-gray-700 text-right">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

export default function UserDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useCurrentUser()

  const [editing,       setEditing]       = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,         setError]         = useState(null)
  const [form,          setForm]          = useState(null)

  const [changingPassword, setChangingPassword] = useState(false)
  const [newPassword,      setNewPassword]      = useState('')
  const [confirmPassword,  setConfirmPassword]  = useState('')
  const [passwordSaving,   setPasswordSaving]   = useState(false)
  const [passwordError,    setPasswordError]    = useState(null)
  const [passwordSuccess,  setPasswordSuccess]  = useState(false)
  const [pendingRequest,   setPendingRequest]   = useState(null)
  const [denying,          setDenying]          = useState(false)

  useEffect(() => {
    fetchProfile(id)
      .then(data => { setForm(data); setLoading(false) })
      .catch(err  => { setError(err.message || 'Failed to load profile'); setLoading(false) })
  }, [id])

  useEffect(() => {
    if (!isAdmin) return
    fetchPendingPasswordRequest(id).then(setPendingRequest).catch(() => {})
  }, [id, isAdmin])

  async function handleChangePassword(e) {
    e.preventDefault()
    setPasswordError(null)
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }
    setPasswordSaving(true)
    try {
      await callChangePassword({ profileId: id, newPassword })
      setPasswordSuccess(true)
      setPendingRequest(null)
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => { setChangingPassword(false); setPasswordSuccess(false) }, 1500)
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password')
    } finally {
      setPasswordSaving(false)
    }
  }

  async function handleDenyRequest() {
    if (!pendingRequest) return
    setDenying(true)
    try {
      await denyPasswordRequest(pendingRequest.id, id)
      setPendingRequest(null)
    } catch (err) {
      setError(err.message || 'Failed to deny request')
    } finally {
      setDenying(false)
    }
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateProfile(id, form)
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteProfile(id)
      navigate('/users/active')
    } catch (err) {
      setError(err.message || 'Failed to delete user')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading) return <PageContainer><p className="text-sm text-gray-400 mt-8">Loading…</p></PageContainer>
  if (!form)   return <PageContainer><p className="text-sm text-red-500 mt-8">{error || 'User not found.'}</p></PageContainer>

  const ro      = !editing
  const initial = form.full_name?.[0]?.toUpperCase() || '?'

  return (
    <PageContainer>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center font-black text-xl text-white"
            style={{ backgroundColor: form.color || '#3B82F6' }}
          >
            {initial}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{form.full_name}</h1>
            <p className="text-sm text-gray-500 capitalize">{form.role}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button type="submit" form="user-detail-form" disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : '💾 Save'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setError(null) }}
                className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setEditing(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors">
              ✏️ Edit
            </button>
          )}
          <button type="button" onClick={() => navigate(-1)}
            className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-600 transition-colors">
            ← Back
          </button>
          {isAdmin && (
            <button type="button" onClick={() => setChangingPassword(true)}
              className="bg-gray-700 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-gray-800 transition-colors">
              🔒 Change Password
            </button>
          )}
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="bg-red-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-red-700 transition-colors">
            🗑 Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mt-3">{error}</div>
      )}

      {isAdmin && pendingRequest && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded mt-3 flex items-center justify-between gap-3">
          <span>{form.full_name} requested a password change on {new Date(pendingRequest.requested_at).toLocaleString()}.</span>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => setChangingPassword(true)} disabled={denying}
              className="bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              Approve
            </button>
            <button type="button" onClick={handleDenyRequest} disabled={denying}
              className="bg-white border border-amber-300 text-amber-800 px-3 py-1.5 rounded text-xs font-semibold hover:bg-amber-100 disabled:opacity-50 transition-colors">
              {denying ? 'Denying…' : 'Deny'}
            </button>
          </div>
        </div>
      )}

      <form id="user-detail-form" onSubmit={handleSave}>
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 max-w-lg">

          <Field label="Full Name">
            {ro
              ? <p className="py-1.5 text-sm text-gray-800">{form.full_name}</p>
              : <input required value={form.full_name} onChange={e => set('full_name', e.target.value)} className={inputCls} />
            }
          </Field>

          <Field label="Role">
            {ro
              ? <p className="py-1.5 text-sm text-gray-800 capitalize">{form.role}</p>
              : <select value={form.role} onChange={e => set('role', e.target.value)} className={inputCls}>
                  {ROLES.map(r => (
                    <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
            }
          </Field>

          <Field label="Phone">
            {ro
              ? <p className="py-1.5 text-sm text-gray-800">{form.phone || '—'}</p>
              : <input type="tel" value={form.phone || ''} onChange={e => set('phone', e.target.value)} className={inputCls} />
            }
          </Field>

          <Field label="Avatar Colour">
            {ro
              ? <div className="flex items-center gap-2 py-1">
                  <div className="w-6 h-6 rounded-full border border-gray-200" style={{ backgroundColor: form.color }} />
                  <span className="text-sm text-gray-500">{COLORS.find(c => c.value === form.color)?.label || form.color}</span>
                </div>
              : <div className="flex gap-2 flex-wrap mt-1">
                  {COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      onClick={() => set('color', c.value)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${form.color === c.value ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
            }
          </Field>

          <Field label="Status">
            {ro
              ? <p className="py-1.5 text-sm text-gray-800">{form.is_active ? 'Active' : 'Inactive'}</p>
              : <label className="flex items-center gap-2 text-sm text-gray-700 mt-1">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => set('is_active', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  Active
                </label>
            }
          </Field>

        </div>
      </form>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Delete User?</h3>
            <p className="text-sm text-gray-600">
              This will permanently delete <span className="font-semibold">{form.full_name}</span> and cannot be undone.
            </p>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2 rounded text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2 rounded text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change password */}
      {changingPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Change Password</h3>
            <p className="text-sm text-gray-600">
              Set a new password for <span className="font-semibold">{form.full_name}</span>.
            </p>
            {passwordSuccess ? (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                Password updated.
              </p>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-3">
                {passwordError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{passwordError}</div>
                )}
                <input
                  type="password"
                  autoFocus
                  placeholder="New password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className={inputCls}
                />
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className={inputCls}
                />
                <div className="flex gap-3 pt-1">
                  <button type="submit" disabled={passwordSaving}
                    className="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {passwordSaving ? 'Saving…' : 'Set Password'}
                  </button>
                  <button type="button" onClick={() => { setChangingPassword(false); setPasswordError(null); setNewPassword(''); setConfirmPassword('') }}
                    className="flex-1 border border-gray-300 text-gray-600 py-2 rounded text-sm font-medium hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </PageContainer>
  )
}
