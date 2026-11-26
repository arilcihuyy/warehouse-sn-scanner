import assert from 'node:assert/strict';
import {
  addCollectScan,
  collectExportRows,
  collectSummary,
  formatStamp,
  matchExportRows,
  normalizeState,
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
  const result = addCollectScan(null, '  AbC-123  ', T1);
  assert.equal(result.status, 'new');
  assert.equal(result.session.items.length, 1);
  assert.deepEqual(result.session.items[0], {
    sn: 'AbC-123',
    qty: 1,
    firstAt: T1,
    lastAt: T1,
  });
  assert.equal(result.session.createdAt, T1);
  assert.equal(result.session.updatedAt, T1);
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

test('collectExportRows writes local timestamps and numbers', () => {
  const rows = collectExportRows([
    { sn: 'A1', qty: 2, firstAt: T1, lastAt: T2 },
  ]);
  assert.deepEqual(rows, [[1, 'A1', '2026-11-26 14:03:05', '2026-11-26 14:04:10', 2]]);
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
