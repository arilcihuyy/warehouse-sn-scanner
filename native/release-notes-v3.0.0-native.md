## Warehouse SN Scanner v3.0.0 — Native Android

Versi native terbaru, bukan sekadar update kecil dari v2.x. Tampilan beranda dirapikan mengikuti pengalaman web terbaru: sapaan yang diketik ulang, tombol cari di pojok kanan atas, animasi masuk dan idle pada kartu, transisi halaman, serta area scanner persegi panjang.

### Yang baru
- **Typewriter greeting** di beranda: “Halo, / Mau scan apa hari ini?”, lalu berganti ke variasi lain secara bergantian.
- **Tombol cari di kanan atas**: langsung membuka daftar scan bebas dengan kolom pencarian aktif dan keyboard muncul.
- **Animasi beranda**: kartu masuk dengan stagger, lalu mengambang pelan; transisi halaman memakai fade.
- **Scanner frame persegi panjang**: area bidik ±84% lebar layar, tinggi 70–104 dp; bukan framing kotak default ZXing.
- Menghormati pengaturan animasi sistem: bila animasi dimatikan, sapaan langsung tampil dan kartu tidak bergerak.
- Versi footer sekarang mengikuti versi aplikasi secara otomatis.
- Semua fitur lama tetap: Cocokkan, Scan Bebas dengan SN unik, merk otomatis/override, edit/hapus/tambah manual, impor daftar, ekspor XLSX/CSV/TSV, penyimpanan lokal.

### Instalasi
1. Unduh `warehouse-sn-scanner-v3.0.0-native.apk`.
2. Pasang di atas v2.x; package dan signing key sama, jadi data aplikasi tetap.
3. Jika diminta, izinkan install dari sumber tidak dikenal.

### Syarat
- Android 7.0+ (API 24)
- Kamera belakang
- Tanpa internet, tanpa akun, tanpa WebView

### Verifikasi
- Package: `io.github.arilcihuyy.snscanner`
- Version: `3.0.0` (versionCode 4)
- Ukuran: 4,486,025 byte (~4.3 MB)
- SHA-256: `56f81cb87b7c647bafc4cec1c83f0c74de0ccf4ba35bebf26f8394fec8e6d880`
- Sertifikat SHA-256: `81:A1:3E:5B:18:A3:72:D1:04:66:28:41:56:9A:62:7A:DB:2A:D8:A1:41:FC:4B:28:C5:B0:52:63:6E:B4:AE:14`
- Signature: APK Signature Scheme v2
- Build: `test`, `lintRelease`, `assembleRelease` lulus

### Catatan
- v2.1.0, v2.0.0, dan v1.0.0 tetap tersimpan sebagai arsip; v3.0.0 adalah rilis terbaru.
- UI native tetap Java/XML, bukan WebView; animasi web tidak dijalankan lewat browser.
