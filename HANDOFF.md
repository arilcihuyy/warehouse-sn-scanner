# Handoff — Warehouse SN Scanner

**Status:** aplikasi selesai. UI minimalis final, kamera sudah dioptimasi. Jangan redesign tanpa diminta.

- Path: `/home/ubuntu/warehouse-sn-scanner`
- Pemilik: Aril (`arilcihuyy` di GitHub)
- Stack: HTML/CSS/JS statis, ZXing vendored, Web Worker, localStorage
- Kamera: 1280×720, decode di `assets/scan-worker.js`, crop adaptif

## Update 26 Nov 2026 — Scan Bebas + ekspor spreadsheet

- Mode kedua **Scan Bebas**: kumpulkan SN apa pun; scan ulang ditolak (satu SN = satu baris), edit/hapus, input manual.
- **Merk otomatis + override**: prefix `ZTE`, `HWTC`/`48575443`, `FHTT`, `RCM` dikenali; chip merk dan dropdown edit bisa memaksa merk. Excel dikelompokkan per merk.
- Ekspor `.xlsx` asli: sheet **Ringkasan**, **Semua** (kolom Merk), dan satu sheet per merk. CSV (`;` + BOM) dan TSV juga menyertakan kolom Merk. Rekap mode Cocokkan tetap bisa unduh Excel.
- State v3 menyimpan sesi `match` + `collect` terpisah di `warehouse-sn-scanner/v2`; data v1/v2 dimigrasikan otomatis, qty lama dirapikan jadi 1.
- **Duplikat ditolak**: scan SN yang sudah ada tidak menambah baris/qty; hanya feedback kuning + beep. State v3 membersihkan qty lama >1 dari perilaku lama.
- File baru: `assets/data.js`, `assets/export.js`, `assets/xlsx.js` (multi-sheet).
- Test baru: `tests/data.test.mjs`, `tests/export.test.mjs`, `tests/e2e-collect.mjs`, `tests/e2e-brands.mjs`.
- Format barcode ditambah: CODE_93, ITF, CODABAR, EAN_8, UPC_A, UPC_E, AZTEC.
- Verifikasi: 39 unit test lulus, E2E lama + collect + brands lulus, XLSX multi-sheet dibuka `openpyxl`, perf throttle 8× raf p95 39 ms.

## Update 26 Nov 2026 — APK Android native v2.0.0

- APK **native Android** (Java + ZXing), bukan WebView/TWA. Tidak butuh Chrome/internet; `INTERNET` tidak diminta.
- Package `io.github.arilcihuyy.snscanner`, versionName `2.0.0` (versionCode 2), minSdk 24 (Android 7.0), targetSdk 36; APK ~4.3 MB.
- Fitur: Cocokkan (impor file/tempel, checklist sisa/ketemu), Scan bebas (SN unik, duplikat ditolak, merk auto/override, edit/hapus/tambah manual), ekspor XLSX multi-sheet + CSV + TSV.
- Source: `native/` di repo ini. `XlsxWriter` ditulis sendiri (tanpa Apache POI); file XLSX divalidasi dengan `openpyxl`.
- Keystore: `~/.android-keys/warehouse-sn-scanner.keystore` (alias `snscanner`, password di `warehouse-sn-scanner.txt`, mode 600). Sama dengan APK v1 supaya bisa update; jangan commit.
- Build: `cd native && ./gradlew assembleRelease` dengan env `SN_KEYSTORE/SN_STOREPASS/SN_KEYALIAS/SN_KEYPASS`.
- Verifikasi: 10 unit test lulus, `apksigner` v2 valid (fingerprint `81:A1:...:AE:14`), package/launchable activity dicek via `aapt`, dua file XLSX dibuka `openpyxl`. Belum diuji install di perangkat fisik.
- Rilis v1.0.0 (TWA) tetap ada sebagai arsip; **gunakan v2.0.0 native**.

## Update 26 Nov 2026 — Redesign UI (Paper & Signal)

