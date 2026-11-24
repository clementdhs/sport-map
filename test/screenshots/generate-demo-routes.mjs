// Generates the demo routes of the README screenshots (demo-routes.json) once, with OpenRouteService:
// `node --env-file=.env test/screenshots/generate-demo-routes.mjs`. The result is committed, so taking the
// screenshots never calls ORS again. Tracks © OpenStreetMap contributors (ODbL), routed by OpenRouteService.
import { writeFileSync } from 'node:fs'

const key = process.env.NUXT_OPENROUTESERVICE_KEY
if (!key) throw new Error('NUXT_OPENROUTESERVICE_KEY manquante (.env)')

// Around Annecy, far from anyone's home. Waypoints as [lng, lat].
const ROUTES = [
  {
    name: 'Tour du lac d\'Annecy',
    description: 'Le grand classique à vélo : la piste cyclable rive ouest, puis la route de Talloires au retour.',
    sport_type: 'cycling',
    profile: 'cycling-regular',
    waypoints: [[6.1300, 45.8990], [6.1400, 45.8640], [6.2010, 45.8270], [6.2240, 45.7800], [6.2140, 45.8410], [6.1950, 45.8590], [6.1650, 45.8840], [6.1300, 45.8990]],
  },
  {
    name: 'Boucle du Mont Baron',
    description: 'Montée raide en forêt jusqu\'au Mont Baron, puis retour par les balcons du lac.',
    sport_type: 'hiking',
    profile: 'foot-hiking',
    waypoints: [[6.1640, 45.9120], [6.1760, 45.9070], [6.1870, 45.8960], [6.1700, 45.8890], [6.1640, 45.9120]],
  },
  {
    name: 'Footing du Pâquier',
    description: 'Boucle plate au bord de l\'eau, du Pâquier à la plage d\'Albigny.',
    sport_type: 'running',
    profile: 'foot-walking',
    waypoints: [[6.1330, 45.9003], [6.1555, 45.9075], [6.1430, 45.9150], [6.1330, 45.9003]],
  },
  {
    name: 'Crêtes du Semnoz',
    description: 'Trail sur la crête du Semnoz, du Crêt de Châtillon aux alpages.',
    sport_type: 'trail',
    profile: 'foot-hiking',
    waypoints: [[6.0860, 45.7900], [6.1010, 45.8170], [6.1130, 45.8350], [6.0860, 45.7900]],
  },
]

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits

const out = []
for (const route of ROUTES) {
  const response = await fetch(`https://api.openrouteservice.org/v2/directions/${route.profile}/geojson`, {
    method: 'POST',
    headers: { 'Authorization': key, 'Content-Type': 'application/json', 'Accept': 'application/geo+json' },
    body: JSON.stringify({
      coordinates: route.waypoints,
      radiuses: route.waypoints.map(() => 1000),
      elevation: true,
      instructions: false,
      extra_info: ['surface', 'waytype', 'traildifficulty'],
    }),
  })
  if (!response.ok) throw new Error(`${route.name}: ${response.status} ${await response.text()}`)
  const feature = (await response.json()).features[0]
  const coordinates = feature.geometry.coordinates
  const { extras = {}, way_points: wayPoints } = feature.properties
  const difficulty = extras.traildifficulty?.values ?? []
  const cycling = route.profile.startsWith('cycling')
  out.push({
    name: route.name,
    description: route.description,
    sport_type: route.sport_type,
    coordinates: coordinates.map(([lng, lat]) => [round(lng, 5), round(lat, 5)]),
    elevations: coordinates.map(([, , ele]) => round(ele, 1)),
    way_info: {
      surface: extras.surface?.values ?? [],
      waytype: extras.waytype?.values ?? [],
      sac_scale: cycling ? [] : difficulty,
      mtb_scale: cycling ? difficulty : [],
    },
    // The editor's state: each waypoint as snapped by ORS, one snapped segment between two.
    editor_state: {
      waypoints: wayPoints.map(i => [round(coordinates[i][0], 5), round(coordinates[i][1], 5)]),
      segments: wayPoints.slice(1).map((end, i) => ({ mode: 'snap', start: wayPoints[i], end })),
    },
  })
  console.log(`${route.name}: ${coordinates.length} points, ${Math.round(feature.properties.summary.distance)} m`)
}

writeFileSync(new URL('./demo-routes.json', import.meta.url), `${JSON.stringify(out)}\n`)
