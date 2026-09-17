#!/usr/bin/env node
// Regenerates the Android launcher icons from the same brand mark the PWA uses,
// so the installed app and the web app look identical on a home screen.
//
//   node scripts/generate-android-icons.mjs
//
// `npx cap add android` scaffolds Capacitor's own placeholder logo and never
// replaces it, which is why the APK shipped with a blue X on it. Re-run this
// after changing public/pwa-512x512.png.
//
// sharp comes in with @vite-pwa/assets-generator (a devDependency), so this
// only runs after `npm install`.
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'

const SOURCE = 'public/pwa-512x512.png' // square, transparent background
const RES = 'android/app/src/main/res'

// Per-density pixel sizes. Legacy icons are 48dp, adaptive foregrounds 108dp.
const DENSITIES = [
  { dir: 'mdpi', legacy: 48, foreground: 108 },
  { dir: 'hdpi', legacy: 72, foreground: 162 },
  { dir: 'xhdpi', legacy: 96, foreground: 216 },
  { dir: 'xxhdpi', legacy: 144, foreground: 324 },
  { dir: 'xxxhdpi', legacy: 192, foreground: 432 },
]

// Android crops an adaptive icon to whatever mask the launcher fancies — circle,
// squircle, teardrop — and only the middle 66% is guaranteed to survive. Sitting
// well inside that keeps the mark whole on every phone.
const SAFE_ZONE = 0.56
const LEGACY_INSET = 0.8 // legacy icons aren't masked, so they can run larger
const BACKGROUND = '#FFFFFF' // matches ic_launcher_background.xml and the PWA icon

// Strip the transparent padding baked into the PWA asset so the framing here is
// ours rather than inherited.
const logo = await sharp(SOURCE).trim().toBuffer()
const { width, height } = await sharp(logo).metadata()
console.log(`Source mark: ${width}x${height} (trimmed from ${SOURCE})`)

function circleMask(size) {
  return Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  )
}

async function centred(size, scale, background) {
  const inner = Math.round(size * scale)
  const mark = await sharp(logo).resize(inner, inner, { fit: 'inside' }).toBuffer()
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer()
}

for (const { dir, legacy, foreground } of DENSITIES) {
  const out = `${RES}/mipmap-${dir}`
  await mkdir(out, { recursive: true })

  const square = await centred(legacy, LEGACY_INSET, BACKGROUND)
  await writeFile(`${out}/ic_launcher.png`, square)

  const round = await sharp(square)
    .composite([{ input: circleMask(legacy), blend: 'dest-in' }])
    .png()
    .toBuffer()
  await writeFile(`${out}/ic_launcher_round.png`, round)

  // Transparent: the adaptive icon's background comes from the colour resource.
  const fg = await centred(foreground, SAFE_ZONE, { r: 0, g: 0, b: 0, alpha: 0 })
  await writeFile(`${out}/ic_launcher_foreground.png`, fg)

  console.log(`${dir.padEnd(8)} legacy ${legacy}px, round ${legacy}px, foreground ${foreground}px`)
}

console.log('\nDone. Rebuild the APK for the new icon to reach a phone.')
