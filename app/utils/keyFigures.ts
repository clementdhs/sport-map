// A cell of the key figures cartouche (`KeyFigures.vue`).
export type KeyFigure = {
  label: string
  // The figure, or « — » when unknown
  value: string
  unit?: string
  // On the yellow of the signs (the duration)
  highlight?: boolean
  // Explanation in a tooltip next to the label
  hint?: string
}

// "21,40 km" → ["21,40", "km"]: figures and units are set apart in the cartouche.
export function splitUnit(formatted: string): [string, string | undefined] {
  const at = formatted.lastIndexOf(' ')
  return at < 0 ? [formatted, undefined] : [formatted.slice(0, at), formatted.slice(at + 1)]
}
