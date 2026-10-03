<script setup lang="ts">
import type { VoiceAnnouncement, VoicePrefs } from '~/utils/voiceGuide'

// Button of follow mode's top bar opening the voice guidance settings, kept on the device.
const props = defineProps<{
  prefs: VoicePrefs
  supported: boolean
  // GPS keeps going with the screen off (Android app): so do the announcements
  background: boolean
}>()
const emit = defineEmits<{ update: [prefs: VoicePrefs] }>()

const { t } = useI18n()
const open = ref(false)

const enabled = computed({
  get: () => props.prefs.enabled,
  set: (value: boolean) => emit('update', { ...props.prefs, enabled: value }),
})
const chosen = computed({
  get: () => props.prefs.announcements,
  // Kept in the order of the list, whatever the order of the clicks.
  set: (value: VoiceAnnouncement[]) =>
    emit('update', { ...props.prefs, announcements: VOICE_ANNOUNCEMENTS.filter(a => value.includes(a)) }),
})
const items = computed(() => VOICE_ANNOUNCEMENTS.map(value => ({ value, label: t(`voice.announcements.${value}`) })))
</script>

<template>
  <UButton
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
      <UAlert v-if="!supported" color="warning" icon="i-lucide-volume-x" :title="t('voice.unsupported')" />
      <div v-else class="space-y-6">
        <USwitch v-model="enabled" :label="t('voice.enabled')" />
        <UCheckboxGroup v-model="chosen" :items="items" :legend="t('voice.legend')" :disabled="!enabled" />
        <p v-if="!background" class="text-sm text-muted">{{ t('voice.screenOnHint') }}</p>
      </div>
    </template>
  </UModal>
</template>
