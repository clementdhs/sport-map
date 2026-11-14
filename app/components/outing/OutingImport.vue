<script setup lang="ts">
// Imports outings from GPX, FIT or TCX files (#268) picked with `pick()` or, with `drop`, dropped anywhere on the
// page (#138, computers), with the progress and then the summary in a modal ("18 sorties importées, 2 déjà
// présentes"). With `routeId`, the outings are added to that route, which they must follow. `imported` is emitted
// once the summary is closed, when something was imported. Not before: on /coach, an import that gives the coach
// its 3 weeks removes the button, and this modal.
const props = defineProps<{ routeId?: string, drop?: boolean }>()
const emit = defineEmits<{ imported: [] }>()

const { t } = useI18n()
const { running, total, done, imported, duplicates, failures, importFiles } = useOutingImport(() => props.routeId)

const input = useTemplateRef('input')
const open = ref(false)

async function start(files: File[]) {
  if (!files.length || running.value) return
  open.value = true
  await importFiles(files)
}

async function onFiles(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  // The same files can be picked again.
  target.value = ''
  await start(files)
}

watch(open, (isOpen) => {
  if (!isOpen && imported.value) emit('imported')
})

// Dropped files, on the whole page. dragenter / dragleave fire for every element crossed: they are counted, like
// the editor's drop zone (`gpx-import.md`), and only drags carrying files count, unless they are all pictures (a
// photo dragged over the route page is not an outing).
const dragDepth = ref(0)
function carriesFiles(event: DragEvent): boolean {
  const transfer = event.dataTransfer
  if (!transfer?.types.includes('Files')) return false
  const items = Array.from(transfer.items ?? [])
  return !items.length || !items.every(item => item.type.startsWith('image/'))
}
function onDragEnter(event: DragEvent) {
  if (!carriesFiles(event)) return
  event.preventDefault()
  dragDepth.value++
}
function onDragOver(event: DragEvent) {
  if (carriesFiles(event)) event.preventDefault()
}
function onDragLeave(event: DragEvent) {
  if (carriesFiles(event)) dragDepth.value = Math.max(0, dragDepth.value - 1)
}
function onDrop(event: DragEvent) {
  if (!carriesFiles(event)) return
  event.preventDefault()
  dragDepth.value = 0
  start(Array.from(event.dataTransfer?.files ?? []))
}
// The editor has its own drop zone for routes: this one only listens on the pages that ask for it.
const listeners = [['dragenter', onDragEnter], ['dragover', onDragOver], ['dragleave', onDragLeave], ['drop', onDrop]] as const
onMounted(() => {
  if (props.drop) for (const [type, listener] of listeners) window.addEventListener(type, listener)
})
onBeforeUnmount(() => {
  for (const [type, listener] of listeners) window.removeEventListener(type, listener)
})

const summary = computed(() => [
  t('outingImport.imported', imported.value),
  duplicates.value ? t('outingImport.duplicates', duplicates.value) : null,
  failures.value.length ? t('outingImport.failed', failures.value.length) : null,
].filter(Boolean).join(', '))

defineExpose({ pick: () => input.value?.click(), running })
</script>

<template>
  <input
    ref="input"
    type="file"
    multiple
    :accept="OUTING_FILE_ACCEPT"
    class="hidden"
    data-testid="outing-import-input"
    @change="onFiles"
  >
  <Teleport v-if="drop && dragDepth > 0" to="body">
    <div
      class="pointer-events-none fixed inset-3 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px]"
      data-testid="outing-drop-overlay"
    >
      <p class="flex items-center gap-2 rounded-md bg-default px-3 py-2 font-medium shadow">
        <UIcon name="i-lucide-file-up" class="size-5 text-primary" />{{ t(routeId ? 'outingImport.dropOnRoute' : 'outingImport.drop') }}
      </p>
    </div>
  </Teleport>
  <UModal v-model:open="open" :title="t('outingImport.title')" :dismissible="!running" :close="!running">
    <template #body>
      <div v-if="running" class="space-y-2" data-testid="outing-import-progress">
        <UProgress :model-value="done" :max="total" />
        <p class="text-sm text-toned">{{ t('outingImport.progress', { done: Math.min(done + 1, total), total }) }}</p>
      </div>
      <div v-else class="space-y-3">
        <p class="font-semibold text-highlighted" role="status" data-testid="outing-import-summary">{{ summary }}.</p>
        <p v-if="imported" class="text-sm text-toned">{{ t(routeId ? 'outingImport.whereRoute' : 'outingImport.where') }}</p>
        <ul v-if="failures.length" class="space-y-1 text-sm" data-testid="outing-import-failures">
          <li v-for="(failure, i) in failures" :key="i">
            {{ t('outingImport.failure', { file: failure.file, message: failure.message }) }}
          </li>
        </ul>
      </div>
    </template>
  </UModal>
</template>
