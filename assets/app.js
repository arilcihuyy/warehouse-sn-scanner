import {
  formatDateTime,
  formatShortDate,
  formatTime,
  normalizeSn,
  parseSnFile,
  parseSnText,
} from './scan-core.js';
import {
  addCollectScan,
  collectBrandSummary,
  collectExportRows,
  collectSummary,
  emptyState,
  formatStamp,
  guessBrand,
  matchExportRows,
  normalizeBrand,
  normalizeState,
  sortCollectByBrand,
} from './data.js';
import { stampForFilename, toCsv, toTsv } from './export.js';
import { buildWorkbook, buildXlsx } from './xlsx.js';
import { CameraScanner } from './scanner.js';
import { FeedbackAudio } from './audio.js';

const STORAGE_KEY = 'warehouse-sn-scanner/v2';
const LEGACY_KEY = 'warehouse-sn-scanner/v1';
const SCAN_COOLDOWN_MS = 1500;

const COLLECT_HEADERS = ['No', 'Merk', 'SN', 'Scan pertama', 'Scan terakhir', 'Jumlah'];
const COLLECT_WIDTHS = [6, 14, 30, 20, 20, 8];
const BRAND_HEADERS = ['No', 'SN', 'Scan pertama', 'Scan terakhir', 'Jumlah'];
const BRAND_WIDTHS = [6, 30, 20, 20, 8];
const MATCH_HEADERS = ['No', 'SN', 'Status', 'Waktu scan'];
const MATCH_WIDTHS = [6, 30, 12, 20];

const ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7.3"/></svg>';
const ICON_BARCODE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 6v12M7.5 6v12M11 6v12M14.5 6v12M18 6v12M20.5 6v12"/></svg>';
const ICON_EDIT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M14 7l3 3"/></svg>';

const el = {};
let store = emptyState();
let mode = 'match';
let state = null;
let itemIndex = new Map();
let filter = 'all';
let search = '';
let scanner = null;
let audio = new FeedbackAudio();
let cameraStarting = false;
let cameraAttempt = 0;
let completeAnnounced = false;
let lastScan = new Map();
let hintTimer = 0;
let frameTimer = 0;
let toastTimer = 0;
let modalReturnFocus = null;
let confirmHandler = null;
let editIndex = -1;
let editQty = 1;
let editBrand = 'auto';

function cacheElements() {
  const ids = [
    'import-view',
    'mode-switch',
    'match-panel',
    'collect-panel',
    'collect-count',
    'collect-sub',
    'collect-start',
    'collect-reset',
    'import-form',
    'sn-input',
    'preview-count',
    'file-btn',
    'file-input',
    'file-note',
    'import-error',
    'start-btn',
    'insecure-note',
    'scan-view',
    'camera-stage',
    'camera-video',
    'camera-mode',
    'scan-frame',
    'scan-hint',
    'camera-idle',
    'idle-start',
    'camera-error',
    'camera-error-title',
    'camera-error-body',
    'camera-retry',
    'paused-overlay',
    'paused-resume',
    'pause-btn',
    'torch-btn',
    'home-btn',
    'camera-date',
    'progress-block',
    'progress-label',
    'found-count',
    'total-count',
    'progress-pct',
    'progress-bar',
    'progress-fill',
    'complete-line',
    'sheet-sub',
    'search-input',
    'search-clear',
    'manual-btn',
    'brand-bar',
    'brand-chips',
    'tabs',
    'tab-all',
    'tab-pending',
    'tab-found',
    'sn-list',
    'rekap-btn',
    'bottom-label',
    'rekap-count',
    'toast',
    'toast-text',
    'rekap-modal',
    'rekap-close',
    'rekap-sub',
    'sum-total',
    'sum-found',
    'sum-left',
    'left-count',
    'found-count-2',
    'left-list',
    'found-list',
    'rekap-xlsx',
    'copy-report',
    'copy-left',
    'reset-btn',
    'export-modal',
    'export-close',
    'export-sub',
    'export-unique',
    'export-total',
    'export-xlsx',
    'export-csv',
    'export-tsv',
    'export-reset',
    'edit-modal',
    'edit-form',
    'edit-title',
    'edit-meta',
    'edit-sn',
    'edit-brand',
    'edit-error',
    'edit-qty',
    'qty-minus',
    'qty-plus',
    'edit-delete',
    'edit-cancel',
    'confirm-modal',
    'confirm-title',
    'confirm-cancel',
    'confirm-reset',
    'confirm-text',
  ];
  for (const id of ids) el[id] = document.getElementById(id);
}

/* ------------------------------------------------------------------ state */

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const normalized = normalizeState(parsed);
      return { store: normalized, migrated: parsed.version !== normalized.version };
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return { store: normalizeState(JSON.parse(legacy)), migrated: true };
  } catch {
    /* corrupted storage falls through to an empty state */
  }
  return { store: emptyState(), migrated: false };
}

function saveStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    toast('Gagal menyimpan data', 'error');
    return false;
  }
}

function saveActive() {
  if (state) state.updatedAt = new Date().toISOString();
  return saveStore();
}

function reindex() {
  itemIndex = new Map();
  if (!state) return;
  for (const item of state.items) itemIndex.set(normalizeSn(item.sn), item);
}

function applyMode(next, { persist = true } = {}) {
  mode = next === 'collect' ? 'collect' : 'match';
  state = store[mode] || null;
  store.lastMode = mode;
  filter = 'all';
  updateFilterTabs();
  clearSearch();
  reindex();
  if (persist) saveStore();
  renderModeHome();
}

function clearSearch() {
  search = '';
  if (el['search-input']) el['search-input'].value = '';
  if (el['search-clear']) el['search-clear'].hidden = true;
}

function cleanSnText(value) {
  return String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function setThemeColor(color) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', color);
}

function activeBrandValue() {
  const value = state && state.activeBrand ? state.activeBrand : 'auto';
  return value === 'auto' ? 'auto' : normalizeBrand(value);
}

/** null means "let the scanner infer it from the SN prefix". */
function brandForNextScan() {
  const value = activeBrandValue();
  return value === 'auto' ? null : value;
}

