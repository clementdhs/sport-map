<script setup lang="ts">
// App header (#101). From md up it is the same on every page but the full-screen ones (editor, follow, record,
// a live share): logo, main navigation, record / create, account. Below md the tab bar holds the navigation and
// the map pages show MapTopBar instead.
const user = useSupabaseUser()
const route = useRoute()
const { t } = useI18n()
const items = useMainNav()
const newItems = useNewItems()
</script>

<template>
  <UHeader to="/" :toggle="false" :ui="{ root: 'border-b-0', center: 'hidden md:flex' }">
    <!-- Pages showing the logo in large (sign-in) set `headerLogo: false` in their meta: no second one up here. -->
    <template v-if="route.meta.headerLogo === false" #left>
      <span />
    </template>
    <!-- On 360 px phones, visitors' buttons don't fit beside the name; from md to lg, the navigation doesn't.
         Outside the slot: UHeader names the logo link after the slot's text, comments included in dev. -->
    <template #title>
      <span class="flex items-center gap-2">
        <AppLogo class="size-7" />
        <span class="hidden min-[400px]:max-md:inline lg:inline">sport-map</span>
      </span>
    </template>

    <nav v-if="user" :aria-label="t('nav.label')" class="flex items-center gap-1">
      <UButton
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        :icon="item.icon"
        :label="item.label"
        :aria-current="item.ariaCurrent"
        :color="item.ariaCurrent ? 'primary' : 'neutral'"
        variant="ghost"
        @click="item.onClick?.()"
      />
    </nav>

    <template #right>
      <template v-if="user">
        <!-- In the tab bar's central button on phones. -->
        <UButton
          v-for="(item, index) in newItems"
          :key="item.to"
          :to="item.to"
          :icon="item.icon"
          :label="item.short"
          :aria-label="item.label"
          :color="index === 0 ? 'neutral' : 'primary'"
          :variant="index === 0 ? 'outline' : 'solid'"
          class="max-md:hidden"
          :ui="{ label: 'hidden lg:inline' }"
        />
      </template>
      <AccountMenu />
    </template>
  </UHeader>
</template>
