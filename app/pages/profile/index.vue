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

const { data: collections, refresh: refreshCollections } = await useFetch<CollectionSummary[]>('/api/collections', { default: () => [] })

// Statistics first (#236), then the member's routes (created and done) and their collections.
const tabs = computed(() => [
  { label: t('profile.tabs.stats'), value: 'stats', slot: 'stats' as const },
  { label: t('profile.tabs.routes'), value: 'routes', slot: 'routes' as const },
  { label: t('profile.tabs.collections'), value: 'collections', slot: 'collections' as const },
])
// The open tab is kept in the URL (?tab=routes), so that coming back from a route shows it again.
const currentRoute = useRoute()
const activeTab = computed({
  get: () => tabs.value.find(tab => tab.value === currentRoute.query.tab)?.value ?? 'stats',
  set: tab => navigateTo({ query: { ...currentRoute.query, tab: tab === 'stats' ? undefined : tab } }, { replace: true }),
})
const routeTabs = computed(() => [
  { label: t('profile.tabs.created'), slot: 'created' as const, badge: data.value?.created.length ?? 0 },
  { label: t('profile.tabs.completed'), slot: 'completed' as const, badge: data.value?.completed.length ?? 0 },
])
</script>

<template>
  <UContainer v-if="data" class="max-w-3xl space-y-6 py-8 lg:max-w-6xl">
    <ProfileHeader :profile="data.profile">
      <template #actions>
        <UButton
          :to="`/profile/${data.profile.username}`"
          icon="i-lucide-eye"
          color="neutral"
          variant="outline"
          size="lg"
          :aria-label="t('profile.viewPublic')"
        />
        <UButton
          to="/settings"
          icon="i-lucide-settings"
          :label="t('header.settings')"
          :aria-label="t('header.settings')"
          color="neutral"
          variant="outline"
          size="lg"
          :ui="{ label: 'hidden sm:inline' }"
        />
      </template>
    </ProfileHeader>

    <UTabs
      v-model="activeTab"
      :items="tabs"
      variant="link"
      class="w-full gap-5"
      :ui="{
        list: 'gap-5 border-accented',
        trigger: 'px-0 text-base data-[state=active]:font-bold',
        indicator: 'h-[3px]',
      }"
    >
      <template #stats>
        <div class="space-y-6">
          <!-- On a computer: the year and its goal on the left, the chart and the records on the right. -->
          <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-5">
            <div class="space-y-6 lg:space-y-5">
              <ProfileYearSummary :summary="summary" class="lg:profile-panel" />
              <!-- The goal is a preference of the device and the account, only known in the browser (#141). -->
              <ClientOnly>
                <ProfileGoal :outings="data.outings" class="lg:profile-panel" />
              </ClientOnly>
            </div>
            <ProfileStats :outings="data.outings" class="lg:profile-panel" />
          </div>
          <ProfileLatestOutings :outings="data.outings" class="profile-panel max-lg:hidden" />
        </div>
      </template>

      <template #routes>
        <UTabs :items="routeTabs" size="sm" class="gap-3" :ui="{ list: 'w-auto self-start' }">
          <template #created>
            <ul v-if="data.created.length" class="grid gap-3.5 pt-1 lg:grid-cols-2">
              <li v-for="route in data.created" :key="route.id"><RouteCard :route="route" hide-owner class="h-full" /></li>
            </ul>
            <UEmpty
              v-else
              icon="i-lucide-route"
              :title="t('profile.noCreated')"
              :description="t('profile.noCreatedHint')"
              :actions="[{ label: t('header.create'), icon: 'i-lucide-plus', to: '/routes/create' }]"
            />
          </template>
          <template #completed>
            <ul v-if="data.completed.length" class="grid gap-3.5 pt-1 lg:grid-cols-2">
              <li v-for="route in data.completed" :key="route.id">
                <RouteCard :route="route" :note="completedNote(route)" class="h-full" />
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
      </template>

      <template #collections>
        <ProfileCollections
          :collections="collections"
          :todo-count="data.todo_count"
          :todo-thumbnails="data.todo_thumbnails"
          @created="refreshCollections()"
        />
      </template>
    </UTabs>
  </UContainer>
</template>
