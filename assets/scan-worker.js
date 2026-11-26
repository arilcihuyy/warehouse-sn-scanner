/*
 * ZXing decode worker.
 * Keeps the expensive decode off the main thread so the camera preview and
 * the checklist stay responsive on mid/low-end phones.
 */
importScripts('zxing.min.js');

const hints = new Map();
hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
  ZXing.BarcodeFormat.CODE_128,
  ZXing.BarcodeFormat.CODE_93,
  ZXing.BarcodeFormat.CODE_39,
  ZXing.BarcodeFormat.ITF,
  ZXing.BarcodeFormat.CODABAR,
  ZXing.BarcodeFormat.EAN_13,
  ZXing.BarcodeFormat.EAN_8,
  ZXing.BarcodeFormat.UPC_A,
  ZXing.BarcodeFormat.UPC_E,
  ZXing.BarcodeFormat.QR_CODE,
  ZXing.BarcodeFormat.DATA_MATRIX,
  ZXing.BarcodeFormat.AZTEC,
]);
// No TRY_HARDER: the strip is close to the lens and already cropped. The
// harder pass mostly burns CPU on low-end devices.
const reader = new ZXing.MultiFormatReader();
reader.setHints(hints);

let luminance = new Uint8ClampedArray(0);

self.onmessage = (event) => {
  const { buffer, width, height, id, generation } = event.data;
  const started = performance.now();
  let text = null;

  try {
    const rgba = new Uint8ClampedArray(buffer);
    const size = width * height;
    if (luminance.length !== size) luminance = new Uint8ClampedArray(size);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) {
      luminance[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
    }

    const source = new ZXing.RGBLuminanceSource(luminance, width, height);
    const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
    const result = reader.decode(bitmap);
    text = result ? result.getText() : null;
  } catch (error) {
    // NotFoundException means "no barcode in this strip" and is expected.
    if (error && error.name && !/NotFound/.test(error.name)) {
      // console.warn('[scan-worker]', error);
    }
  }

  self.postMessage({ id, generation, text, ms: performance.now() - started });
};
