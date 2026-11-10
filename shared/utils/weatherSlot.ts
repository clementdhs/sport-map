import * as z from 'zod'

// The best weather slot of the day for the coach's session (#265): among the daylight hours left today, the
// start (on the hour) whose hours have the least rain, then the least wind, then a temperature closest to the
// 8–15 °C a run likes. Pure, from the hourly forecast of Open-Meteo (weather.ts), in the place's local time.

// One hour of forecast: `time` is Open-Meteo's local "YYYY-MM-DDTHH:mm" of its start.
export interface SlotHour {
  time: string
  temperature: number
  precipitationMm: number
  windKmh: number
}

// Sunrise and sunset of a local date ("YYYY-MM-DDTHH:mm").
export interface Daylight {
  date: string
  sunrise: string
  sunset: string
}

export interface SlotForecast {
  hours: SlotHour[]
  daylight: Daylight[]
}

// A cell of the 6-hour band: its hour, what to write in it, and whether the slot covers it.
export interface BandHour {
  hour: number
  temperature: number
  rain: boolean
  windy: boolean
  inSlot: boolean
}

export interface WeatherSlot {
  // Minutes since local midnight
  startMin: number
  endMin: number
  // Mean temperature over the slot (°C), rounded
  temperature: number
  // Rain over the slot (mm, to 0.1)
  precipitationMm: number
  // Strongest wind over the slot (km/h), rounded
  windMaxKmh: number
}

export type SlotResult =
  | { slot: WeatherSlot, band: BandHour[] }
  // dark: no daylight hour left today; short: some left, but not enough for the session
  | { slot: null, reason: 'dark' | 'short' }

// The range a run likes; beyond it, every degree counts.
export const IDEAL_TEMPERATURE = [8, 15] as const
// An hour with at least this much rain is written "pluie" in the band
export const RAINY_HOUR_MM = 0.1
// From this wind (km/h) an hour is written "vent", and the slot's sentence names it
export const WINDY_KMH = 30
export const BAND_HOURS = 6

const minutesOf = (time: string) => Number(time.slice(11, 13)) * 60 + Number(time.slice(14, 16))
const temperatureGap = (temperature: number) =>
  Math.max(0, IDEAL_TEMPERATURE[0] - temperature, temperature - IDEAL_TEMPERATURE[1])

interface Candidate {
  slot: WeatherSlot
  // Compared in this order, lowest first: rain (0.1 mm), wind (by 5 km/h), temperature gap (whole degrees)
  key: [number, number, number]
}

// The hours (by hour of the day) the slot [start, end[ covers, each with the share of it that falls inside; null
// when the forecast misses one.
function covered(hours: Map<number, SlotHour>, startMin: number, endMin: number): { hour: SlotHour, weight: number }[] | null {
  const result: { hour: SlotHour, weight: number }[] = []
  for (let h = Math.floor(startMin / 60); h * 60 < endMin; h++) {
    const hour = hours.get(h)
    if (!hour) return null
    const overlap = Math.min(endMin, (h + 1) * 60) - Math.max(startMin, h * 60)
    result.push({ hour, weight: overlap / 60 })
  }
  return result
}

function candidate(hours: Map<number, SlotHour>, startMin: number, minutes: number): Candidate | null {
  const endMin = startMin + minutes
  const parts = covered(hours, startMin, endMin)
  if (!parts?.length) return null
  const total = parts.reduce((sum, { weight }) => sum + weight, 0)
  const rain = Math.round(parts.reduce((sum, { hour, weight }) => sum + hour.precipitationMm * weight, 0) * 10) / 10
  const wind = Math.max(...parts.map(({ hour }) => hour.windKmh))
  const temperature = parts.reduce((sum, { hour, weight }) => sum + hour.temperature * weight, 0) / total
  const gap = parts.reduce((sum, { hour, weight }) => sum + temperatureGap(hour.temperature) * weight, 0) / total
  return {
    slot: { startMin, endMin, temperature: Math.round(temperature), precipitationMm: rain, windMaxKmh: Math.round(wind) },
    key: [Math.round(rain * 10), Math.floor(wind / 5), Math.round(gap)],
  }
}

