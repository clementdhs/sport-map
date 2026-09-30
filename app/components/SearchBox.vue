<script setup lang="ts">
import type { LngLat } from '#shared/utils/routes'
import type { Bounds, MapFocus } from '~/stores/routeSearch'

// One field for both searches: "routes" filters the list by name, "place" moves the map.
type Suggestion
  = | { kind: 'routes', label: string, icon: string }
    | { kind: 'place', label: string, icon: string, focus: MapFocus }

interface GeocodingResponse {
  features: { place_name: string, center: LngLat, bbox?: Bounds }[]
}

const emit = defineEmits<{
  place: [focus: MapFocus]
}>()

const search = useRouteSearchStore()
const { t, locale } = useI18n()
const { maptilerKey } = useRuntimeConfig().public

const routesSuggestion = (text: string): Suggestion => ({ kind: 'routes', label: text, icon: 'i-lucide-route' })

// Coming back to the page: show the name search still applied.
const selected = ref<Suggestion | undefined>(search.text ? routesSuggestion(search.text) : undefined)
const searchTerm = ref('')
const places = ref<Suggestion[]>([])
const loading = ref(false)
let latestRequest = 0
let debounceTimer: ReturnType<typeof setTimeout> | undefined

const term = computed(() => searchTerm.value.trim())

const items = computed(() => {
  if (term.value.length < MIN_SEARCH_TEXT_LENGTH) return []
  const groups = [[{ type: 'label' as const, label: t('searchBox.routes') }, routesSuggestion(term.value)]]
  if (places.value.length) groups.push([{ type: 'label' as const, label: t('searchBox.places') }, ...places.value])
  return groups
})

async function geocode(text: string) {
  const request = ++latestRequest
  loading.value = true
  try {
    const { features } = await $fetch<GeocodingResponse>(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(text)}.json`,
      { query: { key: maptilerKey, language: locale.value, limit: 5 } },
    )
    if (request === latestRequest) {
      places.value = features.map(f => ({
        kind: 'place',
        label: f.place_name,
        icon: 'i-lucide-map-pin',
        focus: { center: f.center, bbox: f.bbox },
      }))
    }
  }
  catch {
    if (request === latestRequest) places.value = []
  }
  finally {
    if (request === latestRequest) loading.value = false
  }
}

watch(term, (text) => {
  clearTimeout(debounceTimer)
  if (text.length < MIN_SEARCH_TEXT_LENGTH || !maptilerKey) {
    latestRequest++
    places.value = []
    loading.value = false
    return
  }
  debounceTimer = setTimeout(() => geocode(text), 300)
})

watch(selected, (suggestion) => {
  if (!suggestion) return
  if (suggestion.kind === 'routes') {
    search.text = suggestion.label
  }
  else {
    // The field now shows a place: a name search left behind would no longer match it.
    search.text = ''
    emit('place', suggestion.focus)
  }
})

// Cleared from outside (e.g. the store was reset): empty the field too.
watch(() => search.text, (text) => {
  if (!text && selected.value?.kind === 'routes') selected.value = undefined
})

function clear() {
  search.text = ''
  selected.value = undefined
}
</script>

<template>
  <!-- The menu's own clear control is a non-focusable span inside its trigger button: use a real button beside it. -->
  <div class="relative">
    <UInputMenu
      v-model="selected"
      v-model:search-term="searchTerm"
      :items="items"
      ignore-filter
      :loading="loading"
      icon="i-lucide-search"
      trailing-icon=""
      :placeholder="t('searchBox.placeholder')"
      :aria-label="t('searchBox.label')"
      class="w-full"
      :ui="{ base: 'pe-9' }"
    >
      <template #item-label="{ item }">
        <template v-if="'kind' in item && item.kind === 'routes'">
          {{ t('searchBox.routesContaining', { text: item.label }) }}
        </template>
        <template v-else>
          {{ item.label }}
        </template>
      </template>
      <template #empty>
        {{ t('searchBox.minLength', { count: MIN_SEARCH_TEXT_LENGTH }) }}
      </template>
    </UInputMenu>
    <UButton
      v-if="selected"
      icon="i-lucide-x"
      color="neutral"
      variant="link"
      size="sm"
      :aria-label="t('searchBox.clear')"
      class="absolute inset-y-0 end-1 my-auto h-fit"
      @click="clear"
    />
  </div>
</template>
