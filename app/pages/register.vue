<script setup lang="ts">
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'

type RegisterState = { username: string, email: string, password: string }

// Must match the check constraint on public.profiles.username.
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/

const { t } = useI18n()
useSeoMeta({ title: () => `${t('auth.register.title')} — sport-map` })

const supabase = useSupabaseClient()
const user = useSupabaseUser()

watch(user, (value) => {
  if (value) navigateTo('/')
}, { immediate: true })

const fields = computed<AuthFormField[]>(() => [
  {
    name: 'username',
    type: 'text',
    label: t('auth.register.username'),
    description: t('auth.register.usernameHint'),
    required: true,
  },
  { name: 'email', type: 'email', label: t('auth.email'), placeholder: t('auth.emailPlaceholder'), required: true },
  {
    name: 'password',
    type: 'password',
    label: t('auth.password'),
    description: t('auth.passwordMin', { n: MIN_PASSWORD_LENGTH }),
    required: true,
  },
])

const loading = ref(false)
const errorMessage = ref('')
const confirmationSentTo = ref('')

function validate(state: Partial<RegisterState>): FormError[] {
  const errors: FormError[] = []
  if (!state.username || !USERNAME_PATTERN.test(state.username)) {
    errors.push({ name: 'username', message: t('auth.register.usernameInvalid') })
  }
  if (!state.email) errors.push({ name: 'email', message: t('auth.emailRequired') })
  if (!state.password || state.password.length < MIN_PASSWORD_LENGTH) {
    errors.push({ name: 'password', message: t('auth.passwordMin', { n: MIN_PASSWORD_LENGTH }) })
  }
  return errors
}

async function onSubmit(event: FormSubmitEvent<RegisterState>) {
  loading.value = true
  errorMessage.value = ''
  const { username, email, password } = event.data
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: `${window.location.origin}/confirm`,
    },
  })
  loading.value = false

  if (error) {
    errorMessage.value = error.code === 'user_already_exists'
      ? t('auth.register.alreadyExists')
      : error.message
    return
  }
  // No session means Supabase requires email confirmation first.
  if (!data.session) confirmationSentTo.value = email
}
</script>

<template>
  <UContainer class="flex justify-center py-12">
    <UPageCard class="w-full max-w-md">
      <UAlert
        v-if="confirmationSentTo"
        color="success"
        variant="subtle"
        icon="i-lucide-mail-check"
        :title="t('auth.register.checkEmail')"
        :description="t('auth.register.confirmationSent', { email: confirmationSentTo })"
      />
      <UAuthForm
        v-else
        :title="t('auth.register.title')"
        icon="i-lucide-user-plus"
        :fields="fields"
        :validate="validate"
        :loading="loading"
        :submit="{ label: t('auth.register.submit'), block: true }"
        @submit="onSubmit"
      >
        <template #description>
          {{ t('auth.register.hasAccount') }}
          <ULink to="/login" class="text-primary font-medium">{{ t('auth.register.loginLink') }}</ULink>
        </template>
        <template #validation>
          <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="errorMessage" />
        </template>
      </UAuthForm>
    </UPageCard>
  </UContainer>
</template>
