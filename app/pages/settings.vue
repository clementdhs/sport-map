<script setup lang="ts">
import type { ProfileInfo } from '#shared/types/routes'
import type { ProfileUpdate } from '#shared/utils/routes'

// Account settings, reached from the account menu: profile, password, appearance, data (RGPD).
const { t } = useI18n()
const profileUpdateSchemaLocalized = useLocalizedSchema(profileUpdateSchema)
useSeoMeta({ title: () => `${t('header.settings')} — sport-map` })

const toast = useToast()
const errorMessage = useErrorMessage()
const { data: profile, error } = await useFetch<ProfileInfo>('/api/profile/me/info')
if (error.value) {
  throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: error.value.statusMessage, fatal: true })
}

const form = ref<ProfileUpdate>({ display_name: profile.value?.display_name ?? '', bio: profile.value?.bio ?? '' })
const saving = ref(false)

async function saveProfile() {
  saving.value = true
  try {
    await $fetch('/api/profile/me', { method: 'PATCH', body: form.value })
    toast.add({ title: t('settings.profileUpdated'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({
      title: t('collection.updateFailed'),
      description: errorMessage(err),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

function onPasswordChanged() {
  toast.add({ title: t('auth.passwordChanged'), color: 'success', icon: 'i-lucide-check' })
}
</script>

<template>
  <UContainer v-if="profile" class="max-w-2xl space-y-6 py-8">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">{{ t('header.settings') }}</h1>
      <UButton to="/profile" icon="i-lucide-user" :label="t('header.profile')" color="neutral" variant="outline" />
    </div>

    <section class="space-y-3 rounded-lg border border-default p-4" aria-labelledby="settings-profile-title">
      <h2 id="settings-profile-title" class="font-medium">{{ t('settings.profile') }}</h2>
      <i18n-t keypath="settings.profileHint" tag="p" class="text-sm text-muted" scope="global">
        <template #link>
          <ULink :to="`/profile/${profile.username}`" class="text-primary">{{ t('settings.publicProfile') }}</ULink>
        </template>
        <template #username>@{{ profile.username }}</template>
      </i18n-t>
      <UForm :schema="profileUpdateSchemaLocalized" :state="form" class="space-y-4" @submit="saveProfile">
        <UFormField :label="t('settings.displayName')" name="display_name" :hint="t('settings.displayNameHint', { username: profile.username })">
          <UInput v-model="form.display_name" class="w-full" />
        </UFormField>
        <UFormField :label="t('settings.bio')" name="bio">
          <UTextarea v-model="form.bio" :rows="4" autoresize class="w-full" />
        </UFormField>
        <UButton type="submit" :label="t('settings.saveProfile')" :loading="saving" />
      </UForm>
    </section>

    <section class="space-y-3 rounded-lg border border-default p-4" aria-labelledby="settings-password-title">
      <h2 id="settings-password-title" class="font-medium">{{ t('auth.password') }}</h2>
      <NewPasswordForm :submit-label="t('settings.changePassword')" class="max-w-sm" @done="onPasswordChanged" />
    </section>

    <section class="space-y-3 rounded-lg border border-default p-4" aria-labelledby="settings-appearance-title">
      <h2 id="settings-appearance-title" class="font-medium">{{ t('theme.label') }}</h2>
      <p class="text-sm text-muted">{{ t('settings.appearanceHint') }}</p>
      <LanguageSelect />
      <ThemeSettings />
    </section>

    <AccountData :username="profile.username" />
  </UContainer>
</template>
