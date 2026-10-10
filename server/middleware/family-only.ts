// The app is for the family only: every API route needs a signed-in member, reads included. Except the link
// preview image of a route visible to the family, fetched by chat apps (WhatsApp, Messages) without a cookie,
// the icons Nuxt UI serves to every page, the sign-in page included, and signing in with a username.
const OPEN_API = [/^\/api\/routes\/[0-9a-f-]{36}\/og\.png$/, /^\/api\/_nuxt_icon\//, /^\/api\/auth\/login$/]

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]!
  if (!path.startsWith('/api/') || OPEN_API.some(open => open.test(path))) return
  // An invalid or expired token counts as no session.
  const userId = await requireUserId(event).catch(() => null)
  if (!userId) throw apiError(event, 401, 'api.signInRequired')
})
