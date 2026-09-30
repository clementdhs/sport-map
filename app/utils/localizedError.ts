// An error whose message is a translation key: browser utilities don't know the app's language, so the
// component that shows the error translates it (useErrorMessage).
export class LocalizedError extends Error {
  constructor(readonly key: string, readonly params: Record<string, unknown> = {}) {
    super(key)
    this.name = 'LocalizedError'
  }
}
