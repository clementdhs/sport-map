// The app is for the family only: every page needs a signed-in member, except the ones used to sign in.
const PUBLIC_PAGES = ['/login', '/forgot-password', '/reset-password', '/confirm']

export default defineNuxtRouteMiddleware((to) => {
  if (PUBLIC_PAGES.includes(to.path)) return
  const user = useSupabaseUser()
  if (user.value) return
  // Without network the session can't be refreshed: a page prepared for offline use (follow mode) must still
  // open. Its data comes from the phone's cache, filled by a signed-in member.
  if (import.meta.client && !navigator.onLine) return
  return navigateTo(to.fullPath === '/' ? '/login' : { path: '/login', query: { redirect: to.fullPath } })
})
