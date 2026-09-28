import { createServer } from 'node:http'

// Fake Open-Meteo for the e2e tests (the app reads NUXT_OPEN_METEO_URL): four days of hourly forecast from
// today, dry except for rain on the second afternoon.
export const FAKE_WEATHER_PORT = 3199

function forecast() {
  const today = new Date().toISOString().slice(0, 10)
  const time: string[] = []
  for (let day = 0; day < 4; day++) {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) + day * 86_400_000).toISOString().slice(0, 10)
    for (let h = 0; h < 24; h++) time.push(`${date}T${String(h).padStart(2, '0')}:00`)
  }
  const rainy = (i: number) => i >= 24 + 12 && i < 24 + 18
  return {
    utc_offset_seconds: 0,
    elevation: 450,
    hourly: {
      time,
      temperature_2m: time.map((_, i) => 10 + (i % 24) / 2),
      precipitation: time.map((_, i) => (rainy(i) ? 1 : 0)),
      precipitation_probability: time.map((_, i) => (rainy(i) ? 90 : 0)),
      weather_code: time.map((_, i) => (rainy(i) ? 63 : 0)),
      wind_speed_10m: time.map(() => 12),
      wind_gusts_10m: time.map(() => 30),
    },
  }
}

// Returns the function that stops it.
export function startFakeWeather(): Promise<() => Promise<void>> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(forecast()))
  })
  return new Promise(resolve => server.listen(FAKE_WEATHER_PORT, '127.0.0.1', () => {
    resolve(() => new Promise(done => server.close(() => done())))
  }))
}
