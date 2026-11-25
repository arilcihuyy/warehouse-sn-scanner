const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const ZXing = require('../assets/zxing.min.js');

const hints = new Map();
hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
  ZXing.BarcodeFormat.CODE_128,
  ZXing.BarcodeFormat.CODE_39,
  ZXing.BarcodeFormat.EAN_13,
  ZXing.BarcodeFormat.QR_CODE,
  ZXing.BarcodeFormat.DATA_MATRIX,
]);
hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
const reader = new ZXing.MultiFormatReader();
reader.setHints(hints);

function decodeCrop(png, sx, sy, sw, sh) {
  const lum = new Uint8ClampedArray(sw * sh);
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      const i = ((sy + y) * png.width + (sx + x)) * 4;
      lum[y * sw + x] =
        (png.data[i] * 77 + png.data[i + 1] * 150 + png.data[i + 2] * 29) >> 8;
    }
  }
  try {
    const source = new ZXing.RGBLuminanceSource(lum, sw, sh);
    const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
    return reader.decode(bitmap).getText();
  } catch (error) {
    return `ERR:${error.name}`;
  }
}

const sheet = PNG.sync.read(fs.readFileSync(path.join(__dirname, 'fixtures', 'sheet.png')));
console.log('strip (target)', decodeCrop(sheet, 120, 380, 1360, 120));
console.log('strip (above target)', decodeCrop(sheet, 120, 290, 1360, 80));
console.log('full sheet', decodeCrop(sheet, 0, 0, 1600, 900));

const qr = PNG.sync.read(fs.readFileSync(path.join(__dirname, 'fixtures', 'qr.png')));
console.log('qr', decodeCrop(qr, 0, 0, qr.width, qr.height));
