// Profile photos (#150): a square the member frames in the settings, compressed by the browser to
// AVATAR_SIZE_PX before it is sent, and stored in the private "avatars" bucket.
export const AVATARS_BUCKET = 'avatars'
export const AVATAR_SIZE_PX = 256
// Far above what a 256 px WebP weighs (a few tens of kB); the bucket has the same limit.
export const MAX_AVATAR_BYTES = 256 * 1024
// Lifetime of the signed URLs the browser asks for (s).
export const AVATAR_URL_TTL_S = 3600
// Most the crop zooms in on the photo's short side.
export const MAX_AVATAR_ZOOM = 4

// The square of the source image that becomes the photo, in the image's pixels.
export interface SquareCrop {
  x: number
  y: number
  size: number
}

// Keeps the square inside the image.
export function clampCrop(crop: SquareCrop, width: number, height: number): SquareCrop {
  const size = Math.min(crop.size, width, height)
  return {
    x: Math.min(Math.max(crop.x, 0), width - size),
    y: Math.min(Math.max(crop.y, 0), height - size),
    size,
  }
}

// The square covering as much of the image as it can, centered: what a chosen photo starts with.
export function centeredCrop(width: number, height: number): SquareCrop {
  const size = Math.min(width, height)
  return { x: (width - size) / 2, y: (height - size) / 2, size }
}

// Zoom 1 is the image's short side, MAX_AVATAR_ZOOM a quarter of it. The square keeps its center.
export function zoomCrop(crop: SquareCrop, width: number, height: number, zoom: number): SquareCrop {
  const size = Math.min(width, height) / Math.min(Math.max(zoom, 1), MAX_AVATAR_ZOOM)
  const center = { x: crop.x + crop.size / 2, y: crop.y + crop.size / 2 }
  return clampCrop({ x: center.x - size / 2, y: center.y - size / 2, size }, width, height)
}

// Dragging the photo by (dx, dy) screen pixels in a frame `framePx` wide moves the square the other way.
export function panCrop(crop: SquareCrop, width: number, height: number, dx: number, dy: number, framePx: number): SquareCrop {
  const scale = crop.size / framePx
  return clampCrop({ ...crop, x: crop.x - dx * scale, y: crop.y - dy * scale }, width, height)
}
