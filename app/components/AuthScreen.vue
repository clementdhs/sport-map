<!-- Backdrop of the sign-in and account pages (#110, #126, #237): the contour lines of the Écrins
     (scripts/login-background.py) in the --contour tone of the signage, fading into the paper under the header,
     around the form and at the bottom, and a dotted track in the map's rust from a start dot. The page's content
     goes in the slot, above it; the source credit stays under it (Licence Ouverte). -->
<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <div class="relative isolate flex min-h-[calc(100dvh-var(--ui-header-height))] flex-col overflow-hidden">
    <div class="auth-contours absolute inset-0 -z-10" aria-hidden="true" />
    <div class="auth-fade absolute inset-0 -z-10" aria-hidden="true" />
    <!-- Landscape from sm up, portrait below: the form hides the middle of the page. -->
    <svg class="auth-trail absolute inset-0 -z-10 size-full max-sm:hidden" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="M90 660 C170 600 220 690 320 630 S430 430 530 470 S650 650 770 560 S880 300 990 330 S1080 220 1110 170" />
      <circle cx="90" cy="660" r="8" />
    </svg>
    <svg class="auth-trail absolute inset-0 -z-10 size-full sm:hidden" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="M36 712 C80 660 40 610 100 575 S190 555 220 510 S120 370 60 320" />
      <circle cx="36" cy="712" r="7" />
    </svg>
    <UContainer class="flex flex-1 flex-col items-center gap-7 py-8 sm:py-14">
      <slot />
      <!-- Required by the Licence Ouverte (source and date), kept small and pale. -->
      <p class="mt-auto self-end text-[0.6875rem] text-muted">{{ t('auth.login.reliefCredit') }}</p>
    </UContainer>
  </div>
</template>

<style scoped>
/* The contour lines are an alpha mask, filled with the signage's contour tone. */
.auth-contours {
  background-color: var(--contour);
  mask-image: url('/img/login-contours.svg');
  mask-position: center;
  mask-size: cover;
}

/* No seam with the header, a calm area around the form, and a plain background under the source credit. */
.auth-fade {
  background:
    linear-gradient(var(--ui-bg-paper), transparent 14%, transparent 90%, var(--ui-bg-paper)),
    radial-gradient(ellipse min(30rem, 62vw) 26rem at 50% 46%, var(--ui-bg-paper) 40%, transparent 100%);
}

.auth-trail path {
  fill: none;
  stroke: var(--map-track);
  stroke-dasharray: 2 8;
  stroke-linecap: round;
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
}

.auth-trail circle {
  fill: var(--ui-primary);
  stroke: var(--ui-bg);
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
}
</style>
