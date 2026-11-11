import { serverSupabaseUser } from '#supabase/server'
import type { LoopSentenceResponse } from '#shared/types/loopSentence'

// A loop described in one sentence (#216): the LLM gets the sentence alone (no position, no identity) and can only
// fill the loop panel's settings, its answer checked again by `loopUnderstandingSchema`. Places come back as names,
// never coordinates: the browser looks them up. Each sentence counts in the member's daily quota.
export default defineEventHandler(async (event): Promise<LoopSentenceResponse> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const { sentence } = await readLocalizedBody(event, loopSentenceSchema)
  const { loopLlmProvider, loopLlmKey, loopLlmModel, loopLlmUrl } = useRuntimeConfig(event)
  if (!loopLlmKey) throw apiError(event, 503, 'api.loopSentenceUnavailable')

  const remaining = await consumeLoopSentenceQuota(event)
  let answer: unknown
  try {
    answer = await askLoopLlm(sentence, { provider: loopLlmProvider, key: loopLlmKey, model: loopLlmModel, url: loopLlmUrl, maxWaitMs: 3000 })
  }
  catch (error) {
    console.error('[POST /api/loops/understand]', (error as Error).message)
    throw apiError(event, 502, 'api.loopSentenceFailed')
  }

  const understanding = loopUnderstandingSchema.safeParse(answer)
  const settings = understanding.success ? loopSettingsFromUnderstanding(understanding.data) : null
  if (!understanding.success) console.error('[POST /api/loops/understand] invalid answer', understanding.error.issues.slice(0, 3))
  if (!settings) throw apiError(event, 422, 'api.loopSentenceNotUnderstood')
  return { settings, quota_remaining: remaining }
})
