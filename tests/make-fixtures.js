// Generates the barcode sheet used by tests/roi.html
const fs = require('fs');
const path = require('path');
const bwip = require('bwip-js');
const { PNG } = require('pngjs');

const OUT = path.join(__dirname, 'fixtures');
fs.mkdirSync(OUT, { recursive: true });

function draw(canvas, image, x, y) {
  PNG.bitblt(image, canvas, 0, 0, image.width, image.height, x, y);
}

async function barcode(text) {
  return PNG.sync.read(
    await bwip.toBuffer({
      bcid: 'code128',
      text,
      scale: 3,
      height: 18,
      includetext: true,
      textxalign: 'center',
      paddingwidth: 12,
      paddingheight: 12,
      backgroundcolor: 'FFFFFF',
    }),
  );
}

async function main() {
  const sheet = new PNG({ width: 1600, height: 900 });
  sheet.data.fill(255);

  const top = await barcode('MAC0011223344');
  const middle = await barcode('ZTEGC1234567');
  const bottom = await barcode('PON9988776655');

  draw(sheet, top, Math.round((1600 - top.width) / 2), 60);
  draw(sheet, middle, Math.round((1600 - middle.width) / 2), 330);
  draw(sheet, bottom, Math.round((1600 - bottom.width) / 2), 600);

  fs.writeFileSync(path.join(OUT, 'sheet.png'), PNG.sync.write(sheet));

  const qr = PNG.sync.read(
    await bwip.toBuffer({
      bcid: 'qrcode',
      text: 'QR-TEST-0001',
      scale: 4,
      paddingwidth: 12,
      paddingheight: 12,
      backgroundcolor: 'FFFFFF',
    }),
  );
  fs.writeFileSync(path.join(OUT, 'qr.png'), PNG.sync.write(qr));

  console.log('sheet.png', sheet.width, sheet.height);
  console.log('middle barcode box', {
    x: Math.round((1600 - middle.width) / 2),
    y: 330,
    width: middle.width,
    height: middle.height,
  });
  console.log('qr.png', qr.width, qr.height);
}

main();
