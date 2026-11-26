# Warehouse SN Scanner

Aplikasi web **mobile-first** dengan dua mode: **Cocokkan** barcode perangkat (modem, ONT, router) dengan daftar Serial Number, atau **Scan bebas** untuk mengumpulkan SN apa pun — dikelompokkan per merk — lalu mengekspornya ke Excel/CSV. Pure client-side — tanpa backend, tanpa database, tanpa request ke server. Seluruh progres disimpan di `localStorage` perangkat.

![Tampilan scanner](docs/preview.png)

## Fitur

- **Dua mode**: `Cocokkan` (checklist dari daftar impor) dan `Scan bebas` (kumpulkan SN tanpa daftar target). Sesi keduanya tersimpan terpisah.
- **Impor daftar SN** dari tempel teks atau file `.txt` / `.csv` (deteksi kolom `SN` / `Serial Number`, buang duplikat otomatis).
- **Scanner kamera belakang** dengan area scan tipis horizontal **85% × 28%** di tengah viewfinder. Kamera hanya membaca area kotak, jadi barcode MAC/PON di sebelah SN tidak ikut terbaca.
- **Decode di Web Worker** — ZXing tidak memblokir main thread, jadi preview kamera dan checklist tetap mulus di HP kelas menengah. Resolusi crop adaptif mengikuti kemampuan perangkat.
- Format barcode: `CODE_128`, `CODE_93`, `CODE_39`, `ITF`, `CODABAR`, `EAN_13`, `EAN_8`, `UPC_A`, `UPC_E`, `QR_CODE`, `DATA_MATRIX`, `AZTEC`.
- **Feedback tanpa pop-up**: frame hijau + beep + getar untuk scan baru, kuning + beep ganda untuk duplikat, teks kecil untuk bukan target.
- **Scan bebas**: scan berulang menambah qty, baris bisa diubah/dihapus, ada input manual, pencarian, dan penghitung SN unik + total scan.
- **Merk otomatis + override**: prefix SN dikenali (`ZTE`, `HWTC`/`48575443`, `FHTT`, `RCM`) dan masuk ke merk yang sesuai; chip `Auto` / `ZTE` / `Huawei` / `FiberHome` / `RCM` / `Lainnya` bisa dipakai untuk memaksa merk saat prefix tidak jelas. Merk tiap baris juga bisa diubah di dialog edit.
- **Ekspor spreadsheet**: `.xlsx` berisi sheet **Ringkasan** (jumlah per merk), **Semua** (dengan kolom Merk), dan **satu sheet per merk**; plus CSV (pemisah `;`) dan salin TSV. Mode Cocokkan juga bisa mengunduh Excel dari rekap.
- **Checklist live** dengan progress bar, pencarian, filter `Semua` / `Sisa` / `Ketemu`, dan tap manual untuk koreksi.
- **Rekap & ekspor**: salin sisa SN atau laporan lengkap siap tempel ke WhatsApp, unduh Excel, lalu reset sesi dengan konfirmasi.
- Tombol **home** di layar kamera untuk pindah mode tanpa menghapus sesi.
- **Senter** (jika perangkat mendukung), **pause/resume**, **wake lock**, dan penanganan error kamera yang ramah.
- Dark mode kontras tinggi, target sentuh 44px+, aman untuk safe-area iOS/Android.
- Aset scanner (ZXing) disimpan lokal — tidak bergantung CDN saat dipakai.

## Struktur file

```text
warehouse-sn-scanner/
├── index.html                 # markup: home (2 mode) + layar scan
├── manifest.json              # PWA manifest (add to home screen)
├── assets/
│   ├── styles.css             # seluruh desain dark mode
│   ├── app.js                 # state, render, scan, rekap, ekspor, audio
│   ├── data.js                # state v2, migrasi, operasi daftar scan bebas
│   ├── export.js              # CSV/TSV + nama file
│   ├── xlsx.js                # penulis XLSX/ZIP tanpa dependency
│   ├── scan-core.js           # parsing SN, ROI mapping, decoder ZXing
│   ├── scanner.js             # kamera + crop area scan + decode loop
│   ├── scan-worker.js         # decode ZXing di Web Worker
│   ├── audio.js               # beep Web Audio API (tanpa file audio)
│   ├── zxing.min.js           # @zxing/library 0.21.3 (vendored)
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
├── tests/                     # opsional, tidak dipakai saat produksi
├── docs/preview.png           # screenshot untuk README
└── README.md
```

