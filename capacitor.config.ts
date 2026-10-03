import type { CapacitorConfig } from '@capacitor/cli'

// The Android app is a shell around the hosted site (same account, same data, updated on every deploy): it
// only adds GPS with the screen off (app/utils/nativeGeolocation.ts). CAP_SERVER_URL points it elsewhere,
// e.g. a dev server on the local network (`npx nuxt dev --host`), then `npx cap sync android`.
const serverUrl = process.env.CAP_SERVER_URL ?? 'https://sport-map-psi.vercel.app'

const config: CapacitorConfig = {
  appId: 'io.github.clementdhs.sportmap',
  appName: 'sport-map',
  // Only holds the page shown when the site can't be reached.
  webDir: 'capacitor/www',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http:'),
    errorPath: 'offline.html',
  },
  android: {
    // Background location updates stop after 5 minutes otherwise (background-geolocation plugin README).
    useLegacyBridge: true,
  },
}

export default config
