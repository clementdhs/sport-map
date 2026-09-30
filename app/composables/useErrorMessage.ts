import type { FetchError } from 'ofetch'

// The text to show for a caught error: a translated LocalizedError, the API's statusMessage, or the raw message.
export function useErrorMessage() {
  const { t } = useI18n()
  return (error: unknown): string => {
    if (error instanceof LocalizedError) return t(error.key, error.params)
    return (error as FetchError).data?.statusMessage ?? (error as Error).message
  }
}
