// Turns whatever the person picked (a 4000px phone photo, a screenshot, a
// landscape shot) into a small square JPEG for use as a profile picture: the
// middle square is cropped out and shrunk to `size` px. That keeps every avatar
// around 10–40 KB, which matters because they load in lists with dozens of rows.
//
// Throws a readable Error if the file isn't a picture the browser can decode
// (HEIC on some browsers, a renamed PDF, …) so the caller can tell the user.
export async function squareAvatar(file, { size = 320, quality = 0.88 } = {}) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') {
    throw new Error('Please choose a JPG, PNG or WebP picture.')
  }

  let bitmap
  try {
    // imageOrientation applies the EXIF rotation so portrait shots stay upright.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error("That picture couldn't be opened. Try a JPG or PNG instead.")
  }

  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const sx = (bitmap.width - side) / 2
    const sy = (bitmap.height - side) / 2
    const out = Math.min(size, side)

    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext('2d')
    // Transparent PNGs would otherwise turn black when saved as JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out, out)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out)

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) throw new Error('The picture could not be prepared.')
    return blob
  } finally {
    bitmap.close?.()
  }
}
