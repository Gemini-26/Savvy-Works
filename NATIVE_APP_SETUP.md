# The Android app — background GPS while the phone is locked

The website (and the "install to home screen" PWA version of it) **cannot**
track location once the phone locks or the technician switches apps. No website
can; browsers suspend the tab. This Android app exists purely to get past that:
it is a thin native shell around the same web app, with a native GPS service
that keeps running when the app is off screen.

> The PWA you install from the browser and this APK are two different things.
> The PWA looks like an app on the home screen but is still a browser tab
> underneath, so background tracking does not work there no matter what
> permissions are granted.

## Two ways the APK can work

Controlled by the `server` block in `capacitor.config.json`, which
`scripts/set-app-url.mjs` writes for you.

**Live (recommended, and what this is set up for)** — the APK loads the site
from Vercel. Push to GitHub → Vercel deploys → the change is in the app the
next time it is opened. Nobody reinstalls anything.

```bash
node scripts/set-app-url.mjs https://your-site.vercel.app
```

**Offline** — the web app is bundled inside the APK. Works with no network at
all, but every web change then needs a new APK installed on every phone.

```bash
node scripts/set-app-url.mjs --offline
```

Either way the native parts (background GPS, the permissions plugin) are
compiled into the APK. In live mode Capacitor injects its bridge into the
remote page, so the plugins work exactly the same.

**A new APK is only needed when native code changes** — permissions, Capacitor
plugins, app name/icon. Everything under `src/` rides on the Vercel deploy.

Note for live mode: the app's service worker caches the site on first launch,
so a later launch with no signal still works. The very first launch after
install does need a connection.

## Building an APK

This dev machine has no Java and no Android SDK, so the build runs in GitHub
Actions instead ([.github/workflows/android-apk.yml](.github/workflows/android-apk.yml)).

1. GitHub → **Actions** → **Build Android APK** → **Run workflow**.
2. Optionally fill in the site URL (blank keeps whatever is committed in
   `capacitor.config.json`; `offline` bundles the web app instead).
3. When it finishes, the APK is attached to a new **Release** — open that
   release page on the phone and tap the `.apk` to install. Android will ask
   permission to install from that source the first time.

The workflow caches the debug signing key, so each build installs on top of the
previous one instead of making you uninstall first, and bumps `versionCode` per
run so Android does not see it as a downgrade.

### If you would rather build locally

Needs Android Studio (which brings the SDK) plus a JDK 21:

```bash
npm run android:sync   # vite build + npx cap sync android
npm run android:open   # opens Android Studio, then press Run
```

## After installing — this part matters

Open the app → **Profile** → **Background Access**. Nothing tracks through a
locked screen until that panel is all green. It covers:

| What | Why it is needed |
| --- | --- |
| Location while using the app | The basic GPS grant. |
| **Location all the time** | Android's "Allow all the time". Without it, tracking dies the moment the screen locks. It is a *separate second* grant and Android 11+ usually only offers it from the app's own settings page — the panel walks you there. |
| Notifications | The ongoing "on shift" notification. Android hides it without this, and kills the service along with it. |
| Unrestricted battery use | Stops the battery saver freezing the app mid-shift. |

The panel also shows manufacturer-specific instructions on Samsung, Xiaomi,
Huawei, Oppo, Vivo and OnePlus, which all add their own app-killer on top of
stock Android — the battery exemption alone is not enough on those.

The "Allow all the time" request is deliberately gated behind a disclosure
screen ([BackgroundLocationDisclosure.jsx](src/shared/components/BackgroundLocationDisclosure.jsx))
explaining what is collected and when. That is a Google Play requirement and the
usual reason background-location apps get rejected — do not remove it or move
the request out from behind it.

### Testing that it actually works

Install, clock in, switch **Share my location** on in the clock bubble, grant
everything in Background Access, then lock the phone and put it in a pocket for
a drive. On the Live Users map the dot should keep moving. The ongoing
notification staying in the shade is the sign the service is alive.

## How the pieces fit

| File | Role |
| --- | --- |
| [AppPermissionsPlugin.java](android/app/src/main/java/com/savvycivils/works/AppPermissionsPlugin.java) | Custom Capacitor plugin: checks/requests every permission, opens the right settings screens, re-broadcasts state on resume. |
| [AndroidManifest.xml](android/app/src/main/AndroidManifest.xml) | Declares them. Android silently denies anything not declared here. |
| [nativePermissions.js](src/shared/services/nativePermissions.js) | JS wrapper; no-ops in a browser tab. |
| [useAppPermissions.js](src/hooks/useAppPermissions.js) | Hook: live status, request actions, OEM hints. |
| [BackgroundAccessCard.jsx](src/shared/components/BackgroundAccessCard.jsx) | The Profile panel. Renders nothing on the web. |
| [nativeBackgroundLocation.js](src/shared/services/nativeBackgroundLocation.js) | Wraps `@capacitor-community/background-geolocation`. |
| [useLocationTracking.js](src/hooks/useLocationTracking.js) | Branches native vs browser; throttles writes to one per 45s and retries a fix that failed to send. |

`android.useLegacyBridge: true` in `capacitor.config.json` is required by the
geolocation plugin — without it Android silently stops location updates after
about five minutes in the background.

## Still outstanding

- **Release signing.** Builds are debug-signed (fine for installing directly,
  not acceptable for the Play Store, and the APK is marked debuggable). A Play
  release needs a proper keystore in GitHub secrets and a `signingConfigs`
  block.
- **Play Store listing.** Apps requesting `ACCESS_BACKGROUND_LOCATION` get extra
  review: privacy policy page, the prominent-disclosure screen (done), and a
  justification form. `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is also restricted
  on Play — drop that line from the manifest if it becomes a problem, and the
  plugin falls back to the battery-settings deep link.
- **Restart after reboot.** If a phone reboots mid-shift, the technician has to
  reopen the app; nothing re-arms tracking on boot yet.
- **Links off the site open in the phone's browser**, since only the app's own
  origin is allowed to navigate inside the shell. That includes the PayFast
  checkout redirect. Fine for technicians; if admins ever need to pay from
  inside the app, add `"allowNavigation": ["*.payfast.co.za"]` to the `server`
  block.
- **iOS.** Not scaffolded. Needs a Mac with Xcode plus Apple's own background
  location review.
- **Battery tuning.** `distanceFilter` is 30 m. Worth revisiting once there is
  real battery data from technicians' phones.
