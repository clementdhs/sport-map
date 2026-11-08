<script setup lang="ts">
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'
import type { LoginSession } from '#shared/types/auth'

// One field takes a username or an e-mail.
type LoginState = { identifier: string, password: string }

// The hero shows the logo: the header doesn't repeat it.
definePageMeta({ headerLogo: false })

const { t, locale } = useI18n()
useSeoMeta({ title: () => `${t('auth.login.title')} — sportmap` })

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
    ogTitle: 'sportmap',
    ogImage: `${useRequestURL().origin}/api/routes/${sharedRouteId}/og.png?lang=${locale.value}`,
    ogImageType: 'image/png',
    ogImageWidth: 1200,
    ogImageHeight: 630,
    twitterCard: 'summary_large_image',
  })
}

const fields = computed<AuthFormField[]>(() => [
  {
    name: 'identifier',
    type: 'text',
    label: t('auth.identifier'),
    placeholder: t('auth.identifierPlaceholder'),
    required: true,
    autocomplete: 'username',
    autocapitalize: 'none',
    spellcheck: false,
  },
  { name: 'password', type: 'password', label: t('auth.password'), required: true },
])

const loading = ref(false)
const errorMessage = ref('')
const apiErrorMessage = useErrorMessage()

function validate(state: Partial<LoginState>): FormError[] {
  const errors: FormError[] = []
  if (!state.identifier?.trim()) errors.push({ name: 'identifier', message: t('auth.identifierRequired') })
  if (!state.password) errors.push({ name: 'password', message: t('auth.passwordRequired') })
  return errors
}

async function signInWithEmail(email: string, password: string): Promise<string> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (!error) return ''
  return error.code === 'email_not_confirmed'
    ? t('auth.login.emailNotConfirmed')
    : error.code === 'invalid_credentials'
      ? t('auth.login.invalidCredentials')
      : error.message
}

// The server finds the account's e-mail and signs in: the page only gets the session.
async function signInWithUsername(username: string, password: string): Promise<string> {
  try {
    const session = await $fetch<LoginSession>('/api/auth/login', { method: 'POST', body: { username, password } })
    const { error } = await supabase.auth.setSession(session)
    return error ? error.message : ''
  }
  catch (err) {
    // Same message as a wrong e-mail or password.
    return (err as { statusCode?: number }).statusCode === 401 ? t('auth.login.invalidCredentials') : apiErrorMessage(err)
  }
}

async function onSubmit(event: FormSubmitEvent<LoginState>) {
  loading.value = true
  errorMessage.value = ''
  const identifier = event.data.identifier.trim()
  errorMessage.value = isEmailLogin(identifier)
    ? await signInWithEmail(identifier, event.data.password)
    : await signInWithUsername(identifier, event.data.password)
  loading.value = false
}
</script>

<template>
  <AuthScreen>
    <div class="flex flex-col items-center gap-2 px-6 text-center">
      <AppLogo class="size-18 sm:size-20" />
      <h1 class="mt-1.5 text-[2.75rem] leading-none font-bold sm:text-5xl">sportmap</h1>
      <p class="max-w-72 text-base text-muted sm:max-w-sm sm:text-lg">{{ t('auth.login.tagline') }}</p>
    </div>
    <AuthCard>
      <UAuthForm
        :title="t('auth.login.title')"
        :fields="fields"
        :validate="validate"
        :loading="loading"
        :submit="{ label: t('auth.login.submit'), block: true, size: 'xl' }"
        :ui="AUTH_FORM_UI"
        @submit="onSubmit"
      >
        <template #description>
          {{ t('auth.login.familyOnly') }}
        </template>
        <template #password-hint>
          <ULink to="/forgot-password" class="text-primary font-semibold">{{ t('auth.login.forgotLink') }}</ULink>
        </template>
        <template #validation>
          <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="errorMessage" />
        </template>
      </UAuthForm>
    </AuthCard>
  </AuthScreen>
</template>
