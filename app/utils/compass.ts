import { smoothBearing } from '~/utils/flyover'

// Phone compass of follow mode and outing recording (#98): the direction the top of the screen points to, from the
// device orientation events (useCompass). Pure functions over what an event carries.

// The readings are noisy and come up to 60 times a second: each one moves the heading by a share of the gap, closing
// 63 % of it every SMOOTHING_S seconds.
const SMOOTHING_S = 0.4
// After a gap this long (sensor paused, page hidden), the next reading is taken as is.
const RESTART_MS = 1000
// The page gets a new heading at most this often (the arrow and the map redraw with it).
export const COMPASS_PUBLISH_MS = 100
// Below this horizontal length, the screen faces the ground or the sky too squarely to tell a direction.
const MIN_HORIZONTAL = 0.2

export interface OrientationReading {
  // W3C device orientation (degrees): alpha around the vertical axis, counter-clockwise; beta front-back tilt; gamma
  // left-right tilt. Relative to north only when `absolute`.
  alpha: number | null
  beta: number | null
  gamma: number | null
  absolute: boolean
  // iOS: degrees clockwise from magnetic north of the top of the device, and its accuracy (negative when invalid)
  webkitCompassHeading?: number | null
  webkitCompassAccuracy?: number | null
}

export interface CompassState {
  // Smoothed heading, degrees clockwise from north (0 to 360)
  deg: number
  at: number
}

function normalize(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

const isNumber = (value: number | null | undefined): value is number => value != null && Number.isFinite(value)

// Degrees clockwise from north of the top of the screen, as the phone is held: flat, tilted or upright, in portrait
// or landscape (`screenAngle`, screen.orientation.angle: 90 when the phone is turned a quarter to the left). Null
// when the reading doesn't give one (not relative to north, sensor missing).
export function screenHeading(reading: OrientationReading, screenAngle: number): number | null {
  if (isNumber(reading.webkitCompassHeading)) {
    if (isNumber(reading.webkitCompassAccuracy) && reading.webkitCompassAccuracy < 0) return null
    return normalize(reading.webkitCompassHeading + screenAngle)
  }
  const { alpha, beta, gamma } = reading
  if (!reading.absolute || !isNumber(alpha)) return null
  if (!isNumber(beta) || !isNumber(gamma)) return normalize(screenAngle - alpha)

  // Device axes in the east-north-up frame (rotation matrix of the W3C spec, Z-X'-Y''). The direction is the top of
  // the screen plus the back of the phone, both laid flat: the first counts when the phone lies flat, the second when
  // it stands upright, and in between both point ahead.
  const rad = Math.PI / 180
  const [cZ, sZ] = [Math.cos(alpha * rad), Math.sin(alpha * rad)]
  const [cX, sX] = [Math.cos(beta * rad), Math.sin(beta * rad)]
  const [cY, sY] = [Math.cos(gamma * rad), Math.sin(gamma * rad)]
  const right = [cZ * cY - sZ * sX * sY, sZ * cY + cZ * sX * sY]
  const top = [-sZ * cX, cZ * cX]
  const back = [-cZ * sY - sZ * sX * cY, -sZ * sY + cZ * sX * cY]
  const [sA, cA] = [Math.sin(screenAngle * rad), Math.cos(screenAngle * rad)]
  const east = sA * right[0]! + cA * top[0]! + back[0]!
  const north = sA * right[1]! + cA * top[1]! + back[1]!
  if (Math.hypot(east, north) < MIN_HORIZONTAL) return null
  return normalize(Math.atan2(east, north) / rad)
}

// The heading after a new reading, smoothed the short way round.
export function smoothCompass(state: CompassState | null, headingDeg: number, now: number): CompassState {
  if (!state || now - state.at > RESTART_MS) return { deg: normalize(headingDeg), at: now }
  return { deg: normalize(smoothBearing(state.deg, headingDeg, (now - state.at) / 1000, SMOOTHING_S)), at: now }
}
