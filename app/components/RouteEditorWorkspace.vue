<script setup lang="ts">
import type { FetchError } from 'ofetch'

// Map + side panel of the route editor, shared by the create and edit pages.
defineProps<{
  submitLabel: string
}>()

const editor = useRouteEditorStore()
const hasLockedTrack = computed(() => editor.segments.some(segment => segment.mode === 'locked'))
const toast = useToast()
const saving = ref(false)

const sportItems = SPORT_TYPES.map(value => ({ value, label: SPORT_LABELS[value], icon: SPORT_ICONS[value] }))

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
        <MapRouteEditor />
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
      </div>

      <ElevationProfile
        v-if="editor.track.elevations && editor.track.coordinates.length >= 2"
        :coordinates="editor.track.coordinates"
        :elevations="editor.track.elevations"
      />

      <p v-if="editor.waypoints.length < 2" class="text-sm text-muted">
        <UIcon name="i-lucide-mouse-pointer-click" class="mr-1 align-text-bottom" />
        Clique sur la carte pour placer les points de ton parcours, ou importe un fichier GPX.
      </p>
      <UAlert
        v-if="hasLockedTrack"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        title="Tracé verrouillé"
        description="Ce parcours a été créé avant l'édition des points : son tracé ne peut pas être modifié. Tu peux le prolonger, ou l'effacer pour le retracer."
      />
      <ul v-if="editor.waypoints.length >= 2" class="space-y-1 text-sm text-muted">
        <li><UIcon name="i-lucide-move" class="mr-1 align-text-bottom" />Glisse un point pour le déplacer.</li>
        <li><UIcon name="i-lucide-git-commit-horizontal" class="mr-1 align-text-bottom" />Glisse la ligne pour ajouter un point.</li>
        <li><UIcon name="i-lucide-x" class="mr-1 align-text-bottom" />Clic droit (appui long sur mobile) sur un point pour le supprimer.</li>
      </ul>

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
