<script setup lang="ts">
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'

type ForgotState = { email: string }

const { t } = useI18n()
useSeoMeta({ title: () => `${t('auth.forgot.title')} — sportmap` })

const supabase = useSupabaseClient()

const fields = computed<AuthFormField[]>(() => [
  { name: 'email', type: 'email', label: t('auth.email'), placeholder: t('auth.emailPlaceholder'), required: true },
])

const loading = ref(false)
const sent = ref(false)
const errorMessage = ref('')

function validate(state: Partial<ForgotState>): FormError[] {
  return state.email ? [] : [{ name: 'email', message: t('auth.emailRequired') }]
}

async function onSubmit(event: FormSubmitEvent<ForgotState>) {
  loading.value = true
  errorMessage.value = ''
  // The link in the email points to /reset-password (email template), whatever redirectTo says.
  const { error } = await supabase.auth.resetPasswordForEmail(event.data.email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  loading.value = false

  // Supabase answers the same for unknown addresses: only rate limits and outages are errors.
  if (error) {
    errorMessage.value = error.code === 'over_email_send_rate_limit'
      ? t('auth.forgot.rateLimited')
      : error.message
    return
  }
  sent.value = true
}
</script>

<template>
  <UContainer class="flex justify-center py-12">
    <UPageCard class="w-full max-w-md">
      <div v-if="sent" class="space-y-4">
        <UAlert
          color="success"
          variant="subtle"
          icon="i-lucide-mail-check"
          :title="t('auth.forgot.sentTitle')"
          :description="t('auth.forgot.sentDescription')"
        />
        <UButton to="/login" :label="t('auth.forgot.backToLogin')" color="neutral" variant="outline" block />
      </div>
      <UAuthForm
        v-else
        :title="t('auth.forgot.title')"
        icon="i-lucide-key-round"
        :fields="fields"
        :validate="validate"
        :loading="loading"
        :submit="{ label: t('auth.forgot.submit'), block: true }"
        @submit="onSubmit"
      >
        <template #description>
          {{ t('auth.forgot.description') }}
        </template>
        <template #validation>
          <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="errorMessage" />
        </template>
        <template #footer>
          <ULink to="/login" class="text-primary font-medium">{{ t('auth.forgot.backToLogin') }}</ULink>
        </template>
      </UAuthForm>
    </UPageCard>
  </UContainer>
</template>