function renderBrandBar() {
  const visible = mode === 'collect' && Boolean(state);
  el['brand-bar'].hidden = !visible;
  if (!visible) return;
  const active = activeBrandValue();
  for (const chip of el['brand-chips'].querySelectorAll('.brand-chip')) {
    const on = chip.dataset.brand === active;
    chip.classList.toggle('is-active', on);
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

/* ------------------------------------------------------------------ views */

function showHome() {
  if (scanner && scanner.isRunning) scanner.stop();
  cameraAttempt += 1;
  cameraStarting = false;
  el['scan-view'].hidden = true;
  el['import-view'].hidden = false;
  document.body.classList.remove('in-scan');
  document.title = 'Warehouse SN Scanner';
  setThemeColor('#F4F1EA');
  el['paused-overlay'].hidden = true;
  el['camera-error'].hidden = true;
  el['camera-idle'].hidden = true;
  el['pause-btn'].classList.remove('is-paused');
  el['pause-btn'].setAttribute('aria-pressed', 'false');
  el['pause-btn'].setAttribute('aria-label', 'Jeda kamera');
  renderModeHome();
}

function renderModeHome() {
  const tabs = el['mode-switch'].querySelectorAll('.mode-tab');
  for (const tab of tabs) {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.tabIndex = active ? 0 : -1;
  }

  el['match-panel'].hidden = mode !== 'match';
  el['collect-panel'].hidden = mode !== 'collect';

  const session = store.collect;
  if (session) {
    const summary = collectSummary(session.items);
    const brandGroups = collectBrandSummary(session.items);
    const brands = brandGroups
      .map((group) => `${group.brand} ${group.unique}`)
      .join(' · ');
    el['collect-count'].textContent = `${summary.unique} SN · ${brandGroups.length} merk`;
    el['collect-sub'].textContent = `Dimulai ${formatDateTime(session.createdAt)}${
      brands ? ` · ${brands}` : ''
    }`;
    el['collect-start'].querySelector('span').textContent = 'Lanjutkan scan';
    el['collect-reset'].hidden = false;
  } else {
    el['collect-count'].textContent = 'Belum ada sesi';
    el['collect-sub'].textContent = 'Mulai scan, hasilnya tersimpan otomatis.';
    el['collect-start'].querySelector('span').textContent = 'Mulai scan bebas';
    el['collect-reset'].hidden = true;
  }
}

function showScanView({ autoStart = false } = {}) {
  if (!state) {
    showHome();
    return;
  }
  el['import-view'].hidden = true;
  el['scan-view'].hidden = false;
  document.body.classList.add('in-scan');
  setThemeColor('#08090A');
  el['camera-mode'].textContent = mode === 'collect' ? 'Scan Bebas' : 'SN Scanner';
  el['camera-date'].textContent = formatShortDate(state.createdAt);
  renderAll();
  completeAnnounced =
    mode === 'match' &&
    state.items.length > 0 &&
    state.items.every((item) => item.status === 'found');
  requestAnimationFrame(() => {
    if (autoStart) activateCamera();
    else if (!scanner || !scanner.isRunning) showIdle();
  });
}

function showIdle() {
  if (scanner && scanner.isRunning) {
    hideOverlays();
    return;
  }
  el['camera-error'].hidden = true;
  el['paused-overlay'].hidden = true;
  el['camera-idle'].hidden = false;
  el['scan-frame'].classList.remove('is-hidden', 'is-hit', 'is-dup');
  setHint('Kamera nonaktif', 'idle');
}

function hideOverlays() {
  el['camera-idle'].hidden = true;
  el['camera-error'].hidden = true;
  el['paused-overlay'].hidden = true;
  el['scan-frame'].classList.remove('is-hidden');
}

function cameraErrorMessage(error) {
  const name = error && error.name ? error.name : '';
  if (!window.isSecureContext) {
    return {
      title: 'Kamera butuh HTTPS',
      body: 'Browser memblokir kamera pada alamat http://. Buka halaman ini lewat https:// atau localhost.',
    };
  }
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        title: 'Izin kamera ditolak',
        body: 'Izinkan akses kamera lewat ikon kunci di address bar, lalu coba lagi. Jika halaman ini dibuka dari dalam Telegram, buka di Chrome atau Safari.',
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        title: 'Kamera tidak ditemukan',
        body: 'Perangkat ini tidak punya kamera yang bisa dipakai browser. Daftar SN tetap bisa diubah manual.',
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        title: 'Kamera sedang dipakai',
        body: 'Tutup aplikasi lain yang memakai kamera, lalu tekan Coba lagi.',
      };
    case 'OverconstrainedError':
      return {
        title: 'Kamera belakang tidak tersedia',
        body: 'Coba lagi untuk memakai kamera lain, atau tambah SN secara manual.',
      };
    case 'NotSupportedError':
      return {
        title: 'Browser tidak mendukung kamera',
        body: 'Gunakan Chrome di Android atau Safari di iOS versi terbaru. Daftar SN tetap bisa dipakai manual.',
      };
    case 'TrackEnded':
      return {
        title: 'Kamera berhenti',
        body: 'Kamera terputus atau diambil aplikasi lain. Tekan Coba lagi untuk menyalakan ulang.',
      };
    case 'TimeoutError':
      return {
        title: 'Kamera belum merespons',
        body: 'Jika browser menampilkan permintaan izin kamera, pilih Izinkan. Setelah itu tekan Coba lagi.',
      };
    case 'ScannerUnavailable':
      return {
        title: 'Scanner tidak termuat',
        body: 'Library pemindai gagal dimuat. Muat ulang halaman, lalu coba lagi.',
      };
    default:
      return {
        title: 'Kamera gagal dimulai',
        body: 'Terjadi masalah saat membuka kamera. Muat ulang halaman atau tambah SN secara manual.',
      };
  }
}

function showCameraError(error) {
  const info = cameraErrorMessage(error);
  el['camera-error-title'].textContent = info.title;
  el['camera-error-body'].textContent = info.body;
  el['camera-idle'].hidden = true;
  el['paused-overlay'].hidden = true;
  el['camera-error'].hidden = false;
  el['scan-frame'].classList.add('is-hidden');
  setHint('Kamera tidak aktif', 'idle');
  console.warn('[camera]', error);
}

async function activateCamera() {
  if (!state) return;
  if (!scanner) {
    showCameraError({ name: 'ScannerUnavailable' });
    return;
  }
  if (scanner.isRunning) {
    if (scanner.isPaused) togglePause();
    hideOverlays();
    return;
  }
  if (cameraStarting) return;
  const attempt = (cameraAttempt += 1);
  cameraStarting = true;
  audio.unlock();
  hideOverlays();
  setHint('Menyalakan kamera...', 'idle');
  const watchdog = window.setTimeout(() => {
    if (attempt !== cameraAttempt || scanner.isRunning) return;
    cameraAttempt += 1;
    cameraStarting = false;
    scanner.abortStart();
    showCameraError({ name: 'TimeoutError' });
  }, 12000);
  try {
    await scanner.start();
    window.clearTimeout(watchdog);
    if (attempt !== cameraAttempt) return;
    hideOverlays();
    setHint('Arahkan barcode ke dalam kotak', 'idle');
  } catch (error) {
    window.clearTimeout(watchdog);
    if (attempt !== cameraAttempt) return;
    if (!error || error.name !== 'AbortError') showCameraError(error);
  } finally {
    if (attempt === cameraAttempt) cameraStarting = false;
  }
}

