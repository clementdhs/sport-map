export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`
}

// Rounded to 5 minutes: finer precision would be misleading for an estimate.
export function formatDuration(minutes: number): string {
  const rounded = Math.max(5, Math.round(minutes / 5) * 5)
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`
}

export function formatShortDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })
}

// Fixed time zone so server and client render the same date.
export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  })
}

// Average rating with one decimal, e.g. "4,3".
export function formatRating(average: number): string {
  return average.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
