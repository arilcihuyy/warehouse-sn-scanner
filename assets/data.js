/**
 * Warehouse SN Scanner — persisted state and pure list operations.
 * No DOM here so the Node test runner can exercise every rule.
 */

import { normalizeSn } from './scan-core.js';

export const STORAGE_VERSION = 3;
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

export const BRANDS = ['ZTE', 'Huawei', 'FiberHome', 'RCM', 'Lainnya'];

/** Map free text to one of the fixed brand buckets. */
export function normalizeBrand(value) {
  const clean = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (clean === 'zte') return 'ZTE';
  if (clean === 'huawei' || clean === 'hw') return 'Huawei';
  if (clean === 'fiberhome' || clean === 'fh') return 'FiberHome';
  if (clean === 'rcm') return 'RCM';
  return 'Lainnya';
}

/** Best-effort brand detection from the SN prefix; manual override wins. */
export function guessBrand(value) {
  const sn = String(value ?? '')
    .toUpperCase()
    .replace(/[\s\-_.]/g, '');
  if (/^ZTE/.test(sn)) return 'ZTE';
  if (/^(HWTC|HUAWEI|HW|48575443)/.test(sn)) return 'Huawei';
  if (/^(FHTT|FIBERHOME|FH)/.test(sn)) return 'FiberHome';
  if (/^RCM/.test(sn)) return 'RCM';
  return 'Lainnya';
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validIso(value) {
  return typeof value === 'string' && value && !Number.isNaN(Date.parse(value)) ? value : null;
}

function cleanScanText(value) {
  return String(value ?? '')
    .replace(ZERO_WIDTH, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function nowIso() {
  return new Date().toISOString();
}

/** Local timestamp for spreadsheets: 2026-11-26 14:03:05 (no timezone drift). */
export function formatStamp(value) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export function emptyState() {
  return { version: STORAGE_VERSION, lastMode: 'match', match: null, collect: null };
}

function normalizeMatchSession(raw) {
  if (!isObject(raw) || !Array.isArray(raw.items)) return null;
  const createdAt = validIso(raw.createdAt) || nowIso();
  const items = [];
  for (const item of raw.items) {
    if (!isObject(item) || typeof item.sn !== 'string' || !item.sn.trim()) continue;
    const found = item.status === 'found';
    items.push({
      sn: item.sn.trim().toUpperCase(),
      status: found ? 'found' : 'pending',
      scannedAt: found ? validIso(item.scannedAt) : null,
    });
  }
  if (!items.length) return null;
  return {
    items,
    createdAt,
    updatedAt: validIso(raw.updatedAt),
  };
}

function normalizeCollectSession(raw, clampQty = false) {
  if (!isObject(raw) || !Array.isArray(raw.items)) return null;
  const createdAt = validIso(raw.createdAt) || nowIso();
  const activeBrand =
    String(raw.activeBrand || 'auto').toLowerCase() === 'auto'
      ? 'auto'
      : normalizeBrand(raw.activeBrand);
  const items = [];
  const byKey = new Map();
  for (const item of raw.items) {
    if (!isObject(item)) continue;
    const sn = cleanScanText(item.sn);
    const key = normalizeSn(sn);
    if (!key) continue;
    const brand = item.brand ? normalizeBrand(item.brand) : guessBrand(sn);
    const qty = clampQty
      ? 1
      : Number.isFinite(item.qty) && item.qty >= 1
        ? Math.floor(item.qty)
        : 1;
    const firstAt = validIso(item.firstAt) || createdAt;
    const lastAt = validIso(item.lastAt) || firstAt;
    const existing = byKey.get(key);
    if (existing) {
      if (existing.brand === 'Lainnya' && brand !== 'Lainnya') existing.brand = brand;
      continue;
    }
    const next = { sn, brand, qty, firstAt, lastAt };
    byKey.set(key, next);
    items.push(next);
  }
  if (!items.length) return null;
  return {
    items,
    activeBrand,
    createdAt,
    updatedAt: validIso(raw.updatedAt),
  };
}

/** Accepts a v1 session (items at the root) or a v2/v3 snapshot. */
export function normalizeState(parsed) {
  if (!isObject(parsed)) return emptyState();

  if (Array.isArray(parsed.items)) {
    const match = normalizeMatchSession(parsed);
    return {
      version: STORAGE_VERSION,
      lastMode: 'match',
      match,
      collect: null,
    };
  }

  const legacyQty = parsed.version !== STORAGE_VERSION;
  const match = normalizeMatchSession(parsed.match);
  const collect = normalizeCollectSession(parsed.collect, legacyQty);
  let lastMode = parsed.lastMode === 'collect' ? 'collect' : 'match';
  if (lastMode === 'collect' && !collect) lastMode = 'match';
  if (lastMode === 'match' && !match && collect) lastMode = 'collect';

  return { version: STORAGE_VERSION, lastMode, match, collect };
}

/**
 * Add a scanned code to a collect session.
 * A code that already exists is rejected untouched (one SN = one row).
 */
export function addCollectScan(session, raw, at = nowIso(), brand = null) {
  const sn = cleanScanText(raw);
  const key = normalizeSn(sn);
  if (!key) return { status: 'invalid', session };

  const timestamp = validIso(at) || nowIso();
  const explicit = brand != null && String(brand).toLowerCase() !== 'auto';
  const resolvedBrand = explicit ? normalizeBrand(brand) : guessBrand(sn);
  const items = session && Array.isArray(session.items) ? session.items.slice() : [];
  const index = items.findIndex((item) => normalizeSn(item.sn) === key);
  if (index >= 0) {
    return { status: 'dup', index, item: items[index], session };
  }

  const item = { sn, brand: resolvedBrand, qty: 1, firstAt: timestamp, lastAt: timestamp };
  items.unshift(item);
  return {
    status: 'new',
    index: 0,
    item,
    session: {
      items,
      activeBrand: session && session.activeBrand ? session.activeBrand : 'auto',
      createdAt: session && session.createdAt ? session.createdAt : timestamp,
      updatedAt: timestamp,
    },
  };
}

export function collectSummary(items = []) {
  let totalQty = 0;
  for (const item of items) {
    totalQty += Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 1;
  }
  return { unique: items.length, totalQty };
}

/** Per-brand totals in the fixed display order, skipping empty brands. */
export function collectBrandSummary(items = []) {
  const groups = new Map(
    BRANDS.map((brand) => [brand, { brand, unique: 0, totalQty: 0 }]),
  );
  for (const item of items) {
    const group = groups.get(normalizeBrand(item.brand));
    group.unique += 1;
    group.totalQty += Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 1;
  }
  return BRANDS.map((brand) => groups.get(brand)).filter((group) => group.unique > 0);
}

/** Stable sort by brand order, preserving scan order inside each brand. */
export function sortCollectByBrand(items = []) {
  const order = new Map(BRANDS.map((brand, index) => [brand, index]));
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const diff =
        order.get(normalizeBrand(a.item.brand)) - order.get(normalizeBrand(b.item.brand));
      return diff || a.index - b.index;
    })
    .map((entry) => entry.item);
}

export function collectExportRows(items = [], { withBrand = true } = {}) {
  return items.map((item, index) => {
    const row = [index + 1];
    if (withBrand) row.push(normalizeBrand(item.brand));
    row.push(
      item.sn,
      formatStamp(item.firstAt),
      formatStamp(item.lastAt),
      Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 1,
    );
    return row;
  });
}

export function matchExportRows(items = []) {
  return items.map((item, index) => [
    index + 1,
    item.sn,
    item.status === 'found' ? 'Ketemu' : 'Sisa',
    item.status === 'found' ? formatStamp(item.scannedAt) : '',
  ]);
}
