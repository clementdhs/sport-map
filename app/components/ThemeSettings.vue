<script setup lang="ts">
// Light / dark mode (Nuxt UI's color mode, kept in localStorage) and accent color (cookie):
// in the header's popover for everyone, and on the settings page.
const colorMode = useColorMode()
const { accent, setAccent } = useAccent()

const modes = [
  { value: 'system', label: 'Système', icon: 'i-lucide-monitor' },
  { value: 'light', label: 'Clair', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Sombre', icon: 'i-lucide-moon' },
] as const
</script>

<template>
  <div class="space-y-4">
    <fieldset class="space-y-2">
      <legend class="text-sm font-medium">Thème</legend>
      <div class="grid max-w-56 grid-cols-3 gap-1">
        <UButton
          v-for="mode in modes"
          :key="mode.value"
          :icon="mode.icon"
          :label="mode.label"
          size="sm"
          :color="colorMode.preference === mode.value ? 'primary' : 'neutral'"
          :variant="colorMode.preference === mode.value ? 'soft' : 'ghost'"
          :aria-pressed="colorMode.preference === mode.value"
          :ui="{ base: 'flex-col gap-1' }"
          @click="colorMode.preference = mode.value"
        />
      </div>
    </fieldset>
    <fieldset class="space-y-2">
      <legend class="text-sm font-medium">Couleur</legend>
      <div class="flex gap-3">
        <button
          v-for="value in ACCENTS"
          :key="value"
          type="button"
          :title="ACCENT_LABELS[value]"
          :aria-label="ACCENT_LABELS[value]"
          :aria-pressed="accent === value"
          class="flex size-8 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-(--ui-bg) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--ui-primary)"
          :class="{ 'ring-2 ring-(--ui-text-highlighted)': accent === value }"
          :style="{ backgroundColor: ACCENT_COLORS[value] }"
          @click="setAccent(value)"
        >
          <UIcon v-if="accent === value" name="i-lucide-check" class="size-4" />
        </button>
      </div>
    </fieldset>
  </div>
</template>
