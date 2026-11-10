---
paths:
  - "supabase/migrations/*profile_avatars*"
  - "shared/utils/avatars.ts"
  - "app/utils/avatarUrls.ts"
  - "app/composables/useAvatarUrl.ts"
  - "app/composables/useMyProfile.ts"
  - "app/components/MemberAvatar.vue"
  - "app/components/AvatarEditor.vue"
  - "app/components/AvatarCropper.vue"
  - "app/components/AccountMenu.vue"
  - "app/components/AppTabBar.vue"
  - "server/api/profile/me/avatar*"
  - "server/utils/avatars.ts"
---

# Profile photos (#150)

- Settings, profile section (`AvatarEditor`): the member picks an image, frames it in a square (`AvatarCropper`: drag or arrow keys to move, slider or +/− to zoom, crop math in `shared/utils/avatars.ts`, unit-tested), and the browser draws that square at 256 px and encodes it as WebP (JPEG where it can't, `compressAvatar`, EXIF dropped). A photo of several MB leaves as a few kB. `POST /api/profile/me/avatar` checks size (256 KB) and real type, stores `<user_id>/<uuid>.webp` in the private `avatars` bucket with the member's session, sets `profiles.avatar_path`, then removes only the previous file (removing the whole folder could take the file of a change sent at the same time). `DELETE` empties the folder: the initials come back.
- `profiles.avatar_path` (the never-used `avatar_url` of the initial schema, renamed): a new file name per photo, so no cache shows the old one. A check constraint keeps it inside the member's own folder, since members update their profile row directly through RLS. Storage policies: every signed-in member reads the bucket, each member writes and removes in their own folder only; the anon role gets nothing.
- APIs send the path, not a URL (`ProfileInfo.avatar_path`, `RouteListItem.owner_avatar_path`, also returned by `search_routes`, `LiveShareSummary.user_avatar_path`). **The browser signs it** (`useAvatarUrl`, with the member's session, 1 h): the paths asked for in the same tick go in one request, and URLs are kept for the session until 5 min before they expire (`createSignedUrlCache`). Signing on the server would add a storage call to every search and live poll, and give a new URL (hence a new download) at each refresh. The cost: the server renders the initials and the photo appears once hydrated; the photo is never rendered during hydration (mismatch).
- `MemberAvatar` (photo, else initials on the accent colour) on the profile header, route cards that show their owner, `/live` and `/live/:id`. The phone's profile tab shows the photo in place of its icon and keeps the icon without one (initials on the accent in the tab bar read as the active tab). The account menu's button is a `MemberAvatar` (#231, as in the topo mockups): the initials on the accent until a photo is chosen. `useMyProfile` (was `useMyUsername`) fetches username and photo once per member; the settings page refreshes it after a change.
- Account data: the export adds `photo-de-profil.<ext>` (named in the archive's language) and `photo` in the profile JSON; deleting the account empties the member's folder before removing the auth user.
- e2e (`specs/account.spec.ts`): a noisy PNG of a few MB drawn by the page, sent through the hidden file input; the test checks the request and the stored file stay under 30 kB, the team member's view, and that a signed-out visitor can't sign the file.
