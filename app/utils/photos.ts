// Resizes a photo to PHOTO_MAX_SIDE_PX and re-encodes it as WebP (JPEG where the browser can't encode
// WebP, like older Safari). Re-encoding also drops the EXIF data, GPS position included.
export async function compressPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  }
  catch {
    throw new Error(`${file.name} : format d'image non pris en charge`)
  }

  const scale = Math.min(1, PHOTO_MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))
  // Browsers that can't encode a type silently fall back to PNG.
  let blob = await encode('image/webp', 0.8)
  if (blob?.type !== 'image/webp') blob = await encode('image/jpeg', 0.82)
  if (!blob || blob.type !== 'image/jpeg' && blob.type !== 'image/webp') {
    throw new Error(`${file.name} : compression impossible`)
  }
  if (blob.size > MAX_PHOTO_BYTES) throw new Error(`${file.name} : photo trop lourde, même compressée`)
  return blob
}
