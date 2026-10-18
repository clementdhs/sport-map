<script setup lang="ts">
import type { AvatarSaved } from '#shared/types/routes'
import type { SquareCrop } from '#shared/utils/avatars'

// Profile photo of the settings (#150): choose an image, frame it in a square, then the browser compresses it
// (WebP, AVATAR_SIZE_PX) before sending it. Without one, the initials show.
const props = defineProps<{
  name: string
  path: string | null
}>()
const emit = defineEmits<{
  changed: [path: string | null]
}>()

const { t } = useI18n()
const toast = useToast()
const errorMessage = useErrorMessage()
const input = useTemplateRef('input')

const chosen = shallowRef<{ image: ImageBitmap, name: string } | null>(null)
const crop = ref<SquareCrop>({ x: 0, y: 0, size: 1 })
const open = computed({
  get: () => !!chosen.value,
  set: (value) => {
    if (!value) close()
  },
})
const saving = ref(false)
const removing = ref(false)

async function onSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  try {
    const image = await loadPhoto(file)
    crop.value = centeredCrop(image.width, image.height)
    chosen.value = { image, name: file.name }
  }
  catch (error) {
    toast.add({ title: t('settings.avatar.saveFailed'), description: errorMessage(error), color: 'error' })
  }
}

function close() {
  chosen.value?.image.close()
  chosen.value = null
}

async function save() {
  if (!chosen.value) return
  saving.value = true
  try {
    const body = new FormData()
    body.append('photo', await compressAvatar(chosen.value.image, crop.value, chosen.value.name), chosen.value.name)
    const { avatar_path } = await $fetch<AvatarSaved>('/api/profile/me/avatar', { method: 'POST', body })
    close()
    emit('changed', avatar_path)
    toast.add({ title: t('settings.avatar.saved'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (error) {
    toast.add({ title: t('settings.avatar.saveFailed'), description: errorMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function remove() {
  if (!window.confirm(t('settings.avatar.deleteConfirm'))) return
  removing.value = true
  try {
    await $fetch('/api/profile/me/avatar', { method: 'DELETE' })
    emit('changed', null)
    toast.add({ title: t('settings.avatar.deleted'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (error) {
    toast.add({ title: t('settings.avatar.deleteFailed'), description: errorMessage(error), color: 'error' })
  }
  finally {
    removing.value = false
  }
}

onBeforeUnmount(close)
</script>

<template>
  <div class="flex items-center gap-4">
    <span class="flex shrink-0" data-testid="settings-avatar">
      <MemberAvatar :name="name" :path="props.path" size="3xl" />
    </span>
    <div class="space-y-2">
      <p class="text-sm font-medium">{{ t('settings.avatar.title') }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton
          icon="i-lucide-image-plus"
          :label="path ? t('settings.avatar.change') : t('settings.avatar.choose')"
          size="sm"
          color="neutral"
          variant="outline"
          @click="input?.click()"
        />
        <UButton
          v-if="path"
          icon="i-lucide-trash-2"
          :label="t('settings.avatar.delete')"
          size="sm"
          color="error"
          variant="ghost"
          :loading="removing"
          @click="remove"
        />
      </div>
      <input
        ref="input"
        type="file"
        accept="image/*"
        class="hidden"
        :aria-label="t('settings.avatar.file')"
        @change="onSelected"
      >
    </div>

    <UModal v-model:open="open" :title="t('settings.avatar.frameTitle')">
      <template #body>
        <AvatarCropper v-if="chosen" v-model="crop" :image="chosen.image" />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="outline" @click="close" />
          <UButton icon="i-lucide-check" :label="t('settings.avatar.save')" :loading="saving" @click="save" />
        </div>
      </template>
    </UModal>
  </div>
</template>