function togglePause() {
  if (!scanner || !scanner.isRunning) return;
  if (scanner.isPaused) {
    scanner.resume();
    el['paused-overlay'].hidden = true;
    el['pause-btn'].classList.remove('is-paused');
    el['pause-btn'].setAttribute('aria-pressed', 'false');
    el['pause-btn'].setAttribute('aria-label', 'Jeda kamera');
    setHint('Arahkan barcode ke dalam kotak', 'idle');
  } else {
    scanner.pause();
    el['paused-overlay'].hidden = false;
    el['pause-btn'].classList.add('is-paused');
    el['pause-btn'].setAttribute('aria-pressed', 'true');
    el['pause-btn'].setAttribute('aria-label', 'Lanjutkan kamera');
  }
}

function onTorchChange(supported, on) {
  el['torch-btn'].hidden = !supported;
  el['torch-btn'].classList.toggle('is-on', Boolean(on));
  el['torch-btn'].setAttribute('aria-pressed', on ? 'true' : 'false');
  el['torch-btn'].setAttribute('aria-label', on ? 'Matikan senter' : 'Nyalakan senter');
}

async function toggleTorch() {
  if (!scanner) return;
  try {
    await scanner.toggleTorch();
  } catch {
    toast('Senter tidak tersedia di perangkat ini', 'warn');
  }
}

function goHome() {
  saveActive();
  showHome();
}

/* ------------------------------------------------------------------- scan */

function setHint(text, kind = 'idle') {
  el['scan-hint'].textContent = text;
  el['scan-hint'].dataset.kind = kind;
  clearTimeout(hintTimer);
  if (kind !== 'idle') {
    hintTimer = window.setTimeout(() => {
      el['scan-hint'].textContent = 'Arahkan barcode ke dalam kotak';
      el['scan-hint'].dataset.kind = 'idle';
    }, 2600);
  }
}

function flashFrame(kind) {
  const frame = el['scan-frame'];
  frame.classList.remove('is-hit', 'is-dup');
  void frame.offsetWidth;
  frame.classList.add(kind === 'dup' ? 'is-dup' : 'is-hit');
  clearTimeout(frameTimer);
  frameTimer = window.setTimeout(() => frame.classList.remove('is-hit', 'is-dup'), 720);
}

function vibrate(duration) {
  try {
    if (navigator.vibrate) navigator.vibrate(duration);
  } catch {
    /* ignore */
  }
}

function displayCode(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > 42 ? `${clean.slice(0, 39)}…` : clean;
}

function shouldIgnoreScan(key, now) {
  if (now - (lastScan.get(key) || 0) < SCAN_COOLDOWN_MS) return true;
  lastScan.set(key, now);
  if (lastScan.size > 500) {
    for (const [oldKey, at] of lastScan) {
      if (now - at > 15000) lastScan.delete(oldKey);
    }
  }
  return false;
}

function handleScan(raw) {
  if (!state) return;
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return;
  const key = normalizeSn(text);
  if (!key) return;
  const now = Date.now();
  if (shouldIgnoreScan(key, now)) return;
  if (mode === 'collect') handleCollectScan(text, now);
  else handleMatchScan(text, key);
}

function handleMatchScan(text, key) {
  const item = itemIndex.get(key);
  if (!item) {
    setHint(`Bukan target: ${displayCode(text)}`, 'unknown');
    return;
  }

  if (item.status === 'found') {
    flashFrame('dup');
    audio.duplicate();
    vibrate(60);
    setHint(`Sudah discan: ${item.sn}`, 'dup');
    return;
  }

  item.status = 'found';
  item.scannedAt = new Date().toISOString();
  saveActive();
  flashFrame('hit');
  audio.success();
  vibrate(100);
  setHint(`Ketemu: ${item.sn}`, 'hit');
  renderAll({ flashKey: key });
  checkComplete();
}

function handleCollectScan(text, now) {
  const result = addCollectScan(state, text, new Date(now).toISOString(), brandForNextScan());
  if (result.status === 'invalid') return;

  if (result.status === 'dup') {
    flashFrame('dup');
    audio.duplicate();
    vibrate(60);
    setHint(`Sudah pernah discan: ${result.item.sn}`, 'dup');
    return;
  }

  store.collect = result.session;
  state = store.collect;
  saveStore();
  reindex();

  const item = result.item;
  flashFrame('hit');
  audio.success();
  vibrate(100);
  setHint(`Tersimpan: ${item.brand} · ${item.sn}`, 'hit');
  renderAll({ flashKey: normalizeSn(item.sn) });
}

function checkComplete() {
  if (!state || mode !== 'match') return;
  const all = state.items.length > 0 && state.items.every((item) => item.status === 'found');
  if (all && !completeAnnounced) {
    completeAnnounced = true;
    window.setTimeout(() => audio.complete(), 180);
    toast('Semua SN sudah ketemu', 'success', 4200);
  }
  if (!all) completeAnnounced = false;
}

function toggleItem(index) {
  if (!state || mode !== 'match') return;
  const item = state.items[index];
  if (!item) return;
  const wasFound = item.status === 'found';
  if (wasFound) {
    item.status = 'pending';
    item.scannedAt = null;
    completeAnnounced = false;
  } else {
    item.status = 'found';
    item.scannedAt = new Date().toISOString();
  }
  saveActive();
  audio.tap();
  if (wasFound) {
    completeAnnounced = false;
  } else {
    flashFrame('hit');
    vibrate(40);
    checkComplete();
  }
  renderAll({ flashKey: normalizeSn(item.sn) });
}

/* ----------------------------------------------------------------- render */

function renderAll({ flashKey = null } = {}) {
  if (!state) return;
  if (mode === 'collect') renderCollectAll({ flashKey });
  else renderMatchAll({ flashKey });
}

