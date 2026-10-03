<script setup lang="ts">
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'

type LoginState = { email: string, password: string }

const { t, locale } = useI18n()
useSeoMeta({ title: () => `${t('auth.login.title')} — sport-map` })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()

// Only same-site paths, so the query cannot be used as an open redirect.
const redirectTo = computed(() => {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
})

watch(user, (value) => {
  if (value) navigateTo(redirectTo.value)
}, { immediate: true })

// Link previews (WhatsApp, Messages): their bots have no session, so a shared route link lands here. The image
// draws the route's name and track, and only exists for routes visible to the family.
const sharedRouteId = /^\/routes\/([0-9a-f-]{36})(\/|$)/.exec(redirectTo.value)?.[1]
if (sharedRouteId) {
  useSeoMeta({
    ogTitle: 'sport-map',
    ogImage: `${useRequestURL().origin}/api/routes/${sharedRouteId}/og.png?lang=${locale.value}`,
    ogImageType: 'image/png',
    ogImageWidth: 1200,
    ogImageHeight: 630,
    twitterCard: 'summary_large_image',
  })
}

const fields = computed<AuthFormField[]>(() => [
  { name: 'email', type: 'email', label: t('auth.email'), placeholder: t('auth.emailPlaceholder'), required: true },
  { name: 'password', type: 'password', label: t('auth.password'), required: true },
])

const loading = ref(false)
const errorMessage = ref('')

function validate(state: Partial<LoginState>): FormError[] {
  const errors: FormError[] = []
  if (!state.email) errors.push({ name: 'email', message: t('auth.emailRequired') })
  if (!state.password) errors.push({ name: 'password', message: t('auth.passwordRequired') })
  return errors
}

async function onSubmit(event: FormSubmitEvent<LoginState>) {
  loading.value = true
  errorMessage.value = ''
  const { error } = await supabase.auth.signInWithPassword(event.data)
  loading.value = false

  if (error) {
    errorMessage.value = error.code === 'email_not_confirmed'
      ? t('auth.login.emailNotConfirmed')
      : error.code === 'invalid_credentials'
        ? t('auth.login.invalidCredentials')
        : error.message
  }
}
</script>

<template>
  <UContainer class="flex justify-center py-12">
    <UPageCard class="w-full max-w-md">
      <UAuthForm
        :title="t('auth.login.title')"
        icon="i-lucide-log-in"
        :fields="fields"
        :validate="validate"
        :loading="loading"
        :submit="{ label: t('auth.login.submit'), block: true }"
        @submit="onSubmit"
      >
        <template #description>
          {{ t('auth.login.familyOnly') }}
        </template>
        <template #password-hint>
          <ULink to="/forgot-password" class="text-primary font-medium">{{ t('auth.login.forgotLink') }}</ULink>
        </template>
        <template #validation>
          <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="errorMessage" />
        </template>
      </UAuthForm>
    </UPageCard>
  </UContainer>
</template>
