import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

// Saves an outing recorded with the phone's GPS: its track as a new route of the caller, marked as completed with
// the outing's times, and the outing itself, the first one listed on the route, with its GPS points and their
// times (`saveRecording`).
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const body = await readLocalizedBody(event, recordingSchema)
  const supabase = await serverSupabaseClient(event)
  const id = await saveRecording(event, supabase, user.sub, body, 'POST /api/recordings')

  setResponseStatus(event, 201)
  return { id }
})
