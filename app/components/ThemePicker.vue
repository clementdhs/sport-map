<template>
  <UPopover>
    <UButton icon="i-lucide-palette" color="neutral" variant="ghost" :aria-label="$t('theme.label')" />
    <template #content>
      <ThemeSettings class="w-64 p-4" />
    </template>
  </UPopover>
</template>
