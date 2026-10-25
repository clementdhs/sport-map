import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

// The logo's drawing is repeated in the header component and the link preview (#193).
describe('app logo', () => {
  const path = read('../../public/icon.svg').match(/<path d="([^"]+)"/)![1]

  it('draws the same mark as public/icon.svg in AppLogo.vue and the link preview', () => {
    expect(read('../../app/components/AppLogo.vue')).toContain(`d="${path}"`)
    expect(read('../../server/utils/ogImage.ts')).toContain(`d="${path}"`)
  })

  it('keeps the Android adaptive icon background on the brand color', () => {
    const brand = read('../../public/icon.svg').match(/<rect [^>]*fill="(#[0-9a-f]{6})"/i)![1]
    expect(read('../../android/app/src/main/res/values/ic_launcher_background.xml').toLowerCase()).toContain(brand.toLowerCase())
  })
})
