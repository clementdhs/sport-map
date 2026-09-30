<script setup lang="ts">
// Landing page of the password reset email. Its link carries a single-use token hash (see
// supabase/templates/recovery.html), verified here: unlike the default PKCE link, it works in any browser,
// e.g. asked for on a computer and opened on a phone. The verification signs the user in.
const { t } = useI18n()
useSeoMeta({ title: () => `${t('auth.reset.title')} — sport-map` })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const status = ref<'verifying' | 'ready' | 'invalid'>('verifying')

onMounted(async () => {
  const { token_hash: tokenHash, type } = route.query
  if (typeof tokenHash === 'string' && type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    // The token only works once: don't leave it in the address bar or the history.
    await router.replace({ query: {} })
    status.value = error ? 'invalid' : 'ready'
    return
  }
  // Without a token, only a signed-in user can set a new password here.
  status.value = user.value ? 'ready' : 'invalid'
})

async function onDone() {
  toast.add({ title: t('auth.passwordChanged'), description: t('auth.reset.signedIn'), color: 'success', icon: 'i-lucide-check' })
  await navigateTo('/')
}
</script>

<template>
  <UContainer class="flex justify-center py-12">
    <UPageCard class="w-full max-w-md" :title="t('auth.reset.title')" icon="i-lucide-key-round">
      <div v-if="status === 'verifying'" class="flex items-center gap-3">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
        <span>{{ t('auth.reset.verifying') }}</span>
      </div>
      <div v-else-if="status === 'invalid'" class="space-y-4">
        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="t('auth.reset.invalidTitle')"
          :description="t('auth.reset.invalidDescription')"
        />
        <UButton to="/forgot-password" :label="t('auth.reset.newLink')" block />
      </div>
      <NewPasswordForm v-else :submit-label="t('auth.reset.submit')" @done="onDone" />
    </UPageCard>
  </UContainer>
</template>
