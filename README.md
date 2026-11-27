# StockScan - Inventory Scanner

Aplikasi pemindai barcode, QR, dan nomor seri **mobile-first** untuk operasional gudang. Tersedia dalam dua implementasi di repo ini: **web app** (HTML/CSS/JS, PWA) dan **APK Android native** (Java + ZXing). Keduanya bekerja sepenuhnya di perangkat - tanpa backend, akun, atau sinkronisasi cloud.

![Tampilan scanner](docs/preview.png)

## Fitur utama

- **Beranda** dengan ilustrasi scanning, tiga aksi cepat (`Mulai Scan`, `Input Manual`, `Scan dari Gambar`), statistik hari ini, dan riwayat terbaru.
- **Dua mode**: `Scan Bebas` (kumpulkan barcode apa pun) dan `Cocokkan Daftar` (impor daftar SN lalu tandai yang ketemu / sisa / tidak cocok).
- **Scan Bebas unik**: satu SN = satu baris. Scan ulang hanya memberi peringatan "Duplikat"; tidak menambah baris, qty, atau `scanCount`.
- **Kamera asli** (kamera belakang by default): permission handling, senter, ganti kamera, pause/resume, scan dari gambar, cooldown duplikat, beep + getar, dan penanganan error yang jelas. Decode berjalan di **Web Worker** dengan crop adaptif.
- **Format**: `CODE_128`, `CODE_93`, `CODE_39`, `ITF`, `CODABAR`, `EAN_13`, `EAN_8`, `UPC_A`, `UPC_E`, `QR_CODE`, `DATA_MATRIX`, `AZTEC`.
- **Detail item**: nama produk, merk, kategori, jumlah, lokasi/rak, catatan, format, timestamp - bisa dibuat manual bila barcode belum dikenal.
- **Inventaris**: pencarian SN/nama/merk, filter kategori/duplikat/hari ini, pengurutan, edit, hapus dengan konfirmasi, dan render inkremental.
- **Manajemen sesi**: buat, lanjutkan, rename, ekspor, kosongkan, dan hapus sesi. Data lama (v1–v3) dimigrasikan otomatis.
- **Ekspor nyata**: `.xlsx` sheet `Rekap` per merk (SN per kolom, baris `jumlah`), CSV/TSV dengan format yang sama, dan share file bila didukung browser. Impor daftar dari `.txt`, `.csv`, dan `.xlsx`.
- **Palet StockScan**: gradien pastel mint, cream, kuning hangat, dan peach di latar belakang. Teks hitam, kartu putih, tombol melayang, dan layar kamera gelap dengan frame putih.
- Data tersimpan di `localStorage` (web) / `SharedPreferences` (native). Tidak ada CDN saat pemindaian.

## Unduh APK Android (native)

Build native terbaru adalah versi **3.0.0** (`versionCode 3`) dengan palet StockScan, sesi bernama, detail item lengkap, ganti kamera, pause/resume, dan scan dari gambar.Folder `native/` berisi proyek Gradle; build memerlukan JDK 17 + Android SDK.

Cara pasang APK: unduh → izinkan **install dari sumber tidak dikenal** → buka **StockScan** → izinkan kamera.

Data web dan data APK native tersimpan terpisah dan tidak saling sinkron.

## Struktur file

```text
warehouse-sn-scanner/
├── index.html                 # markup: home (2 mode) + layar scan
├── manifest.json              # PWA manifest (add to home screen)
├── assets/
│   ├── styles.css             # design system: token terang + mode scan gelap
│   ├── app.js                 # state, render, scan, rekap, ekspor, audio
│   ├── data.js                # state v3, migrasi, operasi daftar scan bebas
│   ├── export.js              # CSV/TSV + nama file
│   ├── xlsx.js                # penulis XLSX/ZIP tanpa dependency
│   ├── scan-core.js           # parsing SN, ROI mapping, decoder ZXing
│   ├── scanner.js             # kamera + crop area scan + decode loop
│   ├── scan-worker.js         # decode ZXing di Web Worker
│   ├── audio.js               # beep Web Audio API (tanpa file audio)
│   ├── zxing.min.js           # @zxing/library 0.21.3 (vendored)
│   ├── fonts/                 # Instrument Sans + JetBrains Mono (OFL)
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
├── tests/                     # opsional, tidak dipakai saat produksi
├── native/                    # APK Android native (Java + ZXing + XLSX writer)
├── docs/preview.png           # screenshot untuk README
└── README.md
```

