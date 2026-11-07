<script setup lang="ts">
import type { CollectionSummary, MyProfile } from '#shared/types/routes'

const { formatDate, formatSpeed } = useFormat()

const { t } = useI18n()
useSeoMeta({ title: () => `${t('header.profile')} — sportmap` })

// "Done on …", with the times of an outing recorded with the GPS.
function completedNote(route: MyProfile['completed'][number]) {
  const note = t('route.completedOn', { date: formatDate(route.completed_at) })
  if (route.duration_s == null || route.moving_s == null) return note
  return `${note} · ${formatElapsed(route.duration_s)} · ${formatSpeed(route.distance_m, route.moving_s)}`
}

const { data, error } = await useFetch<MyProfile>('/api/profile/me')
if (error.value) {
  throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: error.value.statusMessage, fatal: true })
}

// Same outings as the statistics tab: no extra request.
const summary = computed(() => yearSummary(data.value?.outings ?? []))

const { data: collections } = await useFetch<CollectionSummary[]>('/api/collections', { default: () => [] })

const tabs = computed(() => [
  { label: t('profile.tabs.created'), slot: 'created' as const, badge: data.value?.created.length ?? 0, icon: 'i-lucide-route' },
  { label: t('profile.tabs.collections'), slot: 'collections' as const, badge: collections.value.length, icon: 'i-lucide-folder' },
  { label: t('profile.tabs.completed'), slot: 'completed' as const, badge: data.value?.completed.length ?? 0, icon: 'i-lucide-flag' },
  { label: t('profile.tabs.stats'), slot: 'stats' as const, icon: 'i-lucide-chart-column' },
])
</script>

<template>
  <UContainer v-if="data" class="max-w-3xl space-y-6 py-8">
    <ProfileHeader :profile="data.profile" :summary="summary">
      <template #actions>
        <UButton
          :to="`/profile/${data.profile.username}`"
          icon="i-lucide-eye"
          color="neutral"
          variant="outline"
          :aria-label="t('profile.viewPublic')"
        />
        <UButton to="/settings" icon="i-lucide-settings" :label="t('header.settings')" :aria-label="t('header.settings')" color="neutral" variant="outline" :ui="{ label: 'hidden sm:inline' }" />
      </template>
    </ProfileHeader>

    <!-- The goal is a preference of the device and the account, only known in the browser (#141). -->
    <ClientOnly>
      <ProfileGoal :outings="data.outings" />
    </ClientOnly>

    <!-- Below md: icon and count on top, label below, so the 4 full labels fit from 360 px. -->
    <UTabs
      :items="tabs"
      variant="link"
      class="w-full"
      :ui="{
        trigger: 'max-md:w-auto max-md:flex-auto max-md:flex-wrap max-md:gap-x-1 max-md:gap-y-0.5 max-md:px-0.5',
        label: 'max-md:order-last max-md:basis-full max-md:text-center max-md:text-xs',
      }"
    >
      <template #created>
        <ul v-if="data.created.length" class="space-y-2 pt-2">
          <li v-for="route in data.created" :key="route.id"><RouteCard :route="route" hide-owner /></li>
        </ul>
        <UEmpty
          v-else
          icon="i-lucide-route"
          :title="t('profile.noCreated')"
          :description="t('profile.noCreatedHint')"
          :actions="[{ label: t('header.create'), icon: 'i-lucide-plus', to: '/routes/create' }]"
        />
      </template>

      <template #collections>
        <!-- The fixed "À faire" list comes first, then the member's collections. -->
        <ul class="space-y-2 pt-2">
          <li>
            <NuxtLink
              to="/collections/todo"
              class="flex items-center gap-3 rounded-lg border border-default p-3 transition-colors hover:bg-elevated focus-visible:bg-elevated"
            >
              <UIcon name="i-lucide-list-todo" class="size-5 shrink-0 text-primary" />
              <div class="min-w-0 flex-1">
                <p class="font-medium">
                  {{ t('todo.name') }}
                  <UIcon name="i-lucide-lock" class="ml-1 size-3.5 align-baseline text-muted" :aria-label="t('profile.privateCollection')" />
                </p>
                <p class="truncate text-sm text-muted">
                  {{ t('collections.routeCount', data.todo_count) }} · {{ t('profile.todoHint') }}
                </p>
              </div>
            </NuxtLink>
          </li>
          <li v-for="collection in collections" :key="collection.id">
            <NuxtLink
              :to="`/collections/${collection.id}`"
              class="flex items-center gap-3 rounded-lg border border-default p-3 transition-colors hover:bg-elevated focus-visible:bg-elevated"
            >
              <UIcon name="i-lucide-folder" class="size-5 shrink-0 text-muted" />
              <div class="min-w-0 flex-1">
                <p class="font-medium">
                  {{ collection.name }}
                  <UIcon v-if="!collection.is_public" name="i-lucide-lock" class="ml-1 size-3.5 align-baseline text-muted" :aria-label="t('profile.privateCollection')" />
                </p>
                <p class="truncate text-sm text-muted">
                  {{ t('collections.routeCount', collection.route_count) }}<template v-if="collection.description"> · {{ collection.description }}</template>
                </p>
              </div>
            </NuxtLink>
          </li>
        </ul>
        <UEmpty
          v-if="!collections.length"
          icon="i-lucide-folder"
          :title="t('profile.noCollections')"
          :description="t('profile.noCollectionsHint')"
          :actions="[{ label: t('profile.discover'), icon: 'i-lucide-map', to: '/' }]"
        />
      </template>

      <template #stats>
        <ProfileStats :outings="data.outings" />
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
          :title="t('profile.noCompleted')"
          :description="t('profile.noCompletedHint')"
        />
      </template>
    </UTabs>
  </UContainer>
</template>
