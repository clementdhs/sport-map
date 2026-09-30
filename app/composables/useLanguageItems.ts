import type { DropdownMenuItem } from '@nuxt/ui'

// The languages as dropdown menu items, the current one checked: the header's picker for visitors and a
// submenu of the account menu. setLocale stores the choice in the sport-map-locale cookie.
export function useLanguageItems() {
  const { locale, locales, setLocale } = useI18n()

  return computed<DropdownMenuItem[]>(() => locales.value.map(item => ({
    label: item.name,
    type: 'checkbox' as const,
    checked: item.code === locale.value,
    onSelect: () => setLocale(item.code),
  })))
}
