<script setup lang="ts">
// Header of the pages without a map; map pages have MapTopBar instead.
const user = useSupabaseUser()
const { t } = useI18n()
</script>

<template>
  <UHeader to="/" :toggle="false" :ui="{ root: 'border-b-0' }">
    <template #title>
      <span class="flex items-center gap-2">
        <AppLogo class="size-7" />
        <!-- On 360 px phones, visitors' buttons don't fit beside the name. -->
        <span class="hidden min-[400px]:inline">sport-map</span>
      </span>
    </template>

    <template #right>
      <UButton
        v-if="user"
        to="/record"
        icon="i-lucide-circle-dot"
        :label="t('header.record')"
        color="neutral"
        variant="outline"
        :ui="{ label: 'hidden sm:inline' }"
      />
      <UButton
        v-if="user"
        to="/routes/create"
        icon="i-lucide-plus"
        :label="t('header.create')"
        :ui="{ label: 'hidden sm:inline' }"
      />
      <AccountMenu />
    </template>
  </UHeader>
</template>
