import { expect, test, waitForHydration } from '../fixtures'

// Download of the Android app from the settings (#337): offered in Android browsers only, linking to the APK of the
// latest GitHub Release. Hidden in the app itself too (isNativeApp), which a browser can't play.
test.use({ role: 'account' })

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

test.describe('in an Android browser', () => {
  test.use({ userAgent: ANDROID_UA })

  test('the settings offer the APK of the latest release', async ({ page }) => {
    await page.goto('/settings#android-app')
    await waitForHydration(page)
    const section = page.getByRole('region', { name: 'Appli Android' })
    await expect(section).toBeVisible()
    await expect(section.getByRole('link', { name: 'Télécharger l\'appli Android' }))
      .toHaveAttribute('href', 'https://github.com/clementdhs/sport-map/releases/latest/download/sportmap.apk')
    await expect(section).toContainText('autoriser l\'installation')
    // A shared link reaches the section, although it only appears once the page is mounted.
    await expect(page.getByRole('navigation', { name: 'Sections des paramètres' }).getByRole('link', { name: 'Appli Android' }))
      .toHaveAttribute('aria-current', 'location')
    await expect(section).toBeInViewport()
  })
})

test.describe('on an iPhone', () => {
  test.use({ userAgent: IPHONE_UA })

  test('the settings offer no APK', async ({ page }) => {
    await page.goto('/settings')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: 'Guidage vocal' })).toBeVisible()
    await expect(page.getByTestId('android-download')).toHaveCount(0)
  })
})

test('on a computer, the settings offer no APK', async ({ page }) => {
  await page.goto('/settings')
  await waitForHydration(page)
  await expect(page.getByRole('heading', { name: 'Guidage vocal' })).toBeVisible()
  await expect(page.getByTestId('android-download')).toHaveCount(0)
})
