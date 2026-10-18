<script setup lang="ts">
import type { LoopProposal } from '~/stores/loopGenerator'

// Automatic loop panel of the route editor (#50): start, sport, distance or duration, then the proposals drawn
// on the map (`useLoopGeneratorStore`).
const editor = useRouteEditorStore()
const loop = useLoopGeneratorStore()
const { t } = useI18n()
const { formatDistance } = useFormat()
const toast = useToast()

const sportItems = useSportItems()
const estimateDuration = useDurationEstimate()
const targetItems = computed(() => [
  { label: t('loop.distance'), value: 'distance' },
  { label: t('loop.duration'), value: 'duration' },
])

// The other side of the target: the duration of the distance, or the distance covered in the duration.
const targetHint = computed(() => {
  if (!loop.targetInRange) return t('loop.outOfRange', { min: formatDistance(LOOP_MIN_M), max: formatDistance(LOOP_MAX_M) })
  return loop.target === 'distance'
    ? t('loop.flatDuration', { duration: formatDuration(estimateDuration(editor.details.sport_type, loop.targetM, null)) })
    : t('loop.flatDistance', { distance: formatDistance(loop.targetM) })
})

// On a phone, new proposals would stay below the fold of the bottom sheet.
const list = useTemplateRef('list')
watch(() => loop.proposals.length, async (count, before) => {
  if (!count || before) return
  await nextTick()
  list.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})

const locating = ref(false)

function locate() {
  if (!('geolocation' in navigator)) {
    toast.add({ title: t('loop.locateFailed'), description: t('gps.unsupported'), color: 'error' })
    return
  }
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      locating.value = false
      loop.setStart([coords.longitude, coords.latitude])
    },
    ({ code, PERMISSION_DENIED }) => {
      locating.value = false
      const denied = isNativeApp() ? t('gps.deniedApp') : t('gps.denied')
      toast.add({ title: t('loop.locateFailed'), description: code === PERMISSION_DENIED ? denied : t('gps.unavailable'), color: 'error' })
    },
    { maximumAge: 60_000, timeout: 20_000 },
  )
}

function choose(index: number) {
  if (editor.waypoints.length && !window.confirm(t('loop.replaceConfirm'))) return
  loop.choose(index)
}

function proposalSummary({ distanceM, gainM }: LoopProposal) {
  const duration = formatDuration(estimateDuration(editor.details.sport_type, distanceM, gainM))
  return t('loop.summary', { distance: formatDistance(distanceM), gain: Math.round(gainM ?? 0), duration })
}
</script>

<template>
  <section class="space-y-4" aria-labelledby="loop-title">
    <div class="flex items-center justify-between gap-2">
      <h2 id="loop-title" class="text-base font-semibold">{{ t('loop.title') }}</h2>
      <UButton icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="t('loop.close')" @click="loop.hide()" />
    </div>

    <UFormField :label="t('loop.start')">
      <p class="mb-2 text-sm" :class="loop.placingStart ? 'text-primary' : 'text-muted'">
        <UIcon
          :name="loop.placingStart ? 'i-lucide-mouse-pointer-click' : 'i-lucide-circle-check'"
          class="mr-1 align-text-bottom"
        />{{ loop.placingStart ? t('loop.placeStart') : t('loop.startPlaced') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          icon="i-lucide-locate-fixed"
          :label="t('loop.myPosition')"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="locating"
          @click="locate"
        />
        <UButton
          v-if="!loop.placingStart"
          icon="i-lucide-map-pin"
          :label="t('loop.pickOnMap')"
          color="neutral"
          variant="outline"
          size="sm"
          @click="loop.placingStart = true"
        />
      </div>
    </UFormField>

    <UFormField :label="t('filters.sport')">
      <USelect v-model="editor.details.sport_type" :items="sportItems" class="w-full" />
    </UFormField>

    <div class="space-y-2">
      <UTabs v-model="loop.target" :items="targetItems" :content="false" size="sm" :aria-label="t('loop.target')" />
      <UFormField v-if="loop.target === 'distance'" :label="t('loop.distanceKm')" :help="targetHint">
        <UInputNumber v-model="loop.distanceKm" :min="1" :max="100" :step="1" :step-snapping="false" class="w-full" />
      </UFormField>
      <UFormField v-else :label="t('loop.durationMin')" :help="targetHint">
        <UInputNumber v-model="loop.durationMin" :min="10" :step="5" :step-snapping="false" class="w-full" />
      </UFormField>
    </div>

    <UButton
      icon="i-lucide-wand-sparkles"
      :label="loop.proposals.length ? t('loop.regenerate') : t('loop.generate')"
      block
      :loading="loop.generating"
      :disabled="!loop.canGenerate"
      @click="loop.generate()"
    />
    <p class="-mt-2 text-xs text-muted">{{ t('loop.quotaHint', { attempts: LOOP_ATTEMPTS }) }}</p>

    <ul v-if="loop.proposals.length" ref="list" class="space-y-2" :aria-label="t('loop.proposals')" aria-live="polite">
      <li
        v-for="(proposal, i) in loop.proposals"
        :key="proposal.seed"
        class="flex items-center gap-3 rounded-md border p-3"
        :class="loop.highlighted === i ? 'border-primary' : 'border-default'"
        @mouseenter="loop.highlighted = i"
        @focusin="loop.highlighted = i"
      >
        <span class="size-3 shrink-0 rounded-full" :style="{ backgroundColor: LOOP_COLORS[i % LOOP_COLORS.length] }" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <p class="font-medium">{{ t('loop.proposal', { n: i + 1 }) }}</p>
          <p v-if="proposal.status === 'loading'" class="text-sm text-muted">
            <UIcon name="i-lucide-loader-circle" class="mr-1 size-4 animate-spin align-text-bottom" />{{ t('editor.routing') }}
          </p>
          <p v-else-if="proposal.status === 'failed'" class="text-sm text-muted">{{ proposal.error }}</p>
          <p v-else class="text-sm">{{ proposalSummary(proposal) }}</p>
        </div>
        <UButton
          v-if="proposal.status === 'ready'"
          :label="t('loop.choose')"
          :aria-label="t('loop.chooseLabel', { n: i + 1 })"
          size="sm"
          @click="choose(i)"
        />
      </li>
    </ul>
  </section>
</template>
