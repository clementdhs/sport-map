
// Deliberate server error, to check that errors reach Sentry (see README). Signed-in users only, so that
// nobody else can use up the free quota.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  throw new Error('Test Sentry : erreur serveur volontaire')
})
