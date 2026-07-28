import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { callCreateUser } from '../services/profileService'

const ROLES   = ['technician', 'admin', 'viewer']
const COLORS  = [
  { label: 'Blue',   value: '#3B82F6' },
  { label: 'Green',  value: '#10B981' },
  { label: 'Purple', value: '#8B5CF6' },
  { label: 'Orange', value: '#F59E0B' },
  { label: 'Red',    value: '#EF4444' },
  { label: 'Teal',   value: '#14B8A6' },
  { label: 'Indigo', value: '#6366F1' },
  { label: 'Pink',   value: '#EC4899' },
]

const inputCls = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function NewUserPage() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)
  const [form,   setForm]   = useState({
    full_name: '',
    email:     '',
    password:  '',
    role:      'technician',
    phone:     '',
    color:     '#3B82F6',
  })

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await callCreateUser(form)
      navigate('/users/active')
    } catch (err) {
      setError(err.message || 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  const initial = form.full_name?.[0]?.toUpperCase() || '?'

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold text-gray-900">New User</h1>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← Back
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5 max-w-lg">

          {/* Avatar preview */}
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center font-black text-2xl text-white"
              style={{ backgroundColor: form.color }}
            >
              {initial}
            </div>
            <div className="text-sm text-gray-500">Avatar preview — updates as you fill in the form</div>
          </div>

          <Field label="Full Name" required>
            <input
              required
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="e.g. John Smith"
              className={inputCls}
            />
          </Field>

          <Field label="Email" required>
            <input
              required
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="john@example.com"
              className={inputCls}
            />
          </Field>

          <Field label="Temporary Password" required>
            <input
              required
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder="Min. 8 characters"
              minLength={8}
              className={inputCls}
            />
          </Field>

          <Field label="Role" required>
            <select
              value={form.role}
              onChange={e => set('role', e.target.value)}
              className={inputCls}
            >
              {ROLES.map(r => (
                <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </Field>

          <Field label="Phone">
            <input
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="+27 81 000 0000"
              className={inputCls}
            />
          </Field>

          <Field label="Avatar Colour">
            <div className="flex gap-2 flex-wrap mt-1">
              {COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => set('color', c.value)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${form.color === c.value ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </Field>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-6 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save User'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </PageContainer>
  )
}
