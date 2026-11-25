# Tests — Warehouse SN Scanner

Folder ini opsional. Aplikasi produksi hanya butuh `index.html`, `manifest.json`, dan `assets/`.

## 1. Unit + decode gambar

```bash
cd tests
npm install

npm test
```

Yang dijalankan:

- `core.test.mjs` — normalisasi SN, parser teks/CSV, dedupe, mapping ROI (termasuk object-fit `cover` dan clamping).
- `decode-node.js` — decode `CODE_128`, `QR_CODE`, `DATA_MATRIX`, `EAN_13` dari gambar yang dibuat `bwip-js`.
- `roi-node.js` — memastikan crop strip tipis hanya membaca barcode target, bukan barcode di atas/bawahnya.

Fixture sudah tersedia di `fixtures/sheet.png` dan `fixtures/qr.png`. Untuk membuat ulang:

```bash
npm run fixtures
```

## 2. Tes ROI di browser

Dari root repo:

```bash
python3 -m http.server 4173
```

Buka **http://localhost:4173/tests/roi.html**. Halaman menampilkan `PASS/FAIL` dan menguji canvas + ZXing yang sama dengan aplikasi.

## 3. End-to-end kamera palsu

Prasyarat:

- `ffmpeg`
- Chromium/Chrome yang bisa dijalankan Playwright
- `npm install` di folder ini

Buat video Y4M dari fixture (barcode target ada di tengah):

```bash
./make-video.sh
```

Jalankan server dari root repo di port **4173**, lalu:

```bash
CHROME_PATH=/path/to/chrome npm run test:e2e
```

Tes yang dijalankan:

- `e2e-import.mjs` — upload CSV/TXT, deteksi kolom SN, buang duplikat.
- `e2e-camera.mjs` — kamera palsu 1280×720 → crop strip → ZXing mendeteksi `ZTEGC1234567` dan mencentang baris yang benar.
- `e2e-flow.mjs` — status 100%, pesan selesai, toggle manual, rekap, reset + kamera berhenti.
- `e2e-pause.mjs` — layout landscape, pause menghentikan video, resume menyalakan lagi.

Screenshot hasil tes ditulis ke folder ini (`e2e-*.png`, `landscape-*.png`). File Y4M dan screenshot tidak perlu di-commit.

## 4. Performance check

Dengan kamera palsu dan CPU throttle (8x), mengukur frame gap, long task, dan waktu decode worker. Jalankan `./make-video.sh` dulu kalau `fixtures/scan.y4m` belum ada:

```bash
npm run perf
# atau atur sendiri:
THROTTLE=6 SECONDS=10 node perf-baseline.mjs
```

Target sehat: long task mendekati 0 dan gap `requestAnimationFrame` p95 di bawah ~50 ms pada throttle 8x. Angka ini bukan benchmark HP asli — hanya pembanding sebelum/sesudah optimasi.
