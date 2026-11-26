# Scan Bebas + Ekspor Spreadsheet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Menambah mode Scan Bebas yang mengumpulkan SN dan mengekspornya ke .xlsx/CSV/TSV, tanpa merusak mode Cocokkan.

**Architecture:** State v2 menyimpan dua sesi (`match`, `collect`) di satu key localStorage. Logika murni dipisah ke `assets/data.js`, penulis XLSX/ZIP ke `assets/xlsx.js`, CSV/TSV ke `assets/export.js`. `app.js` mengikat UI ke fungsi-fungsi itu; kamera tidak diubah selain daftar format.

**Tech Stack:** HTML/CSS/JS statis, ES modules, ZXing vendored, Web Worker, Node test runner manual.

**Spec:** `docs/superpowers/specs/2026-11-26-scan-bebas-design.md`

## Global Constraints

- Tanpa dependency runtime baru; situs tetap statis untuk GitHub Pages.
- Semua path relatif.
- UI dark mode yang ada dipertahankan; tanpa redesign.
- Kolom collect: `No, SN, Scan pertama, Scan terakhir, Jumlah`.
- CSV delimiter `;`, BOM UTF-8 saat unduh.
- Waktu lokal `YYYY-MM-DD HH:mm:ss`.
- Format barcode tambahan: CODE_93, ITF, CODABAR, EAN_8, UPC_A, UPC_E, AZTEC.

## Review Focus

- Barcode terbaca berulang dalam 1,5 detik tidak boleh menambah qty (cooldown).
- SN sama dengan spasi/kapitalisasi berbeda harus dianggap duplikat.
- Nama sheet/teks XML berisi `&`, `<`, kutip, atau karakter terlarang tidak boleh merusak file.
- Unduhan harus tetap bekerja saat `navigator.clipboard` tidak tersedia (fallback textarea).
- Sesi collect kosong tidak boleh membuat layar kamera tanpa data setelah reload.

---

### Task 1: State v2 + operasi collect

**Files:**
- Create: `assets/data.js`
- Test: `tests/data.test.mjs`

**Interfaces:**
- `emptyState() -> State`
- `normalizeState(parsed) -> State` (migrasi v1)
- `collectSummary(items) -> {unique, totalQty}`
- `addCollectScan(session, raw, nowIso) -> {session, status: 'new'|'dup'|'invalid', item?, index?}`
- `collectExportRows(items) -> Array<[number, string, string, string, number]>`
- `matchExportRows(items) -> Array<[number, string, string, string]>`

- [ ] Tulis `tests/data.test.mjs` (migrasi, new/dup/invalid, summary, rows).
- [ ] Jalankan `node tests/data.test.mjs`; pastikan gagal karena modul belum ada.
- [ ] Implementasikan `assets/data.js`.
- [ ] Jalankan ulang; semua lulus.

### Task 2: CSV/TSV + XLSX writer

**Files:**
- Create: `assets/export.js`, `assets/xlsx.js`
- Test: `tests/export.test.mjs`

**Interfaces:**
- `toCsv(headers, rows, delimiter=';') -> string`
- `toTsv(headers, rows) -> string`
- `stampForFilename(date) -> 'YYYYMMDD-HHMM'`
- `buildXlsx({sheetName, headers, rows, widths}) -> Uint8Array`
- `zipStore(entries) -> Uint8Array`

- [ ] Tulis tes: quoting CSV, TSV, signature ZIP `PK`, 6 entri, isi SN/header, qty numerik.
- [ ] Jalankan; pastikan gagal.
- [ ] Implementasikan kedua modul.
- [ ] Jalankan; lulus. Verifikasi file nyata dengan `unzip -t` + `openpyxl`.

### Task 3: Format barcode

**Files:**
- Modify: `assets/scan-core.js` (hints decoder)
- Modify: `assets/scan-worker.js` bila daftar format diduplikasi

- [ ] Tambah format; pastikan `tests/decode-node.js` tetap lulus.

### Task 4: Markup + gaya

**Files:**
- Modify: `index.html`
- Modify: `assets/styles.css`

- [ ] Tab mode di home, panel collect, tombol home kamera, tombol manual, modal edit, modal ekspor, tombol Excel di rekap.
- [ ] Gaya mengikuti token CSS yang ada; target sentuh ≥44px.

### Task 5: Wiring app

**Files:**
- Modify: `assets/app.js`

- [ ] Alias `store` + `state` per mode; migrasi saat load.
- [ ] Scan collect (new/dup), render list/progress, edit/hapus, manual, ekspor, reset per mode, tombol home.

### Task 6: Verifikasi

- [ ] `cd tests && npm test`
- [ ] E2E Playwright: buka app, pilih Scan bebas, scan via `__snc.scan`, edit, ekspor (cek unduhan), reload (sesi pulih).
- [ ] Buka file .xlsx hasil unduhan dengan `openpyxl`; cetak isi.
- [ ] Cek tidak ada error konsol.

### Task 7: Dokumentasi + deploy

- [ ] Update `README.md` + `HANDOFF.md`.
- [ ] Commit, push ke `main`, tunggu GitHub Pages, verifikasi URL live.
