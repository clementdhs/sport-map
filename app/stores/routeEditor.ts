import { length, lineString } from '@turf/turf'
import type { LngLat, RouteDetails } from '#shared/utils/routes'

const defaultDetails = (): RouteDetails => ({
  name: '',
  description: '',
  sport_type: 'running',
  is_public: true,
})

// ~10 cm precision is plenty and keeps payloads small.
const round = (value: number) => Math.round(value * 1e6) / 1e6

export const useRouteEditorStore = defineStore('routeEditor', () => {
  const points = ref<LngLat[]>([])
  const details = ref<RouteDetails>(defaultDetails())

  // Client-side estimate for live feedback; the database computes the stored distance.
  const distanceM = computed(() =>
    points.value.length < 2 ? 0 : length(lineString(points.value), { units: 'meters' }),
  )
  const canSave = computed(() => points.value.length >= 2 && points.value.length <= MAX_ROUTE_POINTS)

  function addPoint([lng, lat]: LngLat) {
    points.value.push([round(lng), round(lat)])
  }

  function undo() {
    points.value.pop()
  }

  function clearPoints() {
    points.value = []
  }

  function reset() {
    clearPoints()
    details.value = defaultDetails()
  }

  async function save(): Promise<string> {
    const { id } = await $fetch<{ id: string }>('/api/routes', {
      method: 'POST',
      body: { ...details.value, coordinates: points.value },
    })
    reset()
    return id
  }

  return { points, details, distanceM, canSave, addPoint, undo, clearPoints, reset, save }
})
