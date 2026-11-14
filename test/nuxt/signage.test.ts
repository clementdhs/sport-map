import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { UApp } from '#components'
import DoneStamp from '~/components/DoneStamp.vue'
import DurationSign from '~/components/DurationSign.vue'
import HerePlate from '~/components/HerePlate.vue'
import KeyFigures from '~/components/KeyFigures.vue'
import SportMark from '~/components/sport/SportMark.vue'

// The trail signage components (#229): the yellow is never the only information, the text is always there.
describe('DurationSign', () => {
  it('shows the duration and names it for screen readers', async () => {
    const sign = await mountSuspended(DurationSign, { props: { minutes: 155 } })
    expect(sign.get('[aria-hidden="true"]').text()).toBe('2 h 35')
    expect(sign.get('.sr-only').text()).toBe('Durée estimée : 2 h 35')
  })

  it('shows nothing without a duration', async () => {
    const sign = await mountSuspended(DurationSign, { props: { minutes: null } })
    expect(sign.text()).toBe('')
    expect(sign.find('.duration-sign').exists()).toBe(false)
  })

  it('comes in two sizes', async () => {
    const small = await mountSuspended(DurationSign, { props: { minutes: 45, size: 'sm' } })
    expect(small.get('.duration-sign').classes()).toContain('sm')
    expect(small.get('.sr-only').text()).toBe('Durée estimée : 45 min')
    const medium = await mountSuspended(DurationSign, { props: { minutes: 45 } })
    expect(medium.get('.duration-sign').classes()).toContain('md')
  })
})

describe('DoneStamp', () => {
  it('stamps the number of outings', async () => {
    const stamp = await mountSuspended(DoneStamp, { props: { count: 3 } })
    expect(stamp.findAll('[aria-hidden="true"]').map(part => part.text())).toEqual(['Fait', '×3'])
    expect(stamp.get('.sr-only').text()).toBe('Fait 3 fois')
  })

  it('says once for a single outing', async () => {
    const stamp = await mountSuspended(DoneStamp, { props: { count: 1 } })
    expect(stamp.get('.sr-only').text()).toBe('Fait une fois')
  })

  it('shows nothing without any outing', async () => {
    const stamp = await mountSuspended(DoneStamp, { props: { count: 0 } })
    expect(stamp.find('.done-stamp').exists()).toBe(false)
    expect(stamp.text()).toBe('')
  })
})

describe('KeyFigures', () => {
  const figures = [
    { label: 'Distance', value: '21,40', unit: 'km' },
    { label: 'Durée', value: '2 h 35', highlight: true, hint: 'Allure de 8 min/km' },
    { label: 'Dénivelé +', value: '—' },
  ]

  // Tooltips need the app's tooltip provider.
  const mountCartouche = () => mountSuspended(defineComponent({ render: () => h(UApp, null, () => h(KeyFigures, { figures })) }))

  it('lists every figure with its label, one column each', async () => {
    const cartouche = await mountCartouche()
    expect(cartouche.findAll('dt').map(term => term.text())).toEqual(['Distance', 'Durée', 'Dénivelé +'])
    expect(cartouche.findAll('dd').map(value => value.text())).toEqual(['21,40 km', '2 h 35', '—'])
    expect(cartouche.get('dl').attributes('style')).toContain('repeat(3, minmax(0, 1fr))')
  })

  it('highlights one cell, still labelled, and explains it in a tooltip', async () => {
    const cartouche = await mountCartouche()
    const cells = cartouche.findAll('dl > div')
    expect(cells.map(cell => cell.classes().includes('bg-(--sign)'))).toEqual([false, true, false])
    expect(cells[1]!.find('[aria-label="Allure de 8 min/km"]').exists()).toBe(true)
    expect(cells[0]!.find('[aria-label]').exists()).toBe(false)
  })
})

describe('HerePlate', () => {
  it('says where one is and the altitude', async () => {
    const plate = await mountSuspended(HerePlate, { props: { place: 'Lille — Citadelle', altitudeM: 21.6 } })
    expect(plate.text().replace(/\s+/g, ' ')).toBe('Vous êtes ici · Lille — Citadelle · alt. 22 m')
  })

  it('leaves the altitude out when unknown', async () => {
    const plate = await mountSuspended(HerePlate, { props: { place: 'Lille', altitudeM: null } })
    expect(plate.text().replace(/\s+/g, ' ')).toBe('Vous êtes ici · Lille')
  })
})

describe('SportMark', () => {
  it('is decorative, in the sport\'s color', async () => {
    const mark = await mountSuspended(SportMark, { props: { sport: 'trail' } })
    expect(mark.attributes('aria-hidden')).toBe('true')
    expect(mark.classes()).toContain('sport-trail')
  })
})
