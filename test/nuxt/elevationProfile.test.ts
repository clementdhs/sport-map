import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import ElevationProfile from '~/components/ElevationProfile.vue'
import type { LngLat } from '#shared/utils/routes'

// 5 points ~1.1 km apart going north.
const coordinates: LngLat[] = [[6.1, 45.9], [6.1, 45.91], [6.1, 45.92], [6.1, 45.93], [6.1, 45.94]]
const elevations = [500, 520, 560, 540, 600]

async function mountProfile() {
  const wrapper = await mountSuspended(ElevationProfile, { props: { coordinates, elevations } })
  const plot = wrapper.get('[role="img"]')
  // happy-dom does no layout: give the plot a size so pointer positions can be mapped to distances.
  plot.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 128, right: 400, bottom: 128, x: 0, y: 0, toJSON: () => ({}) })
  return { wrapper, plot }
}

describe('ElevationProfile', () => {
  it('reports the hovered track position while the keyboard moves along the profile', async () => {
    const { wrapper, plot } = await mountProfile()
    await plot.trigger('keydown', { key: 'ArrowRight' })
    await plot.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('hover')).toEqual([[coordinates[1]], [coordinates[2]]])
    expect(wrapper.text()).toContain('560 m')
  })

  it('follows a pointer, finger included, and clears the position when it leaves', async () => {
    const { wrapper, plot } = await mountProfile()
    await plot.trigger('pointermove', { clientX: 400 }) // right end
    await plot.trigger('pointermove', { clientX: 0 }) // left end
    await plot.trigger('pointerleave')
    expect(wrapper.emitted('hover')).toEqual([[coordinates[4]], [coordinates[0]], [null]])
  })

  it('clears the position when the profile disappears', async () => {
    const { wrapper, plot } = await mountProfile()
    await plot.trigger('pointermove', { clientX: 200 })
    wrapper.unmount()
    expect(wrapper.emitted('hover')!.at(-1)).toEqual([null])
  })
})
