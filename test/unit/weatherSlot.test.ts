import { describe, expect, it } from 'vitest'
import { bestSlot, type SlotForecast, type SlotHour, usualStart } from '#shared/utils/weatherSlot'

const DATE = '2026-11-10'
const time = (h: number) => `${DATE}T${String(h).padStart(2, '0')}:00`

// A day of 24 hours, mild, dry and calm unless `hour` says otherwise; sunrise 07:50, sunset 17:20.
function day(hour: (h: number) => Partial<SlotHour> = () => ({})): SlotForecast {
  return {
    hours: Array.from({ length: 24 }, (_, h) => ({ time: time(h), temperature: 12, precipitationMm: 0, windKmh: 10, ...hour(h) })),
    daylight: [{ date: DATE, sunrise: `${DATE}T07:50`, sunset: `${DATE}T17:20` }],
  }
}

const startHour = (forecast: SlotForecast, now: string, minutes: number) => {
  const result = bestSlot(forecast, `${DATE}T${now}`, minutes)
  return result.slot ? result.slot.startMin / 60 : result.reason
}

describe('bestSlot', () => {
  it('starts on the hour, from sunrise or now, and takes the earliest of equal slots', () => {
    expect(startHour(day(), '06:00', 60)).toBe(8)
    expect(startHour(day(), '10:20', 60)).toBe(11)
    expect(startHour(day(), '13:00', 60)).toBe(13)
  })

  it('puts rain first, then wind, then the temperature', () => {
    // Dry but windy and cold at 9, rainy and mild at 10: the dry hour wins.
    const rainOrWind = day(h => (h === 10 ? { precipitationMm: 0.4 } : h === 9 ? { windKmh: 45, temperature: 2 } : { precipitationMm: 2 }))
    expect(startHour(rainOrWind, '08:30', 60)).toBe(9)
    // All dry: calm and hot beats windy and mild.
    const windOrHeat = day(h => (h === 14 ? { temperature: 24 } : { windKmh: 35 }))
    expect(startHour(windOrHeat, '08:00', 60)).toBe(14)
    // Dry and calm: the temperature closest to 8–15 °C.
    const cold = day(h => ({ temperature: h }))
    expect(startHour(cold, '07:00', 60)).toBe(8)
    const warm = day(h => ({ temperature: 10 + h }))
    expect(startHour(warm, '07:00', 60)).toBe(8)
    expect(startHour(day(h => ({ temperature: 30 - h })), '07:00', 60)).toBe(15)
  })

  it('ignores differences of wind under 5 km/h, so the temperature can decide', () => {
    const forecast = day(h => (h === 8 ? { windKmh: 11, temperature: 3 } : { windKmh: 13 }))
    expect(startHour(forecast, '07:00', 60)).toBe(9)
  })

  it('weighs the last hour of a slot by the share it covers', () => {
    // 1 h 30 from 12: all of 12, half of 13.
    const forecast = day(h => ({ temperature: h === 12 ? 10 : 13, precipitationMm: h >= 12 ? 0 : 1 }))
    const result = bestSlot(forecast, `${DATE}T11:30`, 90)
    expect(result.slot).toEqual({ startMin: 720, endMin: 810, temperature: 11, precipitationMm: 0, windMaxKmh: 10 })
    expect(result.slot && result.band.map(cell => [cell.hour, cell.inSlot])).toEqual([
      [12, true], [13, true], [14, false], [15, false], [16, false], [17, false],
    ])
  })

  it('on a day of rain, still picks the least wet slot', () => {
    const forecast = day(h => ({ precipitationMm: h === 15 ? 0.3 : 1.5 }))
    const result = bestSlot(forecast, `${DATE}T08:00`, 60)
    expect(result.slot).toMatchObject({ startMin: 15 * 60, precipitationMm: 0.3 })
    expect(result.slot && result.band.every(cell => cell.rain)).toBe(true)
  })

  it('in the evening: no slot after sunset, nor one that would end after it', () => {
    expect(bestSlot(day(), `${DATE}T18:10`, 30)).toEqual({ slot: null, reason: 'dark' })
    // From 16:40, 17:00 is the only start left: 17:00–17:20 is all the daylight there is.
    expect(bestSlot(day(), `${DATE}T16:40`, 30)).toEqual({ slot: null, reason: 'short' })
    expect(startHour(day(), '15:40', 60)).toBe(16)
  })

  it('has no slot for a session longer than the daylight left', () => {
    // From 15:30, 16:00 to 17:20 leaves 1 h 20.
    expect(bestSlot(day(), `${DATE}T15:30`, 120)).toEqual({ slot: null, reason: 'short' })
    expect(bestSlot(day(), `${DATE}T15:30`, 90)).toEqual({ slot: null, reason: 'short' })
    expect(startHour(day(), '15:30', 60)).toBe(16)
  })

  it('centres the band of 6 hours on the slot, within the daylight hours left', () => {
    const forecast = day(h => ({ precipitationMm: h === 17 ? 0 : 1, windKmh: h === 16 ? 40 : 10 }))
    const result = bestSlot(forecast, `${DATE}T08:00`, 15)
    expect(result.slot?.startMin).toBe(17 * 60)
    // The band ends at 17, the last hour that starts before sunset.
    expect(result.slot && result.band.map(cell => cell.hour)).toEqual([12, 13, 14, 15, 16, 17])
    expect(result.slot && result.band.at(-2)).toMatchObject({ windy: true, rain: true, inSlot: false })
    // Late in the day, fewer hours are left.
    const late = bestSlot(day(), `${DATE}T14:10`, 60)
    expect(late.slot && late.band.map(cell => cell.hour)).toEqual([15, 16, 17])
  })

  it('has no slot without the forecast of the day', () => {
    expect(bestSlot(day(), '2026-11-11T09:00', 60)).toEqual({ slot: null, reason: 'dark' })
    expect(bestSlot({ ...day(), daylight: [] }, `${DATE}T09:00`, 60)).toEqual({ slot: null, reason: 'dark' })
  })
})

describe('usualStart', () => {
  const place = (lat: number, lng: number, elevation: number | null = null) => ({ lat, lng, elevation })

  it('picks the square most outings start from, by its newest route', () => {
    const home = place(48.851, 2.351, 35)
    expect(usualStart([place(45.1, 5.7), home, place(48.852, 2.349, 40), place(45.1, 5.7)])).toEqual(place(45.1, 5.7))
    expect(usualStart([place(45.1, 5.7), home, place(48.852, 2.349, 40)])).toEqual(home)
  })

  it('takes the newest square on a tie, and none without outings', () => {
    expect(usualStart([place(45.1, 5.7), place(48.85, 2.35)])).toEqual(place(45.1, 5.7))
    expect(usualStart([])).toBeNull()
  })
})
