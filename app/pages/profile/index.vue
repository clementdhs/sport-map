<script setup lang="ts">
import type { CollectionSummary, MyProfile } from '#shared/types/routes'

definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Mon profil — sport-map' })

// "Fait le …", with the times of an outing recorded with the GPS.
function completedNote(route: MyProfile['completed'][number]) {
  const note = `Fait le ${formatDate(route.completed_at)}`
  if (route.duration_s == null || route.moving_s == null) return note
  return `${note} · ${formatElapsed(route.duration_s)} · ${formatSpeed(route.distance_m, route.moving_s)}`
}

const { data, error } = await useFetch<MyProfile>('/api/profile/me')
if (error.value) {
  throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: error.value.statusMessage, fatal: true })
}

const { data: collections } = await useFetch<CollectionSummary[]>('/api/collections', { default: () => [] })

const tabs = computed(() => [
  { label: 'Mes parcours', slot: 'created' as const, badge: data.value?.created.length ?? 0, icon: 'i-lucide-route' },
  { label: 'Sauvegardés', slot: 'saved' as const, badge: data.value?.saved.length ?? 0, icon: 'i-lucide-bookmark' },
  { label: 'Collections', slot: 'collections' as const, badge: collections.value.length, icon: 'i-lucide-folder' },
  { label: 'Réalisés', slot: 'completed' as const, badge: data.value?.completed.length ?? 0, icon: 'i-lucide-flag' },
  { label: 'Statistiques', slot: 'stats' as const, icon: 'i-lucide-chart-column' },
])
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
        <UButton to="/settings" icon="i-lucide-settings" label="Paramètres" aria-label="Paramètres" color="neutral" variant="outline" :ui="{ label: 'hidden sm:inline' }" />
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

      <template #collections>
        <ul v-if="collections.length" class="space-y-2 pt-2">
          <li v-for="collection in collections" :key="collection.id">
            <NuxtLink
              :to="`/collections/${collection.id}`"
              class="flex items-center gap-3 rounded-lg border border-default p-3 transition-colors hover:bg-elevated focus-visible:bg-elevated"
            >
              <UIcon name="i-lucide-folder" class="size-5 shrink-0 text-muted" />
              <div class="min-w-0 flex-1">
                <p class="font-medium">
                  {{ collection.name }}
                  <UIcon v-if="!collection.is_public" name="i-lucide-lock" class="ml-1 size-3.5 align-baseline text-muted" aria-label="Privée" />
                </p>
                <p class="truncate text-sm text-muted">
                  {{ collection.route_count }} parcours<template v-if="collection.description"> · {{ collection.description }}</template>
                </p>
              </div>
            </NuxtLink>
          </li>
        </ul>
        <UEmpty
          v-else
          icon="i-lucide-folder"
          title="Aucune collection"
          description="Regroupe des parcours (un séjour, tes boucles favorites) avec « Ajouter à une collection » sur leur page."
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
