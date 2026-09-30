<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { CollectionSummary } from '#shared/types/routes'
import type { CollectionInput } from '#shared/utils/collections'

// "Add to a collection" dialog of a route page (opened from its actions menu, signed-in viewers only): the viewer's
// collections, each with a checkbox, and a form to create one that holds the route.
const props = defineProps<{ routeId: string }>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const { t } = useI18n()

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
    toast.add({ title: t('collections.unavailable'), description: errorMessage(error), color: 'error' })
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
    toast.add({ title: t('route.actionFailed'), description: errorMessage(error), color: 'error' })
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
    toast.add({ title: t('collections.created'), description: t('collections.routeAdded', { name: form.value.name }), color: 'success', icon: 'i-lucide-check' })
    form.value = { name: '', description: '', is_public: false }
    creating.value = false
    await load()
  }
  catch (error) {
    toast.add({ title: t('collections.createFailed'), description: errorMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

const inCount = computed(() => collections.value?.filter(collection => collection.contains).length ?? 0)
</script>

<template>
  <UModal v-model:open="open" :title="t('route.addToCollection')" :description="inCount ? t('collections.inCount', inCount) : undefined">
    <template #body>
      <div class="space-y-4">
        <!-- Rows shaped like the checkboxes below (name, then route count). -->
        <div v-if="loading && !collections" class="space-y-1">
          <span class="sr-only">{{ t('collections.loading') }}</span>
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
        <ul v-else-if="collections?.length" class="space-y-1" :aria-label="t('collections.mine')">
          <li v-for="collection in collections" :key="collection.id" class="flex items-center gap-2 rounded-md p-2 hover:bg-elevated">
            <UCheckbox
              :model-value="collection.contains"
              :disabled="pending === collection.id"
              :label="collection.name"
              :description="`${t('collections.routeCount', collection.route_count)}${collection.is_public ? '' : ` · ${t('collections.private')}`}`"
              class="flex-1"
              @update:model-value="toggle(collection)"
            />
            <UButton
              :to="`/collections/${collection.id}`"
              icon="i-lucide-arrow-up-right"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('collections.view', { name: collection.name })"
            />
          </li>
        </ul>
        <p v-else-if="collections && !creating" class="text-sm text-muted">
          {{ t('collections.noneYet') }}
        </p>

        <UForm v-if="creating" :schema="collectionSchema" :state="form" class="space-y-3 rounded-lg border border-default p-3" @submit="create">
          <UFormField :label="t('collections.name')" name="name" required>
            <UInput v-model="form.name" class="w-full" autofocus :placeholder="t('collections.namePlaceholder')" />
          </UFormField>
          <UFormField :label="t('collections.description')" name="description">
            <UTextarea v-model="form.description" :rows="2" autoresize class="w-full" />
          </UFormField>
          <USwitch v-model="form.is_public" :label="t('collections.public')" :description="t('collections.publicHint')" />
          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="outline" @click="creating = false" />
            <UButton type="submit" :label="t('collections.createAndAdd')" :loading="saving" />
          </div>
        </UForm>
        <UButton
          v-else
          icon="i-lucide-plus"
          :label="t('collections.new')"
          color="neutral"
          variant="soft"
          block
          @click="creating = true"
        />
      </div>
    </template>
  </UModal>
</template>