function renderMatchAll({ flashKey = null } = {}) {
  const total = state.items.length;
  const found = state.items.filter((item) => item.status === 'found').length;
  const left = total - found;
  const percent = total ? Math.round((found / total) * 100) : 0;

  el['progress-block'].classList.remove('is-collect');
  el['progress-block'].classList.toggle('is-complete', total > 0 && found === total);
  el['progress-label'].textContent = 'Ketemu';
  el['complete-line'].hidden = !(total > 0 && found === total);
  el['tabs'].hidden = false;
  el['manual-btn'].hidden = true;
  el['brand-bar'].hidden = true;
  el['bottom-label'].textContent = 'Rekap';

  el['found-count'].textContent = String(found);
  el['total-count'].textContent = String(total);
  el['progress-pct'].textContent = `${percent}%`;
  el['progress-fill'].style.width = `${percent}%`;
  el['progress-bar'].setAttribute('aria-valuenow', String(percent));
  el['progress-bar'].setAttribute('aria-valuetext', `${found} dari ${total} SN ketemu`);
  el['rekap-count'].textContent = `${found}/${total}`;
  el['tab-all'].textContent = String(total);
  el['tab-pending'].textContent = String(left);
  el['tab-found'].textContent = String(found);
  el['sheet-sub'].textContent = total ? `${left} sisa · ${total} SN` : 'Belum ada SN';
  document.title = `${found}/${total} · SN Scanner`;
  renderMatchList({ flashKey });
}

function renderCollectAll({ flashKey = null } = {}) {
  const summary = collectSummary(state.items);

  el['progress-block'].classList.add('is-collect');
  el['progress-block'].classList.remove('is-complete');
  el['progress-label'].textContent = 'Tersimpan';
  el['complete-line'].hidden = true;
  el['tabs'].hidden = true;
  el['manual-btn'].hidden = false;
  el['brand-bar'].hidden = false;
  el['bottom-label'].textContent = 'Ekspor';
  renderBrandBar();

  el['found-count'].textContent = String(summary.unique);
  el['total-count'].textContent = String(summary.totalQty);
  el['progress-pct'].textContent = '';
  el['progress-fill'].style.width = '100%';
  el['progress-bar'].setAttribute('aria-valuenow', '100');
  el['progress-bar'].setAttribute(
    'aria-valuetext',
    `${summary.unique} SN, ${summary.totalQty} scan`,
  );
  el['rekap-count'].textContent = `${summary.unique} SN`;
  el['sheet-sub'].textContent = summary.unique
    ? `${collectBrandSummary(state.items).length} merk`
    : 'Belum ada scan';
  document.title = `${summary.unique} SN · Scan Bebas`;
  renderCollectList({ flashKey });
}

function renderMatchList({ flashKey = null } = {}) {
  if (!state) return;
  const query = normalizeSn(search);
  const fragment = document.createDocumentFragment();
  let visible = 0;

  state.items.forEach((item, index) => {
    if (filter === 'pending' && item.status !== 'pending') return;
    if (filter === 'found' && item.status !== 'found') return;
    if (query && !normalizeSn(item.sn).includes(query)) return;
    visible += 1;

    const isFound = item.status === 'found';
    const row = document.createElement('button');
    row.type = 'button';
    row.className =
      'sn-row' +
      (isFound ? ' is-found' : '') +
      (flashKey && normalizeSn(item.sn) === flashKey ? ' is-flash' : '');
    row.dataset.idx = String(index);
    row.setAttribute('aria-pressed', isFound ? 'true' : 'false');
    row.setAttribute(
      'aria-label',
      `${item.sn}, ${isFound ? `sudah discan ${formatTime(item.scannedAt)}` : 'belum discan'}. Tekan untuk ${isFound ? 'membatalkan' : 'mencentang'}.`,
    );

    const check = document.createElement('span');
    check.className = 'sn-check';
    check.setAttribute('aria-hidden', 'true');
    check.innerHTML = ICON_CHECK;

    const main = document.createElement('span');
    main.className = 'sn-main';
    const code = document.createElement('span');
    code.className = 'sn-code';
    code.textContent = item.sn;
    const meta = document.createElement('span');
    meta.className = 'sn-meta';
    meta.textContent = isFound ? `Discan ${formatTime(item.scannedAt)}` : 'Belum discan';
    main.append(code, meta);
    row.append(check, main);
    fragment.appendChild(row);
  });

  el['sn-list'].replaceChildren(fragment);

  if (!visible) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.innerHTML = `${ICON_BARCODE}<p></p>`;
    const paragraph = empty.querySelector('p');
    if (query) {
      paragraph.textContent = `Tidak ada SN yang cocok dengan “${search.trim()}”.`;
    } else if (filter === 'pending') {
      paragraph.textContent = 'Semua SN sudah ketemu.';
    } else if (filter === 'found') {
      paragraph.textContent = 'Belum ada SN yang ketemu.';
    } else {
      paragraph.textContent = 'Daftar SN kosong.';
    }
    el['sn-list'].appendChild(empty);
  }
}

function momentLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay ? formatTime(iso) : `${formatShortDate(iso)} ${formatTime(iso)}`;
}

function renderCollectList({ flashKey = null } = {}) {
  if (!state) return;
  const query = normalizeSn(search);
  const fragment = document.createDocumentFragment();
  let visible = 0;

  state.items.forEach((item, index) => {
    if (query && !normalizeSn(item.sn).includes(query)) return;
    visible += 1;

    const row = document.createElement('button');
    row.type = 'button';
    row.className =
      'sn-row is-collect' +
      (flashKey && normalizeSn(item.sn) === flashKey ? ' is-flash' : '');
    row.dataset.idx = String(index);
    row.setAttribute(
      'aria-label',
      `${item.sn}, jumlah ${item.qty}. Tekan untuk mengubah.`,
    );

    const qty = document.createElement('span');
    qty.className = `sn-qty${item.qty > 1 ? ' is-many' : ''}`;
    qty.setAttribute('aria-hidden', 'true');
    qty.textContent = `×${item.qty}`;

    const main = document.createElement('span');
    main.className = 'sn-main';
    const code = document.createElement('span');
    code.className = 'sn-code';
    code.textContent = item.sn;
    const meta = document.createElement('span');
    meta.className = 'sn-meta';
    const unit = item.qty > 1 ? ` · ${item.qty} unit` : '';
    meta.textContent = `${item.brand || 'Lainnya'}${unit} · ${momentLabel(item.lastAt)}`;
    main.append(code, meta);

    const edit = document.createElement('span');
    edit.className = 'sn-edit';
    edit.setAttribute('aria-hidden', 'true');
    edit.innerHTML = ICON_EDIT;

    row.append(qty, main, edit);
    fragment.appendChild(row);
  });

  el['sn-list'].replaceChildren(fragment);

  if (!visible) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.innerHTML = `${ICON_BARCODE}<p></p>`;
    const paragraph = empty.querySelector('p');
    if (query) {
      paragraph.textContent = `Tidak ada SN yang cocok dengan “${search.trim()}”.`;
    } else {
      paragraph.textContent =
        'Belum ada SN. Arahkan barcode ke kotak, atau tekan + untuk menambah manual.';
    }
    el['sn-list'].appendChild(empty);
  }
}

function updateFilterTabs() {
  const buttons = el['tabs'].querySelectorAll('.tab');
  for (const button of buttons) {
    const active = button.dataset.filter === filter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  }
}

