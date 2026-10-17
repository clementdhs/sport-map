<script setup lang="ts">
import type { CollectionDetail } from '#shared/types/routes'
import type { CollectionInput } from '#shared/utils/collections'

const { formatDistance, formatDate } = useFormat()

// Map page: MapSheetLayout replaces the header with its floating top bar.
definePageMeta({ layout: false })
const route = useRoute()
const toast = useToast()
const { t } = useI18n()
const collectionSchemaLocalized = useLocalizedSchema(collectionSchema)
const errorMessage = useErrorMessage()

const { data: collection, error } = await useFetch<CollectionDetail>(`/api/collections/${route.params.id}`)
if (error.value || !collection.value) {
  throw createError({
    statusCode: error.value?.statusCode ?? 404,
    statusMessage: error.value?.statusMessage ?? t('collection.notFound'),
    fatal: true,
  })
}

// Own state for what the page changes: useFetch data is a shallow ref.
const info = ref<CollectionInput>({
  name: collection.value.name,
  description: collection.value.description ?? '',
  is_public: collection.value.is_public,
})
const routes = ref(collection.value.routes)
const highlightedId = ref<string | null>(null)

const totalDistance = computed(() => routes.value.reduce((sum, item) => sum + item.distance_m, 0))
const totalGain = computed(() => routes.value.reduce((sum, item) => sum + (item.elevation_gain_m ?? 0), 0))

const editOpen = ref(false)
const saving = ref(false)
const form = ref<CollectionInput>({ ...info.value })
watch(editOpen, (open) => {
  if (open) form.value = { ...info.value }
})

