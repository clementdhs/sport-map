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
  <div class="relative isolate flex min-h-[calc(100dvh-var(--ui-header-height))] flex-col overflow-hidden">
    <!-- Relief and contour lines of the Écrins in gray (scripts/login-background.py), fading into the page color
         under the header, around the form and at the bottom, with a dotted route like the logo's. -->
    <div class="login-relief absolute inset-0 -z-10" aria-hidden="true" />
    <div class="login-fade absolute inset-0 -z-10" aria-hidden="true" />
    <!-- Landscape from sm up, portrait below: the form hides the middle of the page. -->
    <svg class="login-trail absolute inset-0 -z-10 size-full max-sm:hidden" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="M90 660 C170 600 220 690 320 630 S430 430 530 470 S650 650 770 560 S880 300 990 330 S1080 220 1110 170" />
      <circle cx="90" cy="660" r="9" class="start" />
      <circle cx="1110" cy="170" r="9" class="end" />
    </svg>
    <svg class="login-trail absolute inset-0 -z-10 size-full sm:hidden" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="M40 725 C120 705 90 650 20 600 S10 420 60 360 S30 200 110 140 S300 120 350 60" />
      <circle cx="40" cy="725" r="7" class="start" />
      <circle cx="350" cy="60" r="7" class="end" />
    </svg>
    <UContainer class="flex flex-1 flex-col items-center gap-6 py-8 sm:py-14">
      <div class="login-hero flex flex-col items-center gap-3 px-6 py-2 text-center">
        <AppLogo class="size-16 sm:size-20" />
        <h1 class="text-3xl font-semibold sm:text-4xl">sportmap</h1>
        <p class="max-w-sm text-base text-default sm:text-lg">{{ t('auth.login.tagline') }}</p>
      </div>
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
      <!-- Required by the Licence Ouverte (source and date), kept small and pale. -->
      <p class="mt-auto self-end text-[0.6875rem] text-muted">{{ t('auth.login.reliefCredit') }}</p>
    </UContainer>
  </div>
</template>

<style scoped>
/* Two masks of the same size: the hillshade is a luminance mask (white = shadow), the contour lines an SVG.
   Browsers without luminance masks (Chromium before 120) would tint the whole page: they keep the plain background. */
.login-relief {
  display: none;
}

@supports (mask-mode: luminance) {
  .login-relief {
    display: block;
    background-color: var(--ui-text-muted);
    mask-image: url('/img/login-relief.webp'), url('/img/login-contours.svg');
    mask-mode: luminance, alpha;
    mask-position: center;
    mask-size: cover;
    opacity: 0.22;
  }

  .dark .login-relief {
    opacity: 0.3;
  }
}

/* No seam with the header, a calm area around the form, and a plain background under the source credit. */
.login-fade {
  background:
    linear-gradient(var(--ui-bg), transparent 18%, transparent 88%, var(--ui-bg)),
    radial-gradient(ellipse min(34rem, 70vw) 30rem at 50% 45%, var(--ui-bg) 35%, transparent 100%);
}

.login-trail path {
  fill: none;
  stroke: var(--ui-primary);
  stroke-dasharray: 2 9;
  stroke-linecap: round;
  stroke-width: 4;
  opacity: 0.6;
  vector-effect: non-scaling-stroke;
}

.login-trail .start {
  fill: var(--color-green-500);
}

.login-trail .end {
  fill: var(--color-red-500);
}

/* A veil of the page color under the logo and tagline. */
.login-hero {
  background: radial-gradient(closest-side, var(--ui-bg) 40%, color-mix(in oklab, var(--ui-bg) 70%, transparent) 75%, transparent);
}
</style>
