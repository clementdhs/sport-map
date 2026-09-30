<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { ProfileInfo } from '#shared/types/routes'
import type { ProfileUpdate } from '#shared/utils/routes'

// Account settings, reached from the account menu: profile, password, appearance, data (RGPD).
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Paramètres — sport-map' })

const toast = useToast()
const { data: profile, error } = await useFetch<ProfileInfo>('/api/profile/me/info')
if (error.value) {
  throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: error.value.statusMessage, fatal: true })
}

const form = ref<ProfileUpdate>({ display_name: profile.value?.display_name ?? '', bio: profile.value?.bio ?? '' })
const saving = ref(false)

async function saveProfile() {
  saving.value = true
  try {
    await $fetch('/api/profile/me', { method: 'PATCH', body: form.value })
    toast.add({ title: 'Profil mis à jour', color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({
      title: 'Mise à jour impossible',
      description: (err as FetchError).data?.statusMessage ?? (err as Error).message,
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

function onPasswordChanged() {
  toast.add({ title: 'Mot de passe modifié', color: 'success', icon: 'i-lucide-check' })
}
</script>

<template>
  <UContainer v-if="profile" class="max-w-2xl space-y-6 py-8">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">Paramètres</h1>
      <UButton to="/profile" icon="i-lucide-user" label="Mon profil" color="neutral" variant="outline" />
    </div>

    <section class="space-y-3 rounded-lg border border-default p-4" aria-labelledby="settings-profile-title">
      <h2 id="settings-profile-title" class="font-medium">Profil</h2>
      <p class="text-sm text-muted">
        Ce que les autres voient sur
        <ULink :to="`/profile/${profile.username}`" class="text-primary">ton profil public</ULink>
        (@{{ profile.username }}).
      </p>
      <UForm :schema="profileUpdateSchema" :state="form" class="space-y-4" @submit="saveProfile">
        <UFormField label="Nom affiché" name="display_name" :hint="`Sinon : ${profile.username}`">
          <UInput v-model="form.display_name" class="w-full" />
        </UFormField>
        <UFormField label="Bio" name="bio">
          <UTextarea v-model="form.bio" :rows="4" autoresize class="w-full" />
        </UFormField>
        <UButton type="submit" label="Enregistrer le profil" :loading="saving" />
      </UForm>
    </section>

    <section class="space-y-3 rounded-lg border border-default p-4" aria-labelledby="settings-password-title">
      <h2 id="settings-password-title" class="font-medium">Mot de passe</h2>
      <NewPasswordForm submit-label="Changer le mot de passe" class="max-w-sm" @done="onPasswordChanged" />
    </section>

    <section class="space-y-3 rounded-lg border border-default p-4" aria-labelledby="settings-appearance-title">
      <h2 id="settings-appearance-title" class="font-medium">Apparence</h2>
      <p class="text-sm text-muted">Gardée sur cet appareil. Aussi accessible depuis l'icône de palette de l'en-tête.</p>
      <ThemeSettings />
    </section>

    <AccountData :username="profile.username" />
  </UContainer>
</template>
