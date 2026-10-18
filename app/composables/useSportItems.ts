import type { SportType } from '#shared/utils/routes'

// The sports as select items, each icon in its sport's color (`sport-*` classes of main.css, #108).
export function useSportItems() {
  const { t } = useI18n()
  return computed(() => SPORT_TYPES.map((value: SportType) => ({
    value,
    label: t(`sports.${value}`),
    icon: SPORT_ICONS[value],
    ui: { itemLeadingIcon: `sport-${value} text-(--sport)` },
  })))
}
