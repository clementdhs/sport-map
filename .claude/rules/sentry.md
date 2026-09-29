---
paths:
  - "sentry.*.config.ts"
  - "shared/utils/errorReporting.ts"
  - "nuxt.config.ts"
  - "server/api/_sentry-test.get.ts"
---

# Error monitoring (Sentry)

`@sentry/nuxt` (module skipped under Vitest), initialized in `sentry.client.config.ts` / `sentry.server.config.ts` only when `NUXT_PUBLIC_SENTRY_DSN` is set (never locally or in tests). Errors only (no tracing, no replay), no personal data (`PRIVATE_DATA_COLLECTION`: Sentry 11 collects cookies, headers, bodies, query params and user info by default), expected 3xx/4xx errors dropped and access tokens scrubbed from URLs (`shared/utils/errorReporting.ts`). Source maps upload on Vercel builds with `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`, then are deleted. Changes here are global: push them on a branch and wait for a green CI before main.
