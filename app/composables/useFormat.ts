// The number and date formats of shared/utils/format.ts, in the current language.
export function useFormat() {
  const { localeProperties } = useI18n()
  const locale = () => localeProperties.value.language ?? DEFAULT_FORMAT_LOCALE

  return {
    formatDistance: (meters: number) => formatDistance(meters, locale()),
    formatDate: (isoDate: string) => formatDate(isoDate, locale()),
    formatShortDate: (isoDate: string) => formatShortDate(isoDate, locale()),
    formatTime: (isoDate: string) => formatTime(isoDate, locale()),
    formatRating: (average: number) => formatRating(average, locale()),
    formatSpeed: (meters: number, seconds: number) => formatSpeed(meters, seconds, locale()),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(value, locale(), options),
    // The language tag itself, for other Intl calls.
    locale,
  }
}
