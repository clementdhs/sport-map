<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { LngLat } from '#shared/utils/routes'

// Map + side panel of the route editor, shared by the create and edit pages.
defineProps<{
  submitLabel: string
}>()

const editor = useRouteEditorStore()
const hasLockedTrack = computed(() => editor.segments.some(segment => segment.mode === 'locked'))
const hoverPoint = ref<LngLat | null>(null)
const toast = useToast()
const saving = ref(false)

const sportItems = SPORT_TYPES.map(value => ({ value, label: SPORT_LABELS[value], icon: SPORT_ICONS[value] }))
const poiItems = POI_TYPES.map(value => ({ value, label: POI_LABELS[value], icon: POI_ICONS[value] }))

const gpxInput = useTemplateRef('gpxInput')
const importing = ref(false)

async function onGpxSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-selecting the same file
  if (!file) return
  if (editor.waypoints.length && !window.confirm('Remplacer le tracé en cours par ce fichier GPX ?')) return

  importing.value = true
  try {
    const track = await readGpxFile(file)
    editor.importTrack(track)
    toast.add({
      title: 'Trace importée',
      description: track.elevations
        ? `${track.coordinates.length} points.`
        : `${track.coordinates.length} points. Le fichier ne contient pas d'altitudes : le dénivelé ne sera pas calculé.`,
      color: 'success',
      icon: 'i-lucide-file-check',
    })
  }
  catch (error) {
    toast.add({ title: 'Import impossible', description: (error as Error).message, color: 'error' })
  }
  finally {
    importing.value = false
  }
}

