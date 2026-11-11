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
- Dictation (#296) uses `@capacitor-community/speech-recognition` (`dictation.md`).
- Plugins are called through `registerPlugin` / dynamic imports: the web bundle only carries `@capacitor/core`. `android.useLegacyBridge` must stay on, or background updates stop after 5 minutes.
- Launch screen (`@capacitor/splash-screen`): it stays up while the hosted site loads and is hidden by `app/plugins/splash-screen.client.ts` once the page is hydrated, or by `offline.html`; `launchShowDuration` (10 s) is only the safety net. Measured in October 2026: a cold start of the Vercel server takes about 5 s, a warm load about 0.3 s to hydration on a PC.
- Building needs JDK 21 (Capacitor 8): Android Studio's bundled JBR (Java 25) fails with "Unsupported class file major version 69", so its Gradle JDK must point to a JDK 21. Clem has two PCs. The Android build PC: JDK in `C:\Program Files\Java\jdk-21.0.12.1`, SDK in `D:\Android\Sdk`, `GRADLE_USER_HOME=D:\Gradle` (C: is nearly full). The other one has only a C: drive: JDK in `C:\Program Files\Java\jdk-21`, SDK and adb in `%LOCALAPPDATA%\Android\Sdk` (set `ANDROID_HOME` for `gradlew`), default Gradle home. Each PC has its own debug keystore (`~\.android\debug.keystore`): an APK built on one can't update an app installed from the other (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) unless the keystore is copied over; uninstalling loses the phone-only data (session, offline routes, recording in progress, local settings). Command line: `android\gradlew.bat assembleDebug` with `JAVA_HOME` set to the JDK 21.
- `npm run android:sync` after changing `capacitor.config.ts` or adding a plugin, `npm run android:open` to build in Android Studio. `CAP_SERVER_URL=http://<lan-ip>:3000` (with `npx nuxt dev --host`) points a debug build at a dev server.
