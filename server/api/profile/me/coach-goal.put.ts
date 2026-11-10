import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { CoachGoal } from '#shared/types/account'

// Saves the coach's goal (#264), replacing the previous one.
export default defineEventHandler(async (event): Promise<CoachGoal> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')
  const goal = coachGoalRow(await readLocalizedBody(event, coachGoalSchema))
  const supabase = await serverSupabaseClient(event)
  const { error } = await supabase.from('coach_goals').upsert({ user_id: user.sub, ...goal })
  if (error) {
    console.error('[PUT /api/profile/me/coach-goal]', error)
    throw apiError(event, 500, 'api.saveCoachGoalFailed')
  }
  return goal
})
