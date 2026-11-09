import { supabase } from '../../lib/supabase'
import { squareAvatar } from '../utils/squareAvatar'

const BUCKET = 'avatars'

// ── Change notifications ─────────────────────────────────────────
// The header, the profile page and every list read the picture from separate
// copies of the profile. When it changes here, anything showing it listens and
// updates in place instead of waiting for a reload.
const listeners = new Set()

export function onAvatarChange(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function announce(profileId, avatarUrl) {
  listeners.forEach(cb => cb(profileId, avatarUrl))
}

// ── Helpers ──────────────────────────────────────────────────────
// The storage path inside the bucket for one of our public links, or null.
function pathFromUrl(url) {
  if (!url) return null
  const marker = `/${BUCKET}/`
  const at = url.indexOf(marker)
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length).split('?')[0])
}

async function dropFile(url) {
  const path = pathFromUrl(url)
  // Tidying up the old file is best-effort: the new picture is already saved.
  if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
}

async function saveUrl(profile, avatarUrl) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', profile.id)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Your picture could not be saved.')
}

// ── Public API ───────────────────────────────────────────────────

// Crops `file` to a square, uploads it and makes it the profile's picture.
// `profile` needs { id, company_id, avatar_url }. Resolves to the new URL.
export async function setProfilePicture(profile, file) {
  if (!profile?.id || !profile?.company_id) throw new Error('Your profile is not ready yet. Please try again.')

  const blob = await squareAvatar(file)
  // A fresh random name each time, so a changed picture is never served from a
  // cache and the old link can simply be deleted afterwards.
  const path = `${profile.company_id}/${profile.id}/${crypto.randomUUID()}.jpg`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (uploadError) throw uploadError

  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  try {
    await saveUrl(profile, url)
  } catch (err) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
    throw err
  }

  await dropFile(profile.avatar_url)
  announce(profile.id, url)
  return url
}

// Goes back to the coloured initial.
export async function removeProfilePicture(profile) {
  if (!profile?.id) return
  await saveUrl(profile, null)
  await dropFile(profile.avatar_url)
  announce(profile.id, null)
}
