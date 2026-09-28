<script setup lang="ts">
import type { HalfDayForecast, RouteWeather } from '#shared/types/routes'

// Forecast at the start of the route. Loaded after the page (not server-side): the page doesn't wait for
// Open-Meteo, and crawlers don't use up its quota.
const props = defineProps<{
  routeId: string
}>()

const { data, status } = useFetch<RouteWeather>(`/api/routes/${props.routeId}/weather`, { lazy: true, server: false })

function dayLabel(date: string, today: string): string {
  const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
  if (days === 0) return 'Aujourd\'hui'
  if (days === 1) return 'Demain'
  const weekday = new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' })
  return weekday.charAt(0).toUpperCase() + weekday.slice(1)
}

function rain(forecast: HalfDayForecast): string {
  const chance = forecast.precipitationProbability === null ? '' : `${forecast.precipitationProbability} %`
  return forecast.precipitationMm > 0 ? `${forecast.precipitationMm.toLocaleString('fr-FR')} mm${chance ? ` (${chance})` : ''}` : chance || '—'
}
</script>

<template>
  <section class="space-y-2" aria-labelledby="weather-title">
    <div class="flex items-baseline justify-between gap-2">
      <h2 id="weather-title" class="font-medium">Météo au départ</h2>
      <span v-if="data?.elevationM != null" class="text-xs text-muted">à {{ data.elevationM }} m</span>
    </div>

    <div v-if="status === 'pending' || status === 'idle'" class="space-y-2" aria-busy="true">
      <USkeleton v-for="i in 3" :key="i" class="h-6 w-full" />
    </div>
    <p v-else-if="status === 'error' || !data?.halfDays.length" class="text-sm text-muted">
      Météo indisponible pour le moment.
    </p>
    <template v-else>
      <table class="w-full text-sm">
        <thead class="sr-only">
          <tr><th>Moment</th><th>Ciel</th><th>Température</th><th>Pluie</th><th>Vent</th></tr>
        </thead>
        <tbody>
          <tr v-for="forecast in data.halfDays" :key="`${forecast.date}-${forecast.period}`" class="border-b border-default last:border-0">
            <td class="py-1.5 pr-2">
              <span class="font-medium">{{ dayLabel(forecast.date, data.today) }}</span>
              <span class="block text-xs text-muted">{{ HALF_DAY_LABELS[forecast.period] }}</span>
            </td>
            <td class="py-1.5 pr-2">
              <UIcon :name="weatherKind(forecast.weatherCode).icon" class="size-5 align-middle" :aria-label="weatherKind(forecast.weatherCode).label" />
            </td>
            <td class="py-1.5 pr-2 whitespace-nowrap tabular-nums">{{ forecast.tempMin }}–{{ forecast.tempMax }} °C</td>
            <td class="py-1.5 pr-2 whitespace-nowrap text-muted">
              <UIcon name="i-lucide-droplets" class="mr-0.5 size-3.5 align-[-0.1em]" aria-hidden="true" />{{ rain(forecast) }}
            </td>
            <td class="py-1.5 whitespace-nowrap text-muted" :title="`Rafales jusqu'à ${forecast.gustMaxKmh} km/h`">
              <UIcon name="i-lucide-wind" class="mr-0.5 size-3.5 align-[-0.1em]" aria-hidden="true" />{{ forecast.windMaxKmh }} km/h
            </td>
          </tr>
        </tbody>
      </table>
      <!-- Credit required by Open-Meteo's licence (CC BY 4.0). -->
      <p class="text-xs text-muted">
        Données météo : <ULink to="https://open-meteo.com/" target="_blank" class="underline">Open-Meteo.com</ULink>
      </p>
    </template>
  </section>
</template>
