<script setup lang="ts">
// Light / dark mode (Nuxt UI's color mode, kept in localStorage) and accent color (cookie):
// in the header's popover for visitors, and on the settings page for signed-in users. Two rows (#237): the mode as
// a segmented control, the accents as swatches, each label on the left.
const colorMode = useColorMode()
const { accent, setAccent } = useAccent()
const { t } = useI18n()
const id = useId()

const modes = ['light', 'dark', 'system'] as const
</script>

<template>
  <div class="divide-y divide-default">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <span :id="`${id}-mode`" class="text-sm font-medium">{{ t('theme.mode') }}</span>
      <div role="group" :aria-labelledby="`${id}-mode`" class="flex rounded-[0.625rem] bg-elevated p-0.75">
        <button
          v-for="mode in modes"
          :key="mode"
          type="button"
          :aria-pressed="colorMode.preference === mode"
          class="h-8.5 rounded-sm px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-(--ui-primary)"
          :class="colorMode.preference === mode ? 'bg-default font-semibold text-highlighted shadow-sm' : 'font-medium text-muted hover:text-default'"
          @click="colorMode.preference = mode"
        >
          {{ t(`theme.modes.${mode}`) }}
        </button>
      </div>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <span :id="`${id}-accent`" class="text-sm font-medium">{{ t('theme.accent') }}</span>
      <div role="group" :aria-labelledby="`${id}-accent`" class="flex gap-2.5">
        <button
          v-for="value in ACCENTS"
          :key="value"
          type="button"
          :title="t(`theme.accents.${value}`)"
          :aria-label="t(`theme.accents.${value}`)"
          :aria-pressed="accent === value"
          class="flex size-8 items-center justify-center rounded-full bg-(--swatch-light) text-inverted ring-offset-2 ring-offset-(--ui-bg) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--ui-primary) dark:bg-(--swatch-dark)"
          :class="{ 'ring-2 ring-(--ui-text-highlighted)': accent === value }"
          :style="{ '--swatch-light': ACCENT_COLORS[value].light, '--swatch-dark': ACCENT_COLORS[value].dark }"
          @click="setAccent(value)"
        >
          <UIcon v-if="accent === value" name="i-lucide-check" class="size-4" />
        </button>
      </div>
    </div>
  </div>
</template>
