<script setup lang="ts">
// Floating bar at the top left of the map pages, which have no header: back button, logo and account menu.
const props = defineProps<{
  // Where the back button leads when the page was opened directly (no previous page in the app).
  back?: string
}>()

const { t } = useI18n()
const router = useRouter()

function goBack() {
  if (window.history.state?.back) router.back()
  else navigateTo(props.back)
}
</script>

<template>
  <nav class="flex items-center gap-0.5 rounded-full bg-default p-1 shadow-md ring ring-default" :aria-label="t('mapBar.label')">
    <UButton
      v-if="back"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      :aria-label="t('mapBar.back')"
      class="rounded-full"
      @click="goBack"
    />
    <ULink to="/" class="rounded-full p-1" :aria-label="t('mapBar.home')">
      <AppLogo class="size-7" />
    </ULink>
    <AccountMenu compact />
  </nav>
</template>
