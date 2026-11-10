<script setup lang="ts">
// Table of contents of the settings page (#111): a sticky strip of chips under the header on phones, a sticky
// column on the left on computers. Each section has its anchor (`/settings#voice`); the link of the section
// being read is highlighted, in ink like the other chips of the topo look (#237).
const props = defineProps<{ sections: { id: string, label: string, icon: string }[] }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const list = useTemplateRef('list')

const known = (hash: string) => props.sections.find(section => `#${section.id}` === hash)?.id
// The first section until mounted: the server never sees the hash.
const active = ref(props.sections[0]!.id)
// Set by a link or the URL: kept while the page can't scroll that section up to the top (the last ones), until
// the reader scrolls on their own.
let pinned = false
function followHash(hash: string) {
  const id = known(hash)
  if (!id) return
  active.value = id
  pinned = true
}
// Also a link to another section while the page is open: same page, new hash.
watch(() => route.hash, followHash)

function go(event: MouseEvent, id: string) {
  // Ctrl-click and the like open the link elsewhere, as usual.
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  active.value = id
  pinned = true
  // Done here too: the router doesn't scroll again when the hash is already this one.
  document.getElementById(id)?.scrollIntoView()
  router.replace({ query: route.query, hash: `#${id}` })
}

// The section being read: the last one whose top went past the upper third of the screen.
function onScroll() {
  const tops = props.sections.map(section => document.getElementById(section.id)?.getBoundingClientRect().top ?? Infinity)
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
  if (atBottom) {
    if (!pinned) active.value = props.sections.at(-1)!.id
    return
  }
  const index = tops.findLastIndex(top => top <= window.innerHeight / 3)
  if (!pinned) active.value = props.sections[Math.max(index, 0)]!.id
}
function release() {
  pinned = false
}

const USER_SCROLL_EVENTS = ['wheel', 'touchmove', 'keydown'] as const
onMounted(() => {
  followHash(route.hash)
  window.addEventListener('scroll', onScroll, { passive: true })
  for (const name of USER_SCROLL_EVENTS) window.addEventListener(name, release, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  for (const name of USER_SCROLL_EVENTS) window.removeEventListener(name, release)
})

// Phones: the active chip stays in sight in the strip.
watch(active, (id) => {
  const strip = list.value
  const chip = strip?.querySelector<HTMLElement>(`[href="#${id}"]`)
  if (!strip || !chip || strip.scrollWidth <= strip.clientWidth) return
  strip.scrollTo({ left: chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' })
})
</script>

<template>
  <nav
    :aria-label="t('settings.sectionsLabel')"
    class="sticky top-(--ui-header-height) z-10 -mx-4 border-b border-default bg-paper sm:-mx-6 md:top-[calc(var(--ui-header-height)+2rem)] md:mx-0 md:self-start md:border-0 md:bg-transparent"
  >
    <ul ref="list" class="relative flex gap-1.5 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:px-6 md:flex-col md:gap-1 md:overflow-visible md:p-0">
      <li v-for="section in sections" :key="section.id" class="shrink-0">
        <a
          :href="`#${section.id}`"
          :aria-current="active === section.id ? 'location' : undefined"
          class="flex h-8.5 items-center gap-2 rounded-full border px-3 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary) md:h-auto md:rounded-md md:py-2"
          :class="active === section.id
            ? 'border-(--ui-bg-inverted) bg-inverted font-semibold text-inverted'
            : 'border-accented bg-default font-medium text-default hover:bg-elevated md:border-transparent md:bg-transparent md:text-muted md:hover:text-default'"
          @click="go($event, section.id)"
        >
          <UIcon :name="section.icon" class="size-4 shrink-0 max-md:hidden" aria-hidden="true" />
          {{ section.label }}
        </a>
      </li>
    </ul>
  </nav>
</template>
