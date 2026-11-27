import assert from 'node:assert/strict';
import {
  SessionStore, addExpectedItem, addScan, deleteItem, exportRows, EXPORT_HEADERS, filterItems,
  normalizeSession, normalizeState, replaceItem, sessionSummary, setExpected,
  collectRecap,
} from '../assets/sessions.js';

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

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

test('v3 snapshot migrates to two sessions without losing records', () => {
  const state = normalizeState({
    version: 3,
    lastMode: 'collect',
    collect: { createdAt: '2026-11-01T10:00:00.000Z', items: [{ sn: 'ZTE123', brand: 'ZTE', qty: 1 }] },
    match: { createdAt: '2026-11-02T10:00:00.000Z', items: [{ sn: 'HW456', status: 'found', scannedAt: '2026-11-02T11:00:00.000Z' }] },
  });
  assert.equal(state.version, 4);
  assert.equal(state.sessions.length, 2);
  assert.equal(state.activeIds.collect, 'legacy-collect');
  assert.equal(state.sessions[0].items[0].sn, 'ZTE123');
  assert.equal(state.sessions[0].items[0].scanCount, 1);
  assert.equal(state.sessions[1].items[0].status, 'found');
});

test('normalizeSession clamps legacy repeat counts to one scan', () => {
  const session = normalizeSession({
    mode: 'collect',
    items: [{ sn: 'LEGACY1', scanCount: 6, firstAt: '2026-11-01T10:00:00.000Z', lastAt: '2026-11-02T10:00:00.000Z' }],
  });
  assert.equal(session.items[0].scanCount, 1);
  assert.equal(sessionSummary(session).totalScans, 1);
  assert.equal(sessionSummary(session).duplicates, 0);
});

test('a fresh v4 snapshot with no sessions stays empty', () => {
  const state = normalizeState({ version: 4, sessions: [], activeIds: { collect: null, match: null } });
  assert.equal(state.sessions.length, 0);
});

test('collect scans detect brand and reject duplicates without incrementing', () => {
  let session = normalizeSession({ mode: 'collect', name: 'Test', items: [] });
  const first = addScan(session, ' ztegc001 ', { at: '2026-11-26T10:00:00.000Z' });
  assert.equal(first.status, 'new');
  assert.equal(first.item.brand, 'ZTE');
  session = first.session;
  const duplicate = addScan(session, 'ZTEGC001', { at: '2026-11-26T10:01:00.000Z' });
  assert.equal(duplicate.status, 'dup');
  assert.equal(duplicate.item.scanCount, 1);
  assert.equal(duplicate.item.firstAt, '2026-11-26T10:00:00.000Z');
  assert.equal(duplicate.item.lastAt, '2026-11-26T10:00:00.000Z');
  assert.equal(duplicate.session.items.length, 1);
  assert.equal(duplicate.session.items[0].sn, duplicate.item.sn);
  assert.equal(duplicate.session.duplicateScans, 1);
  assert.equal(sessionSummary(duplicate.session).duplicates, 1);
  assert.equal(sessionSummary(duplicate.session).totalScans, 2);
});

test('duplicate attempts are counted and reset when the list is replaced', () => {
  const session = normalizeSession({ mode: 'collect', items: [{ sn: 'AAA' }], duplicateScans: 2 });
  assert.equal(sessionSummary(session).duplicates, 2);
  assert.equal(sessionSummary(session).totalScans, 3);
  const replaced = setExpected(session, ['BBB']);
  assert.equal(replaced.duplicateScans, 0);
  assert.equal(sessionSummary(replaced).duplicates, 0);
});

test('explicit brand override wins over prefix detection', () => {
  let session = normalizeSession({ mode: 'collect', items: [] });
  session = addScan(session, 'ZTEGC002', { brand: 'Huawei' }).session;
  assert.equal(session.items[0].brand, 'Huawei');
});

test('explicit Lainnya brand is not replaced by the active brand', () => {
  let session = normalizeSession({ mode: 'collect', items: [], activeBrand: 'ZTE' });
  session = addScan(session, 'ZTEGC003', { brand: 'Lainnya' }).session;
  assert.equal(session.items[0].brand, 'Lainnya');
});

test('editing an item to another existing SN is rejected', () => {
  const session = normalizeSession({
    mode: 'collect',
    items: [{ sn: 'AAA' }, { sn: 'BBB' }],
  });
  const next = replaceItem(session, 0, { sn: 'bbb' });
  assert.equal(next, null);
  assert.deepEqual(session.items.map((item) => item.sn), ['AAA', 'BBB']);
});

test('editing brand to auto re-detects from the serial number', () => {
  const session = normalizeSession({
    mode: 'collect',
    items: [{ sn: 'HWTC12345', brand: 'ZTE' }],
  });
  const next = replaceItem(session, 0, { brand: 'auto' });
  assert.equal(next.items[0].brand, 'Huawei');
});

test('manual add in match mode joins the target list, not unmatched', () => {
  let session = normalizeSession({ mode: 'match', items: [] });
  session = addScan(session, 'OUTSIDE1').session;
  const added = addExpectedItem(session, 'OUTSIDE1', { category: 'Perangkat' });
  assert.equal(added.status, 'new');
  assert.equal(added.session.items[0].sn, 'OUTSIDE1');
  assert.equal(added.session.unmatched.length, 0);
  assert.equal(addExpectedItem(added.session, 'outside1').status, 'dup');
});

