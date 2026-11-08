<script setup lang="ts">
import type { Factor } from '@supabase/supabase-js'

// Two-factor authentication with an authenticator app (#253), on the settings page: turned on by scanning a QR
// code and typing a first code, two apps at most (one kept as a spare). Removing one takes an aal2 session, which
// the auth middleware ensures once an app is on. A member who lost every app asks for their factor to be deleted
// in the Supabase dashboard (.claude/rules/family-access.md).
const MAX_FACTORS = 2

const supabase = useSupabaseClient()
const { t } = useI18n()
const { formatDate } = useFormat()
const toast = useToast()

const factors = ref<Factor[]>([])
const loaded = ref(false)
const loadError = ref('')

async function loadFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  loaded.value = true
  loadError.value = error ? error.message : ''
  factors.value = data?.totp ?? []
}
onMounted(loadFactors)

// Enrolment in progress: the factor stays unverified, and unused, until a first code is accepted.
const pending = ref<{ id: string, qrCode: string, secret: string } | null>(null)
const starting = ref(false)
const code = ref('')
const verifying = ref(false)
const codeError = ref('')

// An enrolment left half done (page closed before the code) leaves an unverified factor behind, counted in the
// limit of two: removed before starting again.
async function removeUnverified() {
  const { data } = await supabase.auth.mfa.listFactors()
  const stale = (data?.all ?? []).filter(factor => factor.factor_type === 'totp' && factor.status === 'unverified')
  await Promise.all(stale.map(factor => supabase.auth.mfa.unenroll({ factorId: factor.id })))
}

async function startEnrolment() {
  starting.value = true
  await removeUnverified()
  // A name of its own: some Supabase versions refuse a second factor named like the first, empty names included.
  // Never shown: the list numbers the apps.
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'sportmap', friendlyName: `sportmap-${Date.now()}` })
  starting.value = false
  if (error) {
    toast.add({ title: t('settings.mfa.enrollFailed'), description: error.message, color: 'error' })
    return
  }
  code.value = ''
  codeError.value = ''
  pending.value = { id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
}

async function cancelEnrolment() {
  const factor = pending.value
  pending.value = null
  if (factor) await supabase.auth.mfa.unenroll({ factorId: factor.id })
}

async function confirmEnrolment() {
  const factor = pending.value
  const typed = normalizeTotpCode(code.value)
  if (!factor) return
  if (!isTotpCode(typed)) {
    codeError.value = t('auth.mfa.codeFormat')
    return
  }
  verifying.value = true
  codeError.value = ''
  // Verifying also upgrades this session to aal2: the member isn't asked for a code again here.
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: typed })
  verifying.value = false
  if (error) {
    const key = totpErrorKey(error.code)
    codeError.value = key ? t(key) : error.message
    return
  }
  const first = !factors.value.length
  pending.value = null
  toast.add({ title: t(first ? 'settings.mfa.enabled' : 'settings.mfa.added'), color: 'success', icon: 'i-lucide-shield-check' })
  await loadFactors()
}

async function copySecret() {
  if (!pending.value) return
  try {
    await navigator.clipboard.writeText(pending.value.secret)
    toast.add({ title: t('settings.mfa.secretCopied'), color: 'success', icon: 'i-lucide-check' })
  }
  catch {
    // No clipboard (insecure context, refused): the key stays readable on screen.
  }
}

const confirmingRemoval = ref<string | null>(null)
const removing = ref(false)

async function removeFactor(factorId: string) {
  removing.value = true
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (!error) {
    // The session still lists the removed factor until it is refreshed.
    await supabase.auth.refreshSession()
  }
  removing.value = false
  confirmingRemoval.value = null
  if (error) {
    toast.add({ title: t('settings.mfa.removeFailed'), description: error.message, color: 'error' })
    return
  }
  const last = factors.value.length === 1
  toast.add({ title: t(last ? 'settings.mfa.disabled' : 'settings.mfa.removed'), color: 'success', icon: 'i-lucide-check' })
  await loadFactors()
}
</script>