const better = (a: Candidate, b: Candidate) => {
  for (let i = 0; i < a.key.length; i++) {
    if (a.key[i] !== b.key[i]) return a.key[i]! < b.key[i]!
  }
  return false
}

// The best slot of `minutes` starting on the hour, from now (or sunrise) to sunset of the day of `nowLocal`
// (Open-Meteo's local "YYYY-MM-DDTHH:mm"), and the band of 6 daylight hours around it. Ties go to the earliest.
export function bestSlot(forecast: SlotForecast, nowLocal: string, minutes: number): SlotResult {
  const date = nowLocal.slice(0, 10)
  const daylight = forecast.daylight.find(day => day.date === date)
  const byHour = new Map(forecast.hours.filter(hour => hour.time.startsWith(date)).map(hour => [Number(hour.time.slice(11, 13)), hour]))
  if (!daylight || !byHour.size) return { slot: null, reason: 'dark' }

  const sunset = daylight.sunset.startsWith(date) ? minutesOf(daylight.sunset) : 24 * 60
  const first = Math.ceil(Math.max(minutesOf(nowLocal), minutesOf(daylight.sunrise)) / 60) * 60
  if (first >= sunset) return { slot: null, reason: 'dark' }

  let best: Candidate | null = null
  for (let start = first; start + minutes <= sunset; start += 60) {
    const next = candidate(byHour, start, minutes)
    if (next && (!best || better(next, best))) best = next
  }
  if (!best) return { slot: null, reason: 'short' }
  return { slot: best.slot, band: band(byHour, best.slot, first / 60, Math.ceil(sunset / 60) - 1) }
}

// Up to 6 daylight hours from `firstHour` to `lastHour`, the slot's as centred as the day allows.
function band(hours: Map<number, SlotHour>, slot: WeatherSlot, firstHour: number, lastHour: number): BandHour[] {
  const slotFirst = Math.floor(slot.startMin / 60)
  const slotLast = Math.ceil(slot.endMin / 60) - 1
  const room = BAND_HOURS - (slotLast - slotFirst + 1)
  const start = Math.max(firstHour, Math.min(slotFirst - Math.floor(room / 2), lastHour - BAND_HOURS + 1))
  const cells: BandHour[] = []
  for (let h = start; h <= Math.min(lastHour, start + BAND_HOURS - 1); h++) {
    const hour = hours.get(h)
    if (!hour) continue
    cells.push({
      hour: h,
      temperature: Math.round(hour.temperature),
      rain: hour.precipitationMm >= RAINY_HOUR_MM,
      windy: hour.windKmh >= WINDY_KMH,
      inSlot: h >= slotFirst && h <= slotLast,
    })
  }
  return cells
}

// One of the member's recent places to start from: the start of a route they went out on, newest first.
export interface StartPlace {
  lat: number
  lng: number
  elevation: number | null
}

// The member's usual start: the ~1 km square (0.01°) most of their recent outings start from, the newest one on
// a tie, given by its newest route's own start so the forecast is the one its route page already asked for.
export function usualStart(places: StartPlace[]): StartPlace | null {
  const squares = new Map<string, { count: number, first: StartPlace }>()
  for (const place of places) {
    const key = `${Math.round(place.lat * 100)},${Math.round(place.lng * 100)}`
    const square = squares.get(key)
    if (square) square.count++
    else squares.set(key, { count: 1, first: place })
  }
  let best: { count: number, first: StartPlace } | null = null
  // Maps keep their insertion order: the newest square first, kept on a tie.
  for (const square of squares.values()) {
    if (!best || square.count > best.count) best = square
  }
  return best?.first ?? null
}

// GET /api/profile/me/coach-weather: the member's position, rounded to 0.01° by the browser (only when they
// already allowed it), else the server takes their usual start.
export const coachWeatherQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
})
