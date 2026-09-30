<script setup lang="ts">
import type { HalfDayForecast, RouteWeather } from '#shared/types/routes'

// Forecast at the start of the route. Loaded after the page (not server-side): the page doesn't wait for
// Open-Meteo, and crawlers don't use up its quota.
const props = defineProps<{
  routeId: string
}>()

const { t } = useI18n()
const { formatNumber, locale } = useFormat()
const { data, status } = useFetch<RouteWeather>(`/api/routes/${props.routeId}/weather`, { lazy: true, server: false })

function dayLabel(date: string, today: string): string {
  const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
  if (days === 0) return t('weather.today')
  if (days === 1) return t('weather.tomorrow')
  const weekday = new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'long', timeZone: 'UTC' })
  return weekday.charAt(0).toUpperCase() + weekday.slice(1)
}

function rain(forecast: HalfDayForecast): string {
  const chance = forecast.precipitationProbability === null ? '' : `${forecast.precipitationProbability} %`
  return forecast.precipitationMm > 0 ? `${formatNumber(forecast.precipitationMm)} mm${chance ? ` (${chance})` : ''}` : chance || '—'
}
</script>

<template>
  <section class="space-y-2" aria-labelledby="weather-title">
    <div class="flex items-baseline justify-between gap-2">
      <h2 id="weather-title" class="font-medium">{{ t('weather.title') }}</h2>
      <span v-if="data?.elevationM != null" class="text-xs text-muted">{{ t('weather.elevation', { elevation: data.elevationM }) }}</span>
    </div>

    <!-- Same height as the table (6 half-days of two lines) and the credit line. -->
    <div v-if="status === 'pending' || status === 'idle'" class="space-y-2">
      <span class="sr-only">{{ t('weather.loading') }}</span>
      <div aria-hidden="true">
        <div v-for="i in WEATHER_HALF_DAY_COUNT" :key="i" class="flex items-center gap-3 border-b border-default py-1.5 last:border-0">
          <div class="flex h-9 w-24 flex-col justify-center gap-1">
            <USkeleton class="h-4 w-20" />
            <USkeleton class="h-3 w-14" />
          </div>
          <USkeleton class="size-5 rounded-full" />
          <USkeleton class="h-4 flex-1" />
        </div>
      </div>
      <USkeleton class="h-4 w-44" aria-hidden="true" />
    </div>
    <p v-else-if="status === 'error' || !data?.halfDays.length" class="text-sm text-muted">
      {{ t('weather.unavailable') }}
    </p>
    <template v-else>
      <table class="w-full text-sm">
        <thead class="sr-only">
          <tr><th>{{ t('weather.when') }}</th><th>{{ t('weather.sky') }}</th><th>{{ t('weather.temperature') }}</th><th>{{ t('weather.rain') }}</th><th>{{ t('weather.wind') }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="forecast in data.halfDays" :key="`${forecast.date}-${forecast.period}`" class="border-b border-default last:border-0">
            <td class="py-1.5 pr-2">
              <span class="font-medium">{{ dayLabel(forecast.date, data.today) }}</span>
              <span class="block text-xs text-muted">{{ t(`weather.halfDays.${forecast.period}`) }}</span>
            </td>
            <td class="py-1.5 pr-2">
              <UIcon :name="weatherKind(forecast.weatherCode).icon" class="size-5 align-middle" :aria-label="t(`weather.kinds.${weatherKind(forecast.weatherCode).kind}`)" />
            </td>
            <td class="py-1.5 pr-2 whitespace-nowrap tabular-nums">{{ forecast.tempMin }}–{{ forecast.tempMax }} °C</td>
            <td class="py-1.5 pr-2 whitespace-nowrap text-muted">
              <UIcon name="i-lucide-droplets" class="mr-0.5 size-3.5 align-[-0.1em]" aria-hidden="true" />{{ rain(forecast) }}
            </td>
            <td class="py-1.5 whitespace-nowrap text-muted" :title="t('weather.gusts', { speed: forecast.gustMaxKmh })">
              <UIcon name="i-lucide-wind" class="mr-0.5 size-3.5 align-[-0.1em]" aria-hidden="true" />{{ forecast.windMaxKmh }} km/h
            </td>
          </tr>
        </tbody>
      </table>
      <!-- Credit required by Open-Meteo's licence (CC BY 4.0). -->
      <p class="text-xs text-muted">
        {{ t('weather.credit') }} <ULink to="https://open-meteo.com/" target="_blank" class="underline">Open-Meteo.com</ULink>
      </p>
    </template>
  </section>
</template>
