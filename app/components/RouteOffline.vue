<script setup lang="ts">
import type { LngLat } from '#shared/utils/routes'
import type { OfflineRouteInfo } from '~/utils/offlineRoute'

// Prepares the follow mode of a route for use without network (see app/utils/offlineRoute.ts).
const props = defineProps<{
  routeId: string
  name: string
  coordinates: LngLat[]
}>()

const toast = useToast()
const { maptilerKey } = useRuntimeConfig().public

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
  return `${megabytes.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
})

async function prepare() {
  progress.value = { done: 0, total: 1 }
  try {
    info.value = await prepareOfflineRoute(
      { id: props.routeId, name: props.name, coordinates: props.coordinates },
      mapStyleUrl(maptilerKey),
      (done, total) => (progress.value = { done, total }),
    )
    toast.add({ title: 'Parcours disponible hors-ligne', color: 'success', icon: 'i-lucide-check' })
  }
  catch (error) {
    await removeOfflineRoute(props.routeId)
    toast.add({ title: 'Préparation impossible', description: (error as Error).message, color: 'error' })
  }
  finally {
    progress.value = null
  }
}

async function remove() {
  await removeOfflineRoute(props.routeId)
  info.value = null
}
</script>

<template>
  <div v-if="supported" class="space-y-2 rounded-lg border border-default p-3">
    <div v-if="progress" class="space-y-2" aria-live="polite">
      <p class="text-sm">Téléchargement de la carte… {{ percent }} %</p>
      <UProgress :model-value="percent" size="sm" />
    </div>
    <template v-else-if="info">
      <p class="flex items-center gap-2 text-sm">
        <UIcon name="i-lucide-cloud-check" class="size-4 text-primary" />
        <span>
          <span class="font-medium">Disponible hors-ligne</span>
          <span class="text-muted"> · {{ sizeLabel }} · jusqu'au {{ formatShortDate(offlineExpiry(info).toISOString()) }}</span>
        </span>
      </p>
      <div class="flex gap-2">
        <UButton label="Mettre à jour" icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="outline" @click="prepare" />
        <UButton label="Supprimer du téléphone" icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost" @click="remove" />
      </div>
    </template>
    <template v-else>
      <UButton
        label="Préparer pour le hors-ligne"
        icon="i-lucide-cloud-download"
        color="neutral"
        variant="outline"
        block
        @click="prepare"
      />
      <p class="text-xs text-muted">
        Garde sur ce téléphone la carte autour du tracé et le mode suivi, pour t'en servir sans réseau.
        Compte 20 à 30 Mo pour 30 km : de préférence en Wi-Fi.
      </p>
    </template>
  </div>
</template>
