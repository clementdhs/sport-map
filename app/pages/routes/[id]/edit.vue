<script setup lang="ts">
import type { RouteDetail } from '#shared/types/routes'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const user = useSupabaseUser()

const { data: parcours, error } = await useFetch<RouteDetail>(`/api/routes/${route.params.id}`)
if (error.value || !parcours.value) {
  throw createError({
    statusCode: error.value?.statusCode ?? 404,
    statusMessage: error.value?.statusMessage ?? 'Parcours introuvable',
    fatal: true,
  })
}
// The API also refuses the update: this only avoids showing an editor that could not save.
if (parcours.value.owner_id !== user.value?.sub) {
  throw createError({ statusCode: 403, statusMessage: 'Tu ne peux modifier que tes propres parcours', fatal: true })
}

useSeoMeta({ title: () => `Modifier « ${parcours.value?.name} » — sport-map` })

// Keep edits in progress when coming back to the page; load the route otherwise.
const editor = useRouteEditorStore()
if (editor.editingId !== parcours.value.id) editor.loadRoute(parcours.value)
</script>

<template>
  <RouteEditorWorkspace submit-label="Enregistrer les modifications" />
</template>
