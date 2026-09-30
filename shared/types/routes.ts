import type { LineString } from 'geojson'
import type { EditorState, Poi } from '../utils/routes'
import type { Tables } from './database.types'

// Declared here rather than inferred from the handler: the app's TypeScript project cannot
// resolve server-only aliases (#supabase/server), which would turn inferred responses into `any`.

// What the signed-in viewer did with a route.
export type ViewerActivity = {
  saved: boolean
  completed_at: string | null
} & OutingTimes

// Times of an outing recorded with the GPS (s), null when the route was just marked as done.
export type OutingTimes = {
  duration_s: number | null
  moving_s: number | null
}

export type RouteDetail = Pick<
  Tables<'routes'>,
  | 'id' | 'name' | 'description' | 'sport_type' | 'distance_m' | 'elevation_gain_m' | 'elevation_loss_m'
  | 'is_public' | 'source' | 'created_at' | 'updated_at' | 'owner_id' | 'rating_avg' | 'rating_count'
> & {
  geometry: LineString
  // One elevation (m) per geometry coordinate, when known.
  elevation_profile: number[] | null
  // null for routes saved before the editor state was stored
  editor_state: EditorState | null
  pois: Poi[]
  photos: RoutePhoto[]
  owner: Pick<Tables<'profiles'>, 'username' | 'display_name'> | null
  // null when nobody is signed in
  viewer: ViewerActivity | null
}

// A photo of a route. The URL is signed and expires after an hour: the bucket is private.
export type RoutePhoto = {
  id: string
  url: string
}

export type RouteListItem = {
  id: string
  name: string
  sport_type: Tables<'routes'>['sport_type']
  distance_m: number
  elevation_gain_m: number | null
  is_public: boolean
  // Ends less than 200 m from its start
  is_loop: boolean
  // Average of the ratings (1 to 5), null while nobody rated the route
  rating_avg: number | null
  rating_count: number
  // Display name of the owner, or their username when they chose none
  owner_name: string
  created_at: string
}

export type RouteSummary = RouteListItem & {
  // Where the route is pinned on the search map: its start or, when searching routes passing through the
  // view, the point of its track closest to the view's center.
  marker: [lng: number, lat: number]
}

export type ProfileInfo = Pick<Tables<'profiles'>, 'username' | 'display_name' | 'bio' | 'created_at'>

export type MyProfile = {
  profile: ProfileInfo
  created: RouteListItem[]
  saved: RouteListItem[]
  completed: (RouteListItem & OutingTimes & { completed_at: string })[]
}

export type PublicProfile = {
  profile: ProfileInfo
  routes: RouteListItem[]
}

// A review as the current viewer may see it. Hidden reviews only reach their author and the route's owner.
export type RouteReview = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  updated_at: string
  author: Pick<Tables<'profiles'>, 'username' | 'display_name'> | null
  is_mine: boolean
  hidden_reason: 'owner' | 'reports' | null
  reported_by_me: boolean
  // Only for the route's owner, null for everyone else
  report_count: number | null
}

export type RouteReviews = {
  rating_avg: number | null
  rating_count: number
  reviews: RouteReview[]
}

// Forecast of one half-day at the start of a route (local time of the route).
export type HalfDayForecast = {
  // YYYY-MM-DD
  date: string
  period: 'morning' | 'afternoon'
  tempMin: number
  tempMax: number
  precipitationMm: number
  // Highest chance of rain in the half-day (%), when known
  precipitationProbability: number | null
  windMaxKmh: number
  gustMaxKmh: number
  // WMO weather code of the most severe weather of the half-day
  weatherCode: number
}

export type RouteWeather = {
  // Local date at the route's start (YYYY-MM-DD), to label "today" and "tomorrow"
  today: string
  // Elevation of the start used for the forecast (m), when known
  elevationM: number | null
  halfDays: HalfDayForecast[]
}

// One of the viewer's collections, e.g. in the "add to a collection" menu of a route.
export type CollectionSummary = {
  id: string
  name: string
  description: string | null
  is_public: boolean
  // Routes the viewer can see in it
  route_count: number
  // Whether it holds the route the list was asked for (GET /api/collections?route=)
  contains: boolean
}

export type CollectionDetail = {
  id: string
  name: string
  description: string | null
  is_public: boolean
  created_at: string
  owner: Pick<Tables<'profiles'>, 'username' | 'display_name'> | null
  is_mine: boolean
  // Only the routes the viewer may see, with a simplified track for the map
  routes: (RouteListItem & { preview: LineString })[]
}