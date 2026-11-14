<!-- Placeholder with the shape of a RouteCard (outline, sport, name, figures and sign, author), shown while a route list loads. -->
<template>
  <div class="flex gap-3 rounded-lg border border-default bg-default p-3" aria-hidden="true">
    <USkeleton class="size-18 shrink-0 rounded-md" />
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex h-4 items-center">
        <USkeleton class="h-3 w-24" />
      </div>
      <div class="flex h-6 items-center">
        <USkeleton class="h-5 w-2/3" />
      </div>
      <div class="mt-0.5 flex h-7 items-center justify-between gap-3">
        <USkeleton class="h-5 w-28" />
        <USkeleton class="h-7 w-18 rounded-sm" />
      </div>
      <div class="flex h-4 items-center">
        <USkeleton class="h-3 w-1/3" />
      </div>
    </div>
  </div>
</template>
