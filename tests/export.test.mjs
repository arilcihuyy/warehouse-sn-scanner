import assert from 'node:assert/strict';
import { stampForFilename, toCsv, toTsv } from '../assets/export.js';
import { buildXlsx } from '../assets/xlsx.js';

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

test('toCsv quotes separators, quotes and newlines', () => {
  const csv = toCsv(
    ['No', 'SN'],
    [
      [1, 'A;B'],
      [2, 'He said "hi"'],
      [3, 'line1\nline2'],
      [4, ' plain '],
    ],
  );
  assert.equal(
    csv,
    'No;SN\n1;"A;B"\n2;"He said ""hi"""\n3;"line1\nline2"\n4;" plain "',
  );
});

test('toCsv supports a comma delimiter', () => {
  assert.equal(toCsv(['SN'], [['A,B']], ','), 'SN\n"A,B"');
});

test('toTsv joins with tabs and keeps quotes untouched', () => {
  assert.equal(toTsv(['No', 'SN'], [[1, 'A"B']]), 'No\tSN\n1\tA"B');
});

test('stampForFilename is filesystem friendly', () => {
  assert.equal(stampForFilename(new Date(2026, 10, 26, 14, 3)), '20261126-1403');
});

test('buildXlsx returns a stored ZIP with the expected parts', () => {
  const bytes = buildXlsx({
    sheetName: 'Scan',
    headers: ['No', 'SN', 'Jumlah'],
    rows: [
      [1, 'SN&X', 3],
      [2, 'B<2', 1],
    ],
    widths: [6, 28, 10],
  });
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);

  const text = new TextDecoder('latin1').decode(bytes);
  assert.ok(text.includes('xl/worksheets/sheet1.xml'));
  assert.ok(text.includes('xl/styles.xml'));
  assert.ok(text.includes('<t>No</t>'));
  assert.ok(text.includes('<t>SN&amp;X</t>'));
  assert.ok(text.includes('<t>B&lt;2</t>'));
  assert.ok(text.includes('<v>3</v>'));
  assert.ok(text.includes('<autoFilter ref="A1:C3"/>'));

  const entries = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(
    bytes.length - 12,
    true,
  );
  assert.equal(entries, 6);
});

test('buildXlsx sanitizes forbidden sheet names', () => {
  const bytes = buildXlsx({
    sheetName: 'Scan/Nov:2026[]*?',
    headers: ['SN'],
    rows: [['A1']],
  });
  const text = new TextDecoder('latin1').decode(bytes);
  assert.ok(text.includes('name="ScanNov2026"'));
  assert.ok(!text.includes('name="Scan/Nov'));
});

console.log(`\n${passed} passed`);
