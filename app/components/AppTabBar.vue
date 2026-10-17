<script setup lang="ts">
// Bottom tab bar of the phones (#101): the main sections, labels always shown, and a central button opening
// the choice between recording an outing and creating a route. Not positioned: the layouts place it.
const user = useSupabaseUser()
const { t } = useI18n()
const items = useMainNav()
const newItems = useNewItems()
const menuItems = computed(() => newItems.value.map(({ label, icon, to }) => ({ label, icon, to })))
</script>

<template>
  <nav v-if="user" :aria-label="t('nav.label')" class="border-t border-default bg-default pb-[env(safe-area-inset-bottom)]">
    <ul class="grid h-16 grid-cols-5">
      <template v-for="(item, index) in items" :key="item.to">
        <!-- Central button, two sections on each side. -->
        <li v-if="index === 2" class="flex items-center justify-center">
          <UDropdownMenu :items="menuItems" size="lg" :content="{ side: 'top', sideOffset: 8 }" :ui="{ item: 'py-3' }">
            <UButton icon="i-lucide-plus" size="xl" square class="rounded-full shadow-md" :aria-label="t('nav.new')" />
          </UDropdownMenu>
        </li>
        <li>
          <ULink
            :to="item.to"
            raw
            :aria-current="item.ariaCurrent"
            class="flex h-full flex-col items-center justify-center gap-1 text-xs font-medium"
            :class="item.ariaCurrent ? 'text-primary' : 'text-muted'"
            @click="item.onClick?.()"
          >
            <UIcon :name="item.icon" class="size-6" aria-hidden="true" />
            {{ item.label }}
          </ULink>
        </li>
      </template>
    </ul>
  </nav>
</template>
