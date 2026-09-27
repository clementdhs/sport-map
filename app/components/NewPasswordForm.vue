<script setup lang="ts">
import type { NewPassword } from '#shared/utils/auth'

// Sets a new password for the signed-in user: after a reset link, or from the profile.
defineProps<{
  submitLabel: string
}>()

const emit = defineEmits<{
  done: []
}>()

const supabase = useSupabaseClient()
const state = reactive<NewPassword>({ password: '', confirm: '' })
const saving = ref(false)
const errorMessage = ref('')

async function onSubmit() {
  saving.value = true
  errorMessage.value = ''
  const { error } = await supabase.auth.updateUser({ password: state.password })
  saving.value = false

  if (error) {
    errorMessage.value = error.code === 'same_password'
      ? 'C\'est déjà ton mot de passe actuel.'
      : error.message
    return
  }
  state.password = ''
  state.confirm = ''
  emit('done')
}
</script>

<template>
  <UForm :schema="newPasswordSchema" :state="state" class="space-y-4" @submit="onSubmit">
    <UFormField label="Nouveau mot de passe" name="password" :description="`${MIN_PASSWORD_LENGTH} caractères minimum`" required>
      <UInput id="new-password" v-model="state.password" type="password" autocomplete="new-password" class="w-full" />
    </UFormField>
    <!-- Validated while typing: otherwise a stale "different" error only clears on blur, i.e. when clicking the
         submit button, which then moves under the pointer and misses the click. -->
    <UFormField label="Confirme le mot de passe" name="confirm" eager-validation required>
      <UInput id="new-password-confirm" v-model="state.confirm" type="password" autocomplete="new-password" class="w-full" />
    </UFormField>
    <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="errorMessage" />
    <UButton type="submit" :label="submitLabel" :loading="saving" block />
  </UForm>
</template>
