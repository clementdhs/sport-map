<script setup lang="ts">
import type { RecordOuting } from '#shared/types/routes'
import type { PersonalRecord } from '#shared/utils/personalRecords'
import type { SportType } from '#shared/utils/routes'

// Records of the statistics tab (#140): the longest outing, gain and duration, and the best times of each sport,
// in a year (the current one by default) or ever. Computed in the browser from the profile's outings, like the
// statistics; each record links to its outing.
const props = defineProps<{
  outings: RecordOuting[]
  sport: SportType | 'all'
}>()

const { t } = useI18n()
const { formatDistance, formatNumber, formatSpeed } = useFormat()

const currentYear = Number(localDate(new Date()).slice(0, 4))
const year = ref(String(currentYear))
const yearItems = computed(() => [
  ...[...new Set([currentYear, ...recordYears(props.outings)])].sort((a, b) => b - a).map(y => ({ label: String(y), value: String(y) })),
  { label: t('records.allTime'), value: 'all' },
])

const records = computed(() => personalRecords(props.outings, props.sport, year.value === 'all' ? 'all' : Number(year.value)))
const overall = computed(() => records.value.filter(record => !record.sport))
// Best times and hours, by sport
const bySport = computed(() => {
  const groups = new Map<SportType, PersonalRecord[]>()
  for (const record of records.value) {
    if (record.sport) groups.set(record.sport, [...(groups.get(record.sport) ?? []), record])
  }
  return [...groups.entries()].map(([sport, list]) => ({ sport, records: list }))
})

const label = (record: PersonalRecord) => t(recordLabelKey(record))
const now = new Date()
const recent = (record: PersonalRecord) => isRecentRecord(record.outing.completed_at, now)

function value(record: PersonalRecord): string {
  if (record.metric === 'distance' || record.metric === 'hour') return formatDistance(record.value)
  if (record.metric === 'gain') return `${formatNumber(Math.round(record.value))} m`
  // Rounded like the pace below it (the stopwatch drops the tenths)
  return record.metric === 'time' ? formatStopwatch(Math.round(record.value)) : formatElapsed(record.value)
}

// Pace for runners, speed for cyclists, under a best time.
function detail(record: PersonalRecord): string | null {
  if (record.metric === 'hour') return t('records.inHour')
  if (record.metric !== 'time' || !record.sport || !record.meters) return null
  return SPORT_KINDS[record.sport] === 'ride'
    ? formatSpeed(record.meters, record.value)
    : t('records.pace', { pace: formatPace(record.meters / record.value) })
}

// The outing's detail on its route's Passages tab, or the route for one only marked as done.
function link(outing: RecordOuting): string {
  return outing.outing_id ? `/routes/${outing.route_id}?tab=outings&outing=${outing.outing_id}` : `/routes/${outing.route_id}`
}
</script>

<template>
  <section class="space-y-3" data-testid="records" aria-labelledby="records-title">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="records-title" class="font-display text-2xl font-bold">{{ t('records.title') }}</h2>
      <USelect v-model="year" :items="yearItems" :aria-label="t('records.year')" class="w-40" />
    </div>

    <p v-if="!records.length" class="text-sm text-muted">{{ t('records.empty') }}</p>

    <template v-else>
      <ul class="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
        <li v-for="record in overall" :key="record.key">
          <ProfileRecordTile :label="label(record)" :value="value(record)" :to="link(record.outing)" :outing="record.outing" :recent="recent(record)" />
        </li>
      </ul>

      <div v-for="group in bySport" :key="group.sport" class="space-y-2">
        <h3 class="text-sm font-semibold">{{ t('records.bestTimes', { sport: t(`sports.${group.sport}`) }) }}</h3>
        <ul class="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
          <li v-for="record in group.records" :key="record.key">
            <ProfileRecordTile
              :label="label(record)"
              :value="value(record)"
              :detail="detail(record)"
              :to="link(record.outing)"
              :outing="record.outing"
              :recent="recent(record)"
            />
          </li>
        </ul>
      </div>
      <p v-if="bySport.length" class="text-xs text-muted">{{ t('records.timesHint') }}</p>
    </template>
  </section>
</template>
