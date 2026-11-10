// Two-factor authentication with an authenticator app (TOTP, #253).

// Apps show their 6-digit codes split in two ("123 456"): spaces and dashes are dropped before checking.
export const normalizeTotpCode = (input: string) => input.replace(/[\s-]/g, '')

export const isTotpCode = (code: string) => /^\d{6}$/.test(code)

// The secret typed by hand when the QR code can't be scanned, in groups of four letters.
export const formatTotpSecret = (secret: string) => secret.replace(/(.{4})(?=.)/g, '$1 ')

// Translation key of an error of mfa.verify / mfa.challengeAndVerify the member can act on; null for the others,
// shown as Supabase words them.
export function totpErrorKey(code: string | undefined): string | null {
  switch (code) {
    case 'mfa_verification_failed':
    case 'mfa_challenge_expired':
      return 'auth.mfa.invalidCode'
    case 'over_request_rate_limit':
      return 'auth.mfa.tooManyAttempts'
    default:
      return null
  }
}
