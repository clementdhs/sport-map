// Shared by the browser and server Sentry configs (sentry.client.config.ts, sentry.server.config.ts).

// No personal data: Sentry collects user info, cookies, headers, bodies and query parameters by default.
export const PRIVATE_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [] as never[],
  urlQueryParams: false,
}

// Query parameters that grant access (password reset link, sign-in code): never sent to Sentry.
const SECRET_PARAMS = ['token_hash', 'code', 'access_token', 'refresh_token']

export function scrubUrl(url: string): string {
  return url.replace(new RegExp(`([?&#](?:${SECRET_PARAMS.join('|')})=)[^&#\\s"]*`, 'g'), '$1[retiré]')
}

// Expected HTTP errors (missing route, sign-in required, invalid input) are part of normal use, not bugs.
export function isExpectedHttpError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { status, statusCode } = error as { status?: unknown, statusCode?: unknown }
  const code = typeof status === 'number' ? status : statusCode
  return typeof code === 'number' && code >= 300 && code < 500
}

interface ScrubbableEvent {
  request?: { url?: string, query_string?: unknown, headers?: Record<string, string> }
  breadcrumbs?: { data?: Record<string, unknown> }[]
}

// Drops expected errors, and access tokens from the URLs of the event and its breadcrumbs.
export function prepareErrorEvent<E extends ScrubbableEvent>(event: E, hint: { originalException?: unknown }): E | null {
  if (isExpectedHttpError(hint.originalException)) return null
  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url)
    if (typeof event.request.query_string === 'string') event.request.query_string = scrubUrl(`?${event.request.query_string}`).slice(1)
    else delete event.request.query_string
    if (event.request.headers?.Referer) event.request.headers.Referer = scrubUrl(event.request.headers.Referer)
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    for (const key of ['url', 'from', 'to']) {
      const value = breadcrumb.data?.[key]
      if (typeof value === 'string') breadcrumb.data![key] = scrubUrl(value)
    }
  }
  return event
}