## Jalankan lokal

Kamera browser membutuhkan **secure context**. `localhost` dianggap aman.

```bash
cd warehouse-sn-scanner
python3 -m http.server 8080
```

Buka **http://localhost:8080** di Chrome/Safari. Jangan buka `index.html` lewat `file://` - ES module dan kamera akan diblokir browser.

Alternatif:

```bash
npx serve .
# atau
php -S localhost:8080
```

## Build APK native

Project native ada di `native/` (Java, Gradle, ZXing, tanpa WebView).

```bash
cd native
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=$HOME/android-sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export SN_KEYSTORE=$HOME/.android-keys/warehouse-sn-scanner.keystore
export SN_KEYALIAS=snscanner
export SN_STOREPASS=...
export SN_KEYPASS=...
./gradlew test
./gradlew assembleRelease
```

APK: `native/app/build/outputs/apk/release/app-release.apk`. Jangan commit keystore; update berikutnya wajib memakai key yang sama.

## Deploy gratis ke HTTPS

### GitHub Pages

1. Buat repo baru, upload isi folder ini (cukup `index.html`, `manifest.json`, `assets/`).
2. Repo → **Settings → Pages**.
3. Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Buka `https://<username>.github.io/<repo>/`. Build pertama sekitar 1 menit.

### Cloudflare Pages / Vercel

- Framework preset: **None**
- Build command: **kosong**
- Output directory: **`.`** (root)
- Upload/drag folder ini.

HTTPS wajib untuk kamera. `http://` biasa hanya menampilkan pesan bahwa kamera butuh HTTPS.

## Cara pakai

Pilih mode di layar awal: **Cocokkan** atau **Scan bebas**.

### Mode Cocokkan

1. Tempel daftar SN (satu per baris, atau pisahkan koma/spasi), atau impor `.txt`/`.csv`.
2. Tekan **Mulai scan** dan izinkan akses kamera.
3. Arahkan **hanya barcode SN** ke kotak tipis. Aplikasi hanya memotong area di dalam kotak setiap ±120 ms.
4. Cocok → baris tercentang hijau + beep + getar. Duplikat → kuning. Bukan target → teks kecil, tanpa alarm.
5. Stiker rusak? Ketuk baris SN untuk centang manual.
6. **Rekap** kapan saja → salin laporan / sisa SN, unduh Excel, atau reset sesi.

### Mode Scan bebas

1. Pilih tab **Scan bebas** → **Mulai scan bebas**.
2. Scan barcode apa pun. Setiap SN baru masuk daftar; kalau SN sudah pernah discan, scan ditolak dan tidak menambah baris.
3. Merk terdeteksi dari prefix SN. Kalau prefix tidak jelas (atau salah), tap chip merk di atas daftar sebelum scan - pilihan berlaku untuk scan berikutnya. Merk per baris juga bisa diubah lewat dialog edit.
4. Ketuk baris untuk mengubah SN/merk/jumlah unit atau menghapus. Tombol **+** di samping pencarian untuk menambah SN manual.
5. Tombol **Ekspor** → `.xlsx` berisi sheet `Rekap` per merk (SN di kolom merk, baris `jumlah`); CSV/TSV memakai format yang sama.
6. **Reset sesi** menghapus daftar scan bebas saja; sesi Cocokkan tetap tersimpan.

### Format laporan WhatsApp

```text
*LAPORAN SCAN GUDANG*
Tanggal: 24 Nov 2026, 14.30
Sesi dimulai: 24 Nov 2026, 14.02
Total: 20 SN
Ketemu: 18 SN
Sisa: 2 SN

*BELUM KETEMU (2)*
- ZTEGC1234567
- ZTEGC1234568

*SUDAH KETEMU (18)*
- ...
```

## Optimasi kamera

Kalau HP terasa ngelag saat preview:

