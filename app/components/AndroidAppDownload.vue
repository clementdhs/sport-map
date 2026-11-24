<script setup lang="ts">
// Download of the Android app (#337): the APK of the latest GitHub Release, for Android browsers and the installed
// PWA. The settings page only shows it there (useAndroidDownload).
const { t } = useI18n()
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm">{{ t('androidApp.download.description') }}</p>
    <UButton :to="ANDROID_APK_URL" external icon="i-lucide-download" :label="t('androidApp.download.button')" data-testid="android-download" />
    <p class="text-sm text-muted">{{ t('androidApp.download.help') }}</p>
  </div>
</template>
