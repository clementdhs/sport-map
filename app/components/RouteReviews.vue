<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { RouteReview, RouteReviews } from '#shared/types/routes'
import type { ReviewInput } from '#shared/utils/routes'

// Ratings and comments of a route: signed-in users review the public routes of others, the route's owner
// moderates, everyone can report an abusive comment.
const props = defineProps<{
  routeId: string
  isOwner: boolean
  isPublic: boolean
}>()

const user = useSupabaseUser()
const route = useRoute()
const toast = useToast()

const base = `/api/routes/${props.routeId}/reviews`
const { data } = await useFetch<RouteReviews>(base)

const myReview = computed(() => data.value?.reviews.find(review => review.is_mine) ?? null)
const canReview = computed(() => !!user.value && !props.isOwner && props.isPublic)

const errorMessage = (error: unknown) => (error as FetchError).data?.statusMessage ?? (error as Error).message

// Every mutation answers with the refreshed reviews.
const pending = ref<string | null>(null)
async function mutate(key: string, request: () => Promise<RouteReviews>, failure: string) {
  pending.value = key
  try {
    data.value = await request()
    return true
  }
  catch (error) {
    toast.add({ title: failure, description: errorMessage(error), color: 'error' })
    return false
  }
  finally {
    pending.value = null
  }
}

// Form, for a new review or to edit one's own.
const editing = ref(false)
const form = reactive<{ rating: number, comment: string }>({ rating: 0, comment: '' })

function startEditing() {
  form.rating = myReview.value?.rating ?? 0
  form.comment = myReview.value?.comment ?? ''
  editing.value = true
}

async function submit() {
  const body: ReviewInput = { rating: form.rating, comment: form.comment }
  const saved = await mutate('save', () => $fetch<RouteReviews>(base, { method: 'PUT', body }), "Impossible d'enregistrer ton avis")
  if (saved) {
    editing.value = false
    form.rating = 0
    form.comment = ''
  }
}

function removeMine() {
  if (!window.confirm('Supprimer ton avis ?')) return
  mutate('delete', () => $fetch<RouteReviews>(base, { method: 'DELETE' }), 'Impossible de supprimer ton avis')
}

function report(review: RouteReview) {
  if (!window.confirm('Signaler ce commentaire comme abusif ? Il sera masqué après 3 signalements.')) return
  mutate(`report-${review.id}`, () => $fetch<RouteReviews>(`${base}/${review.id}/report`, { method: 'POST' }), 'Signalement impossible')
}

function setHidden(review: RouteReview, hidden: boolean) {
  mutate(
    `hide-${review.id}`,
    () => $fetch<RouteReviews>(`${base}/${review.id}/hidden`, { method: 'PUT', body: { hidden } }),
    "Impossible de modifier l'avis",
  )
}

const HIDDEN_LABELS = {
  owner: "Commentaire masqué par l'auteur du parcours",
  reports: 'Commentaire masqué après plusieurs signalements',
} as const

const showForm = computed(() => canReview.value && (!myReview.value || editing.value))
const ratingLabels = ['', 'Mauvais', 'Moyen', 'Bien', 'Très bien', 'Excellent']
</script>

