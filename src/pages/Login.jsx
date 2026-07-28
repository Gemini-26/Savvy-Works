import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { logLoginEvent } from '../services/authService'

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleLogin(e) {
    e.preventDefault?.()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    else logLoginEvent().catch(() => {})
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-8 w-full max-w-sm">

        {/* Brand */}
        <div className="flex items-center gap-3 mb-8">
          <div style={{ width: 48, height: 48, background: '#CC2525', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
  <span style={{ color: '#fff', fontWeight: 900, fontSize: 26, fontFamily: 'Arial, sans-serif', lineHeight: 1 }}>S</span>
</div>
          <div>
            <div className="font-black text-gray-900 text-base uppercase tracking-tight">Savvy Civils</div>
            <div className="text-[10px] text-gray-400 font-semibold tracking-widest uppercase">and Plumbing</div>
            <div className="text-xs text-gray-400">Job Management System</div>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
        <p className="text-sm text-gray-500 mb-6">Sign in to your account</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-5">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin(e)}
              autoComplete="email"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                         placeholder:text-gray-300"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin(e)}
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                         placeholder:text-gray-300"
              placeholder="••••••••"
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            className="w-full bg-red-600 text-white py-2.5 rounded-lg font-semibold text-sm
                       hover:bg-red-700 active:bg-red-800
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors shadow-sm mt-2"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Signing in…
              </span>
            ) : 'Sign in'}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-6">
          Need an account? Contact your administrator.
        </p>
      </div>
    </div>
  )
}
