# SN Scanner v4.0.1 — native parity update

Tanggal: 2026-11-27
Package: `io.github.arilcihuyy.snscanner`
versionCode: 6
versionName: 4.0.1

## Perubahan utama

- **Multi-sesi** untuk Scan Bebas dan Cocokkan Daftar: buat, ganti nama, pindah, kosongkan, hapus.
- **Home native**: kartu Scan besar, Inventaris dan Manual sejajar, kartu sesi aktif, bantuan kiri atas, profil + pencarian kanan atas, typewriter greeting, animasi masuk halus.
- **Inventaris gabungan**: pencarian SN/nama/merk, filter Semua/Duplikat/Hari ini, filter kategori, urutan terbaru/terlama, muat lebih banyak, detail item, edit/hapus.
- **Profil/Pengaturan**: suara scan dan getar, info penyimpanan lokal.
- **Bantuan**: panduan singkat di dalam aplikasi.
- **Impor XLSX** selain TXT/CSV/TSV, termasuk varian header `S/N`, `Nomor SN`, `Kode SN`, `Kode Barang`, `Barcode`, `SN Perangkat`.
- **Ekspor mengikuti web**: Scan Bebas memakai satu sheet `Rekap` (kolom per merk + baris `jumlah`); Cocokkan memakai `Ringkasan`, `Inventory`, dan `Tidak Cocok`. Prompt nama file Excel sebelum menyimpan.
- **Penghitung duplikat** di kartu sesi dan rekap.
- **Scan dari gambar** (galeri) dengan percobaan empat orientasi.
- **Migrasi data lama**: snapshot native v1 (`match`/`collect`) otomatis menjadi sesi `Scan Bebas (dipulihkan)` dan `Cocokkan Daftar (dipulihkan)`; snapshot asli disimpan di `state_v1_backup`.

## Perbaikan layout v4.0.1

Versi 4.0.0 memakai tiga kartu fan dengan rotasi dan overlap agar mirip web. Versi 4.0.1 menggantinya dengan susunan native: satu CTA Scan besar dan dua kartu sekunder sejajar, tanpa rotasi/overlap dan tanpa float terus-menerus.

## Yang tetap

- Native Java/XML, tanpa WebView/TWA, tanpa izin INTERNET.
- Kamera ZXing native dengan frame persegi panjang.
- Package dan signing key sama, sehingga update tidak menghapus data lama.
- Penyimpanan lokal di `SharedPreferences`.
