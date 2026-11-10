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
// The button is the member's avatar (#150, #231): their photo, else their initials on the accent colour.
const avatarName = computed(() => me.value?.display_name ?? accountName.value)

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
      color="neutral"
      variant="ghost"
      square
      :aria-label="compact ? t('header.account') : t('header.accountNamed', { name: accountName })"
      class="rounded-full p-0.5"
    >
      <MemberAvatar :name="avatarName" :path="me?.avatar_path" :size="compact ? 'md' : 'lg'" />
    </UButton>
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
