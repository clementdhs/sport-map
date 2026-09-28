import * as Sentry from '@sentry/nuxt'
import { prepareErrorEvent, PRIVATE_DATA_COLLECTION } from './shared/utils/errorReporting'

// Server (Nitro) errors, bundled into the server build by the Sentry module. Same rules as the browser:
// only where a DSN is set, errors only, no personal data. The Nitro handler already skips 3xx/4xx errors.
const dsn = process.env.NUXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? 'development',
    dataCollection: PRIVATE_DATA_COLLECTION,
    tracesSampleRate: 0,
    beforeSend: prepareErrorEvent,
  })
}
