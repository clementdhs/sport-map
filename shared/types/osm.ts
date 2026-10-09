import type { Tables } from './database.types'

// Elevation gain and loss of a marked OpenStreetMap route (#71), for a version of its relation.
export type OsmRouteElevation = Pick<Tables<'osm_route_elevations'>, 'relation_id' | 'version' | 'distance_m' | 'gain_m' | 'loss_m'>

// Elevations of a track imported without any (#71), one per point.
export type TrackElevationsResponse = {
  elevations: number[]
}
