<script setup lang="ts">
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'

type LoginState = { email: string, password: string }

useSeoMeta({ title: 'Connexion — sport-map' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()

watch(user, (value) => {
  if (value) navigateTo('/')
}, { immediate: true })

const fields: AuthFormField[] = [
  { name: 'email', type: 'email', label: 'Email', placeholder: 'toi@exemple.fr', required: true },
  { name: 'password', type: 'password', label: 'Mot de passe', required: true },
]

const loading = ref(false)
const errorMessage = ref('')

function validate(state: Partial<LoginState>): FormError[] {
  const errors: FormError[] = []
  if (!state.email) errors.push({ name: 'email', message: 'Email requis' })
  if (!state.password) errors.push({ name: 'password', message: 'Mot de passe requis' })
  return errors
}

async function onSubmit(event: FormSubmitEvent<LoginState>) {
  loading.value = true
  errorMessage.value = ''
  const { error } = await supabase.auth.signInWithPassword(event.data)
  loading.value = false

  if (error) {
    errorMessage.value = error.code === 'email_not_confirmed'
      ? 'Confirme ton adresse email avant de te connecter.'
      : error.code === 'invalid_credentials'
        ? 'Email ou mot de passe incorrect.'
        : error.message
  }
}
</script>

<template>
  <UContainer class="flex justify-center py-12">
    <UPageCard class="w-full max-w-md">
      <UAuthForm
        title="Connexion"
        icon="i-lucide-log-in"
        :fields="fields"
        :validate="validate"
        :loading="loading"
        :submit="{ label: 'Se connecter', block: true }"
        @submit="onSubmit"
      >
        <template #description>
          Pas encore de compte ?
          <ULink to="/register" class="text-primary font-medium">Inscris-toi</ULink>
        </template>
        <template #validation>
          <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="errorMessage" />
        </template>
      </UAuthForm>
    </UPageCard>
  </UContainer>
</template>
