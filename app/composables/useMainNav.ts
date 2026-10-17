// Sections of the main navigation (#101): bottom tab bar on phones, app header from md up. A section stays current
// on the pages it leads to (a route page for the map, a collection for the profile).
export interface MainNavItem {
  label: string
  icon: string
  to: string
  ariaCurrent?: 'page' | 'true'
  onClick?: () => void
}

const SECTIONS = [
  { key: 'map', icon: 'i-lucide-map', to: '/', within: ['/routes/'] },
  { key: 'discover', icon: 'i-lucide-signpost', to: '/discover', within: [] },
  { key: 'live', icon: 'i-lucide-radio', to: '/live', within: [] },
  { key: 'profile', icon: 'i-lucide-user', to: '/profile', within: ['/collections/'] },
] as const

export function useMainNav() {
  const { t } = useI18n()
  const route = useRoute()
  const search = useRouteSearchStore()
  const discover = useOsmDiscoverStore()
  return computed<MainNavItem[]>(() => SECTIONS.map(({ key, icon, to, within }) => {
    const ariaCurrent = route.path === to
      ? 'page'
      : within.some(prefix => route.path.startsWith(prefix)) ? 'true' : undefined
    // From the home page, discover opens on the same view, like the home page's own link.
    const onClick = key === 'discover' && route.path === '/' ? () => discover.startFrom(search.view) : undefined
    return { label: t(`nav.${key}`), icon, to, ariaCurrent, onClick }
  }))
}

// Choices of the tab bar's central button; the header shows them as two buttons.
export function useNewItems() {
  const { t } = useI18n()
  return computed(() => [
    { label: t('header.record'), short: t('mapBar.record'), icon: 'i-lucide-circle-dot', to: '/record' },
    { label: t('header.create'), short: t('mapBar.create'), icon: 'i-lucide-plus', to: '/routes/create' },
  ])
}
