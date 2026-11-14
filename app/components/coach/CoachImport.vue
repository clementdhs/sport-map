<script setup lang="ts">
// While the coach is learning (mockup 5): the outings of a watch or another app, imported in one go (#268), give it
// its 3 weeks sooner. Complete Strava or Garmin archives are left for later.
const { t } = useI18n()
</script>

<template>
  <section class="space-y-2.5 rounded-lg border-[1.5px] border-dashed border-(--ui-text-highlighted) p-4" data-testid="coach-import">
    <div class="flex items-start gap-2.5">
      <UIcon name="i-lucide-download" class="mt-0.5 size-6 shrink-0 text-highlighted" />
      <div>
        <h2 class="text-lg font-bold [font-family:var(--font-numbers)]">{{ t('coachImport.title') }}</h2>
        <p class="mt-1 text-sm text-toned">{{ t('coachImport.text') }}</p>
      </div>
    </div>
    <OutingImportButton
      :label="t('coachImport.choose')"
      color="neutral"
      variant="outline"
      size="lg"
      block
    />
  </section>
</template>
