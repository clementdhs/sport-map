---
paths:
  - "android/**"
  - "capacitor/**"
  - "capacitor.config.ts"
  - "app/utils/nativeGeolocation.ts"
  - "app/composables/useWatchPosition.ts"
  - "app/composables/useScreenWakeLock.ts"
---

# Android app (Capacitor)

- The app is a Capacitor shell that loads the hosted site (`server.url` in `capacitor.config.ts`): same account, cookies and API, updated on every deploy. Only native changes (plugins, manifest, icons) need a new APK. `capacitor/www` only holds `offline.html`, shown when the site can't be reached (served from `https://localhost`, so its link points to the hosted URL).
- Native code runs only in the app: `isNativeApp()` (`app/utils/nativeGeolocation.ts`). There, `useWatchPosition` takes positions from `@capacitor-community/background-geolocation` (foreground service + notification, keeps going with the screen off) and returns `background: true`; `useScreenWakeLock` does nothing. `recorder.ts` and `trackFollower.ts` don't know where fixes come from.
- Plugins are called through `registerPlugin` / dynamic imports: the web bundle only carries `@capacitor/core`. `android.useLegacyBridge` must stay on, or background updates stop after 5 minutes.
- Building needs JDK 21 (Capacitor 8): Android Studio's bundled JBR (Java 25) fails with "Unsupported class file major version 69", so its Gradle JDK must point to a JDK 21. On Clem's machine: JDK in `C:\Program Files\Java\jdk-21`, SDK in `D:\Android\Sdk`, `GRADLE_USER_HOME=D:\Gradle` (C: is nearly full). Command line: `android\gradlew.bat assembleDebug` with `JAVA_HOME` set to the JDK 21.
- `npm run android:sync` after changing `capacitor.config.ts` or adding a plugin, `npm run android:open` to build in Android Studio. `CAP_SERVER_URL=http://<lan-ip>:3000` (with `npx nuxt dev --host`) points a debug build at a dev server.
