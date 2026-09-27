import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// App green, the background of public/icon.svg.
const BRAND_GREEN = '#16a34a'

// Generates the PWA icons next to public/icon.svg: `npm run pwa:assets`.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // The SVG already has its own rounded square.
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    // Android crops maskable icons to a circle or squircle: keep the drawing in the safe zone, on the app's green.
    maskable: { ...minimal2023Preset.maskable, padding: 0.3, resizeOptions: { background: BRAND_GREEN } },
    // iOS rounds the corners itself and does not support transparency.
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { background: BRAND_GREEN } },
  },
  images: ['public/icon.svg'],
})