## Jalankan lokal

Kamera browser membutuhkan **secure context**. `localhost` dianggap aman.

```bash
cd warehouse-sn-scanner
python3 -m http.server 8080
```

Buka **http://localhost:8080** di Chrome/Safari. Jangan buka `index.html` lewat `file://` — ES module dan kamera akan diblokir browser.

Alternatif:

```bash
npx serve .
# atau
php -S localhost:8080
```

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
2. Scan barcode apa pun. Setiap SN baru masuk daftar; scan ulang otomatis menambah **qty**.
3. Merk terdeteksi dari prefix SN. Kalau prefix tidak jelas (atau salah), tap chip merk di atas daftar sebelum scan — pilihan berlaku untuk scan berikutnya. Merk per baris juga bisa diubah lewat dialog edit.
4. Ketuk baris untuk mengubah SN/merk/qty atau menghapus. Tombol **+** di samping pencarian untuk menambah SN manual.
5. Tombol **Ekspor** → `.xlsx` berisi Ringkasan + Semua + sheet per merk; atau CSV/TSV.
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
4. **Tanpa `TRY_HARDER`** — mode ZXing yang paling mahal. Barcode di strip sudah dekat dan jelas.
5. **Efek UI diringankan**: frame scan memakai satu garis tipis statis (tanpa glow/animasi), tidak ada `backdrop-filter` di atas video, dan shadow tebal dihapus.
6. **Geometry scan di-cache** dan dihitung ulang saat resize/orientasi, bukan dibaca dari DOM setiap frame.

Kalau masih terasa berat: buka di Chrome (bukan browser dalam Telegram/Instagram), tutup aplikasi kamera lain, dan pastikan HP tidak dalam mode hemat daya ekstrem.

## Catatan penting

- **Merk**: deteksi otomatis memakai prefix `ZTE`, `HWTC`/`HUAWEI`/`HW`/`48575443`, `FHTT`/`FIBERHOME`/`FH`, dan `RCM`. Selain itu masuk `Lainnya`. Override lewat chip atau dialog edit selalu menang.
- **Data per browser/origin.** Ganti browser, HP, atau alamat deploy = sesi berbeda. Reset lewat menu Rekap (mode Cocokkan) atau Ekspor (mode Scan bebas).
- **Kompatibel dengan sesi lama.** Data versi sebelumnya (`warehouse-sn-scanner/v1`) dimigrasikan otomatis ke format baru saat halaman dibuka.
- **Kamera**: Chrome Android dan Safari iOS 15.4+. Browser dalam aplikasi (Telegram/Instagram) kadang memblokir kamera — buka di Chrome/Safari.
- **Senter** hanya muncul jika browser + kamera mendukung Torch API. iOS Safari umumnya belum mendukung.
- **Getar** tidak tersedia di iOS Safari; feedback suara + visual tetap jalan.
- **Audio** baru aktif setelah user menekan tombol (aturan autoplay). Itu sebabnya `AudioContext` di-unlock di tombol Mulai scan.
- **Tanpa service worker**: halaman perlu dimuat sekali dengan internet. Setelah itu aset biasanya di-cache browser, tetapi bukan jaminan offline penuh.
- **Daftar besar**: render daftar memakai DOM biasa. Untuk ratusan SN masih nyaman; untuk ribuan, pertimbangkan memecah sesi.

## Kustomisasi

- **Warna**: CSS variables di `assets/styles.css` (`--accent`, `--surface`, `--danger`, dll).
- **Area scan**: ubah `.scan-frame` (`left`, `top`, `width`, `height`). `scanner.js` membaca rect yang sama, jadi tidak ada angka duplikat di JS.
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

- **ZXing** (`@zxing/library` 0.21.3) — Apache License 2.0. File: `assets/zxing.min.js`. Teks lisensi: `assets/zxing-LICENSE.txt`.
- Ikon dan desain dibuat untuk proyek ini.
