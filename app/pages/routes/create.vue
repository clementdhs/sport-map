<script setup lang="ts">
import type { FetchError } from 'ofetch'

definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Créer un parcours — sport-map' })

const editor = useRouteEditorStore()
const toast = useToast()
const saving = ref(false)

const sportItems = SPORT_TYPES.map(value => ({ value, label: SPORT_LABELS[value], icon: SPORT_ICONS[value] }))

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
      <div class="flex items-end justify-between gap-4">
        <div>
          <p class="text-sm text-muted">Distance</p>
          <p class="text-3xl font-semibold tabular-nums">{{ formatDistance(editor.distanceM) }}</p>
        </div>
        <div class="flex gap-2">
          <UTooltip text="Annuler le dernier point">
            <UButton
              icon="i-lucide-undo-2"
              color="neutral"
              variant="outline"
              aria-label="Annuler le dernier point"
              :disabled="!editor.points.length"
              @click="editor.undo()"
            />
          </UTooltip>
          <UTooltip text="Effacer le tracé">
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="outline"
              aria-label="Effacer le tracé"
              :disabled="!editor.points.length"
              @click="editor.clearPoints()"
            />
          </UTooltip>
        </div>
      </div>

      <p v-if="editor.points.length < 2" class="text-sm text-muted">
        <UIcon name="i-lucide-mouse-pointer-click" class="mr-1 align-text-bottom" />
        Clique sur la carte pour placer les points de ton parcours.
      </p>

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
          label="Enregistrer le parcours"
          icon="i-lucide-save"
          block
          :loading="saving"
          :disabled="!editor.canSave"
        />
      </UForm>
    </aside>
  </div>
</template>