function setFilter(next) {
  filter = next === 'pending' || next === 'found' ? next : 'all';
  updateFilterTabs();
  if (state && mode === 'match') renderMatchList();
}

/* ----------------------------------------------------------------- import */

function showImportError(message) {
  el['import-error'].textContent = message;
  el['import-error'].hidden = false;
}

function hideImportError() {
  el['import-error'].hidden = true;
}

function updatePreview() {
  const { items, duplicates } = parseSnText(el['sn-input'].value);
  el['start-btn'].disabled = items.length === 0;
  if (!items.length) {
    el['preview-count'].textContent = '0 SN';
    el['preview-count'].classList.remove('has-items');
  } else {
    el['preview-count'].textContent = `${items.length} SN${
      duplicates ? ` · ${duplicates} duplikat` : ''
    }`;
    el['preview-count'].classList.add('has-items');
    hideImportError();
  }
}

function startMatchSession(items, duplicates) {
  store.match = {
    items: items.map((sn) => ({ sn, status: 'pending', scannedAt: null })),
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
  applyMode('match', { persist: false });
  state = store.match;
  reindex();
  lastScan.clear();
  completeAnnounced = false;
  saveStore();
  showScanView({ autoStart: true });
  if (duplicates > 0) {
    window.setTimeout(
      () => toast(`${duplicates} duplikat dibersihkan`, 'info', 3000),
      900,
    );
  }
}

function requestMatchStart(items, duplicates) {
  const begin = () => startMatchSession(items, duplicates);
  if (store.match && store.match.items.length) {
    const found = store.match.items.filter((item) => item.status === 'found').length;
    askConfirm({
      title: 'Ganti sesi cocokkan?',
      text: `Sesi sekarang (${found}/${store.match.items.length} SN) akan diganti dengan daftar baru. Data lama dihapus.`,
      action: 'Ganti sesi',
      onConfirm: begin,
    });
    return;
  }
  begin();
}

function handleImportSubmit(event) {
  event.preventDefault();
  const { items, duplicates } = parseSnText(el['sn-input'].value);
  if (!items.length) {
    showImportError('Belum ada SN yang bisa dipindai. Tempel daftar SN atau impor file.');
    el['sn-input'].focus();
    return;
  }
  hideImportError();
  audio.unlock();
  requestMatchStart(items, duplicates);
}

async function handleFile(file) {
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    showImportError('File terlalu besar. Maksimal 4 MB.');
    return;
  }
  try {
    const text = await file.text();
    const { items, duplicates } = parseSnFile(text, file.name);
    if (!items.length) {
      showImportError('Tidak ada SN yang terbaca dari file ini.');
      return;
    }
    el['sn-input'].value = items.join('\n');
    el['file-note'].textContent = `${file.name} · ${items.length} SN${
      duplicates ? ` · ${duplicates} duplikat` : ''
    }`;
    hideImportError();
    updatePreview();
  } catch {
    showImportError('File gagal dibaca. Pastikan formatnya .txt atau .csv.');
  }
}

/* ---------------------------------------------------------------- collect */

function startCollectSession() {
  const now = new Date().toISOString();
  store.collect = { items: [], activeBrand: 'auto', createdAt: now, updatedAt: now };
  applyMode('collect', { persist: false });
  state = store.collect;
  reindex();
  saveStore();
  showScanView({ autoStart: true });
}

function requestCollectStart() {
  if (store.collect && store.collect.items.length) {
    applyMode('collect');
    showScanView({ autoStart: true });
    return;
  }
  audio.unlock();
  startCollectSession();
}

function requestCollectNew() {
  if (!store.collect) {
    requestCollectStart();
    return;
  }
  const summary = collectSummary(store.collect.items);
  askConfirm({
    title: 'Mulai sesi baru?',
    text: `${summary.unique} SN (${summary.totalQty} scan) di sesi ini akan dihapus. Ekspor dulu kalau masih diperlukan.`,
    action: 'Mulai baru',
    onConfirm: () => {
      store.collect = null;
      state = null;
      saveStore();
      startCollectSession();
    },
  });
}

function openEdit(index = null) {
  if (mode !== 'collect' || !state) return;
  editIndex = Number.isInteger(index) && index >= 0 ? index : -1;
  const item = editIndex >= 0 ? state.items[editIndex] : null;
  el['edit-title'].textContent = item ? 'Ubah SN' : 'Tambah SN';
  el['edit-sn'].value = item ? item.sn : '';
  el['edit-meta'].textContent = item
    ? `Scan pertama ${formatStamp(item.firstAt)}`
    : 'Masukkan SN yang barcode-nya tidak terbaca.';
  el['edit-delete'].hidden = !item;
  el['edit-error'].hidden = true;
  editQty = item ? item.qty : 1;
  editBrand = item ? normalizeBrand(item.brand) : activeBrandValue();
  el['edit-brand'].value = editBrand;
  updateQtyUi();
  openLayer(el['edit-modal']);
  window.setTimeout(() => {
    el['edit-sn'].focus({ preventScroll: true });
    el['edit-sn'].select();
  }, 60);
}

function updateQtyUi() {
  el['edit-qty'].textContent = String(editQty);
  el['qty-minus'].disabled = editQty <= 1;
}

function closeEdit() {
  closeLayer(el['edit-modal']);
  editIndex = -1;
}

function saveEdit(event) {
  event.preventDefault();
  if (!state || mode !== 'collect') return;
  const sn = cleanSnText(el['edit-sn'].value);
  if (!sn) {
    el['edit-error'].textContent = 'SN tidak boleh kosong.';
    el['edit-error'].hidden = false;
    el['edit-sn'].focus();
    return;
  }
  const key = normalizeSn(sn);
  const brandChoice = el['edit-brand'].value || editBrand;
  const brand = brandChoice === 'auto' ? guessBrand(sn) : normalizeBrand(brandChoice);
  const duplicate = state.items.findIndex(
    (item, index) => index !== editIndex && normalizeSn(item.sn) === key,
  );
  if (duplicate >= 0) {
    el['edit-error'].textContent = `SN ${sn} sudah ada di daftar.`;
    el['edit-error'].hidden = false;
    return;
  }

  if (editIndex >= 0 && state.items[editIndex]) {
    state.items[editIndex] = {
      ...state.items[editIndex],
      sn,
      brand,
      qty: editQty,
    };
  } else {
    const now = new Date().toISOString();
    state.items.unshift({
      sn,
      brand,
      qty: editQty,
      firstAt: now,
      lastAt: now,
    });
  }
  const editing = editIndex >= 0;
  saveActive();
  reindex();
  closeEdit();
  renderAll();
  toast(editing ? 'Perubahan disimpan' : 'SN ditambahkan', 'success');
}

