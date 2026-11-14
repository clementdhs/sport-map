<script setup lang="ts">
import type { RecordOuting } from '#shared/types/routes'

// One record of the profile (#140, #236): what it is, its value, and the outing that holds it, which it links to.
// A record set lately wears the yellow "Record !" badge over its corner.
defineProps<{
  label: string
  value: string
  // Pace or speed of a best time
  detail?: string | null
  to: string
  outing: RecordOuting
  recent?: boolean
}>()

const { formatDate } = useFormat()
</script>

<template>
  <NuxtLink
    :to="to"
    class="relative flex h-full flex-col gap-0.5 rounded-lg border border-default bg-default p-3 transition-colors hover:bg-elevated focus-visible:bg-elevated lg:bg-paper lg:hover:bg-elevated"
  >
    <span class="text-[0.625rem] leading-tight font-bold tracking-wide text-muted uppercase">{{ label }}</span>
    <span class="font-numbers text-2xl leading-tight font-semibold tabular-nums">{{ value }}</span>
    <span v-if="detail" class="text-xs text-muted tabular-nums">{{ detail }}</span>
    <span class="mt-auto truncate pt-1 text-xs text-muted">
      {{ formatDate(outing.completed_at) }} · {{ outing.route_name }}
    </span>
    <!-- After the figures, so the link's name starts with what the record is. -->
    <RecordBadge v-if="recent" class="absolute -top-2.5 right-2.5" />
  </NuxtLink>
</template>
