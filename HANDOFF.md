# Handoff — Warehouse SN Scanner

**Status:** aplikasi selesai. UI minimalis final, kamera sudah dioptimasi. Jangan redesign tanpa diminta.

- Path: `/home/ubuntu/warehouse-sn-scanner`
- Pemilik: Aril (`arilcihuyy` di GitHub)
- Stack: HTML/CSS/JS statis, ZXing vendored, Web Worker, localStorage
- Kamera: 1280×720, decode di `assets/scan-worker.js`, crop adaptif

## Tujuan sesi berikutnya

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
