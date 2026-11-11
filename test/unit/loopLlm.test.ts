import { describe, expect, it } from 'vitest'
import { LoopLlmError, loopLlmFailure, retryAfterMs } from '../../server/utils/loopLlm'

describe('retryAfterMs', () => {
  it('reads the Retry-After header in seconds', () => {
    expect(retryAfterMs('2', '')).toBe(2000)
  })

  it('reads Groq\'s message in milliseconds or seconds', () => {
    expect(retryAfterMs(null, 'Rate limit reached … Please try again in 329.999999ms. Need more tokens?')).toBeCloseTo(330, 0)
    expect(retryAfterMs(null, 'Please try again in 7.5s.')).toBe(7500)
  })

  it('reads minutes and seconds', () => {
    expect(retryAfterMs(null, 'Please try again in 1m2.5s.')).toBe(62_500)
  })

  it('gives nothing when the provider does not say', () => {
    expect(retryAfterMs(null, 'Service unavailable')).toBeUndefined()
  })
})

describe('loopLlmFailure (#304)', () => {
  it('says the LLM is busy when it still refuses for its rate limit', () => {
    expect(loopLlmFailure(new LoopLlmError('LLM answered 429', 429, 4755))).toEqual({ status: 503, key: 'api.loopSentenceBusy' })
  })

  it('keeps the generic failure for other errors of the LLM', () => {
    expect(loopLlmFailure(new LoopLlmError('LLM answered 500', 500))).toEqual({ status: 502, key: 'api.loopSentenceFailed' })
    expect(loopLlmFailure(new LoopLlmError('LLM call failed: timeout'))).toEqual({ status: 502, key: 'api.loopSentenceFailed' })
    expect(loopLlmFailure(new Error('anything'))).toEqual({ status: 502, key: 'api.loopSentenceFailed' })
  })
})