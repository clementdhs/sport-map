// Applies the visitor's accent color: Nuxt UI's primary color (its colors plugin regenerates the CSS
// variables from app config), the accent and its light-mode shade (used by main.css) on <html>, and the
// browser's theme color.
export default defineNuxtPlugin(() => {
  const { accent } = useAccent()
  const appConfig = useAppConfig()

  watch(accent, (value) => {
    appConfig.ui.colors.primary = value
  }, { immediate: true })

  useHead({
    htmlAttrs: { 'data-accent': accent, 'data-accent-shade': () => ACCENT_LIGHT_SHADES[accent.value] },
    meta: [{ name: 'theme-color', content: () => ACCENT_COLORS[accent.value] }],
  })
})
