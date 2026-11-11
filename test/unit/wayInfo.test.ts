import { describe, expect, it } from 'vitest'
import type { WayInfo } from '#shared/utils/routes'
import {
  classGradient, classShares, DIFFICULTY_CLASSES, difficultyClass, difficultyRuns, difficultyScale, hasDifficulty,
  joinWayInfo, pathShare, reverseWayInfo, sliceWayInfo, SURFACE_CLASSES, surfaceClass, surfaceRuns,
} from '#shared/utils/wayInfo'

const [PAVED, UNPAVED, TRAIL, UNKNOWN] = [0, 1, 2, 3]

describe('surfaceClass', () => {
  it('reads the surface first', () => {
    expect(surfaceClass(3, 4)).toBe(PAVED) // asphalt path
    expect(surfaceClass(14, 7)).toBe(PAVED) // paving stones footway
    expect(surfaceClass(10, 5)).toBe(UNPAVED) // gravel track
    expect(surfaceClass(8, 6)).toBe(UNPAVED) // compacted cycleway (greenway)
    expect(surfaceClass(12, 4)).toBe(TRAIL) // ground path
    expect(surfaceClass(11, 8)).toBe(TRAIL) // dirt steps
  })

  it('falls back on the way type without a surface tag', () => {
    expect(surfaceClass(0, 1)).toBe(PAVED)
    expect(surfaceClass(0, 3)).toBe(PAVED)
    expect(surfaceClass(0, 4)).toBe(TRAIL)
    expect(surfaceClass(0, 5)).toBe(UNPAVED)
    expect(surfaceClass(0, 7)).toBe(UNKNOWN)
    expect(surfaceClass(undefined, undefined)).toBe(UNKNOWN)
  })
})

describe('difficulty', () => {
  it('groups the hardest grades and keeps untagged ways apart', () => {
    expect([0, 1, 2, 3, 4, 6, 7].map(difficultyClass)).toEqual([4, 0, 1, 2, 3, 3, 3])
    expect(DIFFICULTY_CLASSES.sac[difficultyClass(undefined)]!.key).toBe('unknown')
  })

  it('uses the MTB scale for cycling sports and the SAC scale otherwise', () => {
    expect(difficultyScale('mountain_biking')).toBe('mtb')
    expect(difficultyScale('cycling')).toBe('mtb')
    expect(difficultyScale('trail')).toBe('sac')
    expect(difficultyScale('hiking')).toBe('sac')
  })

  it('has something to show only when a way is graded', () => {
    expect(hasDifficulty([[0, 4, 0]])).toBe(false)
    expect(hasDifficulty([[0, 2, 0], [2, 4, 2]])).toBe(true)
  })
})

describe('runs and shares', () => {
  // 5 points, 100 m apart.
  const along = [0, 100, 200, 300, 400]
  const info: WayInfo = {
    surface: [[0, 1, 3], [1, 2, 0], [2, 3, 12]],
    waytype: [[0, 1, 3], [1, 3, 4]],
    sac_scale: [[0, 2, 0], [2, 3, 2]],
    mtb_scale: [],
  }

  it('classes each stretch, with the part not covered as unknown', () => {
    // asphalt street, then an untagged path and a ground path (both trails), then nothing known.
    expect(surfaceRuns(info, along)).toEqual([
      { startM: 0, endM: 100, cls: PAVED },
      { startM: 100, endM: 300, cls: TRAIL },
      { startM: 300, endM: 400, cls: UNKNOWN },
    ])
    expect(difficultyRuns(info.sac_scale, along)).toEqual([
      { startM: 0, endM: 200, cls: 4 },
      { startM: 200, endM: 300, cls: 1 },
      { startM: 300, endM: 400, cls: 4 },
    ])
  })

  it('sums the share of each class, in class order', () => {
    expect(classShares(surfaceRuns(info, along))).toEqual([
      { cls: PAVED, share: 0.25 },
      { cls: TRAIL, share: 0.5 },
      { cls: UNKNOWN, share: 0.25 },
    ])
    expect(classShares(difficultyRuns(info.sac_scale, along))).toEqual([{ cls: 1, share: 0.25 }, { cls: 4, share: 0.75 }])
  })

  it('colours the track with a stop at each change of class', () => {
    expect(classGradient(surfaceRuns(info, along), SURFACE_CLASSES, 400)).toEqual([
      'step', ['line-progress'], SURFACE_CLASSES[PAVED].color, 0.25, SURFACE_CLASSES[TRAIL].color, 0.75, SURFACE_CLASSES[UNKNOWN].color,
    ])
  })
})

describe('editing way info', () => {
  const info: WayInfo = { surface: [[0, 2, 3], [2, 4, 11]], waytype: [[0, 4, 4]], sac_scale: [], mtb_scale: [] }

  it('slices a part of the track, renumbered from 0', () => {
    expect(sliceWayInfo(info, 1, 3)).toEqual({ surface: [[0, 1, 3], [1, 2, 11]], waytype: [[0, 2, 4]], sac_scale: [], mtb_scale: [] })
    expect(sliceWayInfo(info, 2, 4)!.surface).toEqual([[0, 2, 11]])
    expect(sliceWayInfo(null, 0, 4)).toBeNull()
    expect(sliceWayInfo({ ...info, surface: [], waytype: [[0, 1, 4]] }, 2, 4)).toBeNull()
  })

  it('reverses the ranges for the way back', () => {
    expect(reverseWayInfo(info, 5).surface).toEqual([[0, 2, 11], [2, 4, 3]])
  })

  it('joins parts at their offset, merging a value that goes on', () => {
    const part: WayInfo = { surface: [[0, 2, 11]], waytype: [], sac_scale: [], mtb_scale: [] }
    expect(joinWayInfo([{ info, offset: 0 }, { info: null, offset: 4 }, { info: part, offset: 6 }])!.surface)
      .toEqual([[0, 2, 3], [2, 4, 11], [6, 8, 11]])
    expect(joinWayInfo([{ info, offset: 0 }, { info: part, offset: 4 }])!.surface).toEqual([[0, 2, 3], [2, 6, 11]])
    expect(joinWayInfo([{ info: null, offset: 0 }])).toBeNull()
  })
})

describe('pathShare (#295)', () => {
  // Five edges of 100 m: asphalt road, gravel track, path without a surface tag, footway without one, asphalt.
  const along = [0, 100, 200, 300, 400, 500]
  const info: WayInfo = {
    surface: [[0, 1, 3], [1, 2, 8], [4, 5, 3]],
    waytype: [[0, 1, 2], [1, 2, 5], [2, 3, 4], [3, 4, 7], [4, 5, 3]],
    sac_scale: [],
    mtb_scale: [],
  }

  it('gives the share of the length on unpaved ways and trails, unknown ways counting as not paths', () => {
    // Gravel track and path: 200 m out of 500.
    expect(pathShare(info, along)).toBeCloseTo(0.4)
  })

  it('gives nothing without way info', () => {
    expect(pathShare(null, along)).toBeNull()
    expect(pathShare(info, [0])).toBeNull()
  })
})
