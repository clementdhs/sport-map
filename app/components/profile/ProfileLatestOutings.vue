<script setup lang="ts">
import type { RecordOuting } from '#shared/types/routes'

// The member's latest outings, on a computer under the statistics (#236): date, route with its sport mark,
// distance, moving time, and the yellow "Record !" on the outings that beat one of their records.
const props = defineProps<{
  outings: RecordOuting[]
}>()

const LATEST = 5
const { t } = useI18n()
const { formatShortDate, formatDistance } = useFormat()

const latest = computed(() => [...props.outings]
  .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
  .slice(0, LATEST))
const breakers = computed(() => recordBreakers(props.outings))

function link(outing: RecordOuting): string {
  return outing.outing_id ? `/routes/${outing.route_id}?tab=outings&outing=${outing.outing_id}` : `/routes/${outing.route_id}`
}
</script>

<template>
  <section v-if="latest.length" aria-labelledby="latest-outings-title" data-testid="latest-outings">
    <h2 id="latest-outings-title" class="font-display text-2xl font-bold">{{ t('profile.latest.title') }}</h2>
    <table class="mt-2 w-full table-fixed text-left">
      <thead class="text-[0.625rem] font-bold tracking-wide text-muted uppercase">
        <tr>
          <th scope="col" class="w-28 py-2 font-bold">{{ t('profile.latest.date') }}</th>
          <th scope="col" class="py-2 font-bold">{{ t('profile.latest.route') }}</th>
          <th scope="col" class="w-28 py-2 font-bold">{{ t('route.distance') }}</th>
          <th scope="col" class="w-28 py-2 font-bold">{{ t('stats.movingTime') }}</th>
          <th scope="col" class="w-28 py-2"><span class="sr-only">{{ t('records.title') }}</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="outing in latest" :key="outing.outing_id ?? `${outing.route_id}:${outing.completed_at}`" class="border-t border-default">
          <td class="py-3 text-muted">{{ formatShortDate(outing.completed_at) }}</td>
          <td class="py-3">
            <NuxtLink :to="link(outing)" class="flex min-w-0 items-center gap-2 font-semibold hover:underline">
              <SportMark :sport="outing.sport_type" />
              <span class="sr-only">{{ t(`sports.${outing.sport_type}`) }} ·</span>
              <span class="truncate">{{ outing.route_name }}</span>
            </NuxtLink>
          </td>
          <td class="py-3 font-numbers text-lg font-semibold tabular-nums">{{ formatDistance(outing.covered_m ?? outing.distance_m) }}</td>
          <td class="py-3 font-numbers text-lg font-semibold tabular-nums">{{ outing.moving_s ? formatElapsed(outing.moving_s) : '—' }}</td>
          <td class="py-3"><RecordBadge v-if="outing.outing_id && breakers[outing.outing_id]" /></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