function deleteEdited() {
  if (!state || editIndex < 0 || !state.items[editIndex]) return;
  const sn = state.items[editIndex].sn;
  state.items.splice(editIndex, 1);
  saveActive();
  reindex();
  closeEdit();
  renderAll();
  toast(`${sn} dihapus`, 'info');
}

/* ------------------------------------------------------------------ rekap */

function buildReport() {
  if (!state || mode !== 'match') return '';
  const found = state.items.filter((item) => item.status === 'found');
  const left = state.items.filter((item) => item.status === 'pending');
  const lines = [
    '*LAPORAN SCAN GUDANG*',
    `Tanggal: ${formatDateTime(new Date().toISOString())}`,
    `Sesi dimulai: ${formatDateTime(state.createdAt)}`,
    `Total: ${state.items.length} SN`,
    `Ketemu: ${found.length} SN`,
    `Sisa: ${left.length} SN`,
    '',
    `*BELUM KETEMU (${left.length})*`,
  ];
  if (left.length) lines.push(...left.map((item) => `- ${item.sn}`));
  else lines.push('- (tidak ada)');
  lines.push('', `*SUDAH KETEMU (${found.length})*`);
  if (found.length) {
    lines.push(...found.map((item) => `- ${item.sn} (${formatTime(item.scannedAt)})`));
  } else {
    lines.push('- (tidak ada)');
  }
  return lines.join('\n');
}

function buildLeftReport() {
  if (!state || mode !== 'match') return '';
  return state.items
    .filter((item) => item.status === 'pending')
    .map((item) => item.sn)
    .join('\n');
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the textarea fallback */
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '-9999px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, area.value.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

async function copyWithFeedback(text, label) {
  if (!text.trim()) {
    toast('Tidak ada SN untuk disalin', 'warn');
    return;
  }
  const ok = await copyText(text);
  toast(ok ? `${label} tersalin` : 'Gagal menyalin, coba lagi', ok ? 'success' : 'error');
}

function buildRekapList(container, items, showTime) {
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'rekap-empty';
    empty.textContent = showTime
      ? 'Belum ada SN yang ketemu.'
      : 'Tidak ada sisa. Semua sudah ketemu.';
    container.appendChild(empty);
    return;
  }

  const limit = 400;
  const fragment = document.createDocumentFragment();
  items.slice(0, limit).forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'rekap-row';
    const number = document.createElement('span');
    number.className = 'rekap-num';
    number.textContent = String(index + 1).padStart(2, '0');
    const code = document.createElement('span');
    code.className = 'rekap-sn';
    code.textContent = item.sn;
    row.append(number, code);
    if (showTime) {
      const time = document.createElement('span');
      time.className = 'rekap-time';
      time.textContent = formatTime(item.scannedAt);
      row.appendChild(time);
    }
    fragment.appendChild(row);
  });
  container.appendChild(fragment);

  if (items.length > limit) {
    const more = document.createElement('p');
    more.className = 'rekap-empty';
    more.textContent = `…dan ${items.length - limit} SN lainnya. Semua tetap ikut tersalin.`;
    container.appendChild(more);
  }
}

function renderRekap() {
  if (!state || mode !== 'match') return;
  const found = state.items.filter((item) => item.status === 'found');
  const left = state.items.filter((item) => item.status === 'pending');
  el['sum-total'].textContent = String(state.items.length);
  el['sum-found'].textContent = String(found.length);
  el['sum-left'].textContent = String(left.length);
  el['left-count'].textContent = String(left.length);
  el['found-count-2'].textContent = String(found.length);
  el['copy-left'].disabled = left.length === 0;
  el['rekap-sub'].textContent = `Mulai ${formatDateTime(state.createdAt)} · ${state.items.length} SN`;
  buildRekapList(el['left-list'], left, false);
  buildRekapList(el['found-list'], found, true);
}

function openRekap() {
  if (!state || mode !== 'match') return;
  el['toast'].classList.remove('is-visible');
  clearTimeout(toastTimer);
  renderRekap();
  openLayer(el['rekap-modal']);
  el['rekap-close'].focus({ preventScroll: true });
}

function closeRekap() {
  closeLayer(el['rekap-modal']);
}

/* ----------------------------------------------------------------- ekspor */

function openExport() {
  if (!state || mode !== 'collect') return;
  const summary = collectSummary(state.items);
  const brandCount = collectBrandSummary(state.items).length;
  el['export-unique'].textContent = String(summary.unique);
  el['export-total'].textContent = String(summary.totalQty);
  el['export-sub'].textContent = `Mulai ${formatDateTime(state.createdAt)} · ${state.items.length} SN · ${brandCount} merk`;
  const empty = state.items.length === 0;
  el['export-xlsx'].disabled = empty;
  el['export-csv'].disabled = empty;
  el['export-tsv'].disabled = empty;
  openLayer(el['export-modal']);
  el['export-close'].focus({ preventScroll: true });
}

