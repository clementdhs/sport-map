// URL of a member's profile photo, from its storage path (profiles.avatar_path), signed by the browser with the
// member's session: the "avatars" bucket is private, readable by signed-in members. Undefined while it is signed,
// without a photo, and on the server, which renders the initials; the photo replaces them once the page is
// hydrated. URLs are shared by the whole app (avatarUrls.ts).
let cache: SignedUrlCache | undefined

export function useAvatarUrl(path: MaybeRefOrGetter<string | null | undefined>): Readonly<Ref<string | undefined>> {
  const url = ref<string>()
  if (import.meta.server) return url

  const supabase = useSupabaseClient()
  cache ??= createSignedUrlCache(async (paths) => {
    const { data, error } = await supabase.storage.from(AVATARS_BUCKET).createSignedUrls(paths, AVATAR_URL_TTL_S)
    if (error) throw error
    const urls = new Map(data.map(item => [item.path, item.signedUrl]))
    return paths.map(item => urls.get(item) || null)
  }, AVATAR_URL_TTL_S * 1000)

  // Rendering the photo during hydration would differ from the server's initials.
  const hydrated = ref(!useNuxtApp().isHydrating)
  if (!hydrated.value) onMounted(() => (hydrated.value = true))

  watch([() => toValue(path), hydrated], async ([current, ready]) => {
    url.value = current && ready ? cache!.peek(current) : undefined
    if (!current || !ready || url.value) return
    const signed = await cache!.get(current)
    // Unless the path changed meanwhile.
    if (toValue(path) === current) url.value = signed ?? undefined
  }, { immediate: true })
  return url
}
