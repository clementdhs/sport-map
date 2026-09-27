import { gpx } from '@tmcw/togeojson'
import { distance } from '@turf/turf'
import type { Feature, LineString, MultiLineString, Position } from 'geojson'
import { MAX_ROUTE_POINTS } from '#shared/utils/routes'
import type { LngLat } from '#shared/utils/routes'

export interface ImportedTrack {
  name: string | null
  coordinates: LngLat[]
  elevations: number[] | null
}

// GPS watches record a point every second: keep points at least this far apart, which also removes jitter.
const MIN_SPACING_M = 5

// Keeps a point once the track has moved far enough from the last kept one; spacing grows until the
// track fits the point limit.
export function resampleTrack(positions: Position[]): Position[] {
  const along = [0]
  for (let i = 1; i < positions.length; i++) {
    along.push(along[i - 1]! + distance(positions[i - 1]!, positions[i]!, { units: 'meters' }))
  }
  const spacing = Math.max(MIN_SPACING_M, along.at(-1)! / (MAX_ROUTE_POINTS - 2))

  const kept = [positions[0]!]
  let lastKept = 0
  for (let i = 1; i < positions.length - 1; i++) {
    if (along[i]! - lastKept >= spacing) {
      kept.push(positions[i]!)
      lastKept = along[i]!
    }
  }
  kept.push(positions.at(-1)!)
  return kept
}

export async function readGpxFile(file: File): Promise<ImportedTrack> {
  const document = new DOMParser().parseFromString(await file.text(), 'application/xml')
  if (document.querySelector('parsererror')) throw new Error("Ce fichier n'est pas un GPX valide.")

  const first = gpx(document).features.find((feature): feature is Feature<LineString | MultiLineString> =>
    feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString')
  if (!first) throw new Error('Ce fichier ne contient aucune trace ni itinéraire.')

  // A track can be split into several segments (pauses, signal loss): join them into one line.
  const positions = first.geometry.type === 'LineString'
    ? first.geometry.coordinates
    : first.geometry.coordinates.flat()
  if (positions.length < 2) throw new Error('La trace contient moins de 2 points.')

  const points = resampleTrack(positions)
  const round = (value: number) => Math.round(value * 1e6) / 1e6
  const hasElevations = points.every(point => typeof point[2] === 'number')

  return {
    name: typeof first.properties?.name === 'string' ? first.properties.name.trim() || null : null,
    coordinates: points.map(([lng, lat]) => [round(lng!), round(lat!)]),
    elevations: hasElevations ? points.map(point => Math.round(point[2]! * 10) / 10) : null,
  }
}
