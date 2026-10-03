<script setup lang="ts">
import type { RouteDetail } from '#shared/types/routes'

// Map page: MapSheetLayout replaces the header with its floating top bar.
definePageMeta({ layout: false })
const route = useRoute()
const user = useSupabaseUser()
const { t } = useI18n()

const { data: parcours, error } = await useFetch<RouteDetail>(`/api/routes/${route.params.id}`)
if (error.value || !parcours.value) {
  throw createError({
    statusCode: error.value?.statusCode ?? 404,
    statusMessage: error.value?.statusMessage ?? t('route.notFound'),
    fatal: true,
  })
}
// The API also refuses the update: this only avoids showing an editor that could not save.
if (parcours.value.owner_id !== user.value?.sub) {
  throw createError({ statusCode: 403, statusMessage: t('editor.notOwner'), fatal: true })
}

useSeoMeta({ title: () => `${t('editor.editTitle', { name: parcours.value?.name })} — sport-map` })

// Keep edits in progress when coming back to the page; load the route otherwise.
const editor = useRouteEditorStore()
if (editor.editingId !== parcours.value.id) editor.loadRoute(parcours.value)
</script>

<template>
  <RouteEditorWorkspace :submit-label="t('editor.submitEdit')" :back="`/routes/${parcours!.id}`" />
</template>
