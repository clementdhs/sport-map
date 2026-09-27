<script setup lang="ts">
useSeoMeta({
  title: 'sport-map — parcours de course, rando et vélo',
  description: 'Crée, partage et découvre des parcours de course à pied, randonnée et vélo.',
})
</script>

<template>
  <div class="h-[calc(100dvh-var(--ui-header-height))]">
    <ClientOnly>
      <MapView />
    </ClientOnly>
  </div>
</template>
