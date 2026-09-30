<script setup lang="ts">
import type { AccountExport } from '#shared/types/account'
import type { AccountDeletion } from '#shared/utils/account'

// RGPD, on the settings page: download everything as an archive, or delete the account.
const props = defineProps<{ username: string }>()

const toast = useToast()
const supabase = useSupabaseClient()
const { t } = useI18n()
const accountDeletionSchemaLocalized = useLocalizedSchema(accountDeletionSchema)
const errorMessage = useErrorMessage()

const exporting = ref(false)

async function exportData() {
  exporting.value = true
  try {
    await downloadAccountArchive(await $fetch<AccountExport>('/api/profile/me/export'))
  }
  catch (error) {
    toast.add({ title: t('accountData.exportFailed'), description: errorMessage(error), color: 'error' })
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
    toast.add({ title: t('accountData.deleted'), description: t('accountData.deletedHint'), color: 'success', icon: 'i-lucide-check' })
    await navigateTo('/')
  }
  catch (error) {
    toast.add({ title: t('route.deleteFailed'), description: errorMessage(error), color: 'error' })
    deleting.value = false
  }
}
</script>

<template>
  <section class="space-y-3 rounded-lg border border-default p-4" aria-labelledby="account-data-title">
    <h2 id="account-data-title" class="font-medium">{{ t('accountData.title') }}</h2>
    <p class="text-sm text-muted">
      {{ t('accountData.description') }}
    </p>
    <div class="flex flex-wrap gap-2">
      <UButton
        icon="i-lucide-download"
        :label="t('accountData.export')"
        color="neutral"
        variant="outline"
        :loading="exporting"
        @click="exportData"
      />
      <UModal v-model:open="deleteOpen" :title="t('accountData.deleteTitle')">
        <UButton icon="i-lucide-user-x" :label="t('accountData.delete')" color="error" variant="ghost" />
        <template #body>
          <div class="space-y-4">
            <i18n-t keypath="accountData.deleteWarning" tag="p" class="text-sm" scope="global">
              <template #forever>
                <strong>{{ t('accountData.forever') }}</strong>
              </template>
            </i18n-t>
            <UForm id="delete-account-form" :schema="accountDeletionSchemaLocalized" :state="confirmation" @submit="deleteAccount">
              <UFormField :label="t('accountData.confirmLabel', { username })" name="username">
                <UInput v-model="confirmation.username" class="w-full" autocomplete="off" />
              </UFormField>
            </UForm>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="outline" @click="deleteOpen = false" />
            <UButton
              type="submit"
              form="delete-account-form"
              :label="t('accountData.deleteForever')"
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
