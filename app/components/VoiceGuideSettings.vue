<script setup lang="ts">
import type { VoicePrefs } from '~/utils/voiceGuide'

// Button of follow mode's top bar opening the voice guidance settings, kept on the device.
defineProps<{
  prefs: VoicePrefs
  supported: boolean
  // GPS keeps going with the screen off (Android app): so do the announcements
  background: boolean
}>()
const emit = defineEmits<{ update: [prefs: VoicePrefs] }>()
// Two roots (button and modal): the page's classes go to the button.
defineOptions({ inheritAttrs: false })

const { t } = useI18n()
const open = ref(false)
</script>

<template>
  <UButton
    v-bind="$attrs"
    :icon="prefs.enabled && supported ? 'i-lucide-volume-2' : 'i-lucide-volume-x'"
    :aria-label="t('voice.title')"
    color="neutral"
    variant="solid"
    class="shrink-0 shadow-md"
    data-testid="voice-settings"
    @click="open = true"
  />

  <UModal v-model:open="open" :title="t('voice.title')" :description="t('voice.description')">
    <template #body>
      <VoiceGuideForm :prefs="prefs" :supported="supported" :background="background" @update="emit('update', $event)" />
    </template>
  </UModal>
</template>
