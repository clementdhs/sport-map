<template>
  <UPopover>
    <UButton icon="i-lucide-palette" color="neutral" variant="ghost" :aria-label="$t('theme.label')" />
    <template #content>
      <ThemeSettings class="w-72 px-4 py-1" />
    </template>
  </UPopover>
</template>
