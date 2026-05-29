# Build RoadSoS as an Android App

Two paths — use whichever fits your goal.

---

## Path A: Install as PWA (no build, 30 seconds, no PC needed)

This is the fastest way to get the app on an Android phone.

1. **Run the backend** on a machine on the same WiFi as your phone (or deploy to a public URL):
   ```bat
   cd roadsos
   run.bat
   ```

2. **On the Android phone**:
   - Find your PC's local IP: in PowerShell run `ipconfig` → IPv4 Address (e.g. `192.168.1.42`).
   - Open Chrome on the phone, go to `http://192.168.1.42:8000`.
   - Chrome will show "**Install RoadSoS**" banner (and the in-app blue install banner).
   - Tap **Install** → app icon appears on home screen.
   - Open it — full-screen, looks/works exactly like a native app.

3. **All sensors work**: GPS, accelerometer, camera, microphone, vibration, speech.

4. **For public access** (no WiFi needed), deploy the FastAPI backend to a free tier of [Render](https://render.com) / [Railway](https://railway.app) / [Fly.io](https://fly.io). Then visit the public URL from any Android phone worldwide.

---

## Path B: Real APK with Capacitor (1-time setup, then `npm run android:build`)

Generate a proper `.apk` you can install directly or upload to the Play Store.

### One-time setup

**Install prerequisites on your PC:**
- [Node.js LTS](https://nodejs.org) (≥ 18)
- [Android Studio](https://developer.android.com/studio) → during install, accept the Android SDK download
- Set `ANDROID_HOME` env-var to the SDK path (Android Studio shows it in Settings → Languages → Android SDK)
- [JDK 17](https://adoptium.net/) (Android Studio bundles one; pick that path for `JAVA_HOME`)

**Inside the `roadsos` folder:**
```bat
npm install                          :: installs Capacitor + plugins
npm run android:init                 :: creates ./android/ project (only once)
npm run android:sync                 :: copies static/ → android/
```

### Edit the API URL (one-time)

By default the app loads itself from a server. For an offline-runs-anywhere APK, point it to a deployed FastAPI backend. Edit `static/js/app.js` at the top:

```js
const API = '';  // change to e.g. 'https://roadsos.onrender.com'
```

Then re-sync: `npm run android:sync`.

### Build & run

```bat
:: Plug in an Android phone (USB debugging on) OR start an emulator from Android Studio.
npm run android:run
```

This compiles, installs, and launches the APK on the device.

To produce a distributable APK:

```bat
npm run android:build
:: APK at android/app/build/outputs/apk/debug/app-debug.apk
```

For a signed release APK (for Play Store):

```bat
:: Generate keystore once:
keytool -genkeypair -v -keystore roadsos.keystore -keyalg RSA -keysize 2048 -validity 10000 -alias roadsos

:: Then in android/app/build.gradle, add a signingConfigs.release block pointing to the keystore.
npm run android:build-release
:: APK at android/app/build/outputs/apk/release/app-release.apk
```

### Open in Android Studio (for tweaking)

```bat
npm run android:open
```

This launches Android Studio with the project so you can change package name, icons, splash screen, permissions, etc.

---

## Required Android permissions

These are auto-added by the Capacitor plugins in `package.json`:

| Permission                  | Why                                    | Plugin                  |
|-----------------------------|----------------------------------------|-------------------------|
| `ACCESS_FINE_LOCATION`      | GPS for emergency location             | `@capacitor/geolocation`|
| `ACCESS_BACKGROUND_LOCATION`| Keep tracking during navigation        | `@capacitor/geolocation`|
| `INTERNET`                  | OSM, routing, AI chat                  | core                    |
| `ACCESS_NETWORK_STATE`      | Detect offline → SMS-Bridge fallback   | `@capacitor/network`    |
| `VIBRATE`                   | Crash alarm, night beacon              | core                    |
| `CAMERA`                    | Scene-analysis photo                   | core                    |
| `RECORD_AUDIO`              | Voice input for AI chat                | core                    |
| `SEND_SMS`                  | Native SMS-Bridge (Blueprint §6.A)     | (manual, see below)     |

To enable `SEND_SMS`, after `npm run android:init` add this to `android/app/src/main/AndroidManifest.xml` inside the `<manifest>` tag:

```xml
<uses-permission android:name="android.permission.SEND_SMS"/>
```

The existing `fireSmsBridge()` JS uses `sms:` URI which works without that permission — but with it, you can send silently in the background.

---

## App-Store-ready Capacitor app

The scaffolding in `package.json` and `capacitor.config.json` is already production-ready:

- **App ID**: `in.roadsos.app`
- **App Name**: RoadSoS
- **Splash screen**: Red brand colour, 1.2 s
- **Status bar**: Matches brand red
- **Icons**: Generated in `static/icons/` (192/512 maskable for adaptive icons)

To change the package name (e.g. for your team), edit `appId` in `capacitor.config.json` BEFORE running `android:init`.

---

## Why this design works for the Blueprint

The Blueprint mandates:

| Requirement                              | How the Android build delivers     |
|------------------------------------------|------------------------------------|
| Native GPS / accelerometer access        | `@capacitor/geolocation`, `@capacitor/motion` plugins |
| Offline regional cache                   | Service-Worker `roadsos-v9` (tiles, routes, geocoding) |
| Native SMS-Bridge when data is dead      | `sms:` URI (works) or `SEND_SMS` permission (silent) |
| Camera flash / screen strobe (Night Beacon) | `getUserMedia` torch + WakeLock work in Capacitor WebView |
| Background crash detection               | DeviceMotion API is exposed to the WebView |
| Country-aware emergency numbers          | `@capacitor/device` exposes `localeTag` + ISO country |

You get a real APK without rewriting any of the existing JS — Capacitor wraps the same web app you already have.
