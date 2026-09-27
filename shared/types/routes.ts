import type { LineString } from 'geojson'
import type { EditorState } from '../utils/routes'
import type { Tables } from './database.types'

// Declared here rather than inferred from the handler: the app's TypeScript project cannot
// resolve server-only aliases (#supabase/server), which would turn inferred responses into `any`.

// What the signed-in viewer did with a route.
export type ViewerActivity = {
  saved: boolean
  completed_at: string | null
}

export type RouteDetail = Pick<
  Tables<'routes'>,
  | 'id' | 'name' | 'description' | 'sport_type' | 'distance_m' | 'elevation_gain_m' | 'elevation_loss_m'
  | 'is_public' | 'source' | 'created_at' | 'updated_at' | 'owner_id'
> & {
  geometry: LineString
  // One elevation (m) per geometry coordinate, when known.
  elevation_profile: number[] | null
  // null for routes saved before the editor state was stored
  editor_state: EditorState | null
  owner: Pick<Tables<'profiles'>, 'username' | 'display_name'> | null
  // null when nobody is signed in
  viewer: ViewerActivity | null
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
  owner_username: string
  created_at: string
}

export type RouteSummary = RouteListItem & {
  start: [lng: number, lat: number]
}

export type ProfileInfo = Pick<Tables<'profiles'>, 'username' | 'display_name' | 'bio' | 'created_at'>

export type MyProfile = {
  profile: ProfileInfo
  created: RouteListItem[]
  saved: RouteListItem[]
  completed: (RouteListItem & { completed_at: string })[]
}

export type PublicProfile = {
  profile: ProfileInfo
  routes: RouteListItem[]
}
