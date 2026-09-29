<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { MyProfile } from '#shared/types/routes'
import type { ProfileUpdate } from '#shared/utils/routes'

definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Mon profil — sport-map' })

// "Fait le …", with the times of an outing recorded with the GPS.
function completedNote(route: MyProfile['completed'][number]) {
  const note = `Fait le ${formatDate(route.completed_at)}`
  if (route.duration_s == null || route.moving_s == null) return note
  return `${note} · ${formatElapsed(route.duration_s)} · ${formatSpeed(route.distance_m, route.moving_s)}`
}

const toast = useToast()
const { data, error, refresh } = await useFetch<MyProfile>('/api/profile/me')
if (error.value) {
  throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: error.value.statusMessage, fatal: true })
}

const tabs = computed(() => [
  { label: 'Mes parcours', slot: 'created' as const, badge: data.value?.created.length ?? 0, icon: 'i-lucide-route' },
  { label: 'Sauvegardés', slot: 'saved' as const, badge: data.value?.saved.length ?? 0, icon: 'i-lucide-bookmark' },
  { label: 'Réalisés', slot: 'completed' as const, badge: data.value?.completed.length ?? 0, icon: 'i-lucide-flag' },
  { label: 'Statistiques', slot: 'stats' as const, icon: 'i-lucide-chart-column' },
])

const editOpen = ref(false)
const saving = ref(false)
const form = ref<ProfileUpdate>({ display_name: '', bio: '' })

watch(editOpen, (open) => {
  if (open && data.value) {
    form.value = { display_name: data.value.profile.display_name ?? '', bio: data.value.profile.bio ?? '' }
  }
})

const passwordOpen = ref(false)
function onPasswordChanged() {
  passwordOpen.value = false
  toast.add({ title: 'Mot de passe modifié', color: 'success', icon: 'i-lucide-check' })
}

async function saveProfile() {
  saving.value = true
  try {
    await $fetch('/api/profile/me', { method: 'PATCH', body: form.value })
    await refresh()
    editOpen.value = false
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
</script>

<template>
  <UContainer v-if="data" class="max-w-3xl space-y-6 py-8">
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold">{{ data.profile.display_name ?? data.profile.username }}</h1>
        <p class="text-sm text-muted">@{{ data.profile.username }} · membre depuis le {{ formatDate(data.profile.created_at) }}</p>
        <p v-if="data.profile.bio" class="whitespace-pre-line pt-2">{{ data.profile.bio }}</p>
      </div>
      <div class="flex shrink-0 gap-2">
        <UButton
          :to="`/profile/${data.profile.username}`"
          icon="i-lucide-eye"
          color="neutral"
          variant="outline"
          aria-label="Voir mon profil public"
        />
        <UModal v-model:open="editOpen" title="Modifier mon profil">
          <UButton icon="i-lucide-pencil" label="Modifier" color="neutral" variant="outline" />
          <template #body>
            <UForm id="profile-form" :schema="profileUpdateSchema" :state="form" class="space-y-4" @submit="saveProfile">
              <UFormField label="Nom affiché" name="display_name" :hint="`Sinon : ${data.profile.username}`">
                <UInput v-model="form.display_name" class="w-full" />
              </UFormField>
              <UFormField label="Bio" name="bio">
                <UTextarea v-model="form.bio" :rows="4" autoresize class="w-full" />
              </UFormField>
            </UForm>
          </template>
          <template #footer>
            <div class="flex w-full justify-end gap-2">
              <UButton label="Annuler" color="neutral" variant="outline" @click="editOpen = false" />
              <UButton type="submit" form="profile-form" label="Enregistrer" :loading="saving" />
            </div>
          </template>
        </UModal>
        <UModal v-model:open="passwordOpen" title="Changer mon mot de passe">
          <UButton icon="i-lucide-key-round" color="neutral" variant="outline" aria-label="Changer mon mot de passe" />
          <template #body>
            <NewPasswordForm submit-label="Changer le mot de passe" @done="onPasswordChanged" />
          </template>
        </UModal>
      </div>
    </div>

    <UTabs :items="tabs" variant="link" class="w-full">
      <template #created>
        <ul v-if="data.created.length" class="space-y-2 pt-2">
          <li v-for="route in data.created" :key="route.id"><RouteCard :route="route" /></li>
        </ul>
        <UEmpty
          v-else
          icon="i-lucide-route"
          title="Aucun parcours créé"
          description="Trace ton premier parcours ou importe un fichier GPX."
          :actions="[{ label: 'Créer un parcours', icon: 'i-lucide-plus', to: '/routes/create' }]"
        />
      </template>

      <template #saved>
        <ul v-if="data.saved.length" class="space-y-2 pt-2">
          <li v-for="route in data.saved" :key="route.id"><RouteCard :route="route" /></li>
        </ul>
        <UEmpty
          v-else
          icon="i-lucide-bookmark"
          title="Aucun parcours sauvegardé"
          description="Sauvegarde des parcours depuis leur page pour les retrouver ici."
          :actions="[{ label: 'Découvrir des parcours', icon: 'i-lucide-map', to: '/' }]"
        />
      </template>

      <template #stats>
        <ProfileStats :completed="data.completed" />
      </template>
      <template #completed>
        <ul v-if="data.completed.length" class="space-y-2 pt-2">
          <li v-for="route in data.completed" :key="route.id">
            <RouteCard :route="route" :note="completedNote(route)" />
          </li>
        </ul>
        <UEmpty
          v-else
          icon="i-lucide-flag"
          title="Aucun parcours réalisé"
          description="Sur la page d'un parcours, indique « Je l'ai fait » pour garder l'historique de tes sorties."
        />
      </template>
    </UTabs>
  </UContainer>
</template>
