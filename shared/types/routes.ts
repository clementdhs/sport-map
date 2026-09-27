import type { LineString } from 'geojson'
import type { Tables } from './database.types'

// Declared here rather than inferred from the handler: the app's TypeScript project cannot
// resolve server-only aliases (#supabase/server), which would turn inferred responses into `any`.
export type RouteDetail = Pick<
  Tables<'routes'>,
  | 'id' | 'name' | 'description' | 'sport_type' | 'distance_m' | 'elevation_gain_m' | 'elevation_loss_m'
  | 'is_public' | 'source' | 'created_at' | 'owner_id'
> & {
  geometry: LineString
  owner: Pick<Tables<'profiles'>, 'username' | 'display_name'> | null
}
