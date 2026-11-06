// Draws the Android launcher icons and launch screens from public/icon.svg: `npm run android:icons`.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const RES = 'android/app/src/main/res'
const icon = readFileSync('public/icon.svg', 'utf8')
const brand = icon.match(/<rect [^>]*fill="(#[0-9a-f]{6})"/i)[1]
const mark = icon.replace(/<rect [^>]*\/>/, '')
const round = icon.replace(/<rect [^>]*\/>/, `<circle cx="256" cy="256" r="256" fill="${brand}"/>`)

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

const png = (svg, size) => sharp(Buffer.from(svg), { density: 144 * size / 512 }).resize(size, size).png()

for (const [density, scale] of Object.entries(DENSITIES)) {
  const dir = `${RES}/mipmap-${density}`
  // Legacy icons (before Android 8): the whole rounded square, or a disc for the round one.
  await png(icon, 48 * scale).toFile(`${dir}/ic_launcher.png`)
  await png(round, 48 * scale).toFile(`${dir}/ic_launcher_round.png`)
  // Adaptive icon foreground: 108 dp, of which the launcher shows about 72 dp, and the mask keeps a 66 dp circle.
  // The mark is drawn at the size it has on the 72 dp tile, so it stays inside the safe zone.
  const size = 108 * scale
  const inner = Math.round(72 * scale)
  const pad = Math.floor((size - inner) / 2)
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await png(mark, inner).toBuffer(), left: pad, top: pad }])
    .png()
    .toFile(`${dir}/ic_launcher_foreground.png`)
}

// Adaptive icon background (Android 8+): the brand color behind the foreground.
writeFileSync(`${RES}/values/ic_launcher_background.xml`, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
  + `    <color name="ic_launcher_background">${brand.toUpperCase()}</color>\n</resources>\n`)

// Launch screens: the icon in the middle of a white screen, a quarter of its short side.
for (const dir of readdirSync(RES).filter(name => name.startsWith('drawable'))) {
  const file = `${RES}/${dir}/splash.png`
  if (!existsSync(file)) continue
  const { width, height } = await sharp(file).metadata()
  const side = Math.round(Math.min(width, height) / 4)
  await sharp({ create: { width, height, channels: 4, background: '#ffffff' } })
    .composite([{ input: await png(icon, side).toBuffer(), left: Math.round((width - side) / 2), top: Math.round((height - side) / 2) }])
    .png()
    .toFile(file)
}
