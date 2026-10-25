<script setup lang="ts">
// App header (#101). From md up it is the same on every page but the full-screen ones (editor, follow, record,
// a live share): logo, main navigation, record / create, account. Below md the tab bar holds the navigation and
// the map pages show MapTopBar instead.
// `wide` (map pages, #154): the content spans the whole width, like the map, instead of the centred column of
// the text pages.
defineProps<{ wide?: boolean }>()

const user = useSupabaseUser()
const route = useRoute()
const { t } = useI18n()
const items = useMainNav()
const newItems = useNewItems()
</script>

<template>
  <UHeader to="/" :toggle="false" class="app-header" :ui="{ root: 'border-b-0', container: wide ? 'max-w-none lg:px-6' : undefined, center: 'hidden md:flex' }">
    <!-- Pages showing the logo in large (sign-in) set `headerLogo: false` in their meta: no second one up here. -->
    <template v-if="route.meta.headerLogo === false" #left>
      <span />
    </template>
    <!-- On 360 px phones, visitors' buttons don't fit beside the name; from md to lg, the navigation doesn't.
         Outside the slot: UHeader names the logo link after the slot's text, comments included in dev. -->
    <template #title>
      <span class="flex items-center gap-2">
        <AppLogo class="size-7" />
        <span class="hidden min-[400px]:max-md:inline lg:inline">sportmap</span>
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

<style>
/* Touch zones of at least 40 px in the 56 px header (#154), for tablets, while the links and buttons keep their
   look: a transparent layer stretched above and below the smaller ones. Not scoped: UHeader's slot content carries
   no scope id. In a layer, so that utilities still win. */
@layer components {
  .app-header :is(a, button) {
    position: relative;
  }

  .app-header :is(a, button)::after {
    content: '';
    position: absolute;
    inset-inline: 0;
    inset-block: min(0px, calc(50% - 1.25rem));
  }
}
</style>
