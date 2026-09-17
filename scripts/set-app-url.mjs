#!/usr/bin/env node
// Switches the Android shell between its two modes, by rewriting the `server`
// block in capacitor.config.json before `npx cap sync` bakes it into the APK.
//
//   node scripts/set-app-url.mjs https://example.vercel.app
//       The APK is a thin native shell around the live site. Every push to
//       GitHub → Vercel deploy is live in the app on next launch, no reinstall.
//       A new APK is only needed when native code changes (permissions,
//       plugins, app icon).
//
//   node scripts/set-app-url.mjs --offline
//       The web app is bundled inside the APK instead. Works with no network
//       at all, but every web change then needs a fresh APK on every phone.
//
// Either way the native plugins (background GPS, permissions) are part of the
// APK — the bridge is injected into the remote page, so they work the same.
import { readFile, writeFile } from 'node:fs/promises'

const CONFIG = new URL('../capacitor.config.json', import.meta.url)
const arg = process.argv[2]

if (!arg) {
  console.error('Usage: node scripts/set-app-url.mjs <https://your-site> | --offline')
  process.exit(1)
}

const config = JSON.parse(await readFile(CONFIG, 'utf8'))

if (arg === '--offline') {
  delete config.server
  console.log('Android shell will bundle the web app (offline-capable, manual updates).')
} else {
  const url = arg.replace(/\/+$/, '')
  if (!/^https:\/\//.test(url)) {
    // Android blocks cleartext by default, and the WebView needs a secure
    // origin for geolocation and service workers regardless.
    console.error(`Refusing "${url}" — the app URL must be https://`)
    process.exit(1)
  }
  config.server = { url, androidScheme: 'https' }
  console.log(`Android shell will load ${url} (auto-updates with each Vercel deploy).`)
}

await writeFile(CONFIG, JSON.stringify(config, null, 2) + '\n')
