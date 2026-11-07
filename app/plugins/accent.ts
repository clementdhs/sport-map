// Applies the visitor's accent color: Nuxt UI's primary color (its colors plugin regenerates the CSS
// variables from app config, here a terrain palette of main.css), the accent on <html>, and the browser's theme
// color (the accent's light shade, or its dark one in dark mode).
export default defineNuxtPlugin(() => {
  const { accent } = useAccent()
  const appConfig = useAppConfig()
  const colorMode = useColorMode()

  watch(accent, (value) => {
    appConfig.ui.colors.primary = value
  }, { immediate: true })

  useHead({
    htmlAttrs: { 'data-accent': accent },
    meta: [{ name: 'theme-color', content: () => ACCENT_COLORS[accent.value][colorMode.value === 'dark' ? 'dark' : 'light'] }],
  })
})
