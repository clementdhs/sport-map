import { describe, expect, it } from 'vitest'
import { isExpectedHttpError, prepareErrorEvent, scrubUrl } from '#shared/utils/errorReporting'

describe('scrubUrl', () => {
  it('removes access tokens from URLs, and only them', () => {
    expect(scrubUrl('https://site/reset-password?token_hash=abc123&type=recovery'))
      .toBe('https://site/reset-password?token_hash=[retiré]&type=recovery')
    expect(scrubUrl('https://site/confirm?code=xyz')).toBe('https://site/confirm?code=[retiré]')
    expect(scrubUrl('https://site/#access_token=aaa&refresh_token=bbb'))
      .toBe('https://site/#access_token=[retiré]&refresh_token=[retiré]')
    expect(scrubUrl('https://site/routes?zipcode=74000')).toBe('https://site/routes?zipcode=74000')
  })
})

describe('isExpectedHttpError', () => {
  it('treats 3xx and 4xx as normal use, not as bugs', () => {
    expect(isExpectedHttpError({ statusCode: 404 })).toBe(true)
    expect(isExpectedHttpError({ status: 401 })).toBe(true)
    expect(isExpectedHttpError({ statusCode: 500 })).toBe(false)
    expect(isExpectedHttpError(new Error('boom'))).toBe(false)
    expect(isExpectedHttpError(null)).toBe(false)
  })
})

describe('prepareErrorEvent', () => {
  it('drops expected errors', () => {
    expect(prepareErrorEvent({}, { originalException: { statusCode: 404 } })).toBeNull()
  })

  it('scrubs the URL of the event and of its breadcrumbs', () => {
    const event = prepareErrorEvent({
      request: { url: 'https://site/reset-password?token_hash=abc', query_string: 'token_hash=abc&type=recovery' },
      breadcrumbs: [{ data: { from: '/reset-password?token_hash=abc', to: '/' } }],
    }, { originalException: new Error('boom') })!
    expect(event.request!.url).toBe('https://site/reset-password?token_hash=[retiré]')
    expect(event.request!.query_string).toBe('token_hash=[retiré]&type=recovery')
    expect(event.breadcrumbs![0]!.data!.from).toBe('/reset-password?token_hash=[retiré]')
  })
})
