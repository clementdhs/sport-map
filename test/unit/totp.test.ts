import { describe, expect, it } from 'vitest'
import { formatTotpSecret, isTotpCode, normalizeTotpCode, totpErrorKey } from '#shared/utils/totp'

describe('TOTP codes (#253)', () => {
  it('accepts a code typed as the apps show it', () => {
    expect(normalizeTotpCode('123 456')).toBe('123456')
    expect(normalizeTotpCode(' 123-456 ')).toBe('123456')
    expect(isTotpCode(normalizeTotpCode('123 456'))).toBe(true)
  })

  it('refuses anything but 6 digits', () => {
    expect(isTotpCode('12345')).toBe(false)
    expect(isTotpCode('1234567')).toBe(false)
    expect(isTotpCode('12a456')).toBe(false)
    expect(isTotpCode('')).toBe(false)
  })

  it('splits the secret in groups of four', () => {
    expect(formatTotpSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ')
    expect(formatTotpSecret('ABCDEFGH')).toBe('ABCD EFGH')
  })

  it('names the errors a member can act on', () => {
    expect(totpErrorKey('mfa_verification_failed')).toBe('auth.mfa.invalidCode')
    expect(totpErrorKey('mfa_challenge_expired')).toBe('auth.mfa.invalidCode')
    expect(totpErrorKey('over_request_rate_limit')).toBe('auth.mfa.tooManyAttempts')
    expect(totpErrorKey('unexpected_failure')).toBeNull()
    expect(totpErrorKey(undefined)).toBeNull()
  })
})
