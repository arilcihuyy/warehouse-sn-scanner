## Warehouse SN Scanner v2.0.0 — Native Android

APK **native Android** (Java + ZXing). Bukan WebView, bukan TWA, tidak memuat halaman web. Aplikasi berjalan sepenuhnya di perangkat dan **tidak meminta izin INTERNET**.

### Fitur
- **Cocokkan**: impor daftar SN dari file `.txt/.csv` atau tempel teks, scan untuk menandai **Ketemu/Sisa** dengan progress.
- **Scan bebas**: scan kontinu, SN unik (duplikat ditolak), deteksi merk otomatis (`ZTE`, `Huawei`, `FiberHome`, `RCM`, `Lainnya`), override merk, cari, edit, hapus, tambah manual.
- **Ekspor Excel native**: `.xlsx` multi-sheet (**Ringkasan**, **Semua**, satu sheet per merk), plus CSV `;` + BOM dan salin TSV.
- Data disimpan di perangkat (`SharedPreferences`), tanpa server/akun.

### Instalasi
1. Unduh `warehouse-sn-scanner-v2.0.0-native.apk`.
2. Buka file APK; izinkan **install dari sumber tidak dikenal** untuk browser/file manager.
3. Buka **SN Scanner**; izinkan kamera saat diminta.

### Syarat
- Android **7.0+** (API 24).
- Kamera belakang.
- Tidak butuh Chrome dan tidak butuh internet.

### Verifikasi
- Package: `io.github.arilcihuyy.snscanner`
- Version: `2.0.0` (versionCode 2)
- Ukuran: ~4.3 MB
- SHA-256: `b0dc87eeb91d2110ad252f91c9462824ca1de22bf88d074f25e0799bf2c5624d`
- Sertifikat penandatangan (SHA-256): `81:A1:3E:5B:18:A3:72:D1:04:66:28:41:56:9A:62:7A:DB:2A:D8:A1:41:FC:4B:28:C5:B0:52:63:6E:B4:AE:14`

### Catatan upgrade
APK v2 memakai package dan signing key yang sama dengan v1, jadi bisa dipasang sebagai update. Namun data v1 (TWA) tersimpan di Chrome/localStorage dan **tidak ikut** ke storage native v2.

Source native: `native/` di repo ini.
