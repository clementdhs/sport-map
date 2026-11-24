<script setup lang="ts">
import type { ProfileInfo, ProfileSummary } from '#shared/types/routes'

// Top of a profile, the member's own or another one's (#236): contour lines behind the ringed avatar (photo or
// initials), the name and the "@username · member since" line. Another member's profile also shows the current
// year's totals here; the member's own shows them in its statistics tab.
const props = defineProps<{
  profile: ProfileInfo
  summary?: ProfileSummary
  // Appended to the "@username · member since" line
  detail?: string
}>()

const { t } = useI18n()
const { formatDate } = useFormat()

const name = computed(() => props.profile.display_name ?? props.profile.username)
</script>

<template>
  <div class="relative space-y-4 overflow-y-clip pt-2 pb-1">
    <ContourTexture />
    <!-- The actions wrap below the avatar and name when the name would get less than 10rem (phones): next to it,
      they left room for a few letters per line and cut the name mid-word (#342). -->
    <div class="relative flex flex-wrap items-center gap-4">
      <!-- The name is the heading next to it. A ring of the surface, then of the accented border, like a map pin. -->
      <span
        class="flex shrink-0 rounded-full shadow-[0_0_0_3px_var(--ui-bg),0_0_0_4.5px_var(--ui-border-accented)]"
        aria-hidden="true"
        data-testid="profile-avatar"
      >
        <MemberAvatar :name="name" :path="profile.avatar_path" size="3xl" class="size-17 font-display text-3xl font-bold lg:size-21 lg:text-4xl" />
      </span>
      <div class="min-w-0 flex-1 basis-40">
        <h1 class="font-display text-3xl leading-none font-bold break-words lg:text-5xl">{{ name }}</h1>
        <p class="mt-1 text-sm text-muted lg:text-base">
          @{{ profile.username }} · {{ t('profile.memberSince', { date: formatDate(profile.created_at) }) }}<template v-if="detail"> · {{ detail }}</template>
        </p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 gap-2 self-start">
        <slot name="actions" />
      </div>
    </div>

    <ProfileYearSummary v-if="summary" :summary="summary" class="relative" />

    <p v-if="profile.bio" class="relative whitespace-pre-line">{{ profile.bio }}</p>
  </div>
</template>
