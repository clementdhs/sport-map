<script setup lang="ts">
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'

type RegisterState = { username: string, email: string, password: string }

// Must match the check constraint on public.profiles.username.
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/
const MIN_PASSWORD_LENGTH = 8

useSeoMeta({ title: 'Inscription — sport-map' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()

watch(user, (value) => {
  if (value) navigateTo('/')
}, { immediate: true })

const fields: AuthFormField[] = [
  {
    name: 'username',
    type: 'text',
    label: "Nom d'utilisateur",
    description: '3 à 30 caractères : lettres, chiffres, _',
    required: true,
  },
  { name: 'email', type: 'email', label: 'Email', placeholder: 'toi@exemple.fr', required: true },
  {
    name: 'password',
    type: 'password',
    label: 'Mot de passe',
    description: `${MIN_PASSWORD_LENGTH} caractères minimum`,
    required: true,
  },
]

const loading = ref(false)
const errorMessage = ref('')
const confirmationSentTo = ref('')

function validate(state: Partial<RegisterState>): FormError[] {
  const errors: FormError[] = []
  if (!state.username || !USERNAME_PATTERN.test(state.username)) {
    errors.push({ name: 'username', message: "Nom d'utilisateur invalide" })
  }
  if (!state.email) errors.push({ name: 'email', message: 'Email requis' })
  if (!state.password || state.password.length < MIN_PASSWORD_LENGTH) {
    errors.push({ name: 'password', message: `${MIN_PASSWORD_LENGTH} caractères minimum` })
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
      ? 'Un compte existe déjà avec cet email.'
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
        title="Vérifie tes emails"
        :description="`Un lien de confirmation a été envoyé à ${confirmationSentTo}.`"
      />
      <UAuthForm
        v-else
        title="Inscription"
        icon="i-lucide-user-plus"
        :fields="fields"
        :validate="validate"
        :loading="loading"
        :submit="{ label: 'Créer mon compte', block: true }"
        @submit="onSubmit"
      >
        <template #description>
          Déjà inscrit ?
          <ULink to="/login" class="text-primary font-medium">Connecte-toi</ULink>
        </template>
        <template #validation>
          <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="errorMessage" />
        </template>
      </UAuthForm>
    </UPageCard>
  </UContainer>
</template>
