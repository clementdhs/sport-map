<script setup lang="ts">
// Floating bar at the top left of the map pages: back button, logo and account menu. When the app header is shown
// from md up (every map page but the editor), the bar keeps only the back button there. Topo look (#231): a surface
// with a sand edge, like MapLibre's buttons on the right.
const props = defineProps<{
  // Where the back button leads when the page was opened directly (no previous page in the app).
  back?: string
  header?: boolean
}>()

const { t } = useI18n()
const router = useRouter()

function goBack() {
  if (window.history.state?.back) router.back()
  else navigateTo(props.back)
}
</script>

<template>
  <nav
    class="map-float flex items-center gap-0.5 rounded-md p-1"
    :class="{ 'md:hidden': header && !back }"
    :aria-label="t('mapBar.label')"
  >
    <UButton
      v-if="back"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      size="lg"
      :aria-label="t('mapBar.back')"
      class="rounded-sm"
      @click="goBack"
    />
    <ULink to="/" class="rounded-sm p-1" :class="{ 'md:hidden': header }" :aria-label="t('mapBar.home')">
      <AppLogo class="size-7" />
    </ULink>
    <div class="flex" :class="{ 'md:hidden': header }">
      <AccountMenu compact />
    </div>
  </nav>
</template>