1. **Decode dipindah ke Web Worker.** Main thread hanya mengambil crop; ZXing berjalan di worker. Hanya satu frame yang diproses pada satu waktu, jadi frame kamera berikutnya tidak menumpuk.
2. **Kamera 1280×720, target 24–30 fps** (bukan 1080p). Preview lebih ringan, detail barcode tetap cukup untuk strip 85% × 28%.
3. **Resolusi crop adaptif**: 900px untuk perangkat 8 core, 760px untuk 6 core, 640px untuk 4 core / RAM kecil. Kalau decode di worker tetap >120 ms tiga kali berturut-turut, resolusi diturunkan otomatis sampai 480px.
4. **Tanpa `TRY_HARDER`** - mode ZXing yang paling mahal. Barcode di strip sudah dekat dan jelas.
5. **Efek UI diringankan**: frame scan memakai satu garis tipis statis (tanpa glow/animasi), tidak ada `backdrop-filter` di atas video, dan shadow tebal dihapus.
6. **Geometry scan di-cache** dan dihitung ulang saat resize/orientasi, bukan dibaca dari DOM setiap frame.

Kalau masih terasa berat: buka di Chrome (bukan browser dalam Telegram/Instagram), tutup aplikasi kamera lain, dan pastikan HP tidak dalam mode hemat daya ekstrem.

## Catatan penting

- **Merk**: deteksi otomatis memakai prefix `ZTE`, `HWTC`/`HUAWEI`/`HW`/`48575443`, `FHTT`/`FIBERHOME`/`FH`, dan `RCM`. Selain itu masuk `Lainnya`. Override lewat chip atau dialog edit selalu menang.
- **Data per browser/origin.** Ganti browser, HP, atau alamat deploy = sesi berbeda. Reset lewat menu Rekap (mode Cocokkan) atau Ekspor (mode Scan bebas).
- **Kompatibel dengan sesi lama.** Data v1/v2 dimigrasikan otomatis. Qty lama yang terbentuk dari scan berulang dirapikan menjadi 1 (satu SN = satu unit).
- **Kamera**: Chrome Android dan Safari iOS 15.4+. Browser dalam aplikasi (Telegram/Instagram) kadang memblokir kamera - buka di Chrome/Safari.
- **Senter** hanya muncul jika browser + kamera mendukung Torch API. iOS Safari umumnya belum mendukung.
- **Getar** tidak tersedia di iOS Safari; feedback suara + visual tetap jalan.
- **Audio** baru aktif setelah user menekan tombol (aturan autoplay). Itu sebabnya `AudioContext` di-unlock di tombol Mulai scan.
- **Tanpa service worker**: halaman perlu dimuat sekali dengan internet. Setelah itu aset biasanya di-cache browser, tetapi bukan jaminan offline penuh.
- **Daftar besar**: render daftar memakai DOM biasa. Untuk ratusan SN masih nyaman; untuk ribuan, pertimbangkan memecah sesi.

## Kustomisasi

- **Warna & tema**: token di `assets/styles.css`. `:root` mengatur shell terang, `body.in-scan` mengatur mode scan gelap (`--accent`, `--surface`, `--text`, `--line`, dll).
- **Font**: `assets/fonts/` (Instrument Sans + JetBrains Mono). Ganti `@font-face` dan `--font`/`--mono` untuk rebrand.
- **Area scan**: ubah `.scan-frame` (`width`, `height`, posisi). `scanner.js` membaca rect yang sama, jadi tidak ada angka duplikat di JS.
- **Format barcode**: daftar format di `assets/scan-worker.js`; fallback `createDecoder()` di `assets/scan-core.js`.
- **Cooldown scan**: `SCAN_COOLDOWN_MS` di `assets/app.js` (default 1500 ms).
- **Interval decode**: `DECODE_INTERVAL_MS` di `assets/scanner.js` (default 120 ms).

## Testing

Tes tersedia di `tests/`. Ringkasnya:

```bash
cd tests
npm install
npm test                 # parser, state, merk, ekspor CSV/XLSX, ROI mapping, decode gambar
npm run test:collect     # E2E scan bebas (tanpa kamera)
npm run test:brands      # E2E merk otomatis/override + Excel per merk
```

Tes end-to-end memakai kamera palsu Chromium + video barcode. Jalankan server dari root repo di port 4173 terlebih dahulu:

```bash
python3 -m http.server 4173
```

Lalu di terminal lain:

```bash
./make-video.sh          # butuh ffmpeg
CHROME_PATH=/path/to/chrome npm run test:e2e
```

Detail lengkap di [`tests/README.md`](tests/README.md).

## Pihak ketiga

- **ZXing** (`@zxing/library` 0.21.3) - Apache License 2.0. File: `assets/zxing.min.js`. Teks lisensi: `assets/zxing-LICENSE.txt`.
- Ikon dan desain dibuat untuk proyek ini.
