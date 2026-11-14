import type { LoopSentenceResponse } from '#shared/types/loopSentence'

// A loop described in one sentence (#216): the LLM gets the sentence alone (no position, no identity) and can only
// fill the loop panel's settings, its answer checked again by `loopUnderstandingSchema`. Places come back as names,
// never coordinates: the browser looks them up. Each sentence counts in the member's daily quota.
// Groq's rate limit reopens within seconds (« try again in 4.7s »): worth waiting rather than failing (#304), the
// field showing « Je lis ta phrase… » meanwhile.
const LOOP_LLM_MAX_WAIT_MS = 10_000

export default defineEventHandler(async (event): Promise<LoopSentenceResponse> => {
  await requireUser(event)

  const { sentence } = await readLocalizedBody(event, loopSentenceSchema)
  const { loopLlmProvider, loopLlmKey, loopLlmModel, loopLlmUrl } = useRuntimeConfig(event)
  if (!loopLlmKey) throw apiError(event, 503, 'api.loopSentenceUnavailable')

  const remaining = await consumeLoopSentenceQuota(event)
  let answer: unknown
  try {
    answer = await askLoopLlm(sentence, { provider: loopLlmProvider, key: loopLlmKey, model: loopLlmModel, url: loopLlmUrl, maxWaitMs: LOOP_LLM_MAX_WAIT_MS })
  }
  catch (error) {
    console.error('[POST /api/loops/understand]', (error as Error).message)
    const { status, key } = loopLlmFailure(error)
    throw apiError(event, status, key)
  }

  const understanding = loopUnderstandingSchema.safeParse(answer)
  const settings = understanding.success ? loopSettingsFromUnderstanding(understanding.data) : null
  if (!understanding.success) console.error('[POST /api/loops/understand] invalid answer', understanding.error.issues.slice(0, 3))
  if (!settings) throw apiError(event, 422, 'api.loopSentenceNotUnderstood')
  return { settings, quota_remaining: remaining }
})