- Shell terang warm-paper untuk home/modal, mode scan gelap imersif; aksen vermilion.
- Font vendored: Instrument Sans + JetBrains Mono (`assets/fonts/`, OFL). Ikon PWA diperbarui.
- Mobile-first: hero ringkas, kartu sesi, bottom sheet scan, safe-area, target sentuh besar, layout khusus layar pendek (375×667 tetap memuat CTA). Kamera tetap **42dvh** dengan strip scan tipis **84% × 26%** seperti desain awal.
- Efek blur di atas live camera dan animasi scan-line dihapus untuk menjaga performa.
- Desktop: home dua kolom; scan dua kolom (kamera kiri, daftar kanan).
- Semua ID, fitur, business logic, state, merk, dan ekspor dipertahankan. Satu-satunya tambahan JS: `#sheet-sub` text + theme-color dinamis.
- Verifikasi: 39 unit test, E2E lama + collect + brands lulus, tidak ada console error; preview README diperbarui. Perf throttle 8×: raf p95 ~36 ms, worker p95 ~2,7 ms.

## Status deploy — SELESAI (25 Nov 2026)

Live di **https://arilcihuyy.github.io/warehouse-sn-scanner/** (HTTP 200, `<title>Warehouse SN Scanner</title>`, assets `scan-worker.js` ikut ter-deploy).

- Repo: `arilcihuyy/warehouse-sn-scanner` (publik), branch `main`, commit pertama `3b7e6de`
- Pages: source `main` / root, `build_type: legacy`, HTTPS enforced, status `built`
- Auth: OAuth device flow (client id gh CLI, scope `repo`). Token baru sudah menggantikan `GITHUB_TOKEN` lama di `~/.hermes/.env` + `~/.git-credentials` (helper `store`), jadi `git push` berikutnya tidak perlu auth ulang.
- Verifikasi: hash file live == file lokal (index.html, app.js, styles.css, zxing.min.js); parse SN 4 entri OK; jalur kamera-gagal tampil rapi (tidak crash).

Kalau perlu update: commit ke `main`, `git push`, Pages rebuild otomatis (~40 detik).

## Riwayat tujuan sesi sebelumnya

Push ke **GitHub Pages** supaya tidak bergantung server lokal.

- Repo publik: `arilcihuyy/warehouse-sn-scanner`
- URL target: `https://arilcihuyy.github.io/warehouse-sn-scanner/`
- Upload: `index.html`, `manifest.json`, `assets/`, `README.md`
- Jangan upload: `tests/node_modules/`, `tests/fixtures/scan.y4m`, screenshot test
- Pages: branch `main`, folder `/ (root)`

## Auth GitHub

Token `GITHUB_TOKEN` di `~/.hermes/.env` (prefix `ghp_`) sudah **expired** — `GET /user` mengembalikan `401 Bad credentials`.

- Jangan minta user paste token di chat.
- Load skill `github-auth`, pakai **OAuth device flow** (client ID gh CLI dari skill), minta user authorize di `https://github.com/login/device`.
- Simpan token baru dengan aman; jangan commit.
- `gh` CLI tidak terpasang. Pakai `curl` + `git`.
- Scope minimal `repo`; Pages API biasanya cukup dengan scope itu.

## Langkah deploy

1. Cek/init git di folder, commit semua file ke branch `main`.
2. Auth device flow.
3. Buat repo publik `arilcihuyy/warehouse-sn-scanner` via API (kalau belum ada), push.
4. Aktifkan Pages:
   - `POST /repos/arilcihuyy/warehouse-sn-scanner/pages` dengan source `{ branch: "main", path: "/" }`
   - Kalau 409, pakai `PUT` untuk update.
5. Tunggu build, lalu verifikasi:
   - `https://arilcihuyy.github.io/warehouse-sn-scanner/` → 200
   - `<title>Warehouse SN Scanner</title>`
   - `assets/scan-worker.js` → 200
6. Kirim link ke Aril dan ingatkan: origin baru = localStorage baru, jadi daftar SN perlu diimpor ulang.

## Catatan teknis

- Semua path relatif; aman di subpath `/warehouse-sn-scanner/`.
- `assets/scan-worker.js` wajib ikut ter-deploy (bukan opsional).
- Kamera butuh HTTPS; GitHub Pages sudah HTTPS.
- UI final: dark netral, tombol putih, frame scan garis tipis, tanpa glow/blur.
- Tes ada di `tests/` (opsional). E2E butuh Playwright + ffmpeg; jangan upload `node_modules`.
- Jangan jalankan tunnel lokal kecuali untuk preview sementara.
