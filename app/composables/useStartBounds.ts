import type { Bounds } from '~/stores/routeSearch'

// What a map opens on (#147): the member's start area, unless the page already has a view of its own (`known`,
// read when the page opens: the map's first view makes it known). Undefined leaves the map's center and zoom.
export function useStartBounds(known: boolean): ComputedRef<Bounds | undefined> {
  const startArea = usePreference('startArea')
  return computed(() => (known ? undefined : startArea.value?.bounds))
}
