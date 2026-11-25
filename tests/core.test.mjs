import assert from 'node:assert/strict';
import {
  computeSourceRoi,
  normalizeSn,
  parseCsv,
  parseSnFile,
  parseSnText,
} from '../assets/scan-core.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS', name);
  } catch (error) {
    console.error('FAIL', name);
    console.error(error.message);
    process.exitCode = 1;
  }
}

test('normalizeSn strips spaces, zero-width and case', () => {
  assert.equal(normalizeSn('  zte gc123\u200b '), 'ZTEGC123');
  assert.equal(normalizeSn(null), '');
});

test('parseSnText handles mixed separators, dedupe and case', () => {
  const result = parseSnText('zte001, ZTE002\nZTE003 zte001\n\n"ZTE004"; ZTE005');
  assert.deepEqual(result.items, ['ZTE001', 'ZTE002', 'ZTE003', 'ZTE004', 'ZTE005']);
  assert.equal(result.duplicates, 1);
});

test('parseSnText ignores empty input', () => {
  assert.deepEqual(parseSnText('  \n , ; '), { items: [], duplicates: 0 });
});

test('parseCsv finds the SN column in a header', () => {
  const result = parseCsv('No,SN,MAC Address\n1,ZTEGC001,AA:BB\n2,ZTEGC002,CC:DD');
  assert.deepEqual(result.items, ['ZTEGC001', 'ZTEGC002']);
  assert.equal(result.duplicates, 0);
});

test('parseCsv handles Serial Number header and semicolons', () => {
  const result = parseCsv('Serial Number;MAC\nZTEGC003;AA\nZTEGC004;BB\nZTEGC003;CC');
  assert.deepEqual(result.items, ['ZTEGC003', 'ZTEGC004']);
  assert.equal(result.duplicates, 1);
});

test('parseCsv without header takes the first non-empty cell', () => {
  const result = parseCsv('ZTEGC005,AA:BB\n,ZTEGC006,CC:DD\nZTEGC007');
  assert.deepEqual(result.items, ['ZTEGC005', 'ZTEGC006', 'ZTEGC007']);
});

test('parseCsv handles quoted cells', () => {
  const result = parseCsv('"SN","Note"\n"ZTEGC008","hello, world"');
  assert.deepEqual(result.items, ['ZTEGC008']);
});

test('parseSnFile picks CSV for .csv and text for .txt', () => {
  assert.deepEqual(parseSnFile('SN,MAC\nZTEGC009,AA', 'list.csv').items, ['ZTEGC009']);
  assert.deepEqual(parseSnFile('ZTEGC010\nZTEGC011', 'list.txt').items, ['ZTEGC010', 'ZTEGC011']);
});

test('computeSourceRoi maps an exact-aspect stage', () => {
  const roi = computeSourceRoi({
    videoWidth: 1600,
    videoHeight: 900,
    stageWidth: 800,
    stageHeight: 450,
    frame: { x: 60, y: 190, width: 680, height: 60 },
  });
  assert.deepEqual(roi, { sx: 120, sy: 380, sw: 1360, sh: 120 });
});

test('computeSourceRoi undoes object-fit cover cropping', () => {
  const roi = computeSourceRoi({
    videoWidth: 1600,
    videoHeight: 900,
    stageWidth: 400,
    stageHeight: 450,
    frame: { x: 40, y: 190, width: 320, height: 60 },
  });
  assert.deepEqual(roi, { sx: 480, sy: 380, sw: 640, sh: 120 });
});

test('computeSourceRoi clamps a frame that leaves the video', () => {
  const roi = computeSourceRoi({
    videoWidth: 1000,
    videoHeight: 1000,
    stageWidth: 500,
    stageHeight: 500,
    frame: { x: -20, y: 100, width: 500, height: 50 },
  });
  assert.equal(roi.sx, 0);
  assert.equal(roi.sy, 200);
  assert.equal(roi.sw, 960);
  assert.equal(roi.sh, 100);
});

test('computeSourceRoi returns null for invalid geometry', () => {
  assert.equal(
    computeSourceRoi({
      videoWidth: 0,
      videoHeight: 900,
      stageWidth: 800,
      stageHeight: 450,
      frame: { x: 0, y: 0, width: 10, height: 10 },
    }),
    null,
  );
});

console.log(`\n${passed} passed`);
