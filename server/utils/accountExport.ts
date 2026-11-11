import type { LineString } from 'geojson'
import type { LngLat, Poi, SportType } from '#shared/utils/routes'
import { buildGpx, gpxFileName } from './gpxBuilder'
import { DEFAULT_MESSAGE_LOCALE, translate, type MessageLocale } from './messages'

// Everything a user's archive holds (RGPD: the data they gave, or that was recorded about them).
export interface AccountData {
  exportedAt: string
  profile: { username: string, display_name: string | null, bio: string | null, email: string | null, created_at: string }
  routes: {
    id: string
    name: string
    description: string | null
    sport_type: SportType
    is_public: boolean
    source: string
    distance_m: number
    elevation_gain_m: number | null
    elevation_loss_m: number | null
    elevation_profile: number[] | null
    pois: Poi[]
    geometry: LineString
    created_at: string
    updated_at: string
  }[]
  photos: { route_id: string, storage_path: string, created_at: string }[]
  // Storage path of the profile photo in the "avatars" bucket, null without one
  avatar: string | null
  reviews: object[]
  activity: object[]
  outings: object[]
  collections: object[]
  reports: object[]
  routingUsage: object[]
  // Loop sentences read by the LLM (#216), counted per day like the routing.
  loopSentenceUsage: object[]
  liveShares: object[]
  // Settings kept in the account (#145), none until a device saved one
  preferences: { preferences: unknown, updated_at: string } | null
  // Privacy zones (#254)
  privacyZones: object[]
  // The coach's goal (#264), none until the member picked one
  coachGoal: object | null
}

export interface AccountArchive {
  files: { path: string, content: string }[]
  // Where each photo of a route goes in the archive, and where it is stored.
  photos: { path: string, storage_path: string }[]
  // Same for the profile photo, from the "avatars" bucket
  avatar: { path: string, storage_path: string } | null
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

const ARCHIVE_NAMES = [
  'readme', 'profile', 'avatar', 'routes', 'reviews', 'activity', 'outings', 'collections', 'reports', 'routing', 'live', 'preferences', 'privacyZones', 'coachGoal', 'loopSentences', 'gpxFolder',
  'photosFolder',
] as const
type ArchiveNames = Record<typeof ARCHIVE_NAMES[number], string>

// The archive's file and folder names, in its language.
const archiveNames = (locale: MessageLocale) =>
  Object.fromEntries(ARCHIVE_NAMES.map(key => [key, translate(locale, `archive.files.${key}`)])) as ArchiveNames

function readme(data: AccountData, locale: MessageLocale, names: ArchiveNames, avatar: AccountArchive['avatar']): string {
  const t = (key: string, params?: Record<string, string>) => translate(locale, `archive.readme.${key}`, params)
  const rows = [
    [names.profile, t('profile')],
    ...avatar ? [[avatar.path, t('avatar')] as const] : [],
    [names.routes, t('routes')],
    [`${names.gpxFolder}/*.gpx`, t('gpx')],
    [`${names.photosFolder}/`, t('photos')],
    [names.reviews, t('reviews')],
    [names.activity, t('activity')],
    [names.outings, t('outings')],
    [names.collections, t('collections')],
    [names.reports, t('reports')],
    [names.routing, t('routing')],
    [names.live, t('live')],
    [names.preferences, t('preferences')],
    [names.privacyZones, t('privacyZones')],
    [names.coachGoal, t('coachGoal')],
    [names.loopSentences, t('loopSentences')],
  ] as const
  const width = Math.max(...rows.map(([path]) => path.length)) + 2
  return `${t('intro', { username: data.profile.username, date: data.exportedAt })}

${rows.map(([path, text]) => `${path.padEnd(width)}${text}`).join('\n')}

${t('json')}
`
}

export function accountArchive(data: AccountData, locale: MessageLocale = DEFAULT_MESSAGE_LOCALE): AccountArchive {
  const names = archiveNames(locale)
  const files: AccountArchive['files'] = []
  const photos: AccountArchive['photos'] = []

  const routes = data.routes.map((route) => {
    // Unique even when two routes share a name.
    const base = `${gpxFileName(route.name).replace(/\.gpx$/, '')}-${route.id.slice(0, 8)}`
    const coordinates = route.geometry.coordinates as LngLat[]
    const gpx = `${names.gpxFolder}/${base}.gpx`
    files.push({
      path: gpx,
      content: buildGpx({
        name: route.name,
        description: route.description,
        type: route.sport_type,
        coordinates,
        elevations: route.elevation_profile?.length === coordinates.length ? route.elevation_profile : null,
        pois: route.pois,
        locale,
      }),
    })
    const routePhotos = data.photos
      .filter(photo => photo.route_id === route.id)
      .map(photo => ({ path: `${names.photosFolder}/${base}/${photo.storage_path.split('/').at(-1)}`, storage_path: photo.storage_path }))
    photos.push(...routePhotos)

    const { geometry: _geometry, elevation_profile: _elevations, ...details } = route
    return { ...details, gpx, photos: routePhotos.map(photo => photo.path) }
  })

  const avatar = data.avatar ? { path: `${names.avatar}.${data.avatar.split('.').at(-1)}`, storage_path: data.avatar } : null

  files.unshift(
    { path: names.readme, content: readme(data, locale, names, avatar) },
    { path: names.profile, content: json({ ...data.profile, photo: avatar?.path ?? null }) },
    { path: names.routes, content: json(routes) },
    { path: names.reviews, content: json(data.reviews) },
    { path: names.activity, content: json(data.activity) },
    { path: names.outings, content: json(data.outings) },
    { path: names.collections, content: json(data.collections) },
    { path: names.reports, content: json(data.reports) },
    { path: names.routing, content: json(data.routingUsage) },
    { path: names.live, content: json(data.liveShares) },
    { path: names.preferences, content: json(data.preferences ?? { preferences: {} }) },
    { path: names.privacyZones, content: json(data.privacyZones) },
    { path: names.coachGoal, content: json(data.coachGoal) },
    { path: names.loopSentences, content: json(data.loopSentenceUsage) },
  )
  return { files, photos, avatar }
}
