<script setup lang="ts">
import type { VoiceAnnouncement, VoicePrefs } from '~/utils/voiceGuide'

// Voice guidance choices, in follow mode's modal (VoiceGuideSettings) and on the settings page.
const props = defineProps<{
  prefs: VoicePrefs
  supported: boolean
  // GPS keeps going with the screen off (Android app): so do the announcements
  background: boolean
}>()
const emit = defineEmits<{ update: [prefs: VoicePrefs] }>()

const { t } = useI18n()

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
  <UAlert v-if="!supported" color="warning" icon="i-lucide-volume-x" :title="t('voice.unsupported')" />
  <div v-else class="space-y-6">
    <USwitch v-model="enabled" :label="t('voice.enabled')" />
    <UCheckboxGroup v-model="chosen" :items="items" :legend="t('voice.legend')" :disabled="!enabled" />
    <p v-if="!background" class="text-sm text-muted">{{ t('voice.screenOnHint') }}</p>
  </div>
</template>
