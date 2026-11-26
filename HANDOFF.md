# Handoff — Warehouse SN Scanner

**Status:** aplikasi selesai. UI minimalis final, kamera sudah dioptimasi. Jangan redesign tanpa diminta.

- Path: `/home/ubuntu/warehouse-sn-scanner`
- Pemilik: Aril (`arilcihuyy` di GitHub)
- Stack: HTML/CSS/JS statis, ZXing vendored, Web Worker, localStorage
- Kamera: 1280×720, decode di `assets/scan-worker.js`, crop adaptif

## Update 26 Nov 2026 — Scan Bebas + ekspor spreadsheet

- Mode kedua **Scan Bebas**: kumpulkan SN apa pun, qty otomatis bertambah untuk duplikat, edit/hapus, input manual.
- **Merk otomatis + override**: prefix `ZTE`, `HWTC`/`48575443`, `FHTT`, `RCM` dikenali; chip merk dan dropdown edit bisa memaksa merk. Excel dikelompokkan per merk.
- Ekspor `.xlsx` asli: sheet **Ringkasan**, **Semua** (kolom Merk), dan satu sheet per merk. CSV (`;` + BOM) dan TSV juga menyertakan kolom Merk. Rekap mode Cocokkan tetap bisa unduh Excel.
- State v2 menyimpan sesi `match` + `collect` terpisah di `warehouse-sn-scanner/v2`; data v1 dimigrasikan otomatis.
- File baru: `assets/data.js`, `assets/export.js`, `assets/xlsx.js` (multi-sheet).
- Test baru: `tests/data.test.mjs`, `tests/export.test.mjs`, `tests/e2e-collect.mjs`, `tests/e2e-brands.mjs`.
- Format barcode ditambah: CODE_93, ITF, CODABAR, EAN_8, UPC_A, UPC_E, AZTEC.
- Verifikasi: 38 unit test lulus, E2E lama + collect + brands lulus, XLSX multi-sheet dibuka `openpyxl`, perf throttle 8× raf p95 39 ms.

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
