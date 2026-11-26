# SN Scanner — Android native

Native Android app (Java) for the Warehouse SN Scanner. No WebView, no TWA, no internet permission. Camera decoding uses ZXing; XLSX is written by the local `XlsxWriter`.

## Features

- **Cocokkan**: import a `.txt/.csv` list or paste SNs, then scan to mark found/remaining.
- **Scan bebas**: continuous scanning, unique SNs, duplicate rejection, brand auto-detection/override, search, edit/delete/manual add.
- **Export**: multi-sheet `.xlsx` (Ringkasan, Semua, per brand), CSV (`;` + BOM), copy TSV. Uses the Android document picker, so no storage permission is needed on modern Android.
- State is stored in `SharedPreferences` as JSON on the device.

## Build

Requirements: JDK 17, Android SDK 36, build-tools 36.1.0.

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=$HOME/android-sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME

# Signing values are read from the environment; never commit them.
export SN_KEYSTORE=$HOME/.android-keys/warehouse-sn-scanner.keystore
export SN_KEYALIAS=snscanner
export SN_STOREPASS=...
export SN_KEYPASS=...

./gradlew test          # pure-Java unit tests
./gradlew assembleRelease
# app/build/outputs/apk/release/app-release.apk
```

The release APK uses `applicationId io.github.arilcihuyy.snscanner`, versionCode 2, versionName 2.0.0, minSdk 24, targetSdk 36. Keep the keystore safe; future updates must be signed with the same key.

## Release

Rename the signed APK to `warehouse-sn-scanner-v2.0.0-native.apk` and attach it to the GitHub release. Verify with:

```bash
apksigner verify --print-certs app-release.apk
aapt dump badging app-release.apk
```
