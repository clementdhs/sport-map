import { describe, expect, it } from 'vitest'
import {
  LOOP_SENTENCE_JSON_SCHEMA,
  LOOP_SENTENCE_MAX_LENGTH,
  loopSentenceSchema,
  loopSettingsFromUnderstanding,
  loopUnderstandingSchema,
} from '#shared/utils/loopSentence'
import type { LoopUnderstanding } from '#shared/utils/loopSentence'

// What the LLM answers when it understood nothing: every field there, all empty.
const nothing: LoopUnderstanding = {
  understood: true,
  sport: null,
  distance_km: null,
  duration_min: null,
  approximate: false,
  shape: null,
  climb: null,
  start: null,
  places: [],
  elevation_gain: null,
  prefer_paths: null,
}

const understanding = (fields: Partial<LoopUnderstanding>): LoopUnderstanding => ({ ...nothing, ...fields })

describe('loopSentenceSchema', () => {
  it('trims the sentence', () => {
    expect(loopSentenceSchema.parse({ sentence: '  footing de 5 km  ' })).toEqual({ sentence: 'footing de 5 km' })
  })

  it('refuses an empty sentence', () => {
    expect(loopSentenceSchema.safeParse({ sentence: '   ' }).success).toBe(false)
  })

  it('refuses a sentence longer than the limit', () => {
    expect(loopSentenceSchema.safeParse({ sentence: 'a'.repeat(LOOP_SENTENCE_MAX_LENGTH + 1) }).success).toBe(false)
    expect(loopSentenceSchema.safeParse({ sentence: 'a'.repeat(LOOP_SENTENCE_MAX_LENGTH) }).success).toBe(true)
  })
})

describe('loopUnderstandingSchema', () => {
  it('accepts a complete answer', () => {
    const answer = understanding({ sport: 'running', distance_km: 5, start: { kind: 'my_point', name: null } })
    expect(loopUnderstandingSchema.parse(answer)).toEqual(answer)
  })

  it('refuses a sport the app does not have', () => {
    expect(loopUnderstandingSchema.safeParse({ ...nothing, sport: 'swimming' }).success).toBe(false)
  })

  it('refuses a negative or absurd distance', () => {
    expect(loopUnderstandingSchema.safeParse({ ...nothing, distance_km: -5 }).success).toBe(false)
    expect(loopUnderstandingSchema.safeParse({ ...nothing, distance_km: 1e9 }).success).toBe(false)
  })

  it('drops fields the schema does not know, such as coordinates', () => {
    const parsed = loopUnderstandingSchema.parse({ ...nothing, coordinates: [5.7, 45.2], start: { kind: 'place', name: 'Eupen', lng: 6 } })
    expect(parsed).not.toHaveProperty('coordinates')
    expect(parsed.start).toEqual({ kind: 'place', name: 'Eupen' })
  })

  it('refuses an answer with a missing field', () => {
    const { climb: _climb, ...withoutClimb } = nothing
    expect(loopUnderstandingSchema.safeParse(withoutClimb).success).toBe(false)
  })
})

describe('LOOP_SENTENCE_JSON_SCHEMA', () => {
  // Strict structured outputs (Groq, OpenAI) want every property required and no other property allowed.
  it('requires every property and allows no other, at every level', () => {
    const walk = (schema: Record<string, unknown>) => {
      if (schema.properties) {
        const properties = schema.properties as Record<string, Record<string, unknown>>
        expect(schema.additionalProperties).toBe(false)
        expect([...(schema.required as string[])].sort()).toEqual(Object.keys(properties).sort())
        Object.values(properties).forEach(walk)
      }
      if (schema.items) walk(schema.items as Record<string, unknown>)
      for (const branch of (schema.anyOf as Record<string, unknown>[] | undefined) ?? []) walk(branch)
    }
    walk(LOOP_SENTENCE_JSON_SCHEMA)
  })

  it('describes the same fields as the validation schema', () => {
    expect(Object.keys(LOOP_SENTENCE_JSON_SCHEMA.properties).sort()).toEqual(Object.keys(nothing).sort())
  })
})

