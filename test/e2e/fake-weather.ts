import { createServer, type IncomingMessage } from 'node:http'

// Fake Open-Meteo and IGN altimetry for the e2e tests (the app reads NUXT_OPEN_METEO_URL, NUXT_IGN_ALTIMETRY_URL and
// NUXT_OPEN_METEO_ELEVATION_URL): four days of hourly forecast from today, dry except for rain on the second
// afternoon, daylight from 07:30 to 18:00; elevations rising 2 m for every 0.001° north of 48.4° (~110 m), like a
// gentle slope. Its time zone puts the place at 9 o'clock whenever the tests run, so the coach's best slot (#265)
// always has daylight left.
export const FAKE_WEATHER_PORT = 3199

function forecast() {
  const now = new Date()
  const offsetHours = 9 - now.getUTCHours()
  const today = new Date(now.getTime() + offsetHours * 3_600_000).toISOString().slice(0, 10)
  const time: string[] = []
  const days: string[] = []
  for (let day = 0; day < 4; day++) {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) + day * 86_400_000).toISOString().slice(0, 10)
    days.push(date)
    for (let h = 0; h < 24; h++) time.push(`${date}T${String(h).padStart(2, '0')}:00`)
  }
  const rainy = (i: number) => i >= 24 + 12 && i < 24 + 18
  return {
    utc_offset_seconds: offsetHours * 3600,
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
    daily: {
      time: days,
      sunrise: days.map(date => `${date}T07:30`),
      sunset: days.map(date => `${date}T18:00`),
    },
  }
}

const elevationAt = (lat: number) => Math.round((100 + (lat - 48.4) * 2000) * 100) / 100

// IGN: POST { lat: 'a|b|…' } → { elevations }. Open-Meteo: ?latitude=a,b,… → { elevation }.
async function answer(url: URL, body: Promise<string>) {
  if (url.pathname.startsWith('/altimetrie/')) {
    const { lat } = JSON.parse(await body) as { lat: string }
    return { elevations: lat.split('|').map(value => elevationAt(Number(value))) }
  }
  if (url.pathname === '/v1/elevation') {
    return { elevation: url.searchParams.get('latitude')!.split(',').map(value => Math.round(elevationAt(Number(value)))) }
  }
  return forecast()
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => resolve(body))
  })
}

// Returns the function that stops it.
export function startFakeWeather(): Promise<() => Promise<void>> {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://localhost')
    const json = await answer(url, readBody(request))
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(json))
  })
  return new Promise(resolve => server.listen(FAKE_WEATHER_PORT, '127.0.0.1', () => {
    resolve(() => new Promise(done => server.close(() => done())))
  }))
}