<template>
  <div class="space-y-3" data-testid="two-factor-settings">
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="text-sm font-semibold">{{ t('settings.mfa.title') }}</h3>
      <UBadge
        v-if="loaded && !loadError"
        :label="factors.length ? t('settings.mfa.on') : t('settings.mfa.off')"
        :color="factors.length ? 'success' : 'neutral'"
        variant="subtle"
        size="sm"
      />
    </div>
    <p class="text-sm text-muted">{{ t('settings.mfa.hint') }}</p>

    <UAlert v-if="loadError" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="t('settings.mfa.loadFailed')" :description="loadError" />

    <ul v-if="factors.length" class="divide-y divide-default rounded-md border border-default">
      <li v-for="(factor, index) in factors" :key="factor.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <UIcon name="i-lucide-smartphone" class="size-5 shrink-0 text-muted" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">{{ t('settings.mfa.factorName', { n: index + 1 }) }}</p>
          <p class="text-xs text-muted">{{ t('settings.mfa.addedOn', { date: formatDate(factor.created_at) }) }}</p>
        </div>
        <template v-if="confirmingRemoval === factor.id">
          <p class="w-full text-sm">{{ t(factors.length === 1 ? 'settings.mfa.removeLastConfirm' : 'settings.mfa.removeConfirm') }}</p>
          <UButton :label="t('settings.mfa.remove')" color="error" size="sm" :loading="removing" @click="removeFactor(factor.id)" />
          <UButton :label="t('settings.mfa.cancel')" color="neutral" variant="ghost" size="sm" :disabled="removing" @click="confirmingRemoval = null" />
        </template>
        <UButton v-else :label="t('settings.mfa.remove')" color="neutral" variant="outline" size="sm" @click="confirmingRemoval = factor.id" />
      </li>
    </ul>

    <div v-if="pending" class="space-y-3 rounded-md border border-default p-3">
      <p class="text-sm">{{ t('settings.mfa.scan') }}</p>
      <!-- The QR code is black on transparent: a white plate keeps it readable in the dark theme. -->
      <img :src="pending.qrCode" :alt="t('settings.mfa.qrAlt')" width="180" height="180" class="size-45 rounded-md bg-white p-2">
      <div class="space-y-1">
        <p class="text-sm text-muted">{{ t('settings.mfa.secretLabel') }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <code class="rounded bg-elevated px-2 py-1 font-mono text-sm break-all" data-testid="totp-secret">{{ formatTotpSecret(pending.secret) }}</code>
          <UButton icon="i-lucide-copy" :label="t('settings.mfa.copySecret')" color="neutral" variant="ghost" size="sm" @click="copySecret" />
        </div>
      </div>
      <form class="space-y-3" @submit.prevent="confirmEnrolment">
        <UFormField :label="t('settings.mfa.firstCode')" :error="codeError || undefined">
          <UInput
            id="totp-enrol-code"
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="123456"
            :maxlength="9"
            class="w-40"
          />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton type="submit" :label="t('settings.mfa.confirm')" :loading="verifying" />
          <UButton :label="t('settings.mfa.cancel')" color="neutral" variant="ghost" :disabled="verifying" @click="cancelEnrolment" />
        </div>
      </form>
    </div>

    <template v-else-if="loaded && !loadError && factors.length < MAX_FACTORS">
      <p v-if="factors.length" class="text-sm text-muted">{{ t('settings.mfa.spareHint') }}</p>
      <UButton
        :label="factors.length ? t('settings.mfa.addSpare') : t('settings.mfa.enable')"
        :icon="factors.length ? 'i-lucide-plus' : 'i-lucide-shield-check'"
        :variant="factors.length ? 'outline' : 'solid'"
        :color="factors.length ? 'neutral' : 'primary'"
        :loading="starting"
        @click="startEnrolment"
      />
    </template>
    <p v-if="factors.length" class="text-sm text-muted">{{ t('settings.mfa.lostPhone') }}</p>
  </div>
</template>
