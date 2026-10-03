<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const user = useSupabaseUser()
const supabase = useSupabaseClient()
const toast = useToast()
const { t } = useI18n()
const languageItems = useLanguageItems()

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.email ?? '', type: 'label' }],
  [
    { label: t('header.profile'), icon: 'i-lucide-user', to: '/profile' },
    { label: t('header.settings'), icon: 'i-lucide-settings', to: '/settings' },
    { label: t('language.label'), icon: 'i-lucide-languages', children: languageItems.value },
  ],
  [{ label: t('header.signOut'), icon: 'i-lucide-log-out', onSelect: signOut }],
])

async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    toast.add({ title: t('header.signOutFailed'), description: error.message, color: 'error' })
    return
  }
  await navigateTo('/')
}
</script>

<template>
  <UHeader to="/" :toggle="false">
    <template #title>
      <span class="flex items-center gap-2">
        <AppLogo class="size-7" />
        <!-- On 360 px phones, visitors' buttons don't fit beside the name. -->
        <span class="hidden min-[400px]:inline">sport-map</span>
      </span>
    </template>

    <template #right>
      <!-- Signed-in users find them in the account menu and the settings. -->
      <LanguagePicker v-if="!user" />
      <ThemePicker v-if="!user" />
      <UButton
        v-if="user"
        to="/record"
        icon="i-lucide-circle-dot"
        :label="t('header.record')"
        color="neutral"
        variant="outline"
        :ui="{ label: 'hidden sm:inline' }"
      />
      <UButton
        v-if="user"
        to="/routes/create"
        icon="i-lucide-plus"
        :label="t('header.create')"
        :ui="{ label: 'hidden sm:inline' }"
      />
      <UDropdownMenu v-if="user" :items="userMenu">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-circle-user"
          :label="user.email"
          :ui="{ label: 'hidden sm:inline' }"
        />
      </UDropdownMenu>
      <UButton v-else to="/login" color="neutral" variant="ghost" :label="t('header.login')" />
    </template>
  </UHeader>
</template>
