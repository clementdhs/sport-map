<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { AccountExport } from '#shared/types/account'
import type { AccountDeletion } from '#shared/utils/account'

// RGPD, on the profile page: download everything as an archive, or delete the account.
const props = defineProps<{ username: string }>()

const toast = useToast()
const supabase = useSupabaseClient()
const errorMessage = (error: unknown) => (error as FetchError).data?.statusMessage ?? (error as Error).message

const exporting = ref(false)

async function exportData() {
  exporting.value = true
  try {
    await downloadAccountArchive(await $fetch<AccountExport>('/api/profile/me/export'))
  }
  catch (error) {
    toast.add({ title: 'Export impossible', description: errorMessage(error), color: 'error' })
  }
  finally {
    exporting.value = false
  }
}

const deleteOpen = ref(false)
const deleting = ref(false)
const confirmation = ref<AccountDeletion>({ username: '' })
const confirmed = computed(() => confirmation.value.username.trim() === props.username)

watch(deleteOpen, (open) => {
  if (open) confirmation.value = { username: '' }
})

async function deleteAccount() {
  if (!confirmed.value) return
  deleting.value = true
  try {
    await $fetch('/api/profile/me', { method: 'DELETE', body: confirmation.value })
    // The account is gone: only the session kept in the browser remains.
    await supabase.auth.signOut({ scope: 'local' })
    toast.add({ title: 'Compte supprimé', description: 'Toutes tes données ont été effacées.', color: 'success', icon: 'i-lucide-check' })
    await navigateTo('/')
  }
  catch (error) {
    toast.add({ title: 'Suppression impossible', description: errorMessage(error), color: 'error' })
    deleting.value = false
  }
}
</script>

<template>
  <section class="space-y-3 rounded-lg border border-default p-4" aria-labelledby="account-data-title">
    <h2 id="account-data-title" class="font-medium">Mes données</h2>
    <p class="text-sm text-muted">
      Télécharge une archive de tout ce que tu as mis sur sport-map (profil, parcours en GPX, photos, avis,
      sorties, collections), ou supprime définitivement ton compte.
    </p>
    <div class="flex flex-wrap gap-2">
      <UButton
        icon="i-lucide-download"
        label="Télécharger mes données"
        color="neutral"
        variant="outline"
        :loading="exporting"
        @click="exportData"
      />
      <UModal v-model:open="deleteOpen" title="Supprimer mon compte ?">
        <UButton icon="i-lucide-user-x" label="Supprimer mon compte" color="error" variant="ghost" />
        <template #body>
          <div class="space-y-4">
            <p class="text-sm">
              Ton compte, tes parcours, leurs photos, tes avis, tes sorties et tes collections seront effacés
              <strong>définitivement</strong>. Les notes des parcours que tu as évalués seront recalculées sans les
              tiennes. Pense à télécharger tes données avant.
            </p>
            <UForm id="delete-account-form" :schema="accountDeletionSchema" :state="confirmation" @submit="deleteAccount">
              <UFormField :label="`Pour confirmer, saisis ton nom d'utilisateur : ${username}`" name="username">
                <UInput v-model="confirmation.username" class="w-full" autocomplete="off" />
              </UFormField>
            </UForm>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton label="Annuler" color="neutral" variant="outline" @click="deleteOpen = false" />
            <UButton
              type="submit"
              form="delete-account-form"
              label="Supprimer définitivement"
              icon="i-lucide-trash-2"
              color="error"
              :disabled="!confirmed"
              :loading="deleting"
            />
          </div>
        </template>
      </UModal>
    </div>
  </section>
</template>