async function save() {
  saving.value = true
  try {
    await $fetch(`/api/collections/${collection.value!.id}`, { method: 'PATCH', body: form.value })
    info.value = { ...form.value }
    editOpen.value = false
    toast.add({ title: t('collection.updated'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (error) {
    toast.add({ title: t('collection.updateFailed'), description: errorMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

const removing = ref<string | null>(null)

async function removeRoute(routeId: string) {
  removing.value = routeId
  try {
    await $fetch(`/api/collections/${collection.value!.id}/routes/${routeId}`, { method: 'DELETE' })
    routes.value = routes.value.filter(item => item.id !== routeId)
    if (highlightedId.value === routeId) highlightedId.value = null
  }
  catch (error) {
    toast.add({ title: t('collection.removeFailed'), description: errorMessage(error), color: 'error' })
  }
  finally {
    removing.value = null
  }
}

const deleteOpen = ref(false)
const deleting = ref(false)

async function deleteCollection() {
  deleting.value = true
  try {
    await $fetch(`/api/collections/${collection.value!.id}`, { method: 'DELETE' })
    toast.add({ title: t('collection.deleted'), color: 'success', icon: 'i-lucide-check' })
    await navigateTo('/profile')
  }
  catch (error) {
    toast.add({ title: t('route.deleteFailed'), description: errorMessage(error), color: 'error' })
    deleting.value = false
  }
}

const pageUrl = useRequestURL().href

async function copyLink() {
  try {
    await navigator.clipboard.writeText(pageUrl)
    toast.add({ title: t('collection.linkCopied'), color: 'success', icon: 'i-lucide-check' })
  }
  catch {
    toast.add({ title: t('collection.copyFailed'), description: pageUrl, color: 'error' })
  }
}

const summary = computed(() => `${t('collection.summary', { count: routes.value.length, distance: formatDistance(totalDistance.value) }, routes.value.length)}`
  + (info.value.description ? ` — ${info.value.description}` : ''))

useSeoMeta({
  title: () => `${info.value.name} — sport-map`,
  description: summary,
  ogTitle: () => info.value.name,
  ogDescription: summary,
})
</script>

<template>
  <MapSheetLayout v-if="collection" back="/">
    <template #map>
      <ClientOnly>
        <MapRouteCollection :routes="routes" :highlighted-id="highlightedId" @hover="highlightedId = $event" />
      </ClientOnly>
    </template>

    <template #title>
      {{ info.name }}
    </template>

    <div class="flex flex-wrap items-center gap-2">
      <UBadge icon="i-lucide-folder" :label="t('collection.badge')" variant="subtle" />
      <UBadge v-if="info.is_public" icon="i-lucide-globe" :label="t('collection.public')" color="neutral" variant="subtle" />
      <UBadge v-else icon="i-lucide-lock" :label="t('profile.privateCollection')" color="neutral" variant="subtle" />
    </div>

    <!-- Phones: the sheet title already shows the name; the heading stays for screen readers. -->
    <h1 class="text-2xl font-semibold max-md:sr-only">{{ info.name }}</h1>

    <p class="text-sm text-muted">
      {{ t('route.by') }}
      <ULink v-if="collection.owner" :to="`/profile/${collection.owner.username}`" class="font-medium text-default hover:underline">
        {{ collection.owner.display_name ?? collection.owner.username }}
      </ULink>
      <span v-if="collection.is_mine" class="ms-1">{{ t('route.you') }}</span>
      · {{ formatDate(collection.created_at) }}
    </p>

    <p v-if="info.description" class="whitespace-pre-line">{{ info.description }}</p>

    <div class="grid grid-cols-3 gap-2">
      <div class="rounded-lg bg-elevated p-3">
        <p class="text-sm text-muted">{{ t('collection.routes') }}</p>
        <p class="text-lg font-semibold">{{ routes.length }}</p>
      </div>
      <div class="rounded-lg bg-elevated p-3">
        <p class="text-sm text-muted">{{ t('route.distance') }}</p>
        <p class="text-lg font-semibold">{{ formatDistance(totalDistance) }}</p>
      </div>
      <div class="rounded-lg bg-elevated p-3">
        <p class="text-sm text-muted">{{ t('record.gain') }}</p>
        <p class="text-lg font-semibold">{{ Math.round(totalGain) }} m</p>
      </div>
    </div>

    <div v-if="collection.is_mine || info.is_public" class="flex flex-wrap gap-2">
      <UButton
        v-if="info.is_public"
        icon="i-lucide-link"
        :label="t('collection.copyLink')"
        color="neutral"
        variant="outline"
        @click="copyLink"
      />
      <UModal v-if="collection.is_mine" v-model:open="editOpen" :title="t('collection.editTitle')">
        <UButton icon="i-lucide-pencil" :label="t('reviews.edit')" color="neutral" variant="outline" />
        <template #body>
          <UForm id="collection-form" :schema="collectionSchemaLocalized" :state="form" class="space-y-4" @submit="save">
            <UFormField :label="t('collections.name')" name="name" required>
              <UInput v-model="form.name" class="w-full" />
            </UFormField>
            <UFormField :label="t('collections.description')" name="description">
              <UTextarea v-model="form.description" :rows="3" autoresize class="w-full" />
            </UFormField>
            <USwitch v-model="form.is_public" :label="t('collections.public')" :description="t('collections.publicHint')" />
          </UForm>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="outline" @click="editOpen = false" />
            <UButton type="submit" form="collection-form" :label="t('common.save')" :loading="saving" />
          </div>
        </template>
      </UModal>
      <UModal
        v-if="collection.is_mine"
        v-model:open="deleteOpen"
        :title="t('collection.deleteTitle')"
        :description="t('collection.deleteDescription')"
      >
        <UButton icon="i-lucide-trash-2" color="error" variant="ghost" :aria-label="t('collection.delete')" />
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="outline" @click="deleteOpen = false" />
            <UButton :label="t('common.delete')" icon="i-lucide-trash-2" color="error" :loading="deleting" @click="deleteCollection" />
          </div>
        </template>
      </UModal>
    </div>

    <ul v-if="routes.length" class="space-y-2" :aria-label="t('collection.routesLabel')">
      <li
        v-for="item in routes"
        :key="item.id"
        class="flex items-start gap-1"
        @mouseenter="highlightedId = item.id"
        @mouseleave="highlightedId = null"
      >
        <RouteCard :route="item" :highlighted="highlightedId === item.id" class="flex-1" />
        <UButton
          v-if="collection.is_mine"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          :loading="removing === item.id"
          :aria-label="t('collection.removeRoute', { name: item.name })"
          @click="removeRoute(item.id)"
        />
      </li>
    </ul>
    <UEmpty
      v-else
      icon="i-lucide-folder-open"
      :title="t('collection.empty')"
      :description="collection.is_mine ? t('collection.emptyMine') : t('collection.emptyOther')"
      :actions="collection.is_mine ? [{ label: t('profile.discover'), icon: 'i-lucide-map', to: '/' }] : undefined"
    />
  </MapSheetLayout>
</template>
