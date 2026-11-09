<script setup lang="ts">
// "Importer des sorties" (#268): picks GPX, FIT or TCX files and imports each as an outing, with the progress and
// then the summary in a modal ("18 sorties importées, 2 déjà présentes"). The button takes UButton's props; the
// page's data is fetched again once the summary is closed, so its statistics and the coach's form count the new
// outings. Not before: on /coach, an import that gives the coach its 3 weeks removes this button, and its modal.
defineOptions({ inheritAttrs: false })

const { t } = useI18n()
const { running, total, done, imported, duplicates, failures, importFiles } = useOutingImport()

const input = useTemplateRef('input')
const open = ref(false)

async function onFiles(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  // The same files can be picked again.
  target.value = ''
  if (!files.length) return
  open.value = true
  await importFiles(files)
}

watch(open, (isOpen) => {
  if (!isOpen && imported.value) refreshNuxtData()
})

const summary = computed(() => [
  t('outingImport.imported', imported.value),
  duplicates.value ? t('outingImport.duplicates', duplicates.value) : null,
  failures.value.length ? t('outingImport.failed', failures.value.length) : null,
].filter(Boolean).join(', '))
</script>

<template>
  <UButton v-bind="$attrs" :loading="running" @click="input?.click()" />
  <input
    ref="input"
    type="file"
    multiple
    :accept="OUTING_FILE_ACCEPT"
    class="hidden"
    data-testid="outing-import-input"
    @change="onFiles"
  >
  <UModal v-model:open="open" :title="t('outingImport.title')" :dismissible="!running" :close="!running">
    <template #body>
      <div v-if="running" class="space-y-2" data-testid="outing-import-progress">
        <UProgress :model-value="done" :max="total" />
        <p class="text-sm text-toned">{{ t('outingImport.progress', { done: Math.min(done + 1, total), total }) }}</p>
      </div>
      <div v-else class="space-y-3">
        <p class="font-semibold text-highlighted" role="status" data-testid="outing-import-summary">{{ summary }}.</p>
        <p v-if="imported" class="text-sm text-toned">{{ t('outingImport.where') }}</p>
        <ul v-if="failures.length" class="space-y-1 text-sm" data-testid="outing-import-failures">
          <li v-for="(failure, i) in failures" :key="i">
            {{ t('outingImport.failure', { file: failure.file, message: failure.message }) }}
          </li>
        </ul>
      </div>
    </template>
  </UModal>
</template>
