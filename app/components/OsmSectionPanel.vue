<script setup lang="ts">
import type { SectionEnd } from '~/stores/osmSection'

// Panel of the discover page while a section of a marked route is chosen (#72): its ends in km along the route (also
// placed on the map), the distance from the departure, and the section's distance and gain, updated live.
defineProps<{
  name: string
}>()

const emit = defineEmits<{
  import: []
}>()

const { t } = useI18n()
const { formatDistance } = useFormat()
const sectionStore = useOsmSectionStore()

const lengthKm = computed(() => (sectionStore.line?.length ?? 0) / 1000)
const kmField = (end: SectionEnd) => computed({
  get: () => (sectionStore.section?.[end] ?? 0) / 1000,
  set: (km: number | null) => sectionStore.setEnd(end, (km ?? 0) * 1000),
})
const fromKm = kmField('from')
const toKm = kmField('to')
const distanceKm = computed({
  get: () => sectionStore.length / 1000,
  set: (km: number | null) => sectionStore.setLength((km ?? 0) * 1000),
})
const formatOptions = { maximumFractionDigits: 1 }

// Past the end of a loop, or backwards along an open line.
const direction = computed(() => {
  const { from = 0, to = 0 } = sectionStore.section ?? {}
  if (to >= from) return null
  return sectionStore.line?.closed ? 'wraps' : 'backwards'
})

const gainLabel = computed(() => {
  if (sectionStore.gainStatus === 'known') return t('discover.gain', { gain: sectionStore.gain })
  return t(sectionStore.gainStatus === 'pending' ? 'discover.gainPending' : 'discover.gainUnknown')
})
</script>

<template>
  <section class="space-y-4" :aria-label="t('discover.section.title')">
    <div class="flex items-center gap-2">
      <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" :aria-label="t('discover.section.back')" @click="sectionStore.stop()" />
      <div class="min-w-0">
        <h2 class="font-semibold">{{ t('discover.section.title') }}</h2>
        <p class="truncate text-sm text-muted">{{ name }}</p>
      </div>
    </div>

    <p class="text-sm text-muted">
      {{ t(sectionStore.nextEnd === 'from' ? 'discover.section.pickFrom' : 'discover.section.pickTo') }}
    </p>
    <p v-if="sectionStore.lines.length > 1" class="-mt-2 text-sm text-muted">
      <UIcon name="i-lucide-unlink" class="mr-1 align-text-bottom" />{{ t('discover.section.pieces') }}
    </p>

    <div class="grid grid-cols-2 gap-3">
      <UFormField :label="t('discover.section.from')">
        <UInputNumber v-model="fromKm" :min="0" :max="lengthKm" :step="0.1" :step-snapping="false" :format-options="formatOptions" class="w-full" />
      </UFormField>
      <UFormField :label="t('discover.section.to')">
        <UInputNumber v-model="toKm" :min="0" :max="lengthKm" :step="0.1" :step-snapping="false" :format-options="formatOptions" class="w-full" />
      </UFormField>
    </div>
    <UFormField :label="t('discover.section.length')" :help="t('discover.section.lengthHint')">
      <UInputNumber v-model="distanceKm" :min="0" :max="lengthKm" :step="0.1" :step-snapping="false" :format-options="formatOptions" class="w-full" />
    </UFormField>

    <div class="rounded-md border border-default p-3">
      <p class="flex items-center gap-2 font-medium" aria-live="polite">
        {{ t('discover.section.summary', { distance: formatDistance(sectionStore.length), gain: gainLabel }) }}
        <UIcon v-if="sectionStore.gainStatus === 'pending'" name="i-lucide-loader-circle" class="size-4 animate-spin text-muted" aria-hidden="true" />
      </p>
      <p v-if="direction" class="mt-1 text-sm text-muted">{{ t(`discover.section.${direction}`) }}</p>
      <p v-if="sectionStore.tooShort" class="mt-1 text-sm text-muted">{{ t('discover.section.tooShort') }}</p>
    </div>

    <UButton icon="i-lucide-route" :label="t('discover.section.import')" block :disabled="sectionStore.tooShort" @click="emit('import')" />
  </section>
</template>
