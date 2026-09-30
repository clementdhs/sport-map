<script setup lang="ts">
const { t } = useI18n()
useSeoMeta({ title: () => `${t('auth.confirm.title')} — sport-map` })

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
          :title="t('auth.confirm.invalidTitle')"
          :description="errorDescription"
        />
        <UButton to="/login" :label="t('auth.confirm.goToLogin')" block />
      </template>
      <template v-else-if="needsLogin">
        <UAlert
          color="success"
          variant="subtle"
          icon="i-lucide-mail-check"
          :title="t('auth.confirm.confirmedTitle')"
          :description="t('auth.confirm.confirmedDescription')"
        />
        <UButton to="/login" :label="t('auth.login.submit')" block />
      </template>
      <div v-else class="flex items-center gap-3">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
        <span>{{ t('auth.confirm.confirming') }}</span>
      </div>
    </UPageCard>
  </UContainer>
</template>
