// Plural messages have two forms, "singular | plural": French uses the singular for 0 and 1, English for 1 only.
function twoForms(isSingular: (count: number) => boolean) {
  return (choice: number, choicesLength: number) => {
    if (choicesLength !== 2) return Math.min(Math.abs(choice), choicesLength - 1)
    return isSingular(Math.abs(choice)) ? 0 : 1
  }
}

export default defineI18nConfig(() => ({
  fallbackLocale: 'fr',
  pluralRules: {
    fr: twoForms(count => count < 2),
    en: twoForms(count => count === 1),
  },
}))
