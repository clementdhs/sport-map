<script setup lang="ts">
// Live location sharing in follow mode and on /record: a button that asks first, then, while sharing, a
// reminder that stays in view with the latest send and a way to stop.
const props = defineProps<{
  active: boolean
  starting: boolean
  // Last points received by the server (ms), points waiting for the network, current time (ms)
  lastSentAt: number | null
  waiting: number
  now: number
  // Opens the confirmation as soon as the control shows: the "Partager ma position" choice (#262)
  ask?: boolean
}>()
const emit = defineEmits<{ start: [], stop: [], asked: [] }>()
const { t } = useI18n()

const confirmOpen = ref(false)
onMounted(() => {
  if (!props.ask) return
  confirmOpen.value = true
  emit('asked')
})
function confirm() {
  confirmOpen.value = false
  emit('start')
}

// One waiting point is the one about to leave; more means the network is missing.
const status = computed(() => {
  if (props.waiting > 1) return t('live.waiting', { count: props.waiting }, props.waiting)
  if (props.lastSentAt === null) return t('live.firstPoint')
  return t('live.sentAgo', { time: formatElapsed(Math.max(0, props.now - props.lastSentAt) / 1000) })
})
</script>

<template>
  <div>
    <div v-if="active" class="flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1.5" role="status">
      <UIcon name="i-lucide-radio" class="size-5 shrink-0 animate-pulse text-primary" />
      <div class="min-w-0">
        <p class="text-sm font-medium">{{ t('live.sharing') }}</p>
        <!-- data-waiting: the count itself, which the text only gives from 2 on (e2e: each point kept, #211) -->
        <p class="text-xs text-muted" data-testid="live-status" :data-waiting="waiting">{{ status }}</p>
      </div>
      <UButton class="ml-auto" :label="t('live.stop')" color="neutral" variant="outline" size="sm" @click="emit('stop')" />
    </div>
    <UButton
      v-else
      icon="i-lucide-radio"
      :label="t('live.share')"
      color="neutral"
      variant="outline"
      block
      :loading="starting"
      @click="confirmOpen = true"
    />

    <UModal
      v-model:open="confirmOpen"
      :title="t('live.confirmTitle')"
      :description="t('live.confirmDescription', { hours: LIVE_SHARE_MAX_HOURS })"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="confirmOpen = false" />
          <UButton icon="i-lucide-radio" :label="t('live.confirm')" @click="confirm" />
        </div>
      </template>
    </UModal>
  </div>
</template>
