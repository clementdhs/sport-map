<script setup lang="ts">
import type { RecordOuting } from '#shared/types/routes'

// One record of the profile (#140): what it is, its value, and the outing that holds it, which it links to.
defineProps<{
  label: string
  value: string
  // Pace or speed of a best time
  detail?: string | null
  to: string
  outing: RecordOuting
}>()

const { formatDate } = useFormat()
</script>

<template>
  <NuxtLink
    :to="to"
    class="block h-full rounded-lg bg-elevated p-3 transition-colors hover:bg-accented focus-visible:bg-accented"
  >
    <p class="text-xs text-muted">{{ label }}</p>
    <p class="font-numbers text-xl font-semibold tabular-nums">{{ value }}</p>
    <p v-if="detail" class="text-xs text-muted tabular-nums">{{ detail }}</p>
    <p class="mt-1 truncate text-xs text-muted">
      {{ formatDate(outing.completed_at) }} · {{ outing.route_name }}
    </p>
  </NuxtLink>
</template>
