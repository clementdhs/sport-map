<script setup lang="ts">
import type { CollectionSummary, MyProfile } from '#shared/types/routes'

const { formatDate, formatSpeed } = useFormat()

const { t } = useI18n()
useSeoMeta({ title: () => `${t('header.profile')} — sport-map` })

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

const { data: collections } = await useFetch<CollectionSummary[]>('/api/collections', { default: () => [] })

const tabs = computed(() => [
  { label: t('profile.tabs.created'), short: t('profile.tabsShort.created'), slot: 'created' as const, badge: data.value?.created.length ?? 0, icon: 'i-lucide-route' },
  { label: t('profile.tabs.saved'), short: t('profile.tabsShort.saved'), slot: 'saved' as const, badge: data.value?.saved.length ?? 0, icon: 'i-lucide-bookmark' },
  { label: t('profile.tabs.collections'), short: t('profile.tabsShort.collections'), slot: 'collections' as const, badge: collections.value.length, icon: 'i-lucide-folder' },
  { label: t('profile.tabs.completed'), short: t('profile.tabsShort.completed'), slot: 'completed' as const, badge: data.value?.completed.length ?? 0, icon: 'i-lucide-flag' },
  { label: t('profile.tabs.stats'), short: t('profile.tabsShort.stats'), slot: 'stats' as const, icon: 'i-lucide-chart-column' },
])
</script>

<template>
  <UContainer v-if="data" class="max-w-3xl space-y-6 py-8">
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold">{{ data.profile.display_name ?? data.profile.username }}</h1>
        <p class="text-sm text-muted">@{{ data.profile.username }} · {{ t('profile.memberSince', { date: formatDate(data.profile.created_at) }) }}</p>
        <p v-if="data.profile.bio" class="whitespace-pre-line pt-2">{{ data.profile.bio }}</p>
      </div>
      <div class="flex shrink-0 gap-2">
        <UButton
          :to="`/profile/${data.profile.username}`"
          icon="i-lucide-eye"
          color="neutral"
          variant="outline"
          :aria-label="t('profile.viewPublic')"
        />
        <UButton to="/settings" icon="i-lucide-settings" :label="t('header.settings')" :aria-label="t('header.settings')" color="neutral" variant="outline" :ui="{ label: 'hidden sm:inline' }" />
      </div>
    </div>

    <!-- Phones: icon and count on top, short label below, so the 5 tabs fit from 360 px.
         The full label stays the tab's accessible name. -->
    <UTabs
      :items="tabs"
      variant="link"
      class="w-full"
      :ui="{
        trigger: 'max-sm:w-auto max-sm:flex-auto max-sm:flex-wrap max-sm:gap-x-1 max-sm:gap-y-0.5 max-sm:px-1',
        label: 'max-sm:order-last max-sm:basis-full max-sm:text-center max-sm:text-xs',
      }"
    >
      <template #default="{ item }">
        <span class="sm:hidden" aria-hidden="true">{{ item.short }}</span>
        <span class="max-sm:sr-only">{{ item.label }}</span>
      </template>
      <template #created>
        <ul v-if="data.created.length" class="space-y-2 pt-2">
          <li v-for="route in data.created" :key="route.id"><RouteCard :route="route" /></li>
        </ul>
        <UEmpty
          v-else
          icon="i-lucide-route"
          :title="t('profile.noCreated')"
          :description="t('profile.noCreatedHint')"
          :actions="[{ label: t('header.create'), icon: 'i-lucide-plus', to: '/routes/create' }]"
        />
      </template>

      <template #saved>
        <ul v-if="data.saved.length" class="space-y-2 pt-2">
          <li v-for="route in data.saved" :key="route.id"><RouteCard :route="route" /></li>
        </ul>
        <UEmpty
          v-else
          icon="i-lucide-bookmark"
          :title="t('profile.noSaved')"
          :description="t('profile.noSavedHint')"
          :actions="[{ label: t('profile.discover'), icon: 'i-lucide-map', to: '/' }]"
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
          v-else
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
