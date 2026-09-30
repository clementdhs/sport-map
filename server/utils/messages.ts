import en from '../../i18n/locales/en.json'
import fr from '../../i18n/locales/fr.json'

// The app's language files, for what the server writes itself (link preview images, GPX files).
const MESSAGES = { fr, en }
export type MessageLocale = keyof typeof MESSAGES
export const DEFAULT_MESSAGE_LOCALE: MessageLocale = 'fr'

type Messages = { [key: string]: string | Messages }

// Looks a key up ("sports.hiking") and fills its {placeholders}. Enough for the simple messages the server
// uses: no plural forms, no vue-i18n special characters.
export function translate(locale: MessageLocale, key: string, params: Record<string, string | number> = {}): string {
  const found = key.split('.').reduce<string | Messages | undefined>(
    (node, part) => (typeof node === 'object' ? node[part] : undefined),
    MESSAGES[locale] as Messages,
  )
  if (typeof found !== 'string') return key
  return found.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(params[name] ?? placeholder))
}
