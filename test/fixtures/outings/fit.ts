import { FitBaseType, FitEncoder, type FitEncoderField } from 'fit-file-parser'

// A small FIT activity file, as a watch writes one (#268): file_id, one record per point, one session. Built with
// fit-file-parser's own encoder rather than kept as a binary file, so its content can be read here. Used by the
// unit tests and the e2e import.

export interface FitPoint {
  lng: number
  lat: number
  // m
  alt: number
  // s after the start
  s: number
}

export interface FitActivity {
  start: Date
  points: FitPoint[]
  // FIT profile values: sport 1 = running, 2 = cycling, 17 = hiking; sub-sport 3 = trail
  sport: number
  subSport?: number
  // s
  elapsedS: number
  timerS: number
  // m
  distanceM: number
}

const semicircles = (degrees: number) => Math.round(degrees * 2 ** 31 / 180)
const field = (number: number, baseType: FitBaseType, size: number, value: number): FitEncoderField => ({ number, baseType, size, value })

export function fitActivity(activity: FitActivity): Uint8Array {
  const time = (s: number) => FitEncoder.toFitTimestamp(new Date(activity.start.getTime() + s * 1000))
  const encoder = new FitEncoder()
  // file_id: type 4 = activity, time_created
  encoder.writeMessage(0, [field(0, FitBaseType.Enum, 1, 4), field(4, FitBaseType.Uint32, 4, time(0))], 0)
  for (const point of activity.points) {
    // record: timestamp, position_lat, position_long, enhanced_altitude (scale 5, offset 500)
    encoder.writeMessage(20, [
      field(253, FitBaseType.Uint32, 4, time(point.s)),
      field(0, FitBaseType.Sint32, 4, semicircles(point.lat)),
      field(1, FitBaseType.Sint32, 4, semicircles(point.lng)),
      field(78, FitBaseType.Uint32, 4, Math.round((point.alt + 500) * 5)),
    ], 1)
  }
  // session: timestamp, start_time, sport, sub_sport, total_elapsed_time and total_timer_time (ms),
  // total_distance (cm)
  encoder.writeMessage(18, [
    field(253, FitBaseType.Uint32, 4, time(activity.elapsedS)),
    field(2, FitBaseType.Uint32, 4, time(0)),
    field(5, FitBaseType.Enum, 1, activity.sport),
    field(6, FitBaseType.Enum, 1, activity.subSport ?? 0),
    field(7, FitBaseType.Uint32, 4, activity.elapsedS * 1000),
    field(8, FitBaseType.Uint32, 4, activity.timerS * 1000),
    field(9, FitBaseType.Uint32, 4, activity.distanceM * 100),
  ], 2)
  return encoder.close()
}

// A 3 min trail run of about 330 m climbing 15 m, with a 30 s stop the watch's timer left out.
export const TRAIL_FIT: FitActivity = {
  start: new Date('2026-10-09T17:00:00Z'),
  points: [
    { lng: 6.13, lat: 45.95, alt: 700, s: 0 },
    { lng: 6.13, lat: 45.951, alt: 705, s: 50 },
    { lng: 6.13, lat: 45.952, alt: 710, s: 100 },
    { lng: 6.13, lat: 45.953, alt: 715, s: 180 },
  ],
  sport: 1,
  subSport: 3,
  elapsedS: 180,
  timerS: 150,
  distanceM: 335,
}