function closeExport() {
  closeLayer(el['export-modal']);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function downloadXlsx({ sheetName, headers, rows, widths, filename }) {
  const bytes = buildXlsx({ sheetName, headers, rows, widths });
  downloadBlob(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  );
}

function exportCollect(kind) {
  if (!state || mode !== 'collect' || !state.items.length) {
    toast('Belum ada SN untuk diekspor', 'warn');
    return;
  }
  const stamp = stampForFilename(new Date());
  const sorted = sortCollectByBrand(state.items);
  const rows = collectExportRows(sorted);
  if (kind === 'xlsx') {
    const summary = collectBrandSummary(state.items);
    const totalUnique = summary.reduce((sum, group) => sum + group.unique, 0);
    const totalQty = summary.reduce((sum, group) => sum + group.totalQty, 0);
    const sheets = [
      {
        name: 'Ringkasan',
        headers: ['Merk', 'SN unik', 'Jumlah unit'],
        rows: [
          ...summary.map((group) => [group.brand, group.unique, group.totalQty]),
          ['TOTAL', totalUnique, totalQty],
        ],
        widths: [16, 10, 12],
      },
      {
        name: 'Semua',
        headers: COLLECT_HEADERS,
        rows,
        widths: COLLECT_WIDTHS,
      },
    ];
    for (const group of summary) {
      const items = sorted.filter((item) => normalizeBrand(item.brand) === group.brand);
      sheets.push({
        name: group.brand,
        headers: BRAND_HEADERS,
        rows: collectExportRows(items, { withBrand: false }),
        widths: BRAND_WIDTHS,
      });
    }
    downloadBlob(
      new Blob([buildWorkbook({ sheets })], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `scan-bebas-${stamp}.xlsx`,
    );
    toast('Excel per merk diunduh', 'success');
  } else if (kind === 'csv') {
    const csv = `\ufeff${toCsv(COLLECT_HEADERS, rows)}`;
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `scan-bebas-${stamp}.csv`,
    );
    toast('CSV diunduh', 'success');
  }
  closeExport();
}

function exportMatchXlsx() {
  if (!state || mode !== 'match' || !state.items.length) {
    toast('Belum ada SN untuk diekspor', 'warn');
    return;
  }
  const stamp = stampForFilename(new Date());
  downloadXlsx({
    sheetName: 'Cocokkan SN',
    headers: MATCH_HEADERS,
    rows: matchExportRows(state.items),
    widths: MATCH_WIDTHS,
    filename: `cocokkan-sn-${stamp}.xlsx`,
  });
  toast('Excel diunduh', 'success');
}

function copyCollectTsv() {
  if (!state || mode !== 'collect') return;
  const rows = collectExportRows(sortCollectByBrand(state.items));
  copyWithFeedback(toTsv(COLLECT_HEADERS, rows), 'TSV');
}

/* ------------------------------------------------------------------ modal */

function openLayer(modal) {
  if (!document.querySelector('.modal:not([hidden])')) modalReturnFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeLayer(modal) {
  modal.hidden = true;
  if (!document.querySelector('.modal:not([hidden])')) {
    document.body.classList.remove('modal-open');
    if (modalReturnFocus && document.contains(modalReturnFocus)) {
      modalReturnFocus.focus({ preventScroll: true });
      modalReturnFocus = null;
    }
  }
}

function askConfirm({ title, text, action = 'Hapus sesi', onConfirm }) {
  el['confirm-title'].textContent = title;
  el['confirm-text'].textContent = text;
  el['confirm-reset'].textContent = action;
  confirmHandler = onConfirm;
  openLayer(el['confirm-modal']);
  el['confirm-cancel'].focus({ preventScroll: true });
}

function closeConfirm() {
  closeLayer(el['confirm-modal']);
  confirmHandler = null;
  if (!el['rekap-modal'].hidden) el['reset-btn'].focus({ preventScroll: true });
  else if (!el['export-modal'].hidden) el['export-reset'].focus({ preventScroll: true });
}

function runConfirm() {
  const handler = confirmHandler;
  confirmHandler = null;
  closeLayer(el['confirm-modal']);
  if (handler) handler();
}

/* ------------------------------------------------------------------ reset */

function clearSession(which) {
  store[which] = null;
  const other = which === 'match' ? 'collect' : 'match';
  mode = store[other] ? other : which === 'match' ? 'match' : 'collect';
  state = store[mode] || null;
  store.lastMode = mode;
  saveStore();
  lastScan.clear();
  completeAnnounced = false;
  el['confirm-modal'].hidden = true;
  el['rekap-modal'].hidden = true;
  el['export-modal'].hidden = true;
  el['edit-modal'].hidden = true;
  document.body.classList.remove('modal-open');
  if (which === 'match') {
    el['sn-input'].value = '';
    el['file-note'].textContent = '';
    el['file-input'].value = '';
    hideImportError();
    updatePreview();
  }
  clearSearch();
  el['scan-frame'].classList.remove('is-hit', 'is-dup', 'is-hidden');
  el['paused-overlay'].hidden = true;
  el['camera-error'].hidden = true;
  el['camera-idle'].hidden = true;
  el['pause-btn'].classList.remove('is-paused');
  el['pause-btn'].setAttribute('aria-pressed', 'false');
  el['pause-btn'].setAttribute('aria-label', 'Jeda kamera');
  el['torch-btn'].hidden = true;
  cameraAttempt += 1;
  cameraStarting = false;
  setHint('Arahkan barcode ke dalam kotak', 'idle');
  showHome();
  requestAnimationFrame(() => {
    if (mode === 'match') el['sn-input'].focus({ preventScroll: true });
  });
  toast('Sesi dihapus', 'info');
}

function requestReset() {
  const which = mode;
  const isCollect = which === 'collect';
  const summary = isCollect && state ? collectSummary(state.items) : null;
  const total = isCollect ? summary.unique : state ? state.items.length : 0;
  askConfirm({
    title: isCollect ? 'Hapus sesi scan bebas?' : 'Hapus sesi cocokkan?',
    text: isCollect
      ? `${total} SN dan seluruh riwayat scan akan dihapus. Ekspor dulu kalau masih diperlukan.`
      : `${total} SN dan seluruh progres akan dihapus. Tindakan ini tidak bisa dibatalkan.`,
    action: 'Hapus sesi',
    onConfirm: () => clearSession(which),
  });
}

/* ------------------------------------------------------------------ toast */

function toast(text, kind = 'success', duration = 2000) {
  el['toast-text'].textContent = text;
  el['toast'].dataset.kind = kind;
  el['toast'].classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el['toast'].classList.remove('is-visible'), duration);
}

/* -------------------------------------------------------------- keyboard */

function trapFocus(modal, event) {
  const focusable = Array.from(
    modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((node) => node.offsetParent !== null && !node.hidden);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function activeModal() {
  if (!el['confirm-modal'].hidden) return el['confirm-modal'];
  if (!el['edit-modal'].hidden) return el['edit-modal'];
  if (!el['export-modal'].hidden) return el['export-modal'];
  if (!el['rekap-modal'].hidden) return el['rekap-modal'];
  return null;
}

function handleGlobalKeydown(event) {
  if (event.key === 'Escape') {
    if (!el['confirm-modal'].hidden) {
      event.preventDefault();
      closeConfirm();
    } else if (!el['edit-modal'].hidden) {
      event.preventDefault();
      closeEdit();
    } else if (!el['export-modal'].hidden) {
      event.preventDefault();
      closeExport();
    } else if (!el['rekap-modal'].hidden) {
      event.preventDefault();
      closeRekap();
    }
    return;
  }
  if (event.key === 'Tab') {
    const modal = activeModal();
    if (modal) trapFocus(modal, event);
  }
}

/* ----------------------------------------------------------------- wiring */

function wireEvents() {
  el['import-form'].addEventListener('submit', handleImportSubmit);

  el['sn-input'].addEventListener('input', () => {
    el['start-btn'].disabled = !el['sn-input'].value.trim();
    updatePreview();
  });

  el['file-btn'].addEventListener('click', () => el['file-input'].click());
  el['file-input'].addEventListener('change', () => {
    const file = el['file-input'].files && el['file-input'].files[0];
    el['file-input'].value = '';
    handleFile(file);
  });

  el['mode-switch'].addEventListener('click', (event) => {
    const tab = event.target.closest('.mode-tab');
    if (tab && tab.dataset.mode !== mode) applyMode(tab.dataset.mode);
  });
  el['mode-switch'].addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const tabs = Array.from(el['mode-switch'].querySelectorAll('.mode-tab'));
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const next =
      event.key === 'ArrowRight'
        ? tabs[(current + 1) % tabs.length]
        : tabs[(current - 1 + tabs.length) % tabs.length];
    next.focus();
    applyMode(next.dataset.mode);
  });

  el['collect-start'].addEventListener('click', requestCollectStart);
  el['collect-reset'].addEventListener('click', requestCollectNew);

  el['brand-chips'].addEventListener('click', (event) => {
    const chip = event.target.closest('.brand-chip');
    if (!chip || !state || mode !== 'collect') return;
    const value = chip.dataset.brand;
    state.activeBrand = value === 'auto' ? 'auto' : normalizeBrand(value);
    saveActive();
    renderBrandBar();
  });

  el['search-input'].addEventListener('input', () => {
    search = el['search-input'].value;
    el['search-clear'].hidden = !search;
    if (mode === 'collect') renderCollectList();
    else renderMatchList();
  });
  el['search-clear'].addEventListener('click', () => {
    clearSearch();
    if (mode === 'collect') renderCollectList();
    else renderMatchList();
    el['search-input'].focus();
  });

  el['tabs'].addEventListener('click', (event) => {
    const button = event.target.closest('.tab');
    if (button) setFilter(button.dataset.filter);
  });
  el['tabs'].addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const buttons = Array.from(el['tabs'].querySelectorAll('.tab'));
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const next =
      event.key === 'ArrowRight'
        ? buttons[(current + 1) % buttons.length]
        : buttons[(current - 1 + buttons.length) % buttons.length];
    next.focus();
    setFilter(next.dataset.filter);
  });

  el['sn-list'].addEventListener('click', (event) => {
    const row = event.target.closest('.sn-row');
    if (!row) return;
    const index = Number(row.dataset.idx);
    if (mode === 'collect') openEdit(index);
    else toggleItem(index);
  });

  el['manual-btn'].addEventListener('click', () => openEdit(null));

  el['rekap-btn'].addEventListener('click', () => {
    if (mode === 'collect') openExport();
    else openRekap();
  });
  el['rekap-close'].addEventListener('click', closeRekap);
  el['rekap-xlsx'].addEventListener('click', exportMatchXlsx);
  el['copy-report'].addEventListener('click', () => copyWithFeedback(buildReport(), 'Laporan'));
  el['copy-left'].addEventListener('click', () =>
    copyWithFeedback(buildLeftReport(), 'Daftar sisa'),
  );
  el['reset-btn'].addEventListener('click', requestReset);

  el['export-close'].addEventListener('click', closeExport);
  el['export-xlsx'].addEventListener('click', () => exportCollect('xlsx'));
  el['export-csv'].addEventListener('click', () => exportCollect('csv'));
  el['export-tsv'].addEventListener('click', copyCollectTsv);
  el['export-reset'].addEventListener('click', requestReset);

  el['edit-form'].addEventListener('submit', saveEdit);
  el['edit-cancel'].addEventListener('click', closeEdit);
  el['edit-delete'].addEventListener('click', deleteEdited);
  el['edit-brand'].addEventListener('change', () => {
    editBrand = el['edit-brand'].value;
  });
  el['qty-minus'].addEventListener('click', () => {
    editQty = Math.max(1, editQty - 1);
    updateQtyUi();
  });
  el['qty-plus'].addEventListener('click', () => {
    editQty = Math.min(9999, editQty + 1);
    updateQtyUi();
  });

  el['confirm-cancel'].addEventListener('click', closeConfirm);
  el['confirm-reset'].addEventListener('click', runConfirm);

  el['idle-start'].addEventListener('click', activateCamera);
  el['camera-retry'].addEventListener('click', activateCamera);
  el['pause-btn'].addEventListener('click', togglePause);
  el['paused-resume'].addEventListener('click', togglePause);
  el['torch-btn'].addEventListener('click', toggleTorch);
  el['home-btn'].addEventListener('click', goHome);

  document.querySelectorAll('[data-close]').forEach((node) => {
    node.addEventListener('click', closeRekap);
  });
  document.querySelectorAll('[data-export-close]').forEach((node) => {
    node.addEventListener('click', closeExport);
  });
  document.querySelectorAll('[data-edit-close]').forEach((node) => {
    node.addEventListener('click', closeEdit);
  });
  document.querySelectorAll('[data-confirm-close]').forEach((node) => {
    node.addEventListener('click', closeConfirm);
  });
  document.addEventListener('keydown', handleGlobalKeydown);
}

