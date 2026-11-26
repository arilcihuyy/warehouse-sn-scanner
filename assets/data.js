/**
 * Warehouse SN Scanner — persisted state and pure list operations.
 * No DOM here so the Node test runner can exercise every rule.
 */

import { normalizeSn } from './scan-core.js';

export const STORAGE_VERSION = 2;
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

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

function normalizeCollectSession(raw) {
  if (!isObject(raw) || !Array.isArray(raw.items)) return null;
  const createdAt = validIso(raw.createdAt) || nowIso();
  const items = [];
  const byKey = new Map();
  for (const item of raw.items) {
    if (!isObject(item)) continue;
    const sn = cleanScanText(item.sn);
    const key = normalizeSn(sn);
    if (!key) continue;
    const qty = Number.isFinite(item.qty) && item.qty >= 1 ? Math.floor(item.qty) : 1;
    const firstAt = validIso(item.firstAt) || createdAt;
    const lastAt = validIso(item.lastAt) || firstAt;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty += qty;
      if (Date.parse(lastAt) > Date.parse(existing.lastAt)) existing.lastAt = lastAt;
      continue;
    }
    const next = { sn, qty, firstAt, lastAt };
    byKey.set(key, next);
    items.push(next);
  }
  if (!items.length) return null;
  return {
    items,
    createdAt,
    updatedAt: validIso(raw.updatedAt),
  };
}

/** Accepts a v1 session (items at the root) or a v2 snapshot. */
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

  const match = normalizeMatchSession(parsed.match);
  const collect = normalizeCollectSession(parsed.collect);
  let lastMode = parsed.lastMode === 'collect' ? 'collect' : 'match';
  if (lastMode === 'collect' && !collect) lastMode = 'match';
  if (lastMode === 'match' && !match && collect) lastMode = 'collect';

  return { version: STORAGE_VERSION, lastMode, match, collect };
}

/**
 * Add a scanned code to a collect session.
 * Returns a new session; the previous one is never mutated.
 */
export function addCollectScan(session, raw, at = nowIso()) {
  const sn = cleanScanText(raw);
  const key = normalizeSn(sn);
  if (!key) return { status: 'invalid', session };

  const timestamp = validIso(at) || nowIso();
  const items = session && Array.isArray(session.items) ? session.items.slice() : [];
  const index = items.findIndex((item) => normalizeSn(item.sn) === key);

  if (index >= 0) {
    const next = {
      ...items[index],
      qty: (Number.isFinite(items[index].qty) ? items[index].qty : 1) + 1,
      lastAt: timestamp,
    };
    items[index] = next;
    return {
      status: 'dup',
      index,
      item: next,
      session: {
        items,
        createdAt: session.createdAt || timestamp,
        updatedAt: timestamp,
      },
    };
  }

  const item = { sn, qty: 1, firstAt: timestamp, lastAt: timestamp };
  items.unshift(item);
  return {
    status: 'new',
    index: 0,
    item,
    session: {
      items,
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

export function collectExportRows(items = []) {
  return items.map((item, index) => [
    index + 1,
    item.sn,
    formatStamp(item.firstAt),
    formatStamp(item.lastAt),
    Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 1,
  ]);
}

export function matchExportRows(items = []) {
  return items.map((item, index) => [
    index + 1,
    item.sn,
    item.status === 'found' ? 'Ketemu' : 'Sisa',
    item.status === 'found' ? formatStamp(item.scannedAt) : '',
  ]);
}
