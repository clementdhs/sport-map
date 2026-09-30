// A signed-in user's language is also kept in their account (auth user_metadata.locale): Supabase writes the
// password reset email in it (supabase/templates/recovery.html). Picking a language saves it there; signing in
// switches to the account's language; accounts without one get the current language.
export default defineNuxtPlugin((nuxtApp) => {
  const supabase = useSupabaseClient()
  const i18n = nuxtApp.$i18n
  const isAppLocale = (value: unknown): value is typeof i18n.locale.value =>
    i18n.locales.value.some(item => item.code === value)

  async function saveLocale(locale: string) {
    const { data } = await supabase.auth.getSession()
    if (!data.session || data.session.user.user_metadata.locale === locale) return
    const { error } = await supabase.auth.updateUser({ data: { locale } })
    if (error) console.error('[account-locale]', error)
  }

  nuxtApp.hook('i18n:localeSwitched', ({ newLocale }) => saveLocale(newLocale))

  supabase.auth.onAuthStateChange((event, session) => {
    if (!session || (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION')) return
    const saved = session.user.user_metadata.locale
    // Deferred: calling Supabase from inside this callback can deadlock its auth lock.
    setTimeout(() => {
      if (!isAppLocale(saved)) void saveLocale(i18n.locale.value)
      else if (event === 'SIGNED_IN' && saved !== i18n.locale.value) void i18n.setLocale(saved)
    })
  })
})
