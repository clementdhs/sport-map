<script setup lang="ts">
import type { LngLat } from '#shared/utils/routes'
import type { Bounds, MapFocus } from '~/stores/routeSearch'

interface Place extends MapFocus {
  label: string
}

interface GeocodingResponse {
  features: { place_name: string, center: LngLat, bbox?: Bounds }[]
}

const emit = defineEmits<{
  select: [place: MapFocus]
}>()

const { maptilerKey } = useRuntimeConfig().public

const searchTerm = ref('')
const places = ref<Place[]>([])
const selected = ref<Place>()
const loading = ref(false)
let latestRequest = 0
let debounceTimer: ReturnType<typeof setTimeout> | undefined

async function geocode(term: string) {
  const request = ++latestRequest
  loading.value = true
  try {
    const { features } = await $fetch<GeocodingResponse>(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(term)}.json`,
      { query: { key: maptilerKey, language: 'fr', limit: 5 } },
    )
    if (request === latestRequest) {
      places.value = features.map(f => ({ label: f.place_name, center: f.center, bbox: f.bbox }))
    }
  }
  catch {
    if (request === latestRequest) places.value = []
  }
  finally {
    if (request === latestRequest) loading.value = false
  }
}

watch(searchTerm, (term) => {
  clearTimeout(debounceTimer)
  if (term.trim().length < 2 || term === selected.value?.label) return
  debounceTimer = setTimeout(() => geocode(term.trim()), 300)
})

watch(selected, (place) => {
  if (place) emit('select', { center: place.center, bbox: place.bbox })
})
</script>

<template>
  <UInputMenu
    v-model="selected"
    v-model:search-term="searchTerm"
    :items="places"
    ignore-filter
    :loading="loading"
    :disabled="!maptilerKey"
    icon="i-lucide-search"
    trailing-icon=""
    placeholder="Rechercher un lieu…"
    aria-label="Rechercher un lieu"
    class="w-full"
  >
    <template #empty>
      {{ searchTerm.trim().length < 2 ? 'Tape au moins 2 lettres' : 'Aucun lieu trouvé' }}
    </template>
  </UInputMenu>
</template>
