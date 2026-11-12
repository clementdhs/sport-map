import { serverSupabaseClient } from '#supabase/server'
import type { CoachGoal } from '#shared/types/account'

// The coach's goal (#264), null until the member picks one.
export default defineEventHandler(async (event): Promise<CoachGoal | null> => {
  const user = await requireUser(event)
  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase
    .from('coach_goals')
    .select('kind, race_date, race_distance_m, race_gain_m, outings_per_week, preferred_days, long_run_day')
    .eq('user_id', user.sub)
    .maybeSingle()
  if (error) {
    console.error('[GET /api/profile/me/coach-goal]', error)
    throw apiError(event, 500, 'api.loadCoachGoalFailed')
  }
  return parseCoachGoal(data as CoachGoal | null)
})
