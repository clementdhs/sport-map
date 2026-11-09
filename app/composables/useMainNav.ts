// Sections of the main navigation (#101): bottom tab bar on phones, app header from md up. A section stays current
// on the pages it leads to (a route page for the map, a collection for the profile). Coach took the place of
// "En direct" (#262), reached from the home banner and the "Partager ma position" choice.
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
  { key: 'coach', icon: 'i-lucide-activity', to: '/coach', within: [] },
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

export interface NewItem {
  kind: 'record' | 'share' | 'create'
  label: string
  short: string
  icon: string
  to: string
}

// Choices of the tab bar's central button; the header shows them as buttons. Sharing one's position starts a
// recording that offers the share once the outing has started (`?share=1`, #262).
export function useNewItems() {
  const { t } = useI18n()
  return computed<NewItem[]>(() => [
    { kind: 'record', label: t('header.record'), short: t('mapBar.record'), icon: 'i-lucide-circle-dot', to: '/record' },
    { kind: 'share', label: t('header.share'), short: t('mapBar.share'), icon: 'i-lucide-radio', to: '/record?share=1' },
    { kind: 'create', label: t('header.create'), short: t('mapBar.create'), icon: 'i-lucide-plus', to: '/routes/create' },
  ])
}
