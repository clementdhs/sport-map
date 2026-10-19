<script setup lang="ts">
import type { ProfileInfo } from '#shared/types/routes'
import type { ProfileUpdate } from '#shared/utils/routes'

// Account settings, reached from the account menu, in sections with their own anchor (#111): profile, account
// (password, data), appearance and language, default sport, paces per sport, voice guidance.
const { t } = useI18n()
const { maptilerKey } = useRuntimeConfig().public
const profileUpdateSchemaLocalized = useLocalizedSchema(profileUpdateSchema)
useSeoMeta({ title: () => `${t('header.settings')} — sport-map` })

const toast = useToast()
const errorMessage = useErrorMessage()
const { data: profile, error, refresh } = await useFetch<ProfileInfo>('/api/profile/me/info')
if (error.value) {
  throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: error.value.statusMessage, fatal: true })
}

const { refresh: refreshMyProfile } = useMyProfile()

const form = ref<ProfileUpdate>({
  username: profile.value?.username ?? '',
  display_name: profile.value?.display_name ?? '',
  bio: profile.value?.bio ?? '',
})
const saving = ref(false)
// The username is also the sign-in name: changing it is worth a warning.
const usernameChanged = computed(() => !!profile.value && form.value.username.trim() !== profile.value.username)

async function saveProfile() {
  saving.value = true
  try {
    await $fetch('/api/profile/me', { method: 'PATCH', body: form.value })
    toast.add({ title: t('settings.profileUpdated'), color: 'success', icon: 'i-lucide-check' })
    // The profile link, the account deletion and the account menu use the username.
    if (usernameChanged.value) await Promise.all([refresh(), refreshMyProfile()])
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

// The account menu and the tab bar show the photo too.
async function onAvatarChanged() {
  await Promise.all([refresh(), refreshMyProfile()])
}

function onPasswordChanged() {
  toast.add({ title: t('auth.passwordChanged'), color: 'success', icon: 'i-lucide-check' })
}

// Ids in English whatever the language, since links to them are shared.
const sections = computed(() => [
  { id: 'profile', label: t('settings.sections.profile'), icon: 'i-lucide-user' },
  { id: 'account', label: t('settings.sections.account'), icon: 'i-lucide-key-round' },
  { id: 'appearance', label: t('settings.sections.appearance'), icon: 'i-lucide-palette' },
  { id: 'sport', label: t('settings.sections.sport'), icon: 'i-lucide-footprints' },
  { id: 'paces', label: t('settings.sections.paces'), icon: 'i-lucide-timer' },
  { id: 'start-area', label: t('settings.sections.startArea'), icon: 'i-lucide-map-pinned' },
  { id: 'voice', label: t('settings.sections.voice'), icon: 'i-lucide-volume-2' },
])
// Under the sticky header, plus the strip of sections on phones.
const SECTION_CLASS = 'scroll-mt-[calc(var(--ui-header-height)+4rem)] space-y-3 md:scroll-mt-[calc(var(--ui-header-height)+2rem)]'
const CARD_CLASS = 'space-y-3 rounded-lg border border-default p-4'

const voice = useVoicePrefs()
</script>

<template>
  <UContainer v-if="profile" class="max-w-4xl space-y-6 py-8">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">{{ t('header.settings') }}</h1>
      <UButton to="/profile" icon="i-lucide-user" :label="t('header.profile')" color="neutral" variant="outline" />
    </div>

    <div class="space-y-6 md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:items-start md:gap-8 md:space-y-0">
      <SettingsNav :sections="sections" />

      <div class="space-y-8">
        <section id="profile" :class="SECTION_CLASS" aria-labelledby="settings-profile-title">
          <h2 id="settings-profile-title" class="text-base font-semibold">{{ t('settings.sections.profile') }}</h2>
          <div :class="CARD_CLASS">
            <i18n-t keypath="settings.profileHint" tag="p" class="text-sm text-muted" scope="global">
              <template #link>
                <ULink :to="`/profile/${profile.username}`" class="text-primary">{{ t('settings.publicProfile') }}</ULink>
              </template>
              <template #username>@{{ profile.username }}</template>
            </i18n-t>
            <AvatarEditor :name="profile.display_name ?? profile.username" :path="profile.avatar_path" @changed="onAvatarChanged" />
            <UForm :schema="profileUpdateSchemaLocalized" :state="form" class="space-y-4" @submit="saveProfile">
              <UFormField :label="t('settings.username')" name="username" :hint="t('settings.usernameHint')">
                <!-- Fixed ids: the generated ones differ between the server and the browser on this page (it awaits its
                     data), which left the labels pointing at nothing after a reload. -->
                <UInput id="profile-username" v-model="form.username" autocomplete="username" autocapitalize="none" :spellcheck="false" class="w-full" />
              </UFormField>
              <UAlert
                v-if="usernameChanged"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                :description="t('settings.usernameChangeWarning', { username: form.username.trim() })"
              />
              <UFormField :label="t('settings.displayName')" name="display_name" :hint="t('settings.displayNameHint', { username: profile.username })">
                <UInput id="profile-display-name" v-model="form.display_name" class="w-full" />
              </UFormField>
              <UFormField :label="t('settings.bio')" name="bio">
                <UTextarea id="profile-bio" v-model="form.bio" :rows="4" autoresize class="w-full" />
              </UFormField>
              <UButton type="submit" :label="t('settings.saveProfile')" :loading="saving" />
            </UForm>
          </div>
        </section>

        <section id="account" :class="SECTION_CLASS" aria-labelledby="settings-account-title">
          <h2 id="settings-account-title" class="text-base font-semibold">{{ t('settings.sections.account') }}</h2>
          <div :class="CARD_CLASS">
            <h3 class="text-sm font-semibold">{{ t('auth.password') }}</h3>
            <NewPasswordForm :submit-label="t('settings.changePassword')" class="max-w-sm" @done="onPasswordChanged" />
          </div>
          <AccountData :username="profile.username" />
        </section>

        <section id="appearance" :class="SECTION_CLASS" aria-labelledby="settings-appearance-title">
          <h2 id="settings-appearance-title" class="text-base font-semibold">{{ t('settings.sections.appearance') }}</h2>
          <div :class="CARD_CLASS">
            <p class="text-sm text-muted">{{ t('settings.appearanceHint') }}</p>
            <LanguageSelect />
            <ThemeSettings />
            <!-- The demo style, used without a MapTiler key, has no dark version. -->
            <MapStyleSetting v-if="maptilerKey" />
          </div>
          <div :class="CARD_CLASS">
            <OutdoorReadabilitySetting />
          </div>
        </section>

        <section id="sport" :class="SECTION_CLASS" aria-labelledby="settings-sport-title">
          <h2 id="settings-sport-title" class="text-base font-semibold">{{ t('settings.sections.sport') }}</h2>
          <div :class="CARD_CLASS">
            <p class="text-sm text-muted">{{ t('settings.defaultSport.hint') }}</p>
            <DefaultSportSetting />
          </div>
        </section>

        <section id="paces" :class="SECTION_CLASS" aria-labelledby="settings-paces-title">
          <h2 id="settings-paces-title" class="text-base font-semibold">{{ t('settings.sections.paces') }}</h2>
          <div :class="CARD_CLASS">
            <p class="text-sm text-muted">{{ t('settings.paces.hint') }}</p>
            <PaceSettings />
          </div>
        </section>

        <section id="start-area" :class="SECTION_CLASS" aria-labelledby="settings-start-area-title">
          <h2 id="settings-start-area-title" class="text-base font-semibold">{{ t('settings.sections.startArea') }}</h2>
          <div :class="CARD_CLASS">
            <p class="text-sm text-muted">{{ t('settings.startArea.hint') }}</p>
            <StartAreaSettings />
          </div>
        </section>

        <section id="voice" :class="SECTION_CLASS" aria-labelledby="settings-voice-title">
          <h2 id="settings-voice-title" class="text-base font-semibold">{{ t('settings.sections.voice') }}</h2>
          <div :class="CARD_CLASS">
            <p class="text-sm text-muted">{{ t('voice.description') }}</p>
            <!-- Speech support and the saved choices are only known in the browser. -->
            <ClientOnly>
              <VoiceGuideForm :prefs="voice.prefs.value" :supported="voice.supported.value" :background="isNativeApp()" @update="voice.setPrefs" />
            </ClientOnly>
          </div>
        </section>
      </div>
    </div>
  </UContainer>
</template>
