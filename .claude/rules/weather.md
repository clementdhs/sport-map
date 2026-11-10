---
paths:
  - "server/api/routes/*/weather.get.ts"
  - "shared/utils/weather.ts"
  - "app/components/RouteWeather.vue"
  - "test/e2e/fake-weather.ts"
  - "server/utils/openMeteo.ts"
---

# Weather

`GET /api/routes/:id/weather` asks Open-Meteo (free, no key, non-commercial, 10k calls/day) for the start of the route, rounded to ~1 km and at its elevation, cached an hour per place (`forecastAt` in `server/utils/openMeteo.ts`, shared with the coach's best slot, `coach.md`), and sums it up by half-day (`shared/utils/weather.ts`). The page loads it client-side. Its licence (CC BY 4.0) requires the "Open-Meteo.com" credit link next to the data. e2e tests point `NUXT_OPEN_METEO_URL` at a fake started by the global setup (`test/e2e/fake-weather.ts`), whose time zone puts the place at 9 o'clock whenever the tests run.
