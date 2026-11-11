import { describe, expect, it } from 'vitest'
import { loopSettingsFromUnderstanding, loopUnderstandingSchema } from '#shared/utils/loopSentence'
import { namedPlaceCore } from '#shared/utils/loops'
import { askLoopLlm } from '../../server/utils/loopLlm'
import { LOOP_SENTENCE_CASES } from './loopSentences'

// The reference sentences against the real LLM (#216), never in CI: `npm run test:loop-sentences`, with
// NUXT_LOOP_LLM_KEY (and optionally NUXT_LOOP_LLM_PROVIDER, _MODEL, _URL) in the environment or `.env`. Each one
// costs a request of the provider's free tier: run one after the other, waiting when the provider says so (about
// 6 minutes on Groq's free tier).
const env = process.env
const options = {
  provider: env.NUXT_LOOP_LLM_PROVIDER || 'groq',
  key: env.NUXT_LOOP_LLM_KEY ?? '',
  model: env.NUXT_LOOP_LLM_MODEL || 'openai/gpt-oss-120b',
  url: env.NUXT_LOOP_LLM_URL,
  // Groq's free tier takes about 5 sentences a minute: the series waits for its window rather than failing.
  maxWaitMs: 120_000,
}

describe.skipIf(!options.key)(`reference sentences (${options.provider}, ${options.model})`, () => {
  for (const { sentence, expected } of LOOP_SENTENCE_CASES) {
    it(sentence, async () => {
      const answer = await askLoopLlm(sentence, options)
      const settings = loopSettingsFromUnderstanding(loopUnderstandingSchema.parse(answer))
      if (expected === null) {
        expect(settings).toBeNull()
        return
      }
      expect(settings).not.toBeNull()
      const { ignored, place, ...fields } = expected
      expect(settings).toMatchObject(fields)
      expect(settings!.place && namedPlaceCore(settings!.place.name)).toBe(place === undefined ? null : namedPlaceCore(place))
      expect(settings!.ignored.map(part => part.kind).sort()).toEqual([...(ignored ?? [])].sort())
    })
  }
})
