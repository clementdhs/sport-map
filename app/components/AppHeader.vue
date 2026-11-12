<script setup lang="ts">
// App header (#101). From md up it is the same on every page but the full-screen ones (editor, follow, record,
// a live share): logo, main navigation, record / share / create, account. Below md the tab bar holds the navigation and
// the map pages show MapTopBar instead.
// `wide` (map pages, #154): the content spans the whole width, like the map, instead of the centred column of
// the text pages. Topo look (#231): surface with a sand edge, the current section on a pill, "Enregistrer" outlined
// in ink with a red dot, "Partager" outlined the same way (#262), "Créer" in the accent, the member's avatar.
defineProps<{ wide?: boolean }>()

const user = useSupabaseUser()
const route = useRoute()
const { t } = useI18n()
const items = useMainNav()
const newItems = useNewItems()
</script>

<template>
  <UHeader to="/" :toggle="false" class="app-header" :ui="{ root: 'bg-default backdrop-blur-none pt-[env(safe-area-inset-top)]', container: wide ? 'max-w-none lg:px-6' : undefined, center: 'hidden md:flex' }">
    <!-- Pages showing the logo in large (sign-in) set `headerLogo: false` in their meta: no second one up here. -->
    <template v-if="route.meta.headerLogo === false" #left>
      <span />
    </template>
    <!-- On 360 px phones, visitors' buttons don't fit beside the name; from md to lg, the navigation doesn't.
         Outside the slot: UHeader names the logo link after the slot's text, comments included in dev. -->
    <template #title>
      <span class="flex items-center gap-2">
        <AppLogo class="size-7.5" />
        <span class="hidden font-display text-2xl leading-none min-[400px]:max-md:inline lg:inline">sportmap</span>
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
        color="neutral"
        variant="ghost"
        size="lg"
        class="h-9.5 text-[0.9375rem]"
        :class="item.ariaCurrent ? 'bg-elevated font-bold text-highlighted' : 'font-medium text-muted hover:bg-elevated/60 hover:text-highlighted'"
        @click="item.onClick?.()"
      />
    </nav>

    <template #right>
      <template v-if="user">
        <!-- In the tab bar's central button on phones. Labels from lg up, the share's from xl: three of them don't fit
             beside the sections at 1024 px. -->
        <UButton
          v-for="item in newItems"
          :key="item.to"
          :to="item.to"
          :icon="item.kind === 'record' ? undefined : item.icon"
          :label="item.short"
          :aria-label="item.label"
          :color="item.kind === 'create' ? 'primary' : 'neutral'"
          :variant="item.kind === 'create' ? 'solid' : 'outline'"
          size="lg"
          class="h-9.5 font-semibold max-md:hidden"
          :class="{ 'ring-[1.5px] ring-(--ui-border-inverted) max-lg:px-3.5': item.kind !== 'create' }"
          :ui="{ label: item.kind === 'share' ? 'hidden xl:inline' : 'hidden lg:inline' }"
        >
          <!-- Recording: a red dot, like a camera's. -->
          <template v-if="item.kind === 'record'" #leading>
            <span class="size-2.5 shrink-0 rounded-full bg-error" aria-hidden="true" />
          </template>
        </UButton>
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
