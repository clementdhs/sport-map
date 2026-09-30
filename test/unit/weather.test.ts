import { describe, expect, it } from 'vitest'
import { halfDayForecasts, localTime, type OpenMeteoHourly, weatherKind, worstWeather } from '#shared/utils/weather'

// Two days of hourly forecast (local time), with rain on the second afternoon.
function forecast(): OpenMeteoHourly {
  const time: string[] = []
  for (const day of ['2026-09-28', '2026-09-29']) {
    for (let h = 0; h < 24; h++) time.push(`${day}T${String(h).padStart(2, '0')}:00`)
  }
  const rainy = (i: number) => i >= 24 + 14 && i < 24 + 17
  return {
    time,
    temperature_2m: time.map((_, i) => 10 + (i % 24) / 2),
    precipitation: time.map((_, i) => (rainy(i) ? 1.5 : 0)),
    precipitation_probability: time.map((_, i) => (rainy(i) ? 80 : 5)),
    weather_code: time.map((_, i) => (rainy(i) ? 63 : 1)),
    wind_speed_10m: time.map((_, i) => 5 + (i % 3)),
    wind_gusts_10m: time.map((_, i) => 12 + (i % 5)),
  }
}

describe('halfDayForecasts', () => {
  it('sums up each morning (6-12 h) and afternoon (12-18 h), in order', () => {
    const [morning, afternoon, nextMorning, nextAfternoon] = halfDayForecasts(forecast(), '2026-09-28T05:00', 6)
    expect(morning).toMatchObject({ date: '2026-09-28', period: 'morning', tempMin: 13, tempMax: 16, precipitationMm: 0 })
    expect(afternoon).toMatchObject({ date: '2026-09-28', period: 'afternoon', tempMin: 16, tempMax: 19 })
    expect(nextMorning!.period).toBe('morning')
    expect(nextAfternoon).toMatchObject({ precipitationMm: 4.5, precipitationProbability: 80, weatherCode: 63, windMaxKmh: 7, gustMaxKmh: 16 })
  })

  it('skips the half-days already over, and keeps `count` of them', () => {
    const forecasts = halfDayForecasts(forecast(), '2026-09-28T13:30', 2)
    expect(forecasts.map(f => `${f.date} ${f.period}`)).toEqual(['2026-09-28 afternoon', '2026-09-29 morning'])
  })
})

describe('localTime', () => {
  it('gives the local time Open-Meteo uses', () => {
    expect(localTime(new Date('2026-09-28T10:15:00Z'), 7200)).toBe('2026-09-28T12:15')
  })
})

describe('weather codes', () => {
  it('keeps the most severe weather, snow over rain showers despite its lower code', () => {
    expect(worstWeather([0, 3, 61, 1])).toBe(61)
    expect(worstWeather([80, 73])).toBe(73)
    expect(worstWeather([95, 75])).toBe(95)
  })

  it('names them in French', () => {
    expect(weatherKind(0).kind).toBe('sunny')
    expect(weatherKind(81).kind).toBe('rain')
    expect(weatherKind(75).kind).toBe('snow')
    expect(weatherKind(96).icon).toBe('i-lucide-cloud-lightning')
  })
})
