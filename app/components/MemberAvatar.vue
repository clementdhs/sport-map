<script setup lang="ts">
import type { AvatarProps } from '@nuxt/ui'

// A member's avatar (#150): their profile photo when they chose one, else their initials on the accent colour,
// like the solid buttons. Decorative: their name is always written next to it.
const props = defineProps<{
  name: string
  // profiles.avatar_path, null for the initials
  path?: string | null
  size?: AvatarProps['size']
}>()

const src = useAvatarUrl(() => props.path)
</script>

<template>
  <UAvatar
    :src="src"
    :text="initials(name)"
    alt=""
    :size="size"
    aria-hidden="true"
    :ui="{ root: 'shrink-0 bg-primary', fallback: 'text-inverted' }"
  />
</template>
