import en from '~~/i18n/locales/en.json'
import fr from '~~/i18n/locales/fr.json'

const MESSAGES = { fr, en }

// The part of @nuxtjs/i18n's internal context used here.
interface I18nContext {
  loadMessages: (locale: string) => Promise<void>
  vueI18n: { global: { setLocaleMessage: (locale: string, messages: unknown) => void } }
}

// @nuxtjs/i18n v10 fetches a language's messages from its /_i18n endpoint before the app starts, even when
// the page already has them: hydration waits for that request, and it fails offline (follow mode). Both
// languages ship with the app instead, and its loader is replaced by one that installs them, with no request.
// Replaced in the hook the module calls just before loading a language, since hooks are registered before any
// plugin runs.
function useBundledMessages(nuxtApp: unknown) {
  const ctx = (nuxtApp as { _nuxtI18n: I18nContext })._nuxtI18n
  ctx.loadMessages = async (locale) => {
    if (locale in MESSAGES) ctx.vueI18n.global.setLocaleMessage(locale, MESSAGES[locale as keyof typeof MESSAGES])
  }
}

export default defineNuxtPlugin({
  name: 'i18n-messages',
  hooks: {
    'i18n:beforeLocaleSwitch': ({ context }) => useBundledMessages(context),
  },
})