/* -------------------------------------------------------------------- init */

function init() {
  cacheElements();
  wireEvents();

  if (!window.isSecureContext) el['insecure-note'].hidden = false;
  updatePreview();

  try {
    scanner = new CameraScanner({
      video: el['camera-video'],
      stage: el['camera-stage'],
      frame: el['scan-frame'],
      onDetect: handleScan,
      onTorchChange,
      onEnded: () => showCameraError({ name: 'TrackEnded' }),
    });
  } catch (error) {
    console.error('[app] scanner init failed', error);
    scanner = null;
  }

  const loaded = loadStore();
  store = loaded.store;
  const preferred = store.lastMode;
  mode = store[preferred] ? preferred : store.match ? 'match' : store.collect ? 'collect' : 'match';
  state = store[mode] || null;

  if (loaded.migrated) {
    if (saveStore()) {
      try {
        localStorage.removeItem(LEGACY_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  if (state) showScanView({ autoStart: false });
  else showHome();

  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__snc = {
      scan: handleScan,
      toggle: toggleItem,
      getState: () => (state ? JSON.parse(JSON.stringify(state)) : null),
      getStore: () => JSON.parse(JSON.stringify(store)),
      mode: () => mode,
      setMode: (next) => applyMode(next),
      report: buildReport,
      leftReport: buildLeftReport,
      openRekap,
      openExport,
      openEdit,
      exportXlsx: () => exportCollect('xlsx'),
      exportCsv: () => exportCollect('csv'),
      reset: clearSession,
      requestReset,
      activateCamera,
      summary: () => (state ? collectSummary(state.items) : null),
      scannerInfo: () => ({
        exists: Boolean(scanner),
        running: Boolean(scanner && scanner.isRunning),
        paused: Boolean(scanner && scanner.isPaused),
        hasStream: Boolean(scanner && scanner.stream),
        trackReadyState: scanner && scanner.track ? scanner.track.readyState : null,
      }),
      scannerRef: () => scanner,
    };
  }
}

init();
