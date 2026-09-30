import type { HalfDayForecast } from '../types/routes'

// Weather at the start of a route, from Open-Meteo's hourly forecast (free for non-commercial use, CC BY 4.0:
// the data must be credited "Weather data by Open-Meteo.com" with a link).

export const HALF_DAYS = { morning: [6, 12], afternoon: [12, 18] } as const
export type HalfDay = keyof typeof HALF_DAYS

// Half-days shown on a route page (three days).
export const WEATHER_HALF_DAY_COUNT = 6
export const HALF_DAY_LABELS: Record<HalfDay, string> = { morning: 'Matin', afternoon: 'Après-midi' }

export interface OpenMeteoHourly {
  time: string[]
  temperature_2m: number[]
  precipitation: number[]
  precipitation_probability: (number | null)[]
  weather_code: number[]
  wind_speed_10m: number[]
  wind_gusts_10m: number[]
}

// Open-Meteo's local "YYYY-MM-DDTHH:mm" of an instant, for a UTC offset.
export function localTime(instant: Date, utcOffsetSeconds: number): string {
  return new Date(instant.getTime() + utcOffsetSeconds * 1000).toISOString().slice(0, 16)
}

const round1 = (value: number) => Math.round(value * 10) / 10

// The next `count` half-days that are not over yet, from the hourly forecast (in the location's local time).
export function halfDayForecasts(hourly: OpenMeteoHourly, nowLocal: string, count: number): HalfDayForecast[] {
  const groups = new Map<string, number[]>()
  hourly.time.forEach((time, i) => {
    const hour = Number(time.slice(11, 13))
    const period = (Object.keys(HALF_DAYS) as HalfDay[]).find(p => hour >= HALF_DAYS[p][0] && hour < HALF_DAYS[p][1])
    if (!period) return
    const key = `${time.slice(0, 10)}|${period}`
    groups.set(key, [...(groups.get(key) ?? []), i])
  })

  const forecasts: HalfDayForecast[] = []
  for (const [key, hours] of groups) {
    const [date, period] = key.split('|') as [string, HalfDay]
    const end = `${date}T${String(HALF_DAYS[period][1]).padStart(2, '0')}:00`
    if (end <= nowLocal) continue
    const pick = <T>(values: T[]) => hours.map(i => values[i]!)
    const probabilities = pick(hourly.precipitation_probability).filter((p): p is number => p !== null)
    forecasts.push({
      date,
      period,
      tempMin: Math.round(Math.min(...pick(hourly.temperature_2m))),
      tempMax: Math.round(Math.max(...pick(hourly.temperature_2m))),
      precipitationMm: round1(pick(hourly.precipitation).reduce((sum, mm) => sum + mm, 0)),
      precipitationProbability: probabilities.length ? Math.max(...probabilities) : null,
      windMaxKmh: Math.round(Math.max(...pick(hourly.wind_speed_10m))),
      gustMaxKmh: Math.round(Math.max(...pick(hourly.wind_gusts_10m))),
      weatherCode: worstWeather(pick(hourly.weather_code)),
    })
  }
  // Hours come in order, so do the half-days.
  return forecasts.slice(0, count)
}

// Severity of a WMO code: clear < clouds < fog < drizzle < rain < snow < storm. (The codes themselves don't
// sort that way: rain showers, 80-82, come after snow, 71-77.)
function severity(code: number): number {
  if (code <= 3) return code
  if (code === 45 || code === 48) return 4
  if (code >= 51 && code <= 57) return 5
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 6
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 7
  if (code >= 95) return 8
  return 3
}

// The most severe weather of a half-day.
export function worstWeather(codes: number[]): number {
  return codes.reduce((worst, code) => (severity(code) > severity(worst) ? code : worst))
}

interface WeatherKind { label: string, icon: string }

// WMO weather interpretation codes, as used by Open-Meteo.
export function weatherKind(code: number): WeatherKind {
  if (code === 0) return { label: 'Ensoleillé', icon: 'i-lucide-sun' }
  if (code <= 2) return { label: 'Éclaircies', icon: 'i-lucide-cloud-sun' }
  if (code === 3) return { label: 'Couvert', icon: 'i-lucide-cloud' }
  if (code === 45 || code === 48) return { label: 'Brouillard', icon: 'i-lucide-cloud-fog' }
  if (code >= 51 && code <= 57) return { label: 'Bruine', icon: 'i-lucide-cloud-drizzle' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Pluie', icon: 'i-lucide-cloud-rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Neige', icon: 'i-lucide-cloud-snow' }
  if (code >= 95) return { label: 'Orage', icon: 'i-lucide-cloud-lightning' }
  return { label: 'Nuageux', icon: 'i-lucide-cloud' }
}
