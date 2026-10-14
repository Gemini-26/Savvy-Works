import { useState } from 'react'
import { Folder, File, FileText, FileImage, FileVideo, FileAudio, FileSpreadsheet, FileArchive, Play } from 'lucide-react'
import { fileKind } from './fileKinds'

const FILE_ICONS = {
  image:   { Icon: FileImage,       cls: 'text-emerald-600' },
  video:   { Icon: FileVideo,       cls: 'text-purple-600' },
  audio:   { Icon: FileAudio,       cls: 'text-pink-600' },
  pdf:     { Icon: FileText,        cls: 'text-red-600' },
  sheet:   { Icon: FileSpreadsheet, cls: 'text-green-700' },
  doc:     { Icon: FileText,        cls: 'text-blue-600' },
  archive: { Icon: FileArchive,     cls: 'text-amber-700' },
  other:   { Icon: File,            cls: 'text-gray-500' },
}

export function FolderIcon({ size = 20, className = '' }) {
  return <Folder size={size} fill="currentColor" fillOpacity={0.3} className={`text-amber-500 shrink-0 ${className}`} />
}

// The little glyph for a file or folder. `file` is a document_files row.
export function FileGlyph({ file, size = 20, className = '' }) {
  const { Icon, cls } = FILE_ICONS[fileKind(file)]
  return <Icon size={size} className={`${cls} shrink-0 ${className}`} />
}

// A big preview tile for the grid: a real thumbnail for photos and videos once
// their link has loaded, the plain icon otherwise (or if the browser can't draw it).
export function Thumb({ item, url, size = 44 }) {
  const [broken, setBroken] = useState(false)
  if (item.kind === 'folder') return <FolderIcon size={size + 12} />

  const kind = fileKind(item.data)
  if (url && !broken && kind === 'image') {
    return <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} className="w-full h-full object-cover" draggable={false} />
  }
  if (url && !broken && kind === 'video') {
    return (
      <div className="relative w-full h-full bg-gray-900">
        <video src={`${url}#t=0.1`} preload="metadata" muted playsInline onError={() => setBroken(true)} className="w-full h-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-7 h-7 rounded-full bg-black/55 flex items-center justify-center">
            <Play size={14} className="text-white ml-0.5" fill="currentColor" />
          </span>
        </span>
      </div>
    )
  }
  return <FileGlyph file={item.data} size={size} />
}
