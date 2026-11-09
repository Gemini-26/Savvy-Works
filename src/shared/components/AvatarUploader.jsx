import { useRef, useState } from 'react'
import { Camera, Eye, Trash2 } from 'lucide-react'
import Avatar from './Avatar'
import PhotoViewer from './PhotoViewer'
import { setProfilePicture, removeProfilePicture } from '../services/avatarService'

// The big circle on a profile page with "View photo" / "Change photo" / "Remove" beside it.
// `profile` is the person's row ({ id, company_id, full_name, color, avatar_url });
// `onChange(url | null)` is called after a successful change; `children` (a name
// and role, say) sit above the buttons, beside the circle.
export default function AvatarUploader({ profile, size = 64, onChange, className = '', children }) {
  const inputRef = useRef(null)
  // What we just saved, until the profile passed in catches up with it.
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [viewing, setViewing] = useState(false)

  const url = saved && saved.profileId === profile?.id ? saved.url : (profile?.avatar_url || null)
  const setUrl = next => setSaved({ profileId: profile?.id, url: next })

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const next = await setProfilePicture({ ...profile, avatar_url: url }, file)
      setUrl(next)
      onChange?.(next)
    } catch (err) {
      setError(err.message || 'The picture could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setBusy(true)
    setError(null)
    try {
      await removeProfilePicture({ ...profile, avatar_url: url })
      setUrl(null)
      onChange?.(null)
    } catch (err) {
      setError(err.message || 'The picture could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className="relative shrink-0">
        {url ? (
          <button
            type="button"
            onClick={() => setViewing(true)}
            aria-label="View photo"
            title="View photo"
            className="block rounded-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Avatar name={profile?.full_name} color={profile?.color} url={url} size={size} />
          </button>
        ) : (
          <Avatar name={profile?.full_name} color={profile?.color} url={url} size={size} />
        )}
        {busy && (
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
          </div>
        )}
      </div>

      <div className="min-w-0">
        {children}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${children ? 'mt-1' : ''}`}>
          {url && (
            <button
              type="button"
              onClick={() => setViewing(true)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900"
            >
              <Eye size={15} /> View photo
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            <Camera size={15} /> {url ? 'Change photo' : 'Add photo'}
          </button>
          {url && (
            <button
              type="button"
              disabled={busy}
              onClick={handleRemove}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 size={14} /> Remove
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="hidden" onChange={handleFile} />

      {viewing && url && (
        <PhotoViewer url={url} title={profile?.full_name} onClose={() => setViewing(false)} />
      )}
    </div>
  )
}
