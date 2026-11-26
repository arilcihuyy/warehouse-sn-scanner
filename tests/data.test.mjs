import assert from 'node:assert/strict';
import {
  addCollectScan,
  collectBrandSummary,
  collectExportRows,
  collectSummary,
  formatStamp,
  guessBrand,
  matchExportRows,
  normalizeBrand,
  normalizeState,
  sortCollectByBrand,
} from '../assets/data.js';

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

const T1 = '2026-11-26T14:03:05';
const T2 = '2026-11-26T14:04:10';

test('normalizeState migrates the v1 session into match', () => {
  const state = normalizeState({
    items: [{ sn: 'zte001', status: 'found', scannedAt: '2026-11-26T07:00:00.000Z' }],
    createdAt: '2026-11-26T06:00:00.000Z',
  });
  assert.equal(state.version, 2);
  assert.equal(state.lastMode, 'match');
  assert.equal(state.collect, null);
  assert.deepEqual(state.match.items, [
    { sn: 'ZTE001', status: 'found', scannedAt: '2026-11-26T07:00:00.000Z' },
  ]);
  assert.equal(state.match.createdAt, '2026-11-26T06:00:00.000Z');
});

test('normalizeState keeps both v2 sessions', () => {
  const state = normalizeState({
    version: 2,
    lastMode: 'collect',
    match: { items: [{ sn: 'A1', status: 'pending', scannedAt: null }], createdAt: T1 },
    collect: { items: [{ sn: 'B2', qty: 3, firstAt: T1, lastAt: T2 }], createdAt: T1 },
  });
  assert.equal(state.lastMode, 'collect');
  assert.equal(state.match.items[0].sn, 'A1');
  assert.equal(state.collect.items[0].qty, 3);
});

test('normalizeState drops empty sessions and repairs bad qty', () => {
  const state = normalizeState({
    version: 2,
    lastMode: 'collect',
    match: { items: [], createdAt: T1 },
    collect: { items: [{ sn: 'b2', firstAt: T1 }], createdAt: T1 },
  });
  assert.equal(state.match, null);
  assert.equal(state.lastMode, 'collect');
  assert.equal(state.collect.items[0].sn, 'b2');
  assert.equal(state.collect.items[0].qty, 1);
  assert.equal(state.collect.items[0].lastAt, T1);
});

test('normalizeState returns an empty state for junk', () => {
  assert.deepEqual(normalizeState(null), {
    version: 2,
    lastMode: 'match',
    match: null,
    collect: null,
  });
});

test('addCollectScan creates a session and keeps the raw casing', () => {
  const result = addCollectScan(null, '  AbC-123  ', T1, 'ZTE');
  assert.equal(result.status, 'new');
  assert.equal(result.session.items.length, 1);
  assert.deepEqual(result.session.items[0], {
    sn: 'AbC-123',
    brand: 'ZTE',
    qty: 1,
    firstAt: T1,
    lastAt: T1,
  });
  assert.equal(result.session.createdAt, T1);
  assert.equal(result.session.updatedAt, T1);
});

test('guessBrand recognizes the warehouse brands from the SN prefix', () => {
  assert.equal(guessBrand('ZTEGC123456'), 'ZTE');
  assert.equal(guessBrand('HWTC123456'), 'Huawei');
  assert.equal(guessBrand('48575443ABCDEF'), 'Huawei');
  assert.equal(guessBrand('FHTT123456'), 'FiberHome');
  assert.equal(guessBrand('RCM123456'), 'RCM');
  assert.equal(guessBrand('ABC123456'), 'Lainnya');
  assert.equal(normalizeBrand('fiber home'), 'FiberHome');
  assert.equal(normalizeBrand(''), 'Lainnya');
});

test('addCollectScan auto-detects a brand when none is passed', () => {
  const result = addCollectScan(null, 'ZTEGC9001', T1);
  assert.equal(result.item.brand, 'ZTE');
});

test('an explicit brand overrides auto-detection, including on a duplicate', () => {
  const first = addCollectScan(null, 'ZTEGC9001', T1);
  assert.equal(first.item.brand, 'ZTE');
  const second = addCollectScan(first.session, 'ZTEGC9001', T2, 'Huawei');
  assert.equal(second.status, 'dup');
  assert.equal(second.item.brand, 'Huawei');
  assert.equal(second.item.qty, 2);
});

