# Scan Bebas + Ekspor Spreadsheet — Design

Tanggal: 2026-11-26
Status: disetujui Aril (pilih file export, tanpa OAuth)

## Intent

Warehouse SN Scanner sekarang hanya bisa **mencocokkan** barcode dengan daftar SN yang diimpor. Aril ingin alat ini juga bekerja seperti scanner gudang sungguhan: scan barcode apa pun, kumpulkan SN-nya, lalu ekspor ke spreadsheet.

## Goals

- Mode kedua **Scan Bebas**: setiap barcode yang terbaca masuk daftar, tanpa perlu daftar target.
- Scan berulang menambah qty, bukan ditolak.
- Baris bisa diubah (SN/qty), dihapus, dan ditambah manual.
- Ekspor **.xlsx asli**, **CSV**, dan **salin TSV** (tempel langsung ke Excel/Google Sheets).
- Mode **Cocokkan** yang lama tetap utuh, termasuk rekap dan reset.
- Format barcode ditambah: CODE_93, ITF, CODABAR, EAN_8, UPC_A, UPC_E, AZTEC.

## Non-goals

- Google Sheets API/OAuth, backend, sinkronisasi cloud.
- Multi-user, login, database.
- Mengubah mekanisme kamera/ROI yang sudah terbukti.

## Anti-goals

- Menambah dependency runtime baru (tetap statis, aman untuk GitHub Pages).
- Memperlambat decode loop atau membuat UI kamera berkedip.

## Keputusan

- **Dua sesi terpisah** dalam satu localStorage: `match` dan `collect`. Pindah mode tidak menghapus sesi lain.
- **Tanpa library**: file .xlsx dibuat sendiri (ZIP store-only + XML SpreadsheetML). Library besar seperti SheetJS tidak diperlukan.
- **CSV delimiter `;`** + BOM UTF-8, supaya Excel locale Indonesia membuka kolom dengan benar.
- **Waktu lokal** ditulis `YYYY-MM-DD HH:mm:ss` sebagai teks, agar tidak bergeser timezone.
- Tombol **home** di layar kamera untuk kembali ke pemilihan mode tanpa menghapus sesi.

## Data model

```js
{
  version: 2,
  lastMode: 'match' | 'collect',
  match: null | {
    items: [{ sn, status: 'pending'|'found', scannedAt: iso|null }],
    createdAt, updatedAt
  },
  collect: null | {
    items: [{ sn, qty, firstAt, lastAt }],
    createdAt, updatedAt
  }
}
```

Migrasi: state v1 (`{items, createdAt}`) menjadi `match`, `collect: null`.

## Layar

1. **Home** — tab `Cocokkan` / `Scan bebas`.
   - Cocokkan: form impor seperti sekarang.
   - Scan bebas: kartu sesi (jumlah SN, total scan, waktu mulai) + tombol mulai/lanjut.
2. **Scan (match)** — tidak berubah.
3. **Scan (collect)** — kamera sama; panel bawah menampilkan jumlah tersimpan, pencarian, tombol `+` manual, daftar (SN, jam, qty), tombol Ekspor.
4. **Edit SN** — bottom sheet: SN, qty +/-, simpan, hapus.
5. **Ekspor** — ringkasan + unduh .xlsx / CSV / salin TSV / reset sesi.
6. **Rekap match** — tambah tombol Unduh Excel.

## Ekspor

Kolom collect: `No, SN, Scan pertama, Scan terakhir, Jumlah`.
Kolom match: `No, SN, Status, Waktu scan`.

- `.xlsx`: satu sheet, header bold, freeze baris atas, autofilter, lebar kolom, qty sebagai angka.
- `CSV`: delimiter `;`, quote bila perlu, BOM saat diunduh.
- `TSV`: untuk clipboard.

## Risiko

- Validitas XLSX buatan sendiri → diverifikasi dengan `openpyxl` dan `unzip -t`.
- Unduhan di iOS Safari → memakai Blob + `a[download]` (didukung iOS 13+).
- Sesi kosong tidak perlu dipertahankan setelah reload.
