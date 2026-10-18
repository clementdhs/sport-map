<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

// Account menu of the header and of the map pages' floating bar. Compact: icon buttons only.
// Profile and live shares are in the main navigation (#101): the menu keeps what concerns the account.
defineProps<{
  compact?: boolean
}>()

const user = useSupabaseUser()
const supabase = useSupabaseClient()
const toast = useToast()
const { t } = useI18n()
const languageItems = useLanguageItems()
const { data: me } = useMyProfile()
// The username, also the sign-in name; the e-mail until it is known.
const accountName = computed(() => me.value?.username ?? user.value?.email ?? '')
// The profile photo in place of the icon (#150), once signed.
const avatarSrc = useAvatarUrl(() => me.value?.avatar_path)
const avatar = computed(() => avatarSrc.value ? { src: avatarSrc.value, alt: '', icon: 'i-lucide-circle-user' } : undefined)
const icon = computed(() => avatar.value ? undefined : 'i-lucide-circle-user')

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [{ label: accountName.value, type: 'label' }],
  [
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
  <UDropdownMenu v-if="user" :items="userMenu" :content="{ align: compact ? 'start' : 'end' }">
    <UButton
      v-if="compact"
      color="neutral"
      variant="ghost"
      :icon="icon"
      :avatar="avatar"
      :aria-label="t('header.account')"
      class="rounded-full"
    />
    <UButton
      v-else
      color="neutral"
      variant="ghost"
      :icon="icon"
      :avatar="avatar"
      :label="accountName"
      :aria-label="t('header.accountNamed', { name: accountName })"
      :ui="{ label: 'hidden max-md:sm:inline lg:inline' }"
    />
  </UDropdownMenu>
  <!-- Signed-in users find these in the account menu and the settings. -->
  <template v-else>
    <LanguagePicker />
    <ThemePicker />
    <UButton
      v-if="compact"
      to="/login"
      color="neutral"
      variant="ghost"
      icon="i-lucide-log-in"
      :aria-label="t('header.login')"
      class="rounded-full"
    />
    <UButton v-else to="/login" color="neutral" variant="ghost" :label="t('header.login')" />
  </template>
</template>
