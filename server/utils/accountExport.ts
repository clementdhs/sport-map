import type { LineString } from 'geojson'
import type { LngLat, Poi, SportType } from '#shared/utils/routes'
import { buildGpx, gpxFileName } from './gpxBuilder'

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
  reviews: object[]
  activity: object[]
  collections: object[]
  reports: object[]
  routingUsage: object[]
}

export interface AccountArchive {
  files: { path: string, content: string }[]
  // Where each photo goes in the archive, and where it is stored.
  photos: { path: string, storage_path: string }[]
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

function readme(data: AccountData): string {
  return `Données de ${data.profile.username} sur sport-map, exportées le ${data.exportedAt}.

profil.json         ton profil (nom d'utilisateur, nom affiché, bio, e-mail, date d'inscription)
parcours.json       tes parcours : description, statistiques, points d'intérêt, visibilité
parcours/*.gpx      le tracé de chaque parcours, à ouvrir dans une application GPS
photos/             les photos de tes parcours, un dossier par parcours
avis.json           les avis que tu as laissés sur des parcours
activite.json       les parcours que tu as sauvegardés ou réalisés, avec les temps de tes sorties enregistrées
collections.json    tes collections de parcours
signalements.json   les avis que tu as signalés
calculs.json        ton nombre de calculs d'itinéraire du jour (limité par personne)

Les fichiers .json sont du texte structuré (JSON), lisible par la plupart des logiciels.
`
}

export function accountArchive(data: AccountData): AccountArchive {
  const files: AccountArchive['files'] = []
  const photos: AccountArchive['photos'] = []

  const routes = data.routes.map((route) => {
    // Unique even when two routes share a name.
    const base = `${gpxFileName(route.name).replace(/\.gpx$/, '')}-${route.id.slice(0, 8)}`
    const coordinates = route.geometry.coordinates as LngLat[]
    const gpx = `parcours/${base}.gpx`
    files.push({
      path: gpx,
      content: buildGpx({
        name: route.name,
        description: route.description,
        type: route.sport_type,
        coordinates,
        elevations: route.elevation_profile?.length === coordinates.length ? route.elevation_profile : null,
        pois: route.pois,
      }),
    })
    const routePhotos = data.photos
      .filter(photo => photo.route_id === route.id)
      .map(photo => ({ path: `photos/${base}/${photo.storage_path.split('/').at(-1)}`, storage_path: photo.storage_path }))
    photos.push(...routePhotos)

    const { geometry: _geometry, elevation_profile: _elevations, ...details } = route
    return { ...details, gpx, photos: routePhotos.map(photo => photo.path) }
  })

  files.unshift(
    { path: 'LISEZMOI.txt', content: readme(data) },
    { path: 'profil.json', content: json(data.profile) },
    { path: 'parcours.json', content: json(routes) },
    { path: 'avis.json', content: json(data.reviews) },
    { path: 'activite.json', content: json(data.activity) },
    { path: 'collections.json', content: json(data.collections) },
    { path: 'signalements.json', content: json(data.reports) },
    { path: 'calculs.json', content: json(data.routingUsage) },
  )
  return { files, photos }
}
