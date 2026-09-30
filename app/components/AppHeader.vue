<script setup lang="ts">
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const toast = useToast()

const userMenu = computed(() => [
  [{ label: user.value?.email ?? '', type: 'label' as const }],
  [
    { label: 'Mon profil', icon: 'i-lucide-user', to: '/profile' },
    { label: 'Paramètres', icon: 'i-lucide-settings', to: '/settings' },
  ],
  [{ label: 'Se déconnecter', icon: 'i-lucide-log-out', onSelect: signOut }],
])

async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    toast.add({ title: 'Déconnexion impossible', description: error.message, color: 'error' })
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
        <span>sport-map</span>
      </span>
    </template>

    <template #right>
      <ThemePicker />
      <UButton
        v-if="user"
        to="/record"
        icon="i-lucide-circle-dot"
        label="Enregistrer une sortie"
        color="neutral"
        variant="outline"
        :ui="{ label: 'hidden sm:inline' }"
      />
      <UButton
        v-if="user"
        to="/routes/create"
        icon="i-lucide-plus"
        label="Créer un parcours"
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
      <template v-else>
        <UButton to="/login" color="neutral" variant="ghost" label="Connexion" />
        <UButton to="/register" label="Inscription" />
      </template>
    </template>
  </UHeader>
</template>
