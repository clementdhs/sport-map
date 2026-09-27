import type { LngLat } from '#shared/utils/routes'

interface GpxTrack {
  name: string
  description: string | null
  type: string
  coordinates: LngLat[]
  elevations: number[] | null
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildGpx({ name, description, type, coordinates, elevations }: GpxTrack): string {
  const desc = description ? `\n    <desc>${escapeXml(description)}</desc>` : ''
  const points = coordinates.map(([lng, lat], i) => {
    const ele = elevations?.[i]
    return ele === undefined
      ? `      <trkpt lat="${lat}" lon="${lng}"/>`
      : `      <trkpt lat="${lat}" lon="${lng}"><ele>${ele}</ele></trkpt>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="sport-map" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>${desc}
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <type>${escapeXml(type)}</type>
    <trkseg>
${points.join('\n')}
    </trkseg>
  </trk>
</gpx>
`
}

// ASCII-only file name, safe in a Content-Disposition header.
export function gpxFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'parcours'}.gpx`
}
