const EXTENSIONS = {
  image:   ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'avif'],
  video:   ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', '3gp'],
  audio:   ['mp3', 'wav', 'm4a', 'aac', 'ogg'],
  pdf:     ['pdf'],
  sheet:   ['xls', 'xlsx', 'csv', 'ods'],
  doc:     ['doc', 'docx', 'txt', 'rtf', 'odt', 'pages'],
  archive: ['zip', 'rar', '7z', 'gz', 'tar'],
}

export function extensionOf(name) {
  const dot = (name || '').lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

// image | video | audio | pdf | sheet | doc | archive | other
export function fileKind(file) {
  const mime = file.mime_type || ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  const ext = extensionOf(file.file_name)
  for (const [kind, list] of Object.entries(EXTENSIONS)) {
    if (list.includes(ext)) return kind
  }
  return 'other'
}

const KIND_NAMES = {
  image: 'Image', video: 'Video', audio: 'Audio', pdf: 'PDF document',
  sheet: 'Spreadsheet', doc: 'Document', archive: 'Archive', other: 'File',
}

// "PDF document", "JPG image" … like the Type column in File Explorer.
export function kindLabel(file) {
  const kind = fileKind(file)
  const ext = extensionOf(file.file_name).toUpperCase()
  if (kind === 'pdf') return KIND_NAMES.pdf
  if (ext && (kind === 'image' || kind === 'video' || kind === 'audio')) return `${ext} ${KIND_NAMES[kind].toLowerCase()}`
  if (ext && kind === 'other') return `${ext} file`
  return KIND_NAMES[kind]
}
