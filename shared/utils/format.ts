// Numbers and dates follow the language (a BCP 47 tag such as 'fr-FR' or 'en-GB'): French by default, for
// server-generated files. Components get these bound to the current language from useFormat().
export const DEFAULT_FORMAT_LOCALE = 'fr-FR'

export function formatDistance(meters: number, locale = DEFAULT_FORMAT_LOCALE): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`
}

// Rounded to 5 minutes: finer precision would be misleading for an estimate.
export function formatDuration(minutes: number): string {
  const rounded = Math.max(5, Math.round(minutes / 5) * 5)
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`
}

export function formatShortDate(isoDate: string, locale = DEFAULT_FORMAT_LOCALE): string {
  return new Date(isoDate).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })
}

// Fixed time zone so server and client render the same date.
export function formatDate(isoDate: string, locale = DEFAULT_FORMAT_LOCALE): string {
  return new Date(isoDate).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  })
}

// Average rating with one decimal, e.g. "4,3".
export function formatRating(average: number, locale = DEFAULT_FORMAT_LOCALE): string {
  return average.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

// Stopwatch, e.g. "1:05:09" or "05:09".
export function formatStopwatch(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(s / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  const rest = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
  return hours ? `${hours}:${rest}` : rest
}

// A measured time, to the minute, e.g. "1 h 05" or "42 min" (seconds under a minute).
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (!hours) return `${minutes} min`
  return `${hours} h ${String(minutes % 60).padStart(2, '0')}`
}

// Speed from meters and seconds, e.g. "8,4 km/h".
export function formatSpeed(meters: number, seconds: number, locale = DEFAULT_FORMAT_LOCALE): string {
  const kmh = seconds > 0 ? (meters / seconds) * 3.6 : 0
  return `${kmh.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km/h`
}

// Any other number, e.g. "1 250" or "1,250".
export function formatNumber(value: number, locale = DEFAULT_FORMAT_LOCALE, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(locale, options)
}
