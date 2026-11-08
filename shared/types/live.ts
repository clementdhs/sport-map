import type { LineString } from 'geojson'
import type { SportType } from '../utils/routes'
import type { LiveThumbnail } from '../utils/liveThumbnail'

export interface LivePoint {
  fixed_at: string
  lng: number
  lat: number
  accuracy_m: number | null
}

// A share in progress, as listed for the family.
export interface LiveShareSummary {
  id: string
  // display_name ?? username
  user_name: string
  // Their profile photo (profiles.avatar_path), null for their initials
  user_avatar_path: string | null
  is_mine: boolean
  // The route followed, if the viewer may see it (null too when recording freely)
  route: { id: string, name: string } | null
  // Following a route, visible or not, rather than recording freely
  follows_route: boolean
  started_at: string
  expires_at: string
  // When the latest point was taken, null before the first one arrives.
  last_fixed_at: string | null
}

// A share in the /live list (#237), with what its card shows: the sport and the mini-map of the route followed
// (even one the viewer may not open, like the full map) and the track covered so far.
export interface LiveShareListItem extends LiveShareSummary {
  // The route's sport, null when recording freely
  sport: SportType | null
  // Length of the track covered (m)
  distance_m: number
  thumbnail: LiveThumbnail | null
}

// A share and its track. Without `after`, all its points and the route followed (even one the viewer may not
// open); with it, only the newer points and no route geometry (already loaded).
export interface LiveShareDetail extends LiveShareSummary {
  points: LivePoint[]
  route_geometry: LineString | null
}

export interface LiveShareStarted {
  id: string
  expires_at: string
}
