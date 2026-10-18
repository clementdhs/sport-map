import { describe, expect, it } from 'vitest'
import type { Climb } from '#shared/utils/slopes'
import {
  announcedClimbs,
  CLIMB_NOTICE_M,
  DEFAULT_VOICE_PREFS,
  durationParts,
  guide,
  type GuideInput,
  type GuideState,
  parseVoicePrefs,
  startGuide,
  TRACK_REPEAT_MS,
} from '~/utils/voiceGuide'

const input = (over: Partial<GuideInput> = {}): GuideInput => ({
  now: 0,
  elapsedS: 0,
  distanceM: 0,
  averageSpeedMs: null,
  doneM: 0,
  offTrack: false,
  arrived: false,
  ...over,
})

// Runs the guide over successive inputs, returning every announcement kind.
function run(inputs: GuideInput[], climbs: Climb[] = [], state: GuideState = startGuide(0)) {
  const said: ReturnType<typeof guide>['announcements'] = []
  for (const i of inputs) {
    const result = guide(state, i, climbs)
    state = result.state
    said.push(...result.announcements)
  }
  return { said, state }
}

describe('guide', () => {
  it('announces leaving the route and getting back on it', () => {
    const { said } = run([input({ now: 1000, offTrack: true }), input({ now: 2000, offTrack: true }), input({ now: 30_000 })])
    expect(said.map(a => a.kind)).toEqual(['offTrack', 'backOnTrack'])
  })

  it('stays quiet when the GPS swings around the off-track limit', () => {
    const inputs = Array.from({ length: 10 }, (_, i) => input({ now: i * 5000, offTrack: i % 2 === 0 }))
    expect(run(inputs).said.map(a => a.kind)).toEqual(['offTrack', 'backOnTrack'])
    // Once the repeat delay is over, leaving again is announced.
    const later = run([...inputs, input({ now: TRACK_REPEAT_MS + 1000, offTrack: true })]).said
    expect(later.map(a => a.kind)).toEqual(['offTrack', 'backOnTrack', 'offTrack'])
  })

  it('announces each kilometre with its time and the time of the last one', () => {
    const { said } = run([
      input({ now: 300_000, elapsedS: 300, distanceM: 1005, averageSpeedMs: 3.3 }),
      input({ now: 310_000, elapsedS: 310, distanceM: 1040 }),
      input({ now: 580_000, elapsedS: 580, distanceM: 2001, averageSpeedMs: 3.4 }),
    ])
    expect(said).toEqual([
      { kind: 'kilometre', km: 1, elapsedS: 300, splitS: 300, averageSpeedMs: 3.3 },
      { kind: 'kilometre', km: 2, elapsedS: 580, splitS: 280, averageSpeedMs: 3.4 },
    ])
  })

  it('announces only the last kilometre after a gap, with the average time per kilometre', () => {
    const { said } = run([input({ now: 600_000, elapsedS: 600, distanceM: 2100 })])
    expect(said).toEqual([{ kind: 'kilometre', km: 2, elapsedS: 600, splitS: 300, averageSpeedMs: null }])
  })

  it('announces a climb once, ahead of it, with the distance rounded to 100 m', () => {
    const climb: Climb = { startM: 2000, endM: 3200, gainM: 84, averageGrade: 7 }
    const { said } = run([
      input({ doneM: 1500 }),
      input({ doneM: 2000 - CLIMB_NOTICE_M + 20 }),
      input({ doneM: 1900 }),
      input({ doneM: 2100 }),
    ], [climb])
    expect(said).toEqual([{ kind: 'climb', inM: 300, lengthM: 1200, grade: 7 }])
  })

  it('skips climbs already started and waits to be back on the route', () => {
    const climbs: Climb[] = [
      { startM: 100, endM: 900, gainM: 60, averageGrade: 7.5 },
      { startM: 2000, endM: 2500, gainM: 40, averageGrade: 8 },
    ]
    const { said } = run([
      input({ doneM: 500 }),
      input({ doneM: 1900, offTrack: true }),
      input({ now: 70_000, doneM: 1950 }),
    ], climbs)
    expect(said.map(a => a.kind)).toEqual(['offTrack', 'backOnTrack', 'climb'])
    expect(said.at(-1)).toMatchObject({ inM: 100, lengthM: 500 })
  })

  it('announces the arrival once', () => {
    const { said } = run([input({ arrived: true }), input({ arrived: false }), input({ arrived: true })])
    expect(said.map(a => a.kind)).toEqual(['arrived'])
  })
})

describe('announcedClimbs', () => {
  it('leaves out long false flats', () => {
    const climbs: Climb[] = [
      { startM: 0, endM: 3000, gainM: 60, averageGrade: 2 },
      { startM: 4000, endM: 4500, gainM: 40, averageGrade: 8 },
    ]
    expect(announcedClimbs(climbs)).toEqual([climbs[1]])
  })
})

describe('parseVoicePrefs', () => {
  it('reads saved choices and ignores unknown ones', () => {
    expect(parseVoicePrefs({ enabled: true, announcements: ['climbs', 'track', 'other'] }))
      .toEqual({ enabled: true, announcements: ['track', 'climbs'] })
  })

  it('falls back to the defaults on missing or damaged values', () => {
    expect(parseVoicePrefs(null)).toEqual(DEFAULT_VOICE_PREFS)
    expect(parseVoicePrefs('on')).toEqual(DEFAULT_VOICE_PREFS)
    expect(parseVoicePrefs({ enabled: 'yes' })).toEqual(DEFAULT_VOICE_PREFS)
  })
})

describe('durationParts', () => {
  it('splits a duration, leaving out seconds beyond an hour', () => {
    expect(durationParts(312.4)).toEqual({ hours: 0, minutes: 5, seconds: 12 })
    expect(durationParts(3725)).toEqual({ hours: 1, minutes: 2, seconds: 0 })
  })
})
