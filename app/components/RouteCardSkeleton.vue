<!-- Placeholder with the shape of a RouteCard (outline, title, stat badges, author), shown while a route list loads. -->
<template>
  <div class="flex gap-3 rounded-lg border border-default p-3" aria-hidden="true">
    <USkeleton class="size-16 shrink-0 rounded-md" />
    <div class="min-w-0 flex-1">
      <div class="flex h-6 items-center">
        <USkeleton class="h-4 w-2/3" />
      </div>
      <!-- Wraps like the badges of a card: sport, distance, gain, duration -->
      <div class="mt-1.5 flex flex-wrap gap-1">
        <USkeleton v-for="width in ['w-32', 'w-20', 'w-20', 'w-18']" :key="width" class="h-6 rounded-md" :class="width" />
      </div>
      <div class="mt-1.5 flex h-5 items-center">
        <USkeleton class="h-3.5 w-1/3" />
      </div>
    </div>
  </div>
</template>