test('match mode tracks found, remaining and unmatched scans', () => {
  let session = normalizeSession({ mode: 'match', items: [] });
  session = setExpected(session, ['AAA111', 'bbb222']);
  assert.equal(session.items.length, 2);
  const found = addScan(session, 'BBB222');
  assert.equal(found.status, 'match');
  const again = addScan(found.session, 'BBB222');
  assert.equal(again.status, 'already');
  const outside = addScan(again.session, 'OTHER9');
  assert.equal(outside.status, 'unmatched');
  const repeat = addScan(outside.session, 'OTHER9');
  assert.equal(repeat.status, 'unmatched-dup');
  assert.equal(repeat.session.unmatched[0].count, 2);
  const summary = sessionSummary(repeat.session);
  assert.equal(summary.matched, 1);
  assert.equal(summary.remaining, 1);
  assert.equal(summary.unmatched, 1);
});

test('collectRecap puts SNs under brand columns and counts per brand', () => {
  const recap = collectRecap([
    { sn: 'ZTE-1', brand: 'ZTE' },
    { sn: 'RCM-1', brand: 'RCM' },
    { sn: 'ZTE-2', brand: 'ZTE' },
  ]);
  assert.deepEqual(recap.headers, ['No', 'ZTE', 'RCM']);
  assert.deepEqual(recap.rows, [
    [1, 'ZTE-1', 'RCM-1'],
    [2, 'ZTE-2', ''],
    ['jumlah', 2, 1],
  ]);
});

test('filterItems supports query, category, duplicates, day and sort', () => {
  const todayIso = new Date().toISOString();
  const items = [
    { sn: 'ZTE1', name: 'Modem', category: 'Perangkat', scanCount: 2, firstAt: todayIso, lastAt: todayIso },
    { sn: 'HW2', name: 'Router', category: 'Aksesoris', scanCount: 1, firstAt: '2020-01-01T08:00:00.000Z', lastAt: '2020-01-01T08:00:00.000Z' },
  ];
  assert.equal(filterItems(items, { query: 'modem' }).length, 1);
  assert.equal(filterItems(items, { category: 'Aksesoris' })[0].sn, 'HW2');
  assert.equal(filterItems(items, { duplicates: true }).length, 1);
  assert.equal(filterItems(items, { today: true }).length, 1);
  assert.equal(filterItems(items, { today: true })[0].sn, 'ZTE1');
  assert.equal(filterItems(items, { sort: 'oldest' })[0].sn, 'HW2');
});

test('edit and delete update a session without touching the original', () => {
  const session = normalizeSession({ mode: 'collect', items: [{ sn: 'AAA', name: 'Lama' }] });
  const edited = replaceItem(session, 0, { name: 'Baru', qty: 3, location: 'Rak A' });
  assert.equal(session.items[0].name, 'Lama');
  assert.equal(edited.items[0].name, 'Baru');
  assert.equal(edited.items[0].qty, 3);
  const removed = deleteItem(edited, 0);
  assert.equal(removed.items.length, 0);
});

test('match export marks pending items with zero scans', () => {
  const session = normalizeSession({ mode: 'match', items: [{ sn: 'AAA' }, { sn: 'BBB', status: 'found' }] });
  const rows = exportRows(session);
  assert.equal(rows[0][9], 0);
  assert.equal(rows[1][9], 1);
});

test('export rows match the twelve summary/inventory headers', () => {
  const session = normalizeSession({ mode: 'collect', items: [{ sn: 'AAA', name: 'Modem', location: 'A1', notes: 'ok' }] });
  const rows = exportRows(session);
  assert.equal(EXPORT_HEADERS.length, 12);
  assert.equal(rows[0].length, 12);
  assert.equal(rows[0][1], 'AAA');
  assert.equal(rows[0][6], 'A1');
});

test('normalizing a match session collapses duplicate SNs and keeps a found hit', () => {
  const session = normalizeSession({
    mode: 'match',
    items: [
      { sn: 'AAA', status: 'pending' },
      { sn: 'aaa', status: 'found', scannedAt: '2026-11-27T01:00:00.000Z' },
    ],
  });
  assert.equal(session.items.length, 1);
  assert.equal(session.items[0].status, 'found');
  assert.equal(session.items[0].scannedAt, '2026-11-27T01:00:00.000Z');
});

test('editing an inactive session does not make it active', () => {
  const storage = memoryStorage();
  const store = new SessionStore(storage);
  const first = store.create('collect', 'First');
  const second = store.create('collect', 'Second');
  store.switchTo(first.id);
  store.rename(second.id, 'Second Renamed');
  assert.equal(store.state.activeIds.collect, first.id);
  store.clear(second.id);
  assert.equal(store.state.activeIds.collect, first.id);
});

test('store persists sessions across instances and separates modes', () => {
  const storage = memoryStorage();
  const first = new SessionStore(storage);
  const collect = first.create('collect', 'Shift 1');
  const match = first.create('match', 'Cek SN');
  first.replace(collect.id, addScan(collect, 'ZTE9').session);
  const second = new SessionStore(storage);
  assert.equal(second.list('collect').length, 1);
  assert.equal(second.list('match').length, 1);
  assert.equal(second.byId(collect.id).items[0].sn, 'ZTE9');
  assert.equal(second.active('match').id, match.id);
  assert.equal(second.rename(collect.id, 'Shift 2').name, 'Shift 2');
  assert.equal(second.clear(collect.id).items.length, 0);
  assert.equal(second.remove(match.id), true);
  assert.equal(second.list('match').length, 0);
});

test('a corrupt stored value is not overwritten on startup', () => {
  const storage = memoryStorage();
  storage.setItem('stockscan/v1', '{broken');
  const state = new SessionStore(storage).state;
  assert.equal(state.sessions.length, 0);
  assert.equal(storage.getItem('stockscan/v1'), '{broken');
});

console.log(`\n${passed} passed`);
