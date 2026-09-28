import * as Sentry from '@sentry/nuxt'
import { prepareErrorEvent, PRIVATE_DATA_COLLECTION } from './shared/utils/errorReporting'

// Browser errors, reported to Sentry only where a DSN is set (production on Vercel): never locally nor in
// tests. Errors only, no tracing or session replay: lighter, and nothing about what users do.
const { dsn, environment } = useRuntimeConfig().public.sentry

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    dataCollection: PRIVATE_DATA_COLLECTION,
    tracesSampleRate: 0,
    beforeSend: prepareErrorEvent,
  })
}
