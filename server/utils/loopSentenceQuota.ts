import type { H3Event } from 'h3'
import { serverSupabaseClient } from '#supabase/server'

// Counts one loop sentence (#216) for the signed-in member and returns how many are left today; past the limit,
// answers 429 with LOOP_SENTENCE_QUOTA_REASON. Counted before the LLM call, failed ones included.
export async function consumeLoopSentenceQuota(event: H3Event): Promise<number> {
  await requireMfa(event)
  const { loopSentenceDailyLimit } = useRuntimeConfig(event)
  const supabase = await serverSupabaseClient(event)
  const { data: remaining, error } = await supabase.rpc('consume_loop_sentence_quota', { daily_limit: Number(loopSentenceDailyLimit) })
  if (error) {
    console.error('[loop sentence quota]', error)
    throw apiError(event, 500, 'api.loopSentenceFailed')
  }
  if (remaining < 0) {
    throw apiError(event, 429, 'api.loopSentenceQuota', { limit: loopSentenceDailyLimit }, { reason: LOOP_SENTENCE_QUOTA_REASON })
  }
  return remaining
}
