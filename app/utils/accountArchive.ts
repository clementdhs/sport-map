import type { AccountExport } from '#shared/types/account'

// Zips the data export in the browser, with the photos downloaded from their signed URLs, and saves it.
export async function downloadAccountArchive(data: AccountExport) {
  const { strToU8, zipSync } = await import('fflate')
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {}
  for (const file of data.files) entries[file.path] = strToU8(file.content)
  for (const photo of data.photos) {
    const response = await fetch(photo.url)
    if (!response.ok) throw new Error(`Photo indisponible : ${photo.path}`)
    // Already compressed (WebP or JPEG): stored as is.
    entries[photo.path] = [new Uint8Array(await response.arrayBuffer()), { level: 0 }]
  }

  const archive = zipSync(entries)
  const url = URL.createObjectURL(new Blob([archive as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `sportmap-${data.username}-${new Date().toISOString().slice(0, 10)}.zip`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
