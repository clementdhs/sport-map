<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { CollectionDetail } from '#shared/types/routes'
import type { CollectionInput } from '#shared/utils/collections'

const route = useRoute()
const toast = useToast()

const { data: collection, error } = await useFetch<CollectionDetail>(`/api/collections/${route.params.id}`)
if (error.value || !collection.value) {
  throw createError({
    statusCode: error.value?.statusCode ?? 404,
    statusMessage: error.value?.statusMessage ?? 'Collection introuvable',
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

const errorMessage = (error: unknown) => (error as FetchError).data?.statusMessage ?? (error as Error).message

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
    toast.add({ title: 'Collection mise à jour', color: 'success', icon: 'i-lucide-check' })
  }
  catch (error) {
    toast.add({ title: 'Mise à jour impossible', description: errorMessage(error), color: 'error' })
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
    toast.add({ title: 'Retrait impossible', description: errorMessage(error), color: 'error' })
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
    toast.add({ title: 'Collection supprimée', color: 'success', icon: 'i-lucide-check' })
    await navigateTo('/profile')
  }
  catch (error) {
    toast.add({ title: 'Suppression impossible', description: errorMessage(error), color: 'error' })
    deleting.value = false
  }
}

const pageUrl = useRequestURL().href

async function copyLink() {
  try {
    await navigator.clipboard.writeText(pageUrl)
    toast.add({ title: 'Lien copié', color: 'success', icon: 'i-lucide-check' })
  }
  catch {
    toast.add({ title: 'Copie impossible', description: pageUrl, color: 'error' })
  }
}

const summary = computed(() => `Collection de ${routes.value.length} parcours · ${formatDistance(totalDistance.value)}`
  + (info.value.description ? ` — ${info.value.description}` : ''))

useSeoMeta({
  title: () => `${info.value.name} — sport-map`,
  description: summary,
  ogTitle: () => info.value.name,
  ogDescription: summary,
})
</script>

<template>
  <div v-if="collection" class="flex h-[calc(100dvh-var(--ui-header-height))] flex-col md:flex-row">
    <div class="relative min-h-0 flex-1">
      <ClientOnly>
        <MapRouteCollection :routes="routes" :highlighted-id="highlightedId" @hover="highlightedId = $event" />
      </ClientOnly>
    </div>

    <aside class="max-h-[50dvh] shrink-0 space-y-4 overflow-y-auto border-t border-default p-4 md:max-h-none md:w-96 md:border-t-0 md:border-l">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge icon="i-lucide-folder" label="Collection" variant="subtle" />
        <UBadge v-if="info.is_public" icon="i-lucide-globe" label="Publique" color="neutral" variant="subtle" />
        <UBadge v-else icon="i-lucide-lock" label="Privée" color="neutral" variant="subtle" />
      </div>

      <h1 class="text-2xl font-semibold">{{ info.name }}</h1>

      <p class="text-sm text-muted">
        Par
        <ULink v-if="collection.owner" :to="`/profile/${collection.owner.username}`" class="font-medium text-default hover:underline">
          {{ collection.owner.display_name ?? collection.owner.username }}
        </ULink>
        <span v-if="collection.is_mine"> (toi)</span>
        · {{ formatDate(collection.created_at) }}
      </p>

      <p v-if="info.description" class="whitespace-pre-line">{{ info.description }}</p>

      <div class="grid grid-cols-3 gap-2">
        <div class="rounded-lg bg-elevated p-3">
          <p class="text-sm text-muted">Parcours</p>
          <p class="text-lg font-semibold">{{ routes.length }}</p>
        </div>
        <div class="rounded-lg bg-elevated p-3">
          <p class="text-sm text-muted">Distance</p>
          <p class="text-lg font-semibold">{{ formatDistance(totalDistance) }}</p>
        </div>
        <div class="rounded-lg bg-elevated p-3">
          <p class="text-sm text-muted">D+</p>
          <p class="text-lg font-semibold">{{ Math.round(totalGain) }} m</p>
        </div>
      </div>

      <div v-if="collection.is_mine || info.is_public" class="flex flex-wrap gap-2">
        <UButton
          v-if="info.is_public"
          icon="i-lucide-link"
          label="Copier le lien"
          color="neutral"
          variant="outline"
          @click="copyLink"
        />
        <UModal v-if="collection.is_mine" v-model:open="editOpen" title="Modifier la collection">
          <UButton icon="i-lucide-pencil" label="Modifier" color="neutral" variant="outline" />
          <template #body>
            <UForm id="collection-form" :schema="collectionSchema" :state="form" class="space-y-4" @submit="save">
              <UFormField label="Nom" name="name" required>
                <UInput v-model="form.name" class="w-full" />
              </UFormField>
              <UFormField label="Description" name="description">
                <UTextarea v-model="form.description" :rows="3" autoresize class="w-full" />
              </UFormField>
              <USwitch v-model="form.is_public" label="Collection publique" description="Visible par tous ceux qui ont le lien. Tes parcours privés y restent cachés." />
            </UForm>
          </template>
          <template #footer>
            <div class="flex w-full justify-end gap-2">
              <UButton label="Annuler" color="neutral" variant="outline" @click="editOpen = false" />
              <UButton type="submit" form="collection-form" label="Enregistrer" :loading="saving" />
            </div>
          </template>
        </UModal>
        <UModal
          v-if="collection.is_mine"
          v-model:open="deleteOpen"
          title="Supprimer cette collection ?"
          description="Les parcours ne sont pas supprimés, seulement leur regroupement."
        >
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" aria-label="Supprimer la collection" />
          <template #footer>
            <div class="flex w-full justify-end gap-2">
              <UButton label="Annuler" color="neutral" variant="outline" @click="deleteOpen = false" />
              <UButton label="Supprimer" icon="i-lucide-trash-2" color="error" :loading="deleting" @click="deleteCollection" />
            </div>
          </template>
        </UModal>
      </div>

      <ul v-if="routes.length" class="space-y-2" aria-label="Parcours de la collection">
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
            :aria-label="`Retirer ${item.name} de la collection`"
            @click="removeRoute(item.id)"
          />
        </li>
      </ul>
      <UEmpty
        v-else
        icon="i-lucide-folder-open"
        title="Collection vide"
        :description="collection.is_mine
          ? 'Ajoute des parcours depuis leur page, avec « Ajouter à une collection ».'
          : 'Aucun parcours visible dans cette collection.'"
        :actions="collection.is_mine ? [{ label: 'Découvrir des parcours', icon: 'i-lucide-map', to: '/' }] : undefined"
      />
    </aside>
  </div>
</template>
