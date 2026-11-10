<script setup lang="ts">
import type { CoachWeather } from '#shared/types/account'
import { localTime } from '#shared/utils/weather'
import { bestSlot, WINDY_KMH, type WeatherSlot } from '#shared/utils/weatherSlot'

// The best weather slot for the session of the day (#265, mockup 1), under the duration picker: worked out in
// the browser from the hourly forecast as the duration changes. Loaded after the page, once: without a place,
// offline or when Open-Meteo fails, the card stays hidden and the session shows alone.
const props = defineProps<{
  // The session's own minutes
  minutes: number
}>()

const { t } = useI18n()
const { formatNumber } = useFormat()

const weather = ref<CoachWeather | null>(null)

// The device's position only when the member already allowed it: the coach never asks for it.
async function allowedPosition(): Promise<{ lat: number, lng: number } | null> {
  try {
    if (!('geolocation' in navigator) || !navigator.permissions) return null
    const { state } = await navigator.permissions.query({ name: 'geolocation' })
    if (state !== 'granted') return null
    return await new Promise(resolve => navigator.geolocation.getCurrentPosition(
      // Rounded here like the forecast's key (~1 km): the exact position never leaves the device.
      ({ coords }) => resolve({ lat: Math.round(coords.latitude * 100) / 100, lng: Math.round(coords.longitude * 100) / 100 }),
      () => resolve(null),
      { maximumAge: 600_000, timeout: 5000 },
    ))
  }
  catch {
    return null
  }
}

onMounted(async () => {
  if (!navigator.onLine) return
  const position = await allowedPosition()
  try {
    const data = await $fetch<CoachWeather | null>('/api/profile/me/coach-weather', { query: position ?? {} })
    if (data) weather.value = data
  }
  catch {}
})

// The place's local time read again with each duration, so a page left open doesn't offer a slot gone by.
const result = computed(() => (weather.value && props.minutes > 0
  ? bestSlot(weather.value, localTime(new Date(), weather.value.utcOffsetSeconds), props.minutes)
  : null))

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return m ? t('coachWeather.hourMinutes', { h, m: String(m).padStart(2, '0') }) : t('coachWeather.hour', { h })
}

function details(slot: WeatherSlot): string {
  const rain = slot.precipitationMm === 0
    ? t('coachWeather.noRain')
    : slot.precipitationMm < 1 ? t('coachWeather.fewDrops') : t('coachWeather.rain', { mm: formatNumber(slot.precipitationMm) })
  const wind = slot.windMaxKmh >= WINDY_KMH ? `, ${t('coachWeather.wind', { speed: slot.windMaxKmh })}` : ''
  return `${slot.temperature}°, ${rain}${wind}`
}
</script>

<template>
  <section
    v-if="result && (result.slot || result.reason === 'short')"
    class="rounded-lg border border-default bg-default px-3.5 py-3"
    :aria-label="t('coachWeather.title')"
    data-testid="coach-weather"
  >
    <p class="flex items-center gap-2 text-sm">
      <UIcon name="i-lucide-sun" class="size-5 shrink-0" aria-hidden="true" />
      <span v-if="result.slot" data-testid="coach-weather-slot">
        {{ t('coachWeather.best') }}
        <strong>{{ t('coachWeather.range', { start: clock(result.slot.startMin), end: clock(result.slot.endMin) }) }}</strong>
        · {{ details(result.slot) }}
      </span>
      <span v-else>{{ t('coachWeather.short') }}</span>
    </p>
    <ol
      v-if="result.slot"
      class="mt-2.5 grid gap-1 text-center text-xs"
      :style="{ gridTemplateColumns: `repeat(${result.band.length}, minmax(0, 1fr))` }"
      :aria-label="t('coachWeather.band')"
    >
      <li
        v-for="cell in result.band"
        :key="cell.hour"
        class="rounded py-1"
        :class="cell.inSlot ? 'bg-(--sign) font-semibold text-(--sign-text)' : 'text-muted'"
        :data-in-slot="cell.inSlot || undefined"
      >
        {{ clock(cell.hour * 60) }}<br>
        <span v-if="cell.rain" class="font-semibold" :class="{ 'text-highlighted': !cell.inSlot }">{{ t('coachWeather.cellRain') }}</span>
        <span v-else-if="cell.windy" class="font-semibold" :class="{ 'text-highlighted': !cell.inSlot }">{{ t('coachWeather.cellWind') }}</span>
        <template v-else>{{ cell.temperature }}°</template>
        <span v-if="cell.inSlot" class="sr-only">({{ t('coachWeather.chosen') }})</span>
      </li>
    </ol>
    <!-- Credit required by Open-Meteo's licence (CC BY 4.0). -->
    <p class="mt-2 text-xs text-muted">
      {{ t('weather.credit') }} <ULink to="https://open-meteo.com/" target="_blank" class="underline">Open-Meteo.com</ULink>
    </p>
  </section>
</template>
