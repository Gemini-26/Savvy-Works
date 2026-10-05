import { supabase } from '../lib/supabase'

// Shown instead of the app when someone is signed in but their login has no
// staff profile (or the profile couldn't be loaded). Without a profile the
// database hides every company record from them, so the normal screens would
// just render empty — which looks like a bug rather than a setup problem.
export default function NoProfileScreen({ email, failed }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <div style={{ width: 48, height: 48, background: '#CC2525', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 26, fontFamily: 'Arial, sans-serif', lineHeight: 1 }}>S</span>
          </div>
          <div>
            <div className="font-black text-gray-900 text-base uppercase tracking-tight">Savvy Civils</div>
            <div className="text-[10px] text-gray-400 font-semibold tracking-widest uppercase">and Plumbing</div>
          </div>
        </div>

        {failed ? (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Couldn’t load your profile</h1>
            <p className="text-sm text-gray-500 mb-6">
              Something went wrong reaching the server. Check your connection and try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-red-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-red-700 transition-colors"
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Your login isn’t set up yet</h1>
            <p className="text-sm text-gray-500 mb-4">
              You’re signed in{email ? <> as <span className="font-medium text-gray-700">{email}</span></> : ''}, but this
              login isn’t linked to a staff profile, so there’s nothing for you to see yet.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Please ask an administrator to link it to your profile, then sign in again.
            </p>
          </>
        )}

        <button
          onClick={() => supabase.auth.signOut()}
          className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${
            failed
              ? 'mt-2 text-gray-600 hover:bg-gray-50'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
