<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { CollectionSummary } from '#shared/types/routes'
import type { CollectionInput } from '#shared/utils/collections'

// Collections tab of the member's profile (#236): the fixed "À faire" list first, labelled "Ma liste", then their
// collections, each with a mosaic of its last routes' outlines, its route count and who sees it; then a button to
// create one.
defineProps<{
  collections: CollectionSummary[]
  todoCount: number
  todoThumbnails: string[]
}>()
const emit = defineEmits<{ created: [] }>()

const { t } = useI18n()
const toast = useToast()
const collectionSchemaLocalized = useLocalizedSchema(collectionSchema)

// Four cells, the missing outlines left empty.
const cells = (thumbnails: string[]) => Array.from({ length: COLLECTION_COVERS }, (_, i) => thumbnails[i] ?? null)

const open = ref(false)
const saving = ref(false)
const form = ref<CollectionInput>({ name: '', description: '', is_public: false })

async function create() {
  saving.value = true
  try {
    await $fetch('/api/collections', { method: 'POST', body: form.value })
    toast.add({ title: t('collections.created'), description: t('collections.createdHint'), color: 'success', icon: 'i-lucide-check' })
    form.value = { name: '', description: '', is_public: false }
    open.value = false
    emit('created')
  }
  catch (error) {
    toast.add({ title: t('collections.createFailed'), description: (error as FetchError).data?.statusMessage ?? (error as Error).message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-2.5">
    <ul class="grid gap-2.5 lg:grid-cols-2">
      <li>
        <NuxtLink to="/collections/todo" class="flex h-full items-center gap-3.5 rounded-lg border border-default bg-default p-3 transition-colors hover:bg-elevated focus-visible:bg-elevated">
          <!-- Four outlines in rust on the muted tone, like the route cards' thumbnails. -->
          <span class="grid size-19 shrink-0 grid-cols-2 gap-0.75 overflow-hidden rounded-md" aria-hidden="true">
            <span v-for="(path, i) in cells(todoThumbnails)" :key="i" class="block bg-muted">
              <svg v-if="path" :viewBox="`0 0 ${THUMBNAIL_SIZE} ${THUMBNAIL_SIZE}`" class="block size-full"><path :d="path" fill="none" class="stroke-(--map-track)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </span>
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="font-display text-xl leading-tight font-bold">{{ t('todo.name') }}</span>
            <!-- After the name in the page, so the link's name starts with it; drawn above it. -->
            <span class="order-first self-start rounded-[3px] border-[1.5px] border-(--sign-edge) bg-(--sign) px-2 text-[11px] leading-4 font-bold tracking-wider text-(--sign-text) uppercase">
              {{ t('profile.myList') }}
            </span>
            <span class="flex flex-wrap items-center gap-x-3 text-sm text-muted">
              <span><span class="font-numbers text-base font-semibold text-highlighted tabular-nums">{{ todoCount }}</span> {{ t('profile.routeWord', todoCount) }}</span>
              <span class="flex items-center gap-1"><UIcon name="i-lucide-lock" class="size-3.5" />{{ t('profile.privateCollection') }}</span>
            </span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
        </NuxtLink>
      </li>
      <li v-for="collection in collections" :key="collection.id">
        <NuxtLink :to="`/collections/${collection.id}`" class="flex h-full items-center gap-3.5 rounded-lg border border-default bg-default p-3 transition-colors hover:bg-elevated focus-visible:bg-elevated">
          <!-- Four outlines in rust on the muted tone, like the route cards' thumbnails. -->
          <span class="grid size-19 shrink-0 grid-cols-2 gap-0.75 overflow-hidden rounded-md" aria-hidden="true">
            <span v-for="(path, i) in cells(collection.thumbnails)" :key="i" class="block bg-muted">
              <svg v-if="path" :viewBox="`0 0 ${THUMBNAIL_SIZE} ${THUMBNAIL_SIZE}`" class="block size-full"><path :d="path" fill="none" class="stroke-(--map-track)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </span>
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="line-clamp-2 font-display text-xl leading-tight font-bold break-words">{{ collection.name }}</span>
            <span class="flex flex-wrap items-center gap-x-3 text-sm text-muted">
              <span><span class="font-numbers text-base font-semibold text-highlighted tabular-nums">{{ collection.route_count }}</span> {{ t('profile.routeWord', collection.route_count) }}</span>
              <span v-if="collection.is_public" class="flex items-center gap-1 whitespace-nowrap"><UIcon name="i-lucide-link" class="size-3.5" />{{ t('profile.sharedCollection') }}</span>
              <span v-else class="flex items-center gap-1 whitespace-nowrap"><UIcon name="i-lucide-lock" class="size-3.5" />{{ t('profile.privateCollection') }}</span>
            </span>
            <span v-if="collection.description" class="truncate text-sm text-muted">{{ collection.description }}</span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
        </NuxtLink>
      </li>
    </ul>

    <p v-if="!collections.length" class="text-sm text-muted">{{ t('profile.noCollectionsHint') }}</p>

    <button
      type="button"
      class="flex h-13 w-full items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-(--ui-border-accented) font-semibold text-highlighted transition-colors hover:bg-elevated focus-visible:bg-elevated lg:w-auto lg:px-8"
      @click="open = true"
    >
      <UIcon name="i-lucide-plus" class="size-4.5" />{{ t('collections.new') }}
    </button>

    <UModal v-model:open="open" :title="t('collections.new')" :description="t('collections.newHint')">
      <template #body>
        <UForm id="new-collection-form" :schema="collectionSchemaLocalized" :state="form" class="space-y-3" @submit="create">
          <UFormField :label="t('collections.name')" name="name" required>
            <UInput v-model="form.name" class="w-full" autofocus :placeholder="t('collections.namePlaceholder')" />
          </UFormField>
          <UFormField :label="t('collections.description')" name="description">
            <UTextarea v-model="form.description" :rows="2" autoresize class="w-full" />
          </UFormField>
          <USwitch v-model="form.is_public" :label="t('collections.public')" :description="t('collections.publicHint')" />
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="outline" @click="open = false" />
          <UButton type="submit" form="new-collection-form" :label="t('collections.create')" :loading="saving" />
        </div>
      </template>
    </UModal>
  </div>
</template>
