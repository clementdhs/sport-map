<script setup lang="ts">
import type { RouteReviews } from '#shared/types/routes'

// "Les mots de l'équipe" (#233): the two latest reviews with a comment, as quotes, the first one being the route
// cards' quote (#232, same order: created_at; hidden reviews never show). Same request as the Avis tab (same
// explicit useFetch key: the automatic one includes the call site), so the reviews load once and an edit there
// shows here too.
const props = defineProps<{
  routeId: string
}>()

const emit = defineEmits<{
  more: []
}>()

const { t } = useI18n()
const { formatShortDate } = useFormat()
const { data } = await useFetch<RouteReviews>(`/api/routes/${props.routeId}/reviews`, { key: routeReviewsKey(props.routeId) })

const LIMIT = 2
const commented = computed(() => (data.value?.reviews ?? [])
  .filter(review => !review.hidden_reason && review.author && review.comment?.trim())
  .sort((a, b) => b.created_at.localeCompare(a.created_at)))
const quotes = computed(() => commented.value.slice(0, LIMIT).map(review => ({
  id: review.id,
  comment: review.comment!.trim(),
  author: review.author!.display_name ?? review.author!.username,
  rating: review.rating,
  date: formatShortDate(review.created_at),
})))
</script>

<template>
  <section v-if="quotes.length" class="space-y-2.5" aria-labelledby="team-words-title">
    <h2 id="team-words-title" class="text-[1.375rem] leading-tight font-bold">{{ t('route.teamWords') }}</h2>
    <figure
      v-for="quote in quotes"
      :key="quote.id"
      class="flex gap-3 rounded-lg border border-default bg-default px-3.5 py-3"
      data-testid="team-word"
    >
      <span class="font-display text-[2.75rem] leading-[0.8] font-bold text-(--stamp)" aria-hidden="true">“</span>
      <div class="min-w-0 space-y-1.5">
        <blockquote class="text-[0.9375rem] leading-snug font-medium break-words text-highlighted italic">{{ quote.comment }}</blockquote>
        <figcaption class="text-sm text-muted">
          <strong class="font-semibold text-highlighted">{{ quote.author }}</strong>
          · <span aria-hidden="true">{{ '★'.repeat(quote.rating) }}</span><span class="sr-only">{{ t('reviews.stars', quote.rating) }}</span>
          · {{ quote.date }}
        </figcaption>
      </div>
    </figure>
    <UButton
      v-if="commented.length > LIMIT"
      :label="t('route.allReviews')"
      color="neutral"
      variant="link"
      trailing-icon="i-lucide-arrow-right"
      class="px-0"
      @click="emit('more')"
    />
  </section>
</template>
