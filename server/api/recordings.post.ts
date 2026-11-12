import { serverSupabaseClient } from '#supabase/server'

// Saves an outing recorded with the phone's GPS: its track as a new route of the caller, marked as completed with
// the outing's times, and the outing itself, the first one listed on the route, with its GPS points and their
// times (`saveRecording`). Answers both ids: the outing's for the coach's review (#267).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const body = await readLocalizedBody(event, recordingSchema)
  const supabase = await serverSupabaseClient(event)
  const { routeId, outingId } = await saveRecording(event, supabase, user.sub, body, 'POST /api/recordings')

  setResponseStatus(event, 201)
  return { id: routeId, outing_id: outingId }
})
