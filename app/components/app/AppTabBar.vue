<script setup lang="ts">
// Bottom tab bar of the phones (#101): the main sections, labels always shown, and a central button opening
// the choice between recording an outing, sharing one's position and creating a route. Not positioned: the layouts place it.
const user = useSupabaseUser()
const { t } = useI18n()
const items = useMainNav()
const newItems = useNewItems()
const menuItems = computed(() => newItems.value.map(({ label, icon, to }) => ({ label, icon, to })))
// The profile tab shows the member's photo in place of its icon (#150), once signed. Not their initials: on the
// accent colour they would read as the current tab.
const { data: me } = useMyProfile()
const avatarSrc = useAvatarUrl(() => me.value?.avatar_path)
</script>

<template>
  <nav v-if="user" :aria-label="t('nav.label')" class="border-t border-default bg-default pb-[env(safe-area-inset-bottom)]">
    <ul class="grid h-16 grid-cols-5">
      <template v-for="(item, index) in items" :key="item.to">
        <!-- Central button, two sections on each side. -->
        <li v-if="index === 2" class="flex items-center justify-center">
          <UDropdownMenu :items="menuItems" size="lg" :content="{ side: 'top', sideOffset: 8 }" :ui="{ item: 'py-3' }">
            <!-- A rounded square in the accent (#231), raised above the bar. -->
            <UButton
              icon="i-lucide-plus"
              square
              class="size-13 justify-center rounded-[1.125rem] shadow-[0_6px_16px_rgb(0_0_0/0.25)]"
              :ui="{ leadingIcon: 'size-6.5' }"
              :aria-label="t('nav.new')"
            />
          </UDropdownMenu>
        </li>
        <li>
          <ULink
            :to="item.to"
            raw
            :aria-current="item.ariaCurrent"
            class="flex h-full flex-col items-center justify-center gap-1 text-xs"
            :class="item.ariaCurrent ? 'font-bold text-primary' : 'font-medium text-muted'"
            @click="item.onClick?.()"
          >
            <UAvatar
              v-if="item.to === '/profile' && avatarSrc"
              :src="avatarSrc"
              alt=""
              icon="i-lucide-user"
              size="xs"
              aria-hidden="true"
              :class="{ 'ring-2 ring-primary': item.ariaCurrent }"
              data-testid="tab-avatar"
            />
            <UIcon v-else :name="item.icon" class="size-6" aria-hidden="true" />
            {{ item.label }}
          </ULink>
        </li>
      </template>
    </ul>
  </nav>
</template>
