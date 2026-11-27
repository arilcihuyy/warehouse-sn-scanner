## Warehouse SN Scanner v2.1.0 — Native Android

Update native Android untuk StockScan. Versi ini memperbaiki bentuk area scan yang sebelumnya terlalu kotak; sekarang berupa strip persegi panjang tipis yang lebih mudah diarahkan ke barcode/QR.

### Perubahan
- **Scanner frame persegi panjang**: area bidik sekarang ±84% lebar layar dengan tinggi sekitar 11% layar (dibatasi 70–104 dp), bukan kotak default library.
- APK tetap **native Java + ZXing**, bukan WebView/TWA, dan tetap tidak meminta izin `INTERNET`.
- Fitur lama dipertahankan: Cocokkan, Scan Bebas dengan SN unik/duplikat ditolak, merk otomatis/override, edit/hapus/tambah manual, ekspor XLSX/CSV/TSV, dan penyimpanan lokal.
- Package dan signing key sama dengan v2.0.0, jadi bisa dipasang sebagai update tanpa menghapus data aplikasi.

### Instalasi
1. Unduh `warehouse-sn-scanner-v2.1.0-native.apk`.
2. Buka APK; izinkan **install dari sumber tidak dikenal** bila diminta.
3. Pasang di atas v2.0.0; data lama tetap ada.

### Syarat
- Android **7.0+** (API 24).
- Kamera belakang.
- Tidak butuh Chrome dan tidak butuh internet.

### Verifikasi
- Package: `io.github.arilcihuyy.snscanner`
- Version: `2.1.0` (versionCode 3)
- Ukuran: 4,483,397 byte (~4.3 MB)
- SHA-256: `5df2035f21bead5af615645ba1b6c93732742a27a2d9b96b2945062f31e2e6e8`
- Sertifikat penandatangan (SHA-256): `81:A1:3E:5B:18:A3:72:D1:04:66:28:41:56:9A:62:7A:DB:2A:D8:A1:41:FC:4B:28:C5:B0:52:63:6E:B4:AE:14`
- Signature scheme: APK Signature Scheme v2

### Catatan
- Versi **v2.0.0** dan **v1.0.0** tetap tersimpan sebagai release/arsip; v2.1.0 adalah update terpisah.
- Fitur animasi dan penataan tombol khusus web tidak termasuk dalam APK native karena APK memakai UI Java yang terpisah.