describe('loopSettingsFromUnderstanding', () => {
  it('fills the sport, distance, precision, shape, climbing and start', () => {
    const settings = loopSettingsFromUnderstanding(understanding({
      sport: 'running',
      distance_km: 5,
      approximate: true,
      shape: 'out_and_back',
      climb: 'flat',
      start: { kind: 'my_point', name: null },
    }))
    expect(settings).toEqual({
      sport: 'running',
      target: { kind: 'distance', km: 5 },
      precision: 'range',
      shape: 'out_and_back',
      climb: 'flat',
      start: { kind: 'my_point' },
      place: null,
      paths: null,
      gain: null,
      ignored: [],
    })
  })

  it('leaves out what the sentence does not say, so the panel keeps its settings', () => {
    const settings = loopSettingsFromUnderstanding(understanding({ distance_km: 12 }))
    expect(settings).toEqual({ sport: null, target: { kind: 'distance', km: 12 }, precision: null, shape: null, climb: null, start: null, place: null, paths: null, gain: null, ignored: [] })
  })

  it('takes a duration when no distance is given', () => {
    expect(loopSettingsFromUnderstanding(understanding({ duration_min: 45 }))?.target).toEqual({ kind: 'duration', min: 45 })
  })

  it('prefers the distance when both are given', () => {
    expect(loopSettingsFromUnderstanding(understanding({ distance_km: 10, duration_min: 60 }))?.target).toEqual({ kind: 'distance', km: 10 })
  })

  it('rounds the distance to the km and the duration to 5 minutes, like the sliders', () => {
    expect(loopSettingsFromUnderstanding(understanding({ distance_km: 7.6 }))?.target).toEqual({ kind: 'distance', km: 8 })
    expect(loopSettingsFromUnderstanding(understanding({ duration_min: 47 }))?.target).toEqual({ kind: 'duration', min: 45 })
  })

  it('reports a distance or duration out of the sliders\' range instead of filling it', () => {
    const tooLong = loopSettingsFromUnderstanding(understanding({ sport: 'road_cycling', distance_km: 150 }))
    expect(tooLong?.target).toBeNull()
    expect(tooLong?.ignored).toEqual([{ kind: 'distance', text: '150 km' }])
    const tooShort = loopSettingsFromUnderstanding(understanding({ sport: 'running', duration_min: 5 }))
    expect(tooShort?.target).toBeNull()
    expect(tooShort?.ignored).toEqual([{ kind: 'duration', text: '5 min' }])
  })

  it('keeps the precision as it is when the sentence says nothing approximate', () => {
    expect(loopSettingsFromUnderstanding(understanding({ distance_km: 5, approximate: false }))?.precision).toBeNull()
  })

  it('turns a named place into a start to look for', () => {
    expect(loopSettingsFromUnderstanding(understanding({ distance_km: 5, start: { kind: 'place', name: '  Eupen ' } }))?.start)
      .toEqual({ kind: 'place', name: 'Eupen' })
  })

  it('ignores a named start without a name', () => {
    expect(loopSettingsFromUnderstanding(understanding({ distance_km: 5, start: { kind: 'place', name: ' ' } }))?.start).toBeNull()
  })

  it('fills the first named place to go through or head towards, with its words (#293)', () => {
    const settings = loopSettingsFromUnderstanding(understanding({
      sport: 'cycling',
      places: [{ name: 'Chartreuse', hint: 'en direction de', text: 'en direction de la Chartreuse' }],
    }))
    expect(settings?.place).toEqual({ name: 'Chartreuse', text: 'en direction de la Chartreuse' })
    expect(settings?.ignored).toEqual([])
  })

  it('reports the other places, since a loop goes through one named place only', () => {
    const settings = loopSettingsFromUnderstanding(understanding({
      places: [
        { name: 'Isère', hint: 'autour de', text: 'autour de l\'Isère' },
        { name: 'Bastille', hint: 'par', text: 'par la Bastille' },
      ],
    }))
    expect(settings?.place?.name).toBe('Isère')
    expect(settings?.ignored).toEqual([{ kind: 'via', text: 'par la Bastille' }])
  })

  it('fills a place alone: the loop can be generated from it', () => {
    expect(loopSettingsFromUnderstanding(understanding({ places: [{ name: 'Isère', hint: 'le long de', text: 'le long de l\'Isère' }] })))
      .not.toBeNull()
  })

  it('ignores a place without a name', () => {
    expect(loopSettingsFromUnderstanding(understanding({ distance_km: 5, places: [{ name: ' ', hint: 'par', text: 'par là' }] }))?.place).toBeNull()
  })

  it('fills a gain in metres, rounded to the slider step, even without a distance (#294)', () => {
    const settings = loopSettingsFromUnderstanding(understanding({ elevation_gain: { meters: 630, text: 'environ 630 m de D+' } }))
    expect(settings).toMatchObject({ target: null, gain: 650, ignored: [] })
  })

  it('keeps the distance with the gain: « 40 km avec 600 m de D+ » (#294)', () => {
    const settings = loopSettingsFromUnderstanding(understanding({ distance_km: 40, elevation_gain: { meters: 600, text: '600 m de D+' } }))
    expect(settings).toMatchObject({ target: { kind: 'distance', km: 40 }, gain: 600 })
  })

  it('drops the climbing level when a gain is given, which replaces it (#294)', () => {
    const settings = loopSettingsFromUnderstanding(understanding({ climb: 'hilly', elevation_gain: { meters: 600, text: '600 m de D+' } }))
    expect(settings).toMatchObject({ climb: null, gain: 600 })
  })

  it('reports a gain given with a duration, which it cannot combine (#294)', () => {
    const settings = loopSettingsFromUnderstanding(understanding({ duration_min: 120, elevation_gain: { meters: 800, text: '800 m of climbing' } }))
    expect(settings).toMatchObject({ target: { kind: 'duration', min: 120 }, gain: null, ignored: [{ kind: 'gain', text: '800 m of climbing' }] })
  })

  it('reports a gain out of the sliders range (#294)', () => {
    const settings = loopSettingsFromUnderstanding(understanding({ distance_km: 10, elevation_gain: { meters: 5000, text: '5000 m de D+' } }))
    expect(settings).toMatchObject({ gain: null, ignored: [{ kind: 'gain', text: '5000 m de D+' }] })
  })

  it('prefers paths when the sentence asks for them (#295)', () => {
    const settings = loopSettingsFromUnderstanding(understanding({ sport: 'running', prefer_paths: { text: 'sur du chemin' } }))
    expect(settings?.paths).toBe(true)
    expect(settings?.ignored).toEqual([])
    expect(loopSettingsFromUnderstanding(understanding({ distance_km: 5 }))?.paths).toBeNull()
  })

  it('quotes the paths back for a road ride, which has no such option', () => {
    const settings = loopSettingsFromUnderstanding(understanding({ sport: 'road_cycling', prefer_paths: { text: 'hors route' } }))
    expect(settings?.paths).toBeNull()
    expect(settings?.ignored).toEqual([{ kind: 'paths', text: 'hors route' }])
  })

  it('cuts the words it quotes to a short excerpt', () => {
    const settings = loopSettingsFromUnderstanding(understanding({ distance_km: 5, elevation_gain: { meters: 5000, text: 'x'.repeat(500) } }))
    expect(settings?.ignored[0]!.text.length).toBeLessThanOrEqual(80)
  })

  it('gives nothing when the LLM says it did not understand', () => {
    expect(loopSettingsFromUnderstanding(understanding({ understood: false, distance_km: 5 }))).toBeNull()
  })

  it('fills the paths alone', () => {
    expect(loopSettingsFromUnderstanding(understanding({ prefer_paths: { text: 'sur du chemin' } }))?.paths).toBe(true)
  })

  it('gives nothing when no setting could be filled', () => {
    expect(loopSettingsFromUnderstanding(nothing)).toBeNull()
    expect(loopSettingsFromUnderstanding(understanding({ approximate: true }))).toBeNull()
    // A gain out of range (#294) fills nothing either.
    expect(loopSettingsFromUnderstanding(understanding({ elevation_gain: { meters: 5000, text: '5000 m' } }))).toBeNull()
  })
})
