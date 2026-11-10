import type { OutingImportResponse } from '#shared/types/routes'
import type { RecordingPayload } from '#shared/utils/routes'

export interface OutingImportFailure {
  file: string
  message: string
}

// Importing outings from GPX, FIT and TCX files (#268): each file is read in the browser and sent on its own,
// one after the other, so a long list shows its progress and one bad file doesn't stop the others.
export function useOutingImport() {
  const { t } = useI18n()
  const { formatDate } = useFormat()
  const errorMessage = useErrorMessage()
  const defaultSport = usePreference('defaultSport')

  const running = ref(false)
  const total = ref(0)
  const done = ref(0)
  const imported = ref(0)
  const duplicates = ref(0)
  const failures = ref<OutingImportFailure[]>([])

  async function importFiles(files: File[]): Promise<void> {
    running.value = true
    total.value = files.length
    done.value = imported.value = duplicates.value = 0
    failures.value = []
    try {
      for (const file of files) {
        try {
          const outing = await readOutingFile(file)
          const body: RecordingPayload = importPayload(outing, {
            name: t('record.defaultName', { date: formatDate(new Date(outing.startedAt).toISOString()) }),
            sport: defaultSport.value ?? 'hiking',
          })
          const answer = await $fetch<OutingImportResponse>('/api/outings/import', { method: 'POST', body })
          if (answer.duplicate) duplicates.value++
          else imported.value++
        }
        catch (error) {
          failures.value.push({ file: file.name, message: errorMessage(error) })
        }
        done.value++
      }
    }
    finally {
      running.value = false
    }
  }

  return { running, total, done, imported, duplicates, failures, importFiles }
}