<template>
  <section id="avis" class="space-y-3" aria-labelledby="reviews-title">
    <div class="flex items-baseline justify-between gap-2">
      <h2 id="reviews-title" class="font-medium">Avis</h2>
      <p v-if="data?.rating_count" class="flex items-center gap-1.5 text-sm">
        <RatingStars :value="data.rating_avg ?? 0" />
        <span class="font-medium">{{ formatRating(data.rating_avg ?? 0) }}</span>
        <span class="text-muted">· {{ data.rating_count }} avis</span>
      </p>
    </div>

    <UForm v-if="showForm" :schema="reviewSchema" :state="form" class="space-y-3 rounded-lg bg-elevated p-3" @submit="submit">
      <UFormField name="rating" :label="myReview ? 'Modifier ta note' : 'Ta note'">
        <div class="flex items-center gap-1" role="radiogroup" aria-label="Ta note">
          <button
            v-for="n in 5"
            :key="n"
            type="button"
            role="radio"
            :aria-checked="form.rating === n"
            :aria-label="`${n} étoile${n > 1 ? 's' : ''}`"
            class="text-2xl leading-none transition-colors"
            :class="n <= form.rating ? 'text-amber-500' : 'text-muted/40 hover:text-amber-300'"
            @click="form.rating = n"
          >
            ★
          </button>
          <span v-if="form.rating" class="ml-2 text-sm text-muted">{{ ratingLabels[form.rating] }}</span>
        </div>
      </UFormField>
      <UFormField name="comment" label="Commentaire" hint="Facultatif">
        <!-- Fixed id: generated ones differ between server and browser in this async component, which
             unlinked the label from the field. -->
        <UTextarea
          id="review-comment"
          v-model="form.comment"
          :rows="3"
          autoresize
          :maxlength="MAX_REVIEW_COMMENT_LENGTH"
          placeholder="État des chemins, balisage, points forts…"
          class="w-full"
        />
      </UFormField>
      <div class="flex justify-end gap-2">
        <UButton v-if="editing" label="Annuler" color="neutral" variant="ghost" @click="editing = false" />
        <UButton type="submit" :label="myReview ? 'Enregistrer' : 'Publier mon avis'" :loading="pending === 'save'" />
      </div>
    </UForm>

    <p v-else-if="!user && isPublic" class="text-sm text-muted">
      <ULink :to="{ path: '/login', query: { redirect: route.fullPath } }" class="font-medium text-primary">Connecte-toi</ULink>
      pour donner ton avis.
    </p>

    <p v-if="!data?.reviews.length && !showForm" class="text-sm text-muted">Aucun avis pour le moment.</p>

    <ul v-if="data?.reviews.length" class="space-y-3">
      <li v-for="review in data.reviews" :key="review.id" class="space-y-1 border-b border-default pb-3 last:border-0">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <RatingStars :value="review.rating" />
          <ULink
            v-if="review.author"
            :to="`/profile/${review.author.username}`"
            class="font-medium text-default hover:underline"
          >
            {{ review.author.display_name ?? review.author.username }}
          </ULink>
          <span v-if="review.is_mine" class="text-muted">(toi)</span>
          <span class="text-muted">· {{ formatShortDate(review.created_at) }}</span>
          <UBadge
            v-if="review.report_count"
            :label="`Signalé ${review.report_count} fois`"
            color="warning"
            variant="subtle"
            size="sm"
          />
        </div>

        <p v-if="review.hidden_reason" class="text-sm text-muted italic">
          <UIcon name="i-lucide-eye-off" class="mr-1 align-text-bottom" />{{ HIDDEN_LABELS[review.hidden_reason] }}
        </p>
        <p v-if="review.comment" class="text-sm break-words whitespace-pre-line" :class="{ 'text-muted': review.hidden_reason }">
          {{ review.comment }}
        </p>

        <div class="flex flex-wrap gap-1">
          <template v-if="review.is_mine && !editing">
            <UButton label="Modifier" icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" @click="startEditing" />
            <UButton
              label="Supprimer"
              icon="i-lucide-trash-2"
              size="xs"
              color="neutral"
              variant="ghost"
              :loading="pending === 'delete'"
              @click="removeMine"
            />
          </template>
          <UButton
            v-if="isOwner && review.comment"
            :label="review.hidden_reason ? 'Afficher le commentaire' : 'Masquer le commentaire'"
            :icon="review.hidden_reason ? 'i-lucide-eye' : 'i-lucide-eye-off'"
            size="xs"
            color="neutral"
            variant="ghost"
            :loading="pending === `hide-${review.id}`"
            @click="setHidden(review, !review.hidden_reason)"
          />
          <UButton
            v-else-if="user && !review.is_mine && review.comment && !isOwner"
            :label="review.reported_by_me ? 'Signalé' : 'Signaler'"
            icon="i-lucide-flag"
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="review.reported_by_me"
            :loading="pending === `report-${review.id}`"
            @click="report(review)"
          />
        </div>
      </li>
    </ul>
  </section>
</template>
