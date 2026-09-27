<script setup lang="ts">
useSeoMeta({ title: 'Confirmation — sport-map' })

const user = useSupabaseUser()
const route = useRoute()

const errorDescription = ref(route.query.error_description as string | undefined)
const needsLogin = ref(false)

watch(user, (value) => {
  if (value) navigateTo('/')
}, { immediate: true })

onMounted(() => {
  // Supabase reports link errors in the query (PKCE flow) or in the hash (implicit flow).
  errorDescription.value ??= new URLSearchParams(window.location.hash.slice(1)).get('error_description') ?? undefined

  // The Supabase plugin already tried to exchange the code at startup. Without a session, the link was opened in
  // another browser than the one used to sign up: the email is confirmed, but the user has to log in.
  if (!user.value && !errorDescription.value) needsLogin.value = true
})
</script>

<template>
  <UContainer class="flex justify-center py-12">
    <UPageCard class="w-full max-w-md">
      <template v-if="errorDescription">
        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Lien de confirmation invalide ou expiré"
          :description="errorDescription"
        />
        <UButton to="/login" label="Aller à la connexion" block />
      </template>
      <template v-else-if="needsLogin">
        <UAlert
          color="success"
          variant="subtle"
          icon="i-lucide-mail-check"
          title="Adresse email confirmée"
          description="Connecte-toi pour continuer."
        />
        <UButton to="/login" label="Se connecter" block />
      </template>
      <div v-else class="flex items-center gap-3">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
        <span>Confirmation de ton compte…</span>
      </div>
    </UPageCard>
  </UContainer>
</template>
