<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { RoutePhoto } from '#shared/types/routes'

// Gallery of a route; its owner can add and delete photos.
const props = defineProps<{
  routeId: string
  isOwner: boolean
}>()

const photos = defineModel<RoutePhoto[]>('photos', { required: true })

const toast = useToast()
const input = useTemplateRef('input')
const uploading = ref(false)
const deletingId = ref<string | null>(null)

const errorMessage = (error: unknown) => (error as FetchError).data?.statusMessage ?? (error as Error).message

// One at a time: each photo is compressed in the browser, then sent on its own (small) request.
async function onSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const files = [...(target.files ?? [])]
  target.value = '' // allow re-selecting the same files
  const room = MAX_ROUTE_PHOTOS - photos.value.length
  if (files.length > room) {
    toast.add({
      title: `${MAX_ROUTE_PHOTOS} photos maximum`,
      description: room ? `Seules les ${room} premières photos sont ajoutées.` : undefined,
      color: 'warning',
    })
  }

  uploading.value = true
  for (const file of files.slice(0, room)) {
    try {
      const body = new FormData()
      body.append('photo', await compressPhoto(file), file.name)
      const photo = await $fetch<RoutePhoto>(`/api/routes/${props.routeId}/photos`, { method: 'POST', body })
      photos.value = [...photos.value, photo]
    }
    catch (error) {
      toast.add({ title: 'Photo non ajoutée', description: errorMessage(error), color: 'error' })
    }
  }
  uploading.value = false
}

async function remove(photo: RoutePhoto) {
  if (!window.confirm('Supprimer cette photo ?')) return
  deletingId.value = photo.id
  try {
    await $fetch(`/api/routes/${props.routeId}/photos/${photo.id}`, { method: 'DELETE' })
    photos.value = photos.value.filter(p => p.id !== photo.id)
  }
  catch (error) {
    toast.add({ title: 'Suppression impossible', description: errorMessage(error), color: 'error' })
  }
  finally {
    deletingId.value = null
  }
}

// Full-size viewer, with arrows (also on the keyboard) to browse the gallery.
const viewerOpen = ref(false)
const current = ref(0)
const currentPhoto = computed(() => photos.value[current.value])

function openAt(index: number) {
  current.value = index
  viewerOpen.value = true
}

function step(delta: number) {
  if (!viewerOpen.value || photos.value.length < 2) return
  current.value = (current.value + delta + photos.value.length) % photos.value.length
}

defineShortcuts({
  arrowleft: () => step(-1),
  arrowright: () => step(1),
})
</script>

<template>
  <section v-if="photos.length || isOwner" class="space-y-2" aria-labelledby="photos-title">
    <div class="flex items-center justify-between gap-2">
      <h2 id="photos-title" class="font-medium">Photos</h2>
      <template v-if="isOwner">
        <UButton
          icon="i-lucide-image-plus"
          label="Ajouter des photos"
          size="sm"
          color="neutral"
          variant="outline"
          :loading="uploading"
          :disabled="photos.length >= MAX_ROUTE_PHOTOS"
          @click="input?.click()"
        />
        <input
          ref="input"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          aria-label="Choisir des photos"
          @change="onSelected"
        >
      </template>
    </div>

    <p v-if="!photos.length" class="text-sm text-muted">
      Ajoute jusqu'à {{ MAX_ROUTE_PHOTOS }} photos de ton parcours. Elles suivent sa visibilité : privées si le parcours l'est.
    </p>
    <ul v-else class="grid grid-cols-3 gap-2">
      <li v-for="(photo, i) in photos" :key="photo.id" class="relative">
        <button
          type="button"
          class="block aspect-square w-full cursor-zoom-in overflow-hidden rounded-md bg-elevated"
          :aria-label="`Agrandir la photo ${i + 1}`"
          @click="openAt(i)"
        >
          <img :src="photo.url" :alt="`Photo ${i + 1} du parcours`" loading="lazy" class="size-full object-cover">
        </button>
        <UButton
          v-if="isOwner"
          icon="i-lucide-trash-2"
          size="xs"
          color="neutral"
          class="absolute top-1 right-1"
          :aria-label="`Supprimer la photo ${i + 1}`"
          :loading="deletingId === photo.id"
          @click="remove(photo)"
        />
      </li>
    </ul>

    <UModal
      v-model:open="viewerOpen"
      :title="`Photo ${current + 1} sur ${photos.length}`"
      :ui="{ content: 'sm:max-w-5xl' }"
    >
      <template #body>
        <div class="relative">
          <img
            v-if="currentPhoto"
            :src="currentPhoto.url"
            :alt="`Photo ${current + 1} du parcours`"
            class="max-h-[75dvh] w-full rounded-md object-contain"
          >
          <template v-if="photos.length > 1">
            <UButton
              icon="i-lucide-chevron-left"
              color="neutral"
              class="absolute top-1/2 left-2 -translate-y-1/2 rounded-full"
              aria-label="Photo précédente"
              @click="step(-1)"
            />
            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full"
              aria-label="Photo suivante"
              @click="step(1)"
            />
          </template>
        </div>
      </template>
    </UModal>
  </section>
</template>
