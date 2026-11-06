import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GpsFix } from '~/composables/useWatchPosition'
import type { Recording } from '~/utils/recorder'

const KEY = 'sport-map:recording:test'
const draft = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as Recording | null

// A fix ~11 m north of the previous one at each call.
let step = 0
const nextFix = (): GpsFix => ({ position: [6.1, 45.9 + 0.0001 * step++], accuracyM: 5, altitudeM: null, headingDeg: null, speedMps: null })

async function mountRecorder() {
  const fix = shallowRef<GpsFix | null>(null)
  let recorder!: ReturnType<typeof useOutingRecorder>
  const wrapper = await mountSuspended(defineComponent({
    setup() {
      recorder = useOutingRecorder(KEY, fix)
      return () => h('div')
    },
  }))
  // One fix per second, as the GPS sends them.
  async function walk(seconds: number) {
    for (let i = 0; i < seconds; i++) {
      vi.advanceTimersByTime(1000)
      fix.value = nextFix()
      await nextTick()
    }
  }
  return { wrapper, recorder, walk }
}

// #182: the whole outing was written to localStorage after every point.
describe('useOutingRecorder draft', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-06T08:00:00Z'), toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    localStorage.clear()
    step = 0
  })
  afterEach(() => vi.useRealTimers())

  it('is written on start, then at most every DRAFT_SAVE_MS while points come', async () => {
    const { recorder, walk } = await mountRecorder()
    recorder.start()
    expect(draft()?.points).toEqual([])

    await walk(5)
    expect(recorder.recording.value?.points).toHaveLength(5)
    expect(draft()?.points).toEqual([])

    // Written 15 s after the start, just before the 15th fix, then not before 30 s.
    expect(DRAFT_SAVE_MS).toBe(15_000)
    await walk(10)
    expect(draft()?.points).toHaveLength(14)
    await walk(14)
    expect(draft()?.points).toHaveLength(14)
    await walk(1)
    expect(draft()?.points).toHaveLength(29)
  })

  it('writes the last points without waiting on pause, when the page is hidden or left', async () => {
    const { wrapper, recorder, walk } = await mountRecorder()
    recorder.start()
    await walk(3)
    recorder.togglePause()
    expect(draft()?.pausedAt).not.toBeNull()
    expect(draft()?.points).toHaveLength(3)

    recorder.togglePause()
    await walk(2)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
    delete (document as { hidden?: boolean }).hidden
    expect(draft()?.points).toHaveLength(5)

    await walk(2)
    wrapper.unmount()
    expect(draft()?.points).toHaveLength(7)
  })

  it('is not written again once the outing is saved or discarded', async () => {
    const { recorder, walk } = await mountRecorder()
    recorder.start()
    await walk(3)
    recorder.stop()
    vi.advanceTimersByTime(DRAFT_SAVE_MS)
    expect(draft()).toBeNull()
  })
})
