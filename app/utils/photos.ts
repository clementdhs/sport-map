import type { SquareCrop } from '#shared/utils/avatars'

// Resizes a photo to PHOTO_MAX_SIDE_PX and re-encodes it as WebP (JPEG where the browser can't encode
// WebP, like older Safari). Re-encoding also drops the EXIF data, GPS position included.
export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await loadPhoto(file)
  const scale = Math.min(1, PHOTO_MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await encodePhoto(canvas, file.name)
  if (blob.size > MAX_PHOTO_BYTES) throw new LocalizedError('errors.photoTooLarge', { name: file.name })
  return blob
}

// The chosen file as an image, turned upright from its EXIF orientation.
export async function loadPhoto(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  }
  catch {
    throw new Error(`${file.name} : format d'image non pris en charge`)
  }
}

// The profile photo (#150): the square of `image` the member framed, AVATAR_SIZE_PX wide, encoded like the
// route photos.
export async function compressAvatar(image: ImageBitmap, crop: SquareCrop, name: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE_PX
  canvas.height = AVATAR_SIZE_PX
  const context = canvas.getContext('2d')!
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX)

  const blob = await encodePhoto(canvas, name)
  if (blob.size > MAX_AVATAR_BYTES) throw new LocalizedError('errors.photoTooLarge', { name })
  return blob
}

async function encodePhoto(canvas: HTMLCanvasElement, name: string): Promise<Blob> {
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))
  // Browsers that can't encode a type silently fall back to PNG.
  let blob = await encode('image/webp', 0.8)
  if (blob?.type !== 'image/webp') blob = await encode('image/jpeg', 0.82)
  if (!blob || blob.type !== 'image/jpeg' && blob.type !== 'image/webp') {
    throw new Error(`${name} : compression impossible`)
  }
  return blob
}
