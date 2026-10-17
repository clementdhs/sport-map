<script setup lang="ts">
const user = useSupabaseUser()
</script>

<template>
  <div>
    <AppHeader />
    <!-- Room for the fixed tab bar on phones, shown to members only. -->
    <UMain :class="{ 'max-md:pb-[calc(4rem+env(safe-area-inset-bottom))]': user }">
      <slot />
    </UMain>
    <AppTabBar class="fixed inset-x-0 bottom-0 z-40 md:hidden" />
  </div>
</template>
