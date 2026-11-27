/**
 * StockScan, session-based inventory state.
 * Pure functions stay DOM-free so Node tests can exercise them.
 * Existing v1/v2/v3 snapshots are migrated without losing records.
 */

import { normalizeSn } from './scan-core.js?v=20261127j';
import { normalizeState as normalizeLegacy, formatStamp, guessBrand, normalizeBrand, BRANDS } from './data.js';

export { formatStamp, guessBrand, normalizeBrand, BRANDS };

export const STORAGE_VERSION = 4;
export const STORAGE_KEY = 'stockscan/v1';
export const LEGACY_KEY = 'warehouse-sn-scanner/v2';
export const CATEGORIES = ['Perangkat', 'Aksesoris', 'Konsumsi', 'Dokumen', 'Lainnya'];

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function uid(prefix = 's') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

function validIso(value, fallback = null) {
  return typeof value === 'string' && value && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function cleanText(value) {
  return String(value ?? '')
    .replace(ZERO_WIDTH, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function qtyOf(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : 1;
}

export function normalizeItem(raw, mode = 'collect') {
  if (!isObject(raw)) return null;
  const sn = cleanText(raw.sn ?? raw.barcode ?? raw.value);
  if (!normalizeSn(sn)) return null;
  const first = validIso(raw.firstAt ?? raw.createdAt, nowIso());
  const rawBrand = cleanText(raw.brand);
  const brand = rawBrand && rawBrand.toLowerCase() !== 'auto' ? normalizeBrand(rawBrand) : guessBrand(sn);
  if (mode === 'match') {
    return {
      sn,
      status: raw.status === 'found' ? 'found' : 'pending',
      scannedAt: raw.status === 'found' ? validIso(raw.scannedAt, first) : null,
      format: cleanText(raw.format),
      name: cleanText(raw.name),
      brand,
      category: CATEGORIES.includes(raw.category) ? raw.category : 'Perangkat',
      qty: qtyOf(raw.qty),
      location: cleanText(raw.location),
      notes: String(raw.notes ?? ''),
    };
  }
  return {
    sn,
    format: cleanText(raw.format),
    name: cleanText(raw.name),
    brand,
    category: CATEGORIES.includes(raw.category) ? raw.category : 'Perangkat',
    qty: qtyOf(raw.qty),
    location: cleanText(raw.location),
    notes: String(raw.notes ?? ''),
    firstAt: first,
    lastAt: validIso(raw.lastAt, first),
    // Scan Bebas is one row per SN. Repeated scans are rejected, so a
    // normalized collect item always has exactly one scan event.
    scanCount: 1,
  };
}

export function normalizeSession(raw) {
  if (!isObject(raw)) return null;
  const mode = raw.mode === 'match' ? 'match' : 'collect';
  const items = [];
  const seen = new Set();
  for (const entry of Array.isArray(raw.items) ? raw.items : []) {
    const item = normalizeItem(entry, mode);
    if (!item) continue;
    const key = normalizeSn(item.sn);
    if (seen.has(key)) {
      if (mode === 'match') {
        const existing = items.find((candidate) => normalizeSn(candidate.sn) === key);
        if (existing && item.status === 'found' && existing.status !== 'found') {
          existing.status = 'found';
          existing.scannedAt = item.scannedAt;
        }
      }
      continue;
    }
    seen.add(key);
    items.push(item);
  }
  if (!items.length && !isObject(raw)) return null;
  const createdAt = validIso(raw.createdAt ?? raw.startedAt, nowIso());
  const unmatched = [];
  if (mode === 'match') {
    for (const entry of Array.isArray(raw.unmatched) ? raw.unmatched : []) {
      const sn = cleanText(entry?.sn);
      if (!sn) continue;
      const existing = unmatched.find((item) => normalizeSn(item.sn) === normalizeSn(sn));
      if (existing) {
        existing.count = qtyOf(existing.count) + 1;
        existing.at = validIso(entry.at, existing.at);
      } else {
        unmatched.push({
          sn,
          format: cleanText(entry?.format),
          at: validIso(entry?.at, createdAt),
          count: qtyOf(entry?.count),
        });
      }
    }
  }
  return {
    id: cleanText(raw.id) || uid(),
    mode,
    name: cleanText(raw.name) || (mode === 'match' ? 'Cocokkan Daftar' : 'Scan Bebas'),
    notes: String(raw.notes ?? ''),
    createdAt,
    updatedAt: validIso(raw.updatedAt, createdAt),
    activeBrand:
      !raw.activeBrand || cleanText(raw.activeBrand).toLowerCase() === 'auto'
        ? 'auto'
        : normalizeBrand(raw.activeBrand),
    duplicateScans: Math.max(0, Math.floor(Number(raw.duplicateScans ?? raw.duplicates) || 0)),
    items,
    unmatched,
  };
}

/** Convert older snapshots (v1-v3) into the session model. */
export function normalizeState(parsed) {
  if (!isObject(parsed)) return freshState();
  if (Array.isArray(parsed.sessions)) {
    const sessions = parsed.sessions.map(normalizeSession).filter(Boolean);
    const activeIds = {
      collect: sessions.find((s) => s.id === parsed.activeIds?.collect && s.mode === 'collect')?.id
        || sessions.find((s) => s.mode === 'collect')?.id
        || null,
      match: sessions.find((s) => s.id === parsed.activeIds?.match && s.mode === 'match')?.id
        || sessions.find((s) => s.mode === 'match')?.id
        || null,
    };
    return {
      version: STORAGE_VERSION,
      lastMode: parsed.lastMode === 'collect' ? 'collect' : 'match',
      sessions,
      activeIds,
    };
  }

  const legacy = normalizeLegacy(parsed);
  const sessions = [];
  if (legacy.collect?.items?.length) {
    sessions.push(normalizeSession({
      id: 'legacy-collect',
      mode: 'collect',
      name: 'Scan Bebas (dipulihkan)',
      createdAt: legacy.collect.createdAt,
      updatedAt: legacy.collect.updatedAt,
      activeBrand: legacy.collect.activeBrand,
      items: legacy.collect.items.map((item) => ({
        ...item,
        scanCount: 1,
        category: 'Perangkat',
      })),
    }));
  }
  if (legacy.match?.items?.length) {
    sessions.push(normalizeSession({
      id: 'legacy-match',
      mode: 'match',
      name: 'Cocokkan Daftar (dipulihkan)',
      createdAt: legacy.match.createdAt,
      updatedAt: legacy.match.updatedAt,
      items: legacy.match.items,
    }));
  }
  return {
    version: STORAGE_VERSION,
    lastMode: legacy.lastMode,
    sessions,
    activeIds: {
      collect: sessions.find((s) => s.mode === 'collect')?.id || null,
      match: sessions.find((s) => s.mode === 'match')?.id || null,
    },
  };
}

export function freshState() {
  return {
    version: STORAGE_VERSION,
    lastMode: 'collect',
    sessions: [],
    activeIds: { collect: null, match: null },
  };
}

export function sessionSummary(session) {
  const items = session?.items || [];
  const duplicateScans = Math.max(0, Math.floor(Number(session?.duplicateScans) || 0));
  let totalScans = duplicateScans;
  let duplicates = duplicateScans;
  let qty = 0;
  for (const item of items) {
    const scans = modeIsMatch(session) ? (item.status === 'found' ? 1 : 0) : qtyOf(item.scanCount);
    totalScans += scans;
    duplicates += modeIsMatch(session) ? 0 : Math.max(0, scans - 1);
    qty += qtyOf(item.qty);
  }
  for (const item of session?.unmatched || []) {
    totalScans += qtyOf(item.count);
    duplicates += Math.max(0, qtyOf(item.count) - 1);
  }
  return {
    unique: items.length,
    totalScans,
    duplicates,
    qty,
    matched: items.filter((item) => item.status === 'found').length,
    remaining: items.filter((item) => item.status !== 'found').length,
    unmatched: (session?.unmatched || []).length,
  };
}

/**
 * Column-per-brand recap used by the Excel export:
 * No | RCM | ZTE | ... ; one row per unit, SN under its brand.
 * Last row is "jumlah" with the count for every brand.
 */
export function collectRecap(items = []) {
  const safeItems = (items || []).filter((item) => item && normalizeSn(item.sn));
  const brands = BRANDS.filter((brand) => safeItems.some((item) => item.brand === brand));
  const columns = brands.length ? brands : [];
  const buckets = new Map(columns.map((brand) => [brand, []]));
  for (const item of safeItems) {
    const brand = columns.includes(item.brand) ? item.brand : BRANDS[BRANDS.length - 1];
    if (!buckets.has(brand)) {
      columns.push(brand);
      buckets.set(brand, []);
    }
    buckets.get(brand).push(item.sn);
  }
  const maxRows = columns.reduce((max, brand) => Math.max(max, buckets.get(brand).length), 0);
  const rows = [];
  for (let index = 0; index < maxRows; index += 1) {
    rows.push([index + 1, ...columns.map((brand) => buckets.get(brand)[index] || '')]);
  }
  rows.push(['jumlah', ...columns.map((brand) => buckets.get(brand).length)]);
  return { headers: ['No', ...columns], rows };
}

function modeIsMatch(session) {
  return session?.mode === 'match';
}

/** Add a scan to a session. Never mutates the caller's session. */
export function addScan(session, raw, meta = {}) {
  const sn = cleanText(raw);
  const key = normalizeSn(sn);
  if (!key) return { status: 'invalid', session };
  const at = validIso(meta.at, nowIso());
  const mode = session?.mode === 'match' ? 'match' : 'collect';
  const base = session || {
    id: uid(),
    mode,
    name: mode === 'match' ? 'Cocokkan Daftar' : 'Scan Bebas',
    notes: '',
    createdAt: at,
    updatedAt: at,
    activeBrand: 'auto',
    duplicateScans: 0,
    items: [],
    unmatched: [],
  };
  const items = base.items.map((item) => ({ ...item }));
  const unmatched = (base.unmatched || []).map((item) => ({ ...item }));
  const next = { ...base, items, unmatched, updatedAt: at };

  if (mode === 'match') {
    const index = items.findIndex((item) => normalizeSn(item.sn) === key);
    if (index >= 0) {
      if (items[index].status === 'found') {
        return { status: 'already', index, item: items[index], session: next };
      }
      items[index] = {
        ...items[index],
        status: 'found',
        scannedAt: at,
        format: meta.format || items[index].format,
      };
      return { status: 'match', index, item: items[index], session: next };
    }
    const existing = unmatched.findIndex((item) => normalizeSn(item.sn) === key);
    if (existing >= 0) {
      unmatched[existing] = {
        ...unmatched[existing],
        count: qtyOf(unmatched[existing].count) + 1,
        at,
      };
      return { status: 'unmatched-dup', index: existing, item: unmatched[existing], session: next };
    }
    const item = { sn, format: meta.format || '', at, count: 1 };
    unmatched.unshift(item);
    return { status: 'unmatched', index: 0, item, session: next };
  }

  const index = items.findIndex((item) => normalizeSn(item.sn) === key);
  if (index >= 0) {
    // A serial number is one physical row; do not bump scanCount or lastAt.
    return {
      status: 'dup',
      index,
      item: items[index],
      session: {
        ...base,
        duplicateScans: Math.max(0, Math.floor(Number(base.duplicateScans) || 0)) + 1,
        updatedAt: at,
      },
    };
  }
  const explicitBrand = cleanText(meta.brand);
  const explicit = explicitBrand && explicitBrand.toLowerCase() !== 'auto'
    ? normalizeBrand(explicitBrand)
    : null;
  const brand = explicit || (base.activeBrand && base.activeBrand !== 'auto' ? base.activeBrand : guessBrand(sn));
  const item = normalizeItem({
    sn,
    format: meta.format,
    name: meta.name,
    brand,
    category: meta.category,
    qty: meta.qty,
    location: meta.location,
    notes: meta.notes,
    firstAt: at,
    lastAt: at,
    scanCount: 1,
  }, 'collect');
  items.unshift(item);
  return { status: 'new', index: 0, item, session: next };
}

export function addExpectedItem(session, raw, meta = {}) {
  const sn = cleanText(raw);
  const key = normalizeSn(sn);
  if (!key) return null;
  const base = session?.mode === 'match' ? session : null;
  if (!base) return null;
  const items = base.items.slice();
  const existing = items.find((item) => normalizeSn(item.sn) === key);
  if (existing) return { status: 'dup', item: existing, session: base };
  const item = normalizeItem({
    sn,
    format: meta.format,
    name: meta.name,
    brand: meta.brand,
    category: meta.category,
    qty: meta.qty,
    location: meta.location,
    notes: meta.notes,
  }, 'match');
  if (!item) return null;
  items.unshift(item);
  const unmatched = (base.unmatched || []).filter((entry) => normalizeSn(entry.sn) !== key);
  return { status: 'new', item, session: { ...base, items, unmatched, updatedAt: nowIso() } };
}

export function setExpected(session, values) {
  const at = nowIso();
  const items = [];
  const seen = new Set();
  for (const raw of values || []) {
    const sn = cleanText(raw);
    const key = normalizeSn(sn);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const item = normalizeItem({ sn, category: 'Perangkat' }, 'match');
    items.push(item);
  }
  return {
    ...session,
    mode: 'match',
    items,
    unmatched: [],
    duplicateScans: 0,
    updatedAt: at,
  };
}

export function replaceItem(session, index, patch) {
  const items = session.items.slice();
  const current = items[index];
  if (!current) return null;
  const sn = cleanText(patch.sn ?? current.sn);
  const key = normalizeSn(sn);
  if (!key) return null;
  for (let i = 0; i < items.length; i += 1) {
    if (i !== index && normalizeSn(items[i].sn) === key) return null;
  }
  const nextItem = normalizeItem({ ...current, ...patch, sn }, session.mode);
  if (!nextItem) return null;
  items[index] = nextItem;
  return { ...session, items, updatedAt: nowIso() };
}

export function deleteItem(session, index) {
  if (!session?.items?.[index]) return session;
  const items = session.items.slice();
  items.splice(index, 1);
  return { ...session, items, updatedAt: nowIso() };
}

export function filterItems(items = [], options = {}) {
  const { query = '', category = '', duplicates = false, today = false, sort = 'newest' } = options;
  const needle = cleanText(query).toUpperCase();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const threshold = startOfToday.getTime();
  const filtered = items.map((item, index) => ({ item, index })).filter(({ item }) => {
    if (needle) {
      const haystack = [item.sn, item.name, item.brand, item.category, item.location]
        .join(' ')
        .toUpperCase();
      if (!haystack.includes(needle)) return false;
    }
    if (category && item.category !== category) return false;
    if (duplicates && qtyOf(item.scanCount) < 2) return false;
    if (today) {
      const at = Date.parse(item.lastAt || item.scannedAt || item.firstAt || '');
      if (!Number.isFinite(at) || at < threshold) return false;
    }
    return true;
  });
  filtered.sort((a, b) => {
    const at = (entry) => Date.parse(entry.item.lastAt || entry.item.scannedAt || entry.item.firstAt || '') || 0;
    const diff = at(b) - at(a) || b.index - a.index;
    return sort === 'oldest' ? -diff : diff;
  });
  return filtered.map((entry) => entry.item);
}

export function exportRows(session) {
  const match = modeIsMatch(session);
  return (session?.items || []).map((item, index) => [
    index + 1,
    item.sn,
    item.name || item.sn,
    item.brand,
    item.category,
    qtyOf(item.qty),
    item.location,
    formatStamp(item.lastAt || item.scannedAt || item.firstAt),
    item.notes || '',
    match ? (item.status === 'found' ? 1 : 0) : qtyOf(item.scanCount),
    item.status === 'found' ? 'Ketemu' : item.status === 'pending' ? 'Sisa' : '',
    item.format || '',
  ]);
}

export const EXPORT_HEADERS = [
  'No', 'Barcode/SN', 'Nama Produk', 'Merk', 'Kategori', 'Jumlah',
  'Lokasi', 'Waktu', 'Catatan', 'Jumlah Scan', 'Status', 'Format',
];

/** localStorage-backed store with an in-memory cache and safe migration. */
export class SessionStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.state = this.read();
  }

  read() {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY) || this.storage?.getItem(LEGACY_KEY);
      if (!raw) return freshState();
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      console.warn('[stockscan] state tidak dapat dibaca, mulai kosong', error);
      return freshState();
    }
  }

  save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.warn('[stockscan] state tidak dapat disimpan', error);
    }
  }

  setMode(mode) {
    this.state.lastMode = mode === 'match' ? 'match' : 'collect';
    this.save();
  }

  list(mode) {
    return this.state.sessions.filter((session) => session.mode === mode);
  }

  byId(id) {
    return this.state.sessions.find((session) => session.id === id) || null;
  }

  active(mode) {
    const id = this.state.activeIds[mode];
    return this.byId(id) || this.list(mode)[0] || null;
  }

  ensure(mode = 'collect') {
    const existing = this.active(mode);
    if (existing) return existing;
    const session = this.create(mode, mode === 'match' ? 'Cocokkan Daftar' : 'Scan Bebas');
    return session;
  }

  create(mode = 'collect', name = 'Sesi Baru') {
    const at = nowIso();
    const session = normalizeSession({
      id: uid(),
      mode: mode === 'match' ? 'match' : 'collect',
      name: cleanText(name) || 'Sesi Baru',
      notes: '',
      createdAt: at,
      updatedAt: at,
      activeBrand: 'auto',
      items: [],
      unmatched: [],
    });
    this.state.sessions.push(session);
    this.state.activeIds[session.mode] = session.id;
    this.state.lastMode = session.mode;
    this.save();
    return session;
  }

  switchTo(id) {
    const session = this.byId(id);
    if (!session) return null;
    this.state.activeIds[session.mode] = session.id;
    this.state.lastMode = session.mode;
    this.save();
    return session;
  }

  replace(id, next) {
    const index = this.state.sessions.findIndex((session) => session.id === id);
    if (index < 0) return null;
    const previous = this.state.sessions[index];
    const wasActive = !this.state.activeIds[previous.mode] || this.state.activeIds[previous.mode] === previous.id;
    this.state.sessions[index] = normalizeSession(next) || next;
    if (wasActive) this.state.activeIds[this.state.sessions[index].mode] = this.state.sessions[index].id;
    this.save();
    return this.state.sessions[index];
  }

  rename(id, name) {
    const session = this.byId(id);
    if (!session) return null;
    return this.replace(id, { ...session, name: cleanText(name) || session.name });
  }

  setNotes(id, notes) {
    const session = this.byId(id);
    if (!session) return null;
    return this.replace(id, { ...session, notes: String(notes ?? '') });
  }

  clear(id) {
    const session = this.byId(id);
    if (!session) return null;
    return this.replace(id, {
      ...session,
      items: [],
      unmatched: [],
      duplicateScans: 0,
      updatedAt: nowIso(),
    });
  }

  remove(id) {
    const index = this.state.sessions.findIndex((session) => session.id === id);
    if (index < 0) return false;
    const [removed] = this.state.sessions.splice(index, 1);
    if (this.state.activeIds[removed.mode] === removed.id) {
      this.state.activeIds[removed.mode] = this.list(removed.mode)[0]?.id || null;
    }
    this.save();
    return true;
  }
}
