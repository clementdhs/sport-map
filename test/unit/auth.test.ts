import { describe, expect, it } from 'vitest'
import { isEmailLogin, newPasswordSchema, USERNAME_PATTERN, usernameLoginSchema } from '#shared/utils/auth'
import { profileUpdateSchema } from '#shared/utils/routes'

describe('isEmailLogin', () => {
  it('takes what has an @ for an e-mail, anything else for a username', () => {
    expect(isEmailLogin('clem@example.fr')).toBe(true)
    expect(isEmailLogin('@clem')).toBe(true)
    expect(isEmailLogin('clem')).toBe(false)
    expect(isEmailLogin('Clem_59')).toBe(false)
    expect(isEmailLogin('user_0a1b2c3d4e')).toBe(false)
  })
})

describe('usernameLoginSchema', () => {
  it('trims the username and keeps the password as typed', () => {
    expect(usernameLoginSchema.parse({ username: '  Clem ', password: ' secret ' })).toEqual({ username: 'Clem', password: ' secret ' })
  })

  it('accepts usernames the profile pattern rejects, so they get the same answer as unknown ones', () => {
    expect(usernameLoginSchema.safeParse({ username: 'clé', password: 'x' }).success).toBe(true)
  })

  it('needs both fields', () => {
    expect(usernameLoginSchema.safeParse({ username: '  ', password: 'x' }).error?.issues[0]?.message).toBe('auth.identifierRequired')
    expect(usernameLoginSchema.safeParse({ username: 'clem', password: '' }).error?.issues[0]?.message).toBe('auth.passwordRequired')
  })
})

describe('newPasswordSchema', () => {
  const check = (password: string) => newPasswordSchema.safeParse({ password, confirm: password })

  it('asks for at least 10 characters, like the hosted Supabase project', () => {
    expect(check('a'.repeat(9)).error?.issues[0]?.message).toBe('validation.minChars')
    expect(check('a'.repeat(10)).success).toBe(true)
  })
})

describe('profile username', () => {
  const update = (username: string) => profileUpdateSchema.safeParse({ username, display_name: '', bio: '' })

  it('follows the database check: 3 to 30 letters, digits or _', () => {
    expect(USERNAME_PATTERN.test('Clem_59')).toBe(true)
    expect(update(' lea ').data?.username).toBe('lea')
    expect(update('ab').error?.issues[0]?.message).toBe('validation.usernameFormat')
    expect(update('a'.repeat(31)).success).toBe(false)
    expect(update('léa').success).toBe(false)
    expect(update('le a').success).toBe(false)
  })
})
