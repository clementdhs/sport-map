import type { FetchError } from 'ofetch'
import type { LiveShareStarted } from '#shared/types/live'
import type { LivePointsPayload } from '#shared/utils/live'
import type { GpsFix } from './useWatchPosition'

// Sharing the member's position with the family during an outing (follow mode, /record), only once they ask
// for it. It ends when they stop it, when the page is left or closed, or when the server says the share is
// over (12 hours). Points are sent from the GPS updates themselves, which keep coming with the screen off in
// the Android app, and from a timer while they don't.
export function useLiveShare(routeId: string | null, fix: Ref<GpsFix | null>) {
  const { t } = useI18n()
  const toast = useToast()
  const errorMessage = useErrorMessage()

  const share = shallowRef<LiveShareStarted | null>(null)
  const starting = ref(false)
  // Last points received by the server (ms), and how many are waiting (no network).
  const lastSentAt = ref<number | null>(null)
  const waiting = ref(0)
  let queue = emptyLiveQueue()
  let lastTryAt: number | null = null
  let sending = false

  function setQueue(next: LiveQueue) {
    queue = next
    waiting.value = next.pending.length
  }

  function ended() {
    share.value = null
    setQueue(emptyLiveQueue())
    toast.add({ title: t('live.ended'), description: t('live.endedHint'), color: 'warning', icon: 'i-lucide-radio' })
  }

  async function send() {
    if (sending || !share.value || !queue.pending.length || !liveSendDue(lastTryAt, Date.now())) return
    sending = true
    lastTryAt = Date.now()
    const id = share.value.id
    try {
      // Everything waiting, batch after batch.
      while (share.value?.id === id && queue.pending.length) {
        const points = nextLiveBatch(queue)
        await $fetch(`/api/live/${id}/points`, { method: 'POST', body: { points } satisfies LivePointsPayload })
        if (share.value?.id === id) setQueue(acknowledgeLivePoints(queue, points))
        lastSentAt.value = Date.now()
      }
    }
    catch (error) {
      // Stopped or expired on the server's side; otherwise no network: the points wait for the next try.
      if ((error as FetchError).statusCode === 404 && share.value?.id === id) ended()
    }
    finally {
      sending = false
    }
  }

  watch(fix, (current) => {
    if (!share.value || !current) return
    setQueue(keepLivePoint(queue, current, Date.now()))
    send()
  })
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => (timer = setInterval(send, 5000)))

  async function start() {
    starting.value = true
    try {
      share.value = await $fetch<LiveShareStarted>('/api/live', { method: 'POST', body: { route_id: routeId } })
      setQueue(emptyLiveQueue())
      lastTryAt = null
      lastSentAt.value = null
      if (fix.value) setQueue(keepLivePoint(queue, fix.value, Date.now()))
      send()
    }
    catch (error) {
      toast.add({ title: t('live.startFailed'), description: errorMessage(error), color: 'error' })
    }
    finally {
      starting.value = false
    }
  }

  // Without a network the share stays visible to the family until it expires: say so.
  async function stop() {
    const current = share.value
    if (!current) return
    share.value = null
    setQueue(emptyLiveQueue())
    try {
      await $fetch(`/api/live/${current.id}`, { method: 'DELETE' })
    }
    catch {
      toast.add({ title: t('live.stopFailed'), description: t('live.stopFailedHint'), color: 'warning' })
    }
  }

  // A closed or reloaded page stops sharing too; keepalive lets the request outlive the page.
  function onPageHide() {
    if (share.value) fetch(`/api/live/${share.value.id}`, { method: 'DELETE', keepalive: true }).catch(() => {})
  }
  onMounted(() => window.addEventListener('pagehide', onPageHide))
  onBeforeUnmount(() => {
    clearInterval(timer)
    window.removeEventListener('pagehide', onPageHide)
    stop()
  })

  return { active: computed(() => !!share.value), starting, lastSentAt, waiting, start, stop }
}
