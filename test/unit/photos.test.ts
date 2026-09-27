import { describe, expect, it } from 'vitest'
import { detectPhotoType } from '../../server/utils/photos'

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap(part => (typeof part === 'string' ? [...part].map(c => c.charCodeAt(0)) : part)))

describe('detectPhotoType', () => {
  it('recognizes WebP and JPEG from their first bytes', () => {
    expect(detectPhotoType(bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 '))).toBe('image/webp')
    expect(detectPhotoType(bytes([0xFF, 0xD8, 0xFF, 0xE0], 'JFIF'))).toBe('image/jpeg')
  })

  it('rejects anything else, whatever its name or declared type', () => {
    expect(detectPhotoType(bytes([0x89], 'PNG\r\n'))).toBeNull()
    expect(detectPhotoType(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(detectPhotoType(bytes('RIFF', [0, 0, 0, 0], 'WAVE'))).toBeNull()
    expect(detectPhotoType(new Uint8Array())).toBeNull()
  })
})