async function onSubmit() {
  saving.value = true
  try {
    const id = await editor.save()
    toast.add({ title: 'Parcours enregistré', color: 'success', icon: 'i-lucide-check' })
    await navigateTo(`/routes/${id}`)
  }
  catch (error) {
    toast.add({
      title: "Impossible d'enregistrer le parcours",
      description: (error as FetchError).data?.statusMessage ?? (error as Error).message,
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex h-[calc(100dvh-var(--ui-header-height))] flex-col md:flex-row">
    <div class="relative min-h-0 flex-1">
      <ClientOnly>
        <MapRouteEditor :hover-point="hoverPoint" />
      </ClientOnly>
    </div>

    <aside class="max-h-[40dvh] shrink-0 space-y-5 overflow-y-auto border-t border-default p-4 md:max-h-none md:w-96 md:border-t-0 md:border-l">
      <div class="flex items-center justify-between gap-4">
        <USwitch
          v-model="editor.snapToPaths"
          label="Suivre les chemins"
          :description="editor.snapToPaths ? `Itinéraire adapté : ${SPORT_LABELS[editor.details.sport_type].toLowerCase()}` : 'Tracé en ligne droite'"
        />
        <div class="flex gap-2">
          <UTooltip text="Importer un fichier GPX">
            <UButton
              icon="i-lucide-upload"
              color="neutral"
              variant="outline"
              aria-label="Importer un fichier GPX"
              :loading="importing"
              @click="gpxInput?.click()"
            />
          </UTooltip>
          <input ref="gpxInput" type="file" accept=".gpx,application/gpx+xml" class="hidden" @change="onGpxSelected">
          <UTooltip text="Annuler la dernière action">
            <UButton
              icon="i-lucide-undo-2"
              color="neutral"
              variant="outline"
              aria-label="Annuler la dernière action"
              :disabled="!editor.canUndo"
              @click="editor.undo()"
            />
          </UTooltip>
          <UTooltip text="Effacer le tracé">
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="outline"
              aria-label="Effacer le tracé"
              :disabled="!editor.waypoints.length"
              @click="editor.clearPoints()"
            />
          </UTooltip>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="col-span-3">
          <p class="flex items-center gap-2 text-sm text-muted">
            Distance
            <UIcon v-if="editor.isRouting" name="i-lucide-loader-circle" class="size-4 animate-spin" aria-label="Calcul en cours" />
          </p>
          <p class="text-3xl font-semibold">{{ formatDistance(editor.distanceM) }}</p>
        </div>
        <div>
          <p class="text-sm text-muted">Dénivelé +</p>
          <p class="text-lg font-semibold">{{ editor.elevation ? `${Math.round(editor.elevation.gain)} m` : '—' }}</p>
        </div>
        <div>
          <p class="text-sm text-muted">Dénivelé −</p>
          <p class="text-lg font-semibold">{{ editor.elevation ? `${Math.round(editor.elevation.loss)} m` : '—' }}</p>
        </div>
        <DurationEstimate
          v-if="editor.distanceM > 0"
          :sport="editor.details.sport_type"
          :distance-m="editor.distanceM"
          :elevation-gain-m="editor.elevation?.gain ?? null"
        />
      </div>

      <ElevationProfile
        v-if="editor.track.elevations && editor.track.coordinates.length >= 2"
        :coordinates="editor.track.coordinates"
        :elevations="editor.track.elevations"
        @hover="hoverPoint = $event"
      />

      <p v-if="editor.waypoints.length < 2" class="text-sm text-muted">
        <UIcon name="i-lucide-mouse-pointer-click" class="mr-1 align-text-bottom" />
        Clique sur la carte pour placer les points de ton parcours, ou importe un fichier GPX.
      </p>
      <UAlert
        v-if="editor.routingQuotaReached"
        color="warning"
        variant="subtle"
        icon="i-lucide-gauge"
        title="Limite de calculs atteinte pour aujourd'hui"
        description="Pour préserver le service gratuit de calcul d'itinéraire, chacun a un nombre limité de calculs par jour. D'ici demain, les nouveaux segments sont tracés en ligne droite, sans dénivelé."
      />
      <p
        v-else-if="editor.routingQuotaRemaining !== null && editor.routingQuotaRemaining <= ROUTING_QUOTA_WARNING"
        class="text-sm text-warning"
      >
        <UIcon name="i-lucide-gauge" class="mr-1 align-text-bottom" />
        Plus que {{ editor.routingQuotaRemaining }} calcul{{ editor.routingQuotaRemaining > 1 ? 's' : '' }} d'itinéraire aujourd'hui.
      </p>
      <UAlert
        v-if="hasLockedTrack"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        title="Tracé verrouillé"
        description="Ce parcours a été créé avant l'édition des points : son tracé ne peut pas être modifié. Tu peux le prolonger, ou l'effacer pour le retracer."
      />
      <div v-if="editor.waypoints.length >= 2" class="grid grid-cols-2 gap-2">
        <UButton
          icon="i-lucide-rotate-ccw"
          label="Revenir au départ"
          color="neutral"
          variant="outline"
          block
          :disabled="!editor.canFinish"
          @click="editor.returnToStart()"
        />
        <UButton
          icon="i-lucide-arrow-left-right"
          label="Aller-retour"
          color="neutral"
          variant="outline"
          block
          :disabled="!editor.canFinish"
          @click="editor.outAndBack()"
        />
      </div>
      <p v-if="editor.isLoop" class="-mt-3 text-sm text-muted">
        <UIcon name="i-lucide-circle-check" class="mr-1 align-text-bottom" />Le parcours revient à son point de départ.
      </p>
      <ul v-if="editor.waypoints.length >= 2" class="space-y-1 text-sm text-muted">
        <li><UIcon name="i-lucide-move" class="mr-1 align-text-bottom" />Glisse un point pour le déplacer.</li>
        <li><UIcon name="i-lucide-git-commit-horizontal" class="mr-1 align-text-bottom" />Glisse la ligne pour ajouter un point.</li>
        <li><UIcon name="i-lucide-x" class="mr-1 align-text-bottom" />Clic droit (appui long sur mobile) sur un point pour le supprimer.</li>
      </ul>

      <section v-if="editor.track.coordinates.length >= 2" class="space-y-3" aria-labelledby="pois-title">
        <div class="flex items-center justify-between gap-2">
          <h2 id="pois-title" class="font-medium">Points d'intérêt</h2>
          <UButton
            v-if="!editor.placingPoi"
            icon="i-lucide-map-pin-plus"
            label="Ajouter"
            size="sm"
            color="neutral"
            variant="outline"
            :disabled="editor.pois.length >= MAX_POIS"
            @click="editor.placingPoi = true"
          />
          <UButton v-else label="Annuler" size="sm" color="neutral" variant="ghost" @click="editor.placingPoi = false" />
        </div>
        <p v-if="editor.placingPoi" class="text-sm text-primary">
          <UIcon name="i-lucide-mouse-pointer-click" class="mr-1 align-text-bottom" />Clique sur la carte : le point se place sur le tracé.
        </p>
        <p v-else-if="!editor.pois.length" class="text-sm text-muted">
          Signale un point d'eau, un point de vue, un parking ou un passage difficile.
        </p>
        <ul v-if="editor.pois.length" class="space-y-3">
          <li
            v-for="(poi, i) in editor.pois"
            :key="i"
            class="grid grid-cols-[1fr_auto] gap-2"
            @mouseenter="hoverPoint = poi.coordinates"
            @mouseleave="hoverPoint = null"
          >
            <USelect
              v-model="poi.type"
              :items="poiItems"
              :icon="POI_ICONS[poi.type]"
              :aria-label="`Type du point d'intérêt ${i + 1}`"
              class="w-full"
            />
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              :aria-label="`Supprimer le point d'intérêt ${i + 1}`"
              @click="editor.removePoi(i)"
            />
            <UInput
              v-model="poi.note"
              placeholder="Note (facultatif)"
              :maxlength="MAX_POI_NOTE_LENGTH"
              :aria-label="`Note du point d'intérêt ${i + 1}`"
              class="col-span-2 w-full"
            />
          </li>
        </ul>
      </section>

      <USeparator />

      <UForm :schema="routeDetailsSchema" :state="editor.details" class="space-y-4" @submit="onSubmit">
        <UFormField label="Nom" name="name" required>
          <UInput v-model="editor.details.name" placeholder="Tour du lac" class="w-full" />
        </UFormField>

        <UFormField label="Sport" name="sport_type">
          <USelect v-model="editor.details.sport_type" :items="sportItems" class="w-full" />
        </UFormField>

        <UFormField label="Description" name="description">
          <UTextarea v-model="editor.details.description" :rows="3" autoresize class="w-full" />
        </UFormField>

        <UFormField name="is_public">
          <USwitch
            v-model="editor.details.is_public"
            label="Parcours public"
            description="Visible par tous et dans la recherche."
          />
        </UFormField>

        <UButton
          type="submit"
          :label="submitLabel"
          icon="i-lucide-save"
          block
          :loading="saving"
          :disabled="!editor.canSave"
        />
      </UForm>
    </aside>
  </div>
</template>
