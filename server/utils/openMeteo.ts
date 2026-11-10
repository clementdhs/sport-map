import type { OpenMeteoHourly } from '#shared/utils/weather'

export interface OpenMeteoResponse {
  utc_offset_seconds: number
  elevation: number
  hourly: OpenMeteoHourly
  // Local "YYYY-MM-DDTHH:mm" of each day's sunrise and sunset, for the coach's best slot (#265)
  daily?: { time: string[], sunrise: string[], sunset: string[] }
}

// Forecasts are shared between places within ~1 km of each other (round the coordinates to 0.01° first) and
// kept for an hour: Open-Meteo's free API allows 10,000 calls a day. A route page and the coach (#265) ask for
// the same key when the coach's place is that route's start, so the second one costs no call. Rounding also
// keeps the exact start of private routes to ourselves.
export const forecastAt = defineCachedFunction(
  async (lat: number, lng: number, elevation: number | null): Promise<OpenMeteoResponse> => $fetch<OpenMeteoResponse>(
    useRuntimeConfig().openMeteoUrl,
    {
      query: {
        latitude: lat,
        longitude: lng,
        // The start's elevation, rather than the model's: temperatures differ a lot in the mountains.
        ...(elevation === null ? {} : { elevation }),
        hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m',
        daily: 'sunrise,sunset',
        timezone: 'auto',
        forecast_days: 4,
      },
      timeout: 8000,
    },
  ),
  // "-daylight": entries cached before the daily sunrise and sunset were asked for aren't reused.
  { name: 'open-meteo-daylight', maxAge: 3600, getKey: (lat: number, lng: number, elevation: number | null) => `${lat},${lng},${elevation}` },
)

export const roundCoordinate = (value: number) => Math.round(value * 100) / 100
