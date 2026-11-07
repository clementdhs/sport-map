import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// The brand color (BRAND_COLOR in shared/utils/theme.ts), the background of public/icon.svg.
const BRAND_COLOR = '#4f46e5'

// Generates the PWA icons next to public/icon.svg: `npm run pwa:assets`.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // The SVG already has its own rounded square.
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    // Android crops maskable icons to a circle or squircle: keep the drawing in the safe zone, on the brand color.
    maskable: { ...minimal2023Preset.maskable, padding: 0.3, resizeOptions: { background: BRAND_COLOR } },
    // iOS rounds the corners itself and does not support transparency.
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { background: BRAND_COLOR } },
  },
  images: ['public/icon.svg'],
})
