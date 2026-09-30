// Phone cameras produce 3–12 MB photos; uploading those raw over mobile data
// is what made job photos slow. This shrinks a photo to at most `maxSize` px
// on its long edge as a JPEG (typically 300–500 KB) before it's uploaded —
// still plenty sharp for before/after evidence.
//
// Anything that can't be decoded (e.g. HEIC on some browsers), or is already
// small, is returned untouched so an upload never fails because of this.
export async function compressImage(file, { maxSize = 1600, quality = 0.8, skipBelowBytes = 400 * 1024 } = {}) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif' || file.size < skipBelowBytes) return file

  try {
    // imageOrientation keeps portrait shots upright (applies the EXIF rotation).
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}
