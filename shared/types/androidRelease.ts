// Latest Android release (#337), as GET /api/app/android-release returns it: null when there is none yet, or
// when GitHub couldn't be read.
export interface AndroidRelease {
  versionName: string
  versionCode: number
  // The release's own APK (always sportmap.apk).
  apkUrl: string
}
