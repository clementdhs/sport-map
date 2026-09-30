import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { collectionSchema } from '#shared/utils/collections'

// The schema as a form sees it, through useLocalizedSchema in a component.
async function localizedCollectionSchema() {
  let schema = collectionSchema
  await mountSuspended(defineComponent({
    setup() {
      schema = useLocalizedSchema(collectionSchema)
      return () => h('div')
    },
  }))
  return schema
}

async function messages(value: unknown) {
  const schema = await localizedCollectionSchema()
  const result = await schema['~standard'].validate(value)
  return (result.issues ?? []).map(issue => issue.message)
}

describe('useLocalizedSchema', () => {
  it('translates the keys, with the limits taken from the issue', async () => {
    expect(await messages({ name: '', is_public: false })).toEqual(['Nom requis'])
    expect(await messages({ name: 'x'.repeat(81), is_public: false })).toEqual(['80 caractères maximum'])
  })

  it('follows the current language', async () => {
    const { $i18n } = useNuxtApp()
    await $i18n.setLocale('en')
    try {
      expect(await messages({ name: 'x'.repeat(81), is_public: false })).toEqual(['80 characters maximum'])
    }
    finally {
      await $i18n.setLocale('fr')
    }
  })
})
