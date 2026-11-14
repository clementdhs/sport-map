<script setup lang="ts">
// One of the route page's secondary actions (#103, look of #233): an icon in a round plate over a short label,
// sharing the row evenly ("Fait le 18 oct." may take two lines). Active (in the "À faire" list, done), the plate
// turns ink with a yellow icon. Attributes (click, aria-label, a dropdown's trigger props) go to the button.
defineProps<{
  icon: string
  label: string
  active?: boolean
  loading?: boolean
  disabled?: boolean
}>()
</script>

<template>
  <UButton
    :label="label"
    color="neutral"
    variant="ghost"
    :disabled="disabled || loading"
    :ui="{ base: 'group flex-col justify-center gap-1 px-1 py-1.5 text-xs font-medium text-highlighted hover:bg-transparent active:bg-transparent', label: 'max-w-full text-center leading-tight' }"
  >
    <template #leading>
      <span
        class="flex size-11 items-center justify-center rounded-full border transition-colors"
        :class="active
          ? 'border-(--ui-text-highlighted) bg-inverted text-(--sign) dark:text-inverted'
          : 'border-accented bg-default group-hover:bg-elevated'"
      >
        <UIcon :name="loading ? 'i-lucide-loader-circle' : icon" class="size-5" :class="{ 'animate-spin': loading }" />
      </span>
    </template>
  </UButton>
</template>
