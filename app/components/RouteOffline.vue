<script setup lang="ts">
import type { LngLat } from '#shared/utils/routes'
import type { OfflineRouteInfo } from '~/utils/offlineRoute'

const { formatShortDate, formatNumber } = useFormat()

// Prepares the follow mode of a route for use without network (see app/utils/offlineRoute.ts). The route page starts
// it from its actions menu (exposed `prepare`); this shows the download progress, then the stored copy.
const props = defineProps<{
  routeId: string
  name: string
  coordinates: LngLat[]
}>()

const toast = useToast()
const { t } = useI18n()
const errorMessage = useErrorMessage()
const { maptilerKey } = useRuntimeConfig().public
// The styles the maps may show with the member's choice (#151): both when they follow the theme.
const mapStyle = usePreference('mapStyle')

// Browser-only (Cache Storage, service worker): decided after mounting.
const supported = ref(false)
const info = ref<OfflineRouteInfo | null>(null)
const progress = ref<{ done: number, total: number } | null>(null)

onMounted(() => {
  supported.value = offlineSupported()
  info.value = listOfflineRoutes()[props.routeId] ?? null
})

const percent = computed(() => (progress.value ? Math.round((progress.value.done / progress.value.total) * 100) : 0))
const sizeLabel = computed(() => {
  const megabytes = (info.value?.bytes ?? 0) / 1024 / 1024
  return t('offline.size', { size: formatNumber(megabytes, { maximumFractionDigits: 1 }) })
})

async function prepare() {
  progress.value = { done: 0, total: 1 }
  try {
    info.value = await prepareOfflineRoute(
      { id: props.routeId, name: props.name, coordinates: props.coordinates },
      mapStyleUrls(maptilerKey, mapStyle.value),
      (done, total) => (progress.value = { done, total }),
    )
    toast.add({ title: t('offline.ready'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (error) {
    await removeOfflineRoute(props.routeId)
    toast.add({ title: t('offline.failed'), description: errorMessage(error), color: 'error' })
  }
  finally {
    progress.value = null
  }
}

async function remove() {
  await removeOfflineRoute(props.routeId)
  info.value = null
}

const available = computed(() => !!info.value)
const preparing = computed(() => !!progress.value)
defineExpose({ supported, available, preparing, prepare })
</script>

<template>
  <div v-if="supported && (progress || info)" class="space-y-2 rounded-lg border border-default p-3">
    <div v-if="progress" class="space-y-2" aria-live="polite">
      <p class="text-sm">{{ t('offline.downloading', { percent }) }}</p>
      <UProgress :model-value="percent" size="sm" />
    </div>
    <template v-else-if="info">
      <p class="flex items-center gap-2 text-sm">
        <UIcon name="i-lucide-cloud-check" class="size-4 text-primary" />
        <span>
          <span class="font-medium">{{ t('offline.available') }}</span>
          <span class="text-muted"> · {{ sizeLabel }} · {{ t('offline.until', { date: formatShortDate(offlineExpiry(info).toISOString()) }) }}</span>
        </span>
      </p>
      <div class="flex gap-2">
        <UButton :label="t('offline.update')" icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="outline" @click="prepare" />
        <UButton :label="t('offline.remove')" icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost" @click="remove" />
      </div>
    </template>
  </div>
</template>
