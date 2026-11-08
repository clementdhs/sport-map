import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import TwoFactorSettings from '~/components/TwoFactorSettings.vue'

// Two-factor authentication (#253): Supabase's mfa calls are simulated, with an account holding `factors`.
type FakeFactor = { id: string, factor_type: 'totp', status: 'verified' | 'unverified', created_at: string, friendly_name?: string }
let factors: FakeFactor[] = []
const GOOD_CODE = '123456'

const mfa = {
  listFactors: vi.fn(async () => ({
    data: { all: factors, totp: factors.filter(factor => factor.status === 'verified'), phone: [], webauthn: [] },
    error: null,
  })),
  enroll: vi.fn(async () => {
    const factor: FakeFactor = { id: `factor-${factors.length + 1}`, factor_type: 'totp', status: 'unverified', created_at: '2026-11-08T10:00:00Z' }
    factors.push(factor)
    return { data: { id: factor.id, type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'JBSWY3DPEHPK3PXP', uri: '' } }, error: null }
  }),
  challengeAndVerify: vi.fn(async ({ factorId, code }: { factorId: string, code: string }) => {
    if (code !== GOOD_CODE) return { data: null, error: { code: 'mfa_verification_failed', message: 'Invalid TOTP code entered' } }
    factors.find(factor => factor.id === factorId)!.status = 'verified'
    return { data: {}, error: null }
  }),
  unenroll: vi.fn(async ({ factorId }: { factorId: string }) => {
    factors = factors.filter(factor => factor.id !== factorId)
    return { data: { id: factorId }, error: null }
  }),
  getAuthenticatorAssuranceLevel: vi.fn(),
}
const auth = { mfa, refreshSession: vi.fn(async () => ({ data: {}, error: null })) }
mockNuxtImport('useSupabaseClient', () => () => ({ auth }))

const claims = ref<{ sub: string, aal?: string } | null>(null)
mockNuxtImport('useSupabaseUser', () => () => claims)

beforeEach(() => {
  factors = []
  vi.clearAllMocks()
})

async function mountSettings() {
  const wrapper = await mountSuspended(TwoFactorSettings)
  await flushPromises()
  return wrapper
}

function button(wrapper: Awaited<ReturnType<typeof mountSettings>>, label: string) {
  const found = wrapper.findAll('button').find(candidate => candidate.text() === label)
  if (!found) throw new Error(`No "${label}" button in: ${wrapper.text()}`)
  return found
}

describe('TwoFactorSettings', () => {
  it('turns two-factor authentication on with a QR code and a first code', async () => {
    const wrapper = await mountSettings()
    expect(wrapper.text()).toContain('Désactivée')

    await button(wrapper, 'Activer la double authentification').trigger('click')
    await flushPromises()
    expect(mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', issuer: 'sportmap', friendlyName: expect.stringMatching(/^sportmap-\d+$/) })
    expect(wrapper.get('img').attributes('src')).toContain('data:image/svg+xml')
    expect(wrapper.get('[data-testid="totp-secret"]').text()).toBe('JBSW Y3DP EHPK 3PXP')

    // A wrong code is refused and the enrolment stays open.
    await wrapper.get('#totp-enrol-code').setValue('654321')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Code incorrect ou expiré')
    expect(wrapper.find('img').exists()).toBe(true)

    // Typed as the apps show it.
    await wrapper.get('#totp-enrol-code').setValue('123 456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mfa.challengeAndVerify).toHaveBeenLastCalledWith({ factorId: 'factor-1', code: GOOD_CODE })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('Activée')
    expect(wrapper.text()).toContain('Appli d\'authentification 1')
    // Room for a spare app.
    expect(button(wrapper, 'Ajouter une appli de secours').exists()).toBe(true)
  })

  it('checks the code format before asking Supabase', async () => {
    const wrapper = await mountSettings()
    await button(wrapper, 'Activer la double authentification').trigger('click')
    await flushPromises()
    await wrapper.get('#totp-enrol-code').setValue('12345')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Le code a 6 chiffres')
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled()
  })

  it('removes the factor of a cancelled enrolment, and one left from an earlier visit', async () => {
    factors = [{ id: 'stale', factor_type: 'totp', status: 'unverified', created_at: '2026-11-01T10:00:00Z' }]
    const wrapper = await mountSettings()
    await button(wrapper, 'Activer la double authentification').trigger('click')
    await flushPromises()
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale' })

    await button(wrapper, 'Annuler').trigger('click')
    await flushPromises()
    expect(mfa.unenroll).toHaveBeenLastCalledWith({ factorId: 'factor-1' })
    expect(factors).toEqual([])
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('offers no third app, and removes one after a confirmation', async () => {
    factors = [
      { id: 'a', factor_type: 'totp', status: 'verified', created_at: '2026-11-01T10:00:00Z', friendly_name: '' },
      { id: 'b', factor_type: 'totp', status: 'verified', created_at: '2026-11-02T10:00:00Z', friendly_name: 'sportmap-2' },
    ]
    const wrapper = await mountSettings()
    expect(wrapper.text()).toContain('Appli d\'authentification 2')
    expect(wrapper.findAll('button').some(candidate => candidate.text() === 'Ajouter une appli de secours')).toBe(false)

    await wrapper.findAll('button').filter(candidate => candidate.text() === 'Retirer')[1]!.trigger('click')
    expect(wrapper.text()).toContain('Ses codes ne seront plus acceptés')
    expect(mfa.unenroll).not.toHaveBeenCalled()
    await wrapper.findAll('button').filter(candidate => candidate.text() === 'Retirer').at(-1)!.trigger('click')
    await flushPromises()
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'b' })
    expect(auth.refreshSession).toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Ajoutée le 2 novembre 2026')
    expect(button(wrapper, 'Ajouter une appli de secours').exists()).toBe(true)
  })
})

describe('needsMfaCode', () => {
  it('asks for a code only on an aal1 session of an account with an app', async () => {
    claims.value = null
    expect(await needsMfaCode()).toBe(false)

    claims.value = { sub: 'me', aal: 'aal2' }
    expect(await needsMfaCode()).toBe(false)
    expect(mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled()

    claims.value = { sub: 'me', aal: 'aal1' }
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
    expect(await needsMfaCode()).toBe(false)
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    expect(await needsMfaCode()).toBe(true)
  })
})
