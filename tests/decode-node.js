// Node smoke test for the ZXing decode core (run: node tests/decode-node.js)
const bwip = require('bwip-js');
const { PNG } = require('pngjs');
const ZXing = require('../assets/zxing.min.js');

const HINTS = new Map();
HINTS.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
  ZXing.BarcodeFormat.CODE_128,
  ZXing.BarcodeFormat.CODE_39,
  ZXing.BarcodeFormat.EAN_13,
  ZXing.BarcodeFormat.QR_CODE,
  ZXing.BarcodeFormat.DATA_MATRIX,
]);
HINTS.set(ZXing.DecodeHintType.TRY_HARDER, true);

function decodePng(buf) {
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;
  const lum = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    lum[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }
  const src = new ZXing.RGBLuminanceSource(lum, width, height);
  const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(src));
  const reader = new ZXing.MultiFormatReader();
  reader.setHints(HINTS);
  try {
    return reader.decode(bmp).getText();
  } catch (e) {
    return 'ERR:' + e.name + ':' + e.message;
  }
}

async function main() {
  for (const text of ['ZTEGC1234567', 'MAC0011223344']) {
    const png = await bwip.toBuffer({
      bcid: 'code128',
      text,
      scale: 3,
      height: 18,
      includetext: true,
      textxalign: 'center',
      paddingwidth: 12,
      paddingheight: 12,
      backgroundcolor: 'FFFFFF',
    });
    console.log('CODE128', text, '->', decodePng(png));
  }

  const qr = await bwip.toBuffer({
    bcid: 'qrcode',
    text: 'QR-TEST-0001',
    scale: 4,
    paddingwidth: 12,
    paddingheight: 12,
    backgroundcolor: 'FFFFFF',
  });
  console.log('QR', '->', decodePng(qr));

  const dm = await bwip.toBuffer({
    bcid: 'datamatrix',
    text: 'DM-TEST-0002',
    scale: 4,
    paddingwidth: 12,
    paddingheight: 12,
    backgroundcolor: 'FFFFFF',
  });
  console.log('DATA_MATRIX', '->', decodePng(dm));

  const ean = await bwip.toBuffer({
    bcid: 'ean13',
    text: '4006381333931',
    scale: 3,
    height: 18,
    includetext: true,
    paddingwidth: 12,
    paddingheight: 12,
    backgroundcolor: 'FFFFFF',
  });
  console.log('EAN13', '->', decodePng(ean));
}

main();