test('addCollectScan merges a normalized duplicate and bumps qty', () => {
  const first = addCollectScan(null, 'SN 001', T1);
  const second = addCollectScan(first.session, 'sn001', T2);
  assert.equal(second.status, 'dup');
  assert.equal(second.session.items.length, 1);
  assert.equal(second.session.items[0].qty, 2);
  assert.equal(second.session.items[0].firstAt, T1);
  assert.equal(second.session.items[0].lastAt, T2);
});

test('addCollectScan puts new scans first', () => {
  const first = addCollectScan(null, 'AAA', T1);
  const second = addCollectScan(first.session, 'BBB', T2);
  assert.deepEqual(
    second.session.items.map((item) => item.sn),
    ['BBB', 'AAA'],
  );
});

test('addCollectScan rejects empty input without touching the session', () => {
  const first = addCollectScan(null, 'AAA', T1);
  const result = addCollectScan(first.session, '   ', T2);
  assert.equal(result.status, 'invalid');
  assert.equal(result.session, first.session);
});

test('collectSummary counts unique SN and total qty', () => {
  const session = {
    items: [
      { sn: 'A', qty: 3 },
      { sn: 'B', qty: 1 },
    ],
  };
  assert.deepEqual(collectSummary(session.items), { unique: 2, totalQty: 4 });
  assert.deepEqual(collectSummary([]), { unique: 0, totalQty: 0 });
});

test('collectExportRows includes the brand column and local timestamps', () => {
  const rows = collectExportRows([
    { sn: 'A1', brand: 'ZTE', qty: 2, firstAt: T1, lastAt: T2 },
  ]);
  assert.deepEqual(rows, [
    [1, 'ZTE', 'A1', '2026-11-26 14:03:05', '2026-11-26 14:04:10', 2],
  ]);
});

test('collectExportRows can omit the brand for per-brand sheets', () => {
  const rows = collectExportRows(
    [{ sn: 'A1', brand: 'ZTE', qty: 2, firstAt: T1, lastAt: T2 }],
    { withBrand: false },
  );
  assert.deepEqual(rows, [[1, 'A1', '2026-11-26 14:03:05', '2026-11-26 14:04:10', 2]]);
});

test('collectBrandSummary groups counts in the fixed brand order', () => {
  const items = [
    { sn: 'R1', brand: 'RCM', qty: 1 },
    { sn: 'Z1', brand: 'ZTE', qty: 2 },
    { sn: 'Z2', brand: 'ZTE', qty: 1 },
    { sn: 'H1', brand: 'Huawei', qty: 3 },
  ];
  assert.deepEqual(collectBrandSummary(items), [
    { brand: 'ZTE', unique: 2, totalQty: 3 },
    { brand: 'Huawei', unique: 1, totalQty: 3 },
    { brand: 'RCM', unique: 1, totalQty: 1 },
  ]);
});

test('sortCollectByBrand keeps the scan order inside each brand', () => {
  const items = [
    { sn: 'R1', brand: 'RCM' },
    { sn: 'Z1', brand: 'ZTE' },
    { sn: 'H1', brand: 'Huawei' },
    { sn: 'Z2', brand: 'ZTE' },
  ];
  assert.deepEqual(
    sortCollectByBrand(items).map((item) => item.sn),
    ['Z1', 'Z2', 'H1', 'R1'],
  );
});

test('normalizeState infers a missing brand for old collect items', () => {
  const state = normalizeState({
    version: 2,
    lastMode: 'collect',
    collect: {
      items: [
        { sn: 'ZTEGC9001', qty: 1, firstAt: T1, lastAt: T1 },
        { sn: 'FHTT9002', qty: 1, firstAt: T1, lastAt: T1 },
      ],
      createdAt: T1,
    },
  });
  assert.deepEqual(
    state.collect.items.map((item) => [item.sn, item.brand]),
    [
      ['ZTEGC9001', 'ZTE'],
      ['FHTT9002', 'FiberHome'],
    ],
  );
  assert.equal(state.collect.activeBrand, 'auto');
});

test('matchExportRows maps status and scan time', () => {
  const rows = matchExportRows([
    { sn: 'A1', status: 'found', scannedAt: '2026-11-26T14:03:05' },
    { sn: 'B2', status: 'pending', scannedAt: null },
  ]);
  assert.deepEqual(rows, [
    [1, 'A1', 'Ketemu', '2026-11-26 14:03:05'],
    [2, 'B2', 'Sisa', ''],
  ]);
});

test('formatStamp pads every field', () => {
  assert.equal(formatStamp(new Date(2026, 0, 2, 3, 4, 5)), '2026-01-02 03:04:05');
  assert.equal(formatStamp(null), '');
});

console.log(`\n${passed} passed`);
