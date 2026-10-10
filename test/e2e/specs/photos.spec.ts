import { storedPhotoFiles } from '../admin'
import { expect, routeAction, test, waitForMap } from '../fixtures'

test.use({ role: 'account' })

// A 1×1 PNG: the page converts it to WebP (or JPEG) before uploading it.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// Whether a signed-out visitor (publishable key only) can get a signed URL for a file, straight from the storage API.
async function visitorCanSign(path: string): Promise<boolean> {
  const response = await fetch(`${process.env.E2E_SUPABASE_URL}/storage/v1/object/sign/route-photos/${path}`, {
    method: 'POST',
    headers: { apikey: process.env.E2E_SUPABASE_PUBLIC_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  })
  return response.ok
}

test('adds, shows and deletes photos, and removes their files with the route', async ({ page, requestAs }) => {
  // Visible to the family until it is made private: far from France (FAR_AWAY).
  const route = { name: 'Parcours photos e2e', sport_type: 'hiking', is_public: true, coordinates: [[168.66, -45.03], [168.7, -45.01]] }
  const { id } = await (await page.request.post('/api/routes', { data: route })).json() as { id: string }
  await page.goto(`/routes/${id}`)
  await waitForMap(page)

  // The button reflects the change right away (it used to need a reload).
  await page.getByRole('button', { name: 'Sauvegarder' }).click()
  await expect(page.getByRole('button', { name: 'Sauvegardé' })).toBeVisible()

  await page.getByRole('tab', { name: /Photos/ }).click()
  const upload = () => page.getByLabel('Choisir des photos').setInputFiles({ name: 'sommet.png', mimeType: 'image/png', buffer: PNG_1PX })
  const photos = page.getByRole('region', { name: 'Photos' }).locator('img')
  await upload()
  await expect(photos).toHaveCount(1)
  // Served by the private bucket through a signed URL.
  await expect.poll(() => photos.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  const [file] = await storedPhotoFiles(id)

  // Other members see the photos of a route visible to the family. Signed-out visitors can't reach the files,
  // even through the storage API.
  const member = await requestAs('family')
  const asMember = await (await member.get(`/api/routes/${id}`)).json() as { photos: unknown[] }
  expect(asMember.photos).toHaveLength(1)
  expect(await visitorCanSign(`${id}/${file!.name}`)).toBe(false)

  // Once the route is private, other members don't see it any more.
  expect((await page.request.put(`/api/routes/${id}`, { data: { ...route, is_public: false } })).ok()).toBe(true)
  expect((await member.get(`/api/routes/${id}`)).status()).toBe(404)
  await page.reload()
  await waitForMap(page)

  await page.getByRole('button', { name: 'Agrandir la photo 1' }).click()
  await expect(page.getByRole('dialog', { name: 'Photo 1 sur 1' })).toBeVisible()
  await page.keyboard.press('Escape')

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Supprimer la photo 1' }).click()
  await expect(photos).toHaveCount(0)
  expect(await storedPhotoFiles(id)).toHaveLength(0)

  // Deleting the route also deletes the files of its photos.
  await upload()
  await expect(photos).toHaveCount(1)
  await routeAction(page, 'Supprimer le parcours')
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
  expect(await storedPhotoFiles(id)).toHaveLength(0)
})
