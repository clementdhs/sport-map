// The app is for the family only: every page needs a signed-in member, except the ones used to sign in.
const PUBLIC_PAGES = ['/login', '/forgot-password', '/reset-password', '/confirm']

export default defineNuxtRouteMiddleware(async (to) => {
  if (PUBLIC_PAGES.includes(to.path)) return
  // Without network the session can't be refreshed: a page prepared for offline use (follow mode) must still
  // open. Its data comes from the phone's cache, filled by a signed-in member.
  if (import.meta.client && !navigator.onLine) return
  const user = useSupabaseUser()
  // A member with two-factor authentication who hasn't typed their code yet goes back to the sign-in page, which
  // asks for it (#253). RLS would show them nothing anyway.
  if (user.value && !(await needsMfaCode())) return
  return navigateTo(to.fullPath === '/' ? '/login' : { path: '/login', query: { redirect: to.fullPath } })
})
