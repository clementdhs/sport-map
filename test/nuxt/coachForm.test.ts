import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { LoadOuting } from '#shared/utils/trainingForm'
import CoachFormCard from '~/components/CoachFormCard.vue'

// The form card of the coach page (#263): the state with its gauge and sentence, or the start card while the coach
// is still learning.
function outing(daysAgo: number, km = 10): LoadOuting {
  return {
    sport_type: 'running',
    distance_m: km * 1000,
    elevation_gain_m: 0,
    completed_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  }
}

describe('CoachFormCard', () => {
  it('shows the start card with the days covered while learning', async () => {
    const card = await mountSuspended(CoachFormCard, { props: { outings: [outing(9), outing(6), outing(0)] } })
    expect(card.find('[data-testid="coach-form-card"]').exists()).toBe(false)
    const start = card.get('[data-testid="coach-form-start"]')
    expect(start.text()).toContain('Le coach apprend à te connaître')
    expect(start.text()).toContain('Encore 11 jours.')
    const days = start.findAll('[data-day]').map(day => day.attributes('data-day'))
    expect(days).toHaveLength(21)
    expect(days.slice(0, 10)).toEqual(['outing', 'rest', 'rest', 'outing', 'rest', 'rest', 'rest', 'rest', 'rest', 'outing'])
    expect(days.slice(10).every(day => day === 'future')).toBe(true)
    expect(start.get('[role="img"]').attributes('aria-label')).toBe('10 jours sur 21 écoulés, 3 avec une sortie')
    expect(start.text()).toContain('Il y a 9 jours')
  })

  it('shows the state, the gauge and the sentence once it knows the member', async () => {
    // 20 km-effort a week for 4 weeks (and a longer history), then 30
    const outings = [...[7, 14, 21, 28].flatMap(start => [outing(start + 1), outing(start + 4)]), outing(1, 15), outing(3, 15), outing(45)]
    const card = await mountSuspended(CoachFormCard, { props: { outings } })
    const link = card.get('[data-testid="coach-form-card"]')
    expect(link.attributes('href')).toBe('/coach/forme')
    expect(link.attributes('data-state')).toBe('progress')
    expect(link.text()).toContain('En progression')
    expect(link.text()).toContain('7 derniers jours : 30 km-effort, 50 % de plus que ton fond (20 / sem.). Continue, sans en rajouter.')
    expect(link.get('[role="meter"]').attributes('aria-valuetext')).toBe('Rapport entre tes 7 derniers jours et ton fond : × 1,5')
    expect(link.get('[data-testid="form-gauge-needle"]').attributes('style')).toContain('left: 75%')
  })
})
