import type { LngLat } from '#shared/utils/routes'
import { isLoopPlacesFresh, type LoopPlacesSearch, loopPlacesCell, MAX_LOOP_CACHED_PLACES } from '#shared/utils/loopPlacesCache'
import type { CachedLoopPlaces } from '#shared/types/loopPlaces'

// What a live search gave; `complete` is false when a source the search needed didn't answer (not kept then).
export interface LiveLoopPlaces<T> {
  places: T[]
  complete: boolean
}

// The places of a loop search around the start's cell (#311): the family's answer when it is under
// LOOP_PLACES_TTL_DAYS old, else a live search around the cell centre, kept for the next ones. While the live search
// fails, an older answer still serves. Throws only when there is neither.
export async function cachedLoopPlaces<T>(
  search: LoopPlacesSearch,
  start: LngLat,
  live: (centre: LngLat) => Promise<LiveLoopPlaces<T>>,
  signal?: AbortSignal,
): Promise<T[]> {
  const centre = loopPlacesCell(start)
  // The cache is a shortcut: when it can't be read, Overpass is asked as before.
  const cached = await $fetch<CachedLoopPlaces>('/api/loops/places/lookup', { method: 'POST', body: { search, start: centre }, signal })
    .catch(() => null)
  signal?.throwIfAborted()
  if (cached && isLoopPlacesFresh(cached.fetched_at)) return cached.places as T[]

  let answer: LiveLoopPlaces<T>
  try {
    answer = await live(centre)
  }
  catch (error) {
    if (cached && (error as Error)?.name !== 'AbortError') return cached.places as T[]
    throw error
  }
  // A source missing this time: the older, complete answer is better.
  if (!answer.complete) return cached ? cached.places as T[] : answer.places
  if (answer.places.length <= MAX_LOOP_CACHED_PLACES) {
    $fetch('/api/loops/places', { method: 'POST', body: { search, start: centre, places: answer.places } })
      .catch(error => console.warn('[loop places] not cached', error))
  }
  return answer.places
}
