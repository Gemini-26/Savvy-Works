import { useState } from 'react'

const FALLBACK_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#14B8A6', '#6366F1', '#EC4899']

// The round "icon" for a person: their profile picture when they have one,
// otherwise their first initial on their colour. Use this everywhere a person
// appears so a new picture shows up across the whole app.
//
//   <Avatar name={p.full_name} color={p.color} url={p.avatar_url} size={32} />
//
// `size` is the diameter in px. If the picture fails to load (deleted, offline)
// it quietly falls back to the initial.
export default function Avatar({ name, color, url, size = 32, className = '', title }) {
  const [failedUrl, setFailedUrl] = useState(null)
  const showPicture = !!url && failedUrl !== url
  const bg = color || FALLBACK_COLORS[(name?.charCodeAt(0) || 0) % FALLBACK_COLORS.length]

  return (
    <div
      title={title}
      className={`rounded-full flex items-center justify-center font-bold text-white uppercase flex-shrink-0 overflow-hidden select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.42)),
        backgroundColor: showPicture ? '#e5e7eb' : bg,
      }}
    >
      {showPicture ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setFailedUrl(url)}
          className="w-full h-full object-cover"
        />
      ) : (
        name?.trim()?.[0] ?? '?'
      )}
    </div>
  )
}
