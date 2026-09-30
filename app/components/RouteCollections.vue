<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { CollectionSummary } from '#shared/types/routes'
import type { CollectionInput } from '#shared/utils/collections'

// "Add to a collection" dialog of a route page (opened from its actions menu, signed-in viewers only): the viewer's
// collections, each with a checkbox, and a form to create one that holds the route.
const props = defineProps<{ routeId: string }>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()

const collections = ref<CollectionSummary[] | null>(null)
const loading = ref(false)
const pending = ref<string | null>(null)

const errorMessage = (error: unknown) => (error as FetchError).data?.statusMessage ?? (error as Error).message

async function load() {
  loading.value = true
  try {
    collections.value = await $fetch<CollectionSummary[]>('/api/collections', { query: { route: props.routeId } })
  }
  catch (error) {
    toast.add({ title: 'Collections indisponibles', description: errorMessage(error), color: 'error' })
  }
  finally {
    loading.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) load()
})

async function toggle(collection: CollectionSummary) {
  pending.value = collection.id
  try {
    await $fetch(`/api/collections/${collection.id}/routes/${props.routeId}`, { method: collection.contains ? 'DELETE' : 'PUT' })
    collections.value = collections.value!.map(item => item.id === collection.id
      ? { ...item, contains: !item.contains, route_count: item.route_count + (item.contains ? -1 : 1) }
      : item)
  }
  catch (error) {
    toast.add({ title: 'Action impossible', description: errorMessage(error), color: 'error' })
  }
  finally {
    pending.value = null
  }
}

const creating = ref(false)
const saving = ref(false)
const form = ref<CollectionInput>({ name: '', description: '', is_public: false })

async function create() {
  saving.value = true
  try {
    await $fetch('/api/collections', { method: 'POST', body: { ...form.value, route_id: props.routeId } })
    toast.add({ title: 'Collection créée', description: `Parcours ajouté à « ${form.value.name} »`, color: 'success', icon: 'i-lucide-check' })
    form.value = { name: '', description: '', is_public: false }
    creating.value = false
    await load()
  }
  catch (error) {
    toast.add({ title: 'Création impossible', description: errorMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

const inCount = computed(() => collections.value?.filter(collection => collection.contains).length ?? 0)
</script>

<template>
  <UModal v-model:open="open" title="Ajouter à une collection" :description="inCount ? `Dans ${inCount} de tes collections` : undefined">
    <template #body>
      <div class="space-y-4">
        <!-- Rows shaped like the checkboxes below (name, then route count). -->
        <div v-if="loading && !collections" class="space-y-1">
          <span class="sr-only">Chargement de tes collections…</span>
          <div v-for="i in 2" :key="i" class="flex items-center gap-2 p-2" aria-hidden="true">
            <div class="flex flex-1 gap-2">
              <USkeleton class="mt-0.5 size-4 rounded-sm" />
              <div class="flex-1 space-y-1 py-0.5">
                <USkeleton class="h-4 w-1/2" />
                <USkeleton class="h-4 w-1/4" />
              </div>
            </div>
            <USkeleton class="size-8" />
          </div>
        </div>
        <ul v-else-if="collections?.length" class="space-y-1" aria-label="Mes collections">
          <li v-for="collection in collections" :key="collection.id" class="flex items-center gap-2 rounded-md p-2 hover:bg-elevated">
            <UCheckbox
              :model-value="collection.contains"
              :disabled="pending === collection.id"
              :label="collection.name"
              :description="`${collection.route_count} parcours${collection.is_public ? '' : ' · privée'}`"
              class="flex-1"
              @update:model-value="toggle(collection)"
            />
            <UButton
              :to="`/collections/${collection.id}`"
              icon="i-lucide-arrow-up-right"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`Voir la collection ${collection.name}`"
            />
          </li>
        </ul>
        <p v-else-if="collections && !creating" class="text-sm text-muted">
          Tu n'as pas encore de collection. Crée-en une pour regrouper des parcours (un week-end, un séjour…).
        </p>

        <UForm v-if="creating" :schema="collectionSchema" :state="form" class="space-y-3 rounded-lg border border-default p-3" @submit="create">
          <UFormField label="Nom" name="name" required>
            <UInput v-model="form.name" class="w-full" autofocus placeholder="Week-end dans les Vosges" />
          </UFormField>
          <UFormField label="Description" name="description">
            <UTextarea v-model="form.description" :rows="2" autoresize class="w-full" />
          </UFormField>
          <USwitch v-model="form.is_public" label="Collection publique" description="Visible par tous ceux qui ont le lien. Tes parcours privés y restent cachés." />
          <div class="flex justify-end gap-2">
            <UButton label="Annuler" color="neutral" variant="outline" @click="creating = false" />
            <UButton type="submit" label="Créer et ajouter" :loading="saving" />
          </div>
        </UForm>
        <UButton
          v-else
          icon="i-lucide-plus"
          label="Nouvelle collection"
          color="neutral"
          variant="soft"
          block
          @click="creating = true"
        />
      </div>
    </template>
  </UModal>
</template>
