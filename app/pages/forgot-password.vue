<script setup lang="ts">
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'

type ForgotState = { email: string }

useSeoMeta({ title: 'Mot de passe oublié — sport-map' })

const supabase = useSupabaseClient()

const fields: AuthFormField[] = [
  { name: 'email', type: 'email', label: 'Email', placeholder: 'toi@exemple.fr', required: true },
]

const loading = ref(false)
const sent = ref(false)
const errorMessage = ref('')

function validate(state: Partial<ForgotState>): FormError[] {
  return state.email ? [] : [{ name: 'email', message: 'Email requis' }]
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
      ? 'Trop de demandes pour le moment : réessaie dans quelques minutes.'
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
          title="Vérifie ta boîte mail"
          description="Si un compte existe pour cette adresse, tu vas recevoir un lien pour choisir un nouveau mot de passe. Pense aux courriers indésirables."
        />
        <UButton to="/login" label="Retour à la connexion" color="neutral" variant="outline" block />
      </div>
      <UAuthForm
        v-else
        title="Mot de passe oublié"
        icon="i-lucide-key-round"
        :fields="fields"
        :validate="validate"
        :loading="loading"
        :submit="{ label: 'Recevoir un lien', block: true }"
        @submit="onSubmit"
      >
        <template #description>
          Indique l'adresse de ton compte : on t'envoie un lien pour choisir un nouveau mot de passe.
        </template>
        <template #validation>
          <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="errorMessage" />
        </template>
        <template #footer>
          <ULink to="/login" class="text-primary font-medium">Retour à la connexion</ULink>
        </template>
      </UAuthForm>
    </UPageCard>
  </UContainer>
</template>
