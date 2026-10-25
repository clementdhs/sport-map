import type { CapacitorConfig } from '@capacitor/cli'

// The Android app is a shell around the hosted site (same account, same data, updated on every deploy): it
// only adds GPS with the screen off (app/utils/nativeGeolocation.ts). CAP_SERVER_URL points it elsewhere,
// e.g. a dev server on the local network (`npx nuxt dev --host`), then `npx cap sync android`.
const serverUrl = process.env.CAP_SERVER_URL ?? 'https://sport-map-psi.vercel.app'

const config: CapacitorConfig = {
  appId: 'io.github.clementdhs.sportmap',
  appName: 'sportmap',
  // Only holds the page shown when the site can't be reached.
  webDir: 'capacitor/www',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http:'),
    errorPath: 'offline.html',
  },
  // The WebView's colour until the page paints, black otherwise: the manifest's background_color (nuxt.config.ts).
  backgroundColor: '#ffffff',
  android: {
    // Background location updates stop after 5 minutes otherwise (background-geolocation plugin README).
    useLegacyBridge: true,
  },
  plugins: {
    // The launch screen stays up while the site loads, until the page hides it once hydrated
    // (app/plugins/splash-screen.client.ts, capacitor/www/offline.html). This duration is only the safety net:
    // a cold start of the hosted site's server alone takes about 5 s.
    SplashScreen: {
      launchShowDuration: 10000,
      launchAutoHide: true,
    },
  },
}

export default config
