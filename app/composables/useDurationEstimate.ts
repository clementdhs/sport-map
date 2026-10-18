import type { SportType } from '#shared/utils/routes'

// Estimated moving time at the pace the member looking set for the sport (#146), else the sport's default one,
// as until the component is mounted (the server renders the defaults).
export function useDurationEstimate() {
  const paces = usePreference('paces')
  return (sport: SportType, distanceM: number, elevationGainM: number | null) =>
    estimateDurationMin(sport, distanceM, elevationGainM, paces.value[sport])
}
