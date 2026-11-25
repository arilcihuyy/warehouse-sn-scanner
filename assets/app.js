import {
  formatDateTime,
  formatShortDate,
  formatTime,
  normalizeSn,
  parseSnFile,
  parseSnText,
} from './scan-core.js';
import { CameraScanner } from './scanner.js';
import { FeedbackAudio } from './audio.js';

const STORAGE_KEY = 'warehouse-sn-scanner/v1';
const SCAN_COOLDOWN_MS = 1500;

const ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7.3"/></svg>';
const ICON_BARCODE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 6v12M7.5 6v12M11 6v12M14.5 6v12M18 6v12M20.5 6v12"/></svg>';

const el = {};
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

function cacheElements() {
  const ids = [
    'import-view',
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
    'camera-date',
    'progress-block',
    'found-count',
    'total-count',
    'progress-pct',
    'progress-bar',
    'progress-fill',
    'complete-line',
    'search-input',
    'search-clear',
    'tabs',
    'tab-all',
    'tab-pending',
    'tab-found',
    'sn-list',
    'rekap-btn',
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
    'copy-report',
    'copy-left',
    'reset-btn',
    'confirm-modal',
    'confirm-cancel',
    'confirm-reset',
    'confirm-text',
  ];
  for (const id of ids) el[id] = document.getElementById(id);
}

/* ------------------------------------------------------------------ state */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length) return null;
    const items = parsed.items
      .filter((item) => item && typeof item.sn === 'string' && item.sn.trim())
      .map((item) => ({
        sn: String(item.sn).trim().toUpperCase(),
        status: item.status === 'found' ? 'found' : 'pending',
        scannedAt:
          item.status === 'found' && item.scannedAt && !Number.isNaN(Date.parse(item.scannedAt))
            ? item.scannedAt
            : null,
      }));
    if (!items.length) return null;
    return {
      items,
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt || null,
    };
  } catch {
    return null;
  }
}

function saveState() {
  if (!state) return;
  state.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Gagal menyimpan progres', 'error');
  }
}

function reindex() {
  itemIndex = new Map();
  if (!state) return;
  for (const item of state.items) itemIndex.set(normalizeSn(item.sn), item);
}

/* ------------------------------------------------------------------ views */

function showImportView() {
  if (el['scan-view']) el['scan-view'].hidden = true;
  el['import-view'].hidden = false;
  document.body.classList.remove('in-scan');
  document.title = 'Warehouse SN Scanner';
  setFilter('all');
  if (el['sn-list']) el['sn-list'].replaceChildren();
}

function showScanView({ autoStart = false } = {}) {
  el['import-view'].hidden = true;
  el['scan-view'].hidden = false;
  document.body.classList.add('in-scan');
  el['camera-date'].textContent = formatShortDate(state.createdAt);
  renderAll();
  completeAnnounced =
    state.items.length > 0 && state.items.every((item) => item.status === 'found');
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
        body: 'Perangkat ini tidak punya kamera yang bisa dipakai browser. Daftar SN tetap bisa dicentang manual.',
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
        body: 'Coba lagi untuk memakai kamera lain, atau centang SN secara manual.',
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
        body: 'Terjadi masalah saat membuka kamera. Muat ulang halaman atau centang SN secara manual.',
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

function handleScan(raw) {
  if (!state) return;
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return;
  const key = normalizeSn(text);
  if (!key) return;

  const now = Date.now();
  if (now - (lastScan.get(key) || 0) < SCAN_COOLDOWN_MS) return;
  lastScan.set(key, now);
  if (lastScan.size > 500) {
    for (const [oldKey, at] of lastScan) {
      if (now - at > 15000) lastScan.delete(oldKey);
    }
  }

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
  saveState();
  flashFrame('hit');
  audio.success();
  vibrate(100);
  setHint(`Ketemu: ${item.sn}`, 'hit');
  renderAll({ flashKey: key });
  checkComplete();
}

function checkComplete() {
  if (!state) return;
  const all = state.items.length > 0 && state.items.every((item) => item.status === 'found');
  if (all && !completeAnnounced) {
    completeAnnounced = true;
    window.setTimeout(() => audio.complete(), 180);
    toast('Semua SN sudah ketemu', 'success', 4200);
  }
  if (!all) completeAnnounced = false;
}

function toggleItem(index) {
  if (!state) return;
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
  saveState();
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
  const total = state.items.length;
  const found = state.items.filter((item) => item.status === 'found').length;
  const left = total - found;
  const percent = total ? Math.round((found / total) * 100) : 0;

  el['found-count'].textContent = String(found);
  el['total-count'].textContent = String(total);
  el['progress-pct'].textContent = `${percent}%`;
  el['progress-fill'].style.width = `${percent}%`;
  el['progress-bar'].setAttribute('aria-valuenow', String(percent));
  el['progress-bar'].setAttribute('aria-valuetext', `${found} dari ${total} SN ketemu`);
  el['complete-line'].hidden = !(total > 0 && found === total);
  el['progress-block'].classList.toggle('is-complete', total > 0 && found === total);
  el['rekap-count'].textContent = `${found}/${total}`;
  el['tab-all'].textContent = String(total);
  el['tab-pending'].textContent = String(left);
  el['tab-found'].textContent = String(found);
  document.title = `${found}/${total} · SN Scanner`;
  renderList({ flashKey });
}

function renderList({ flashKey = null } = {}) {
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

function setFilter(next) {
  filter = next === 'pending' || next === 'found' ? next : 'all';
  const buttons = el['tabs'].querySelectorAll('.tab');
  for (const button of buttons) {
    const active = button.dataset.filter === filter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  }
  if (state) renderList();
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

function startSession(items, duplicates) {
  state = {
    items: items.map((sn) => ({ sn, status: 'pending', scannedAt: null })),
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
  reindex();
  lastScan.clear();
  completeAnnounced = false;
  saveState();
  showScanView({ autoStart: true });
  if (duplicates > 0) {
    window.setTimeout(
      () => toast(`${duplicates} duplikat dibersihkan`, 'info', 3000),
      900,
    );
  }
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
  startSession(items, duplicates);
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

/* ------------------------------------------------------------------ rekap */

function buildReport() {
  if (!state) return '';
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
  if (!state) return '';
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
  if (!state) return;
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

function openRekap() {
  if (!state) return;
  el['toast'].classList.remove('is-visible');
  clearTimeout(toastTimer);
  renderRekap();
  openLayer(el['rekap-modal']);
  el['rekap-close'].focus({ preventScroll: true });
}

function closeRekap() {
  closeLayer(el['rekap-modal']);
}

function openConfirm() {
  if (!state) return;
  el['confirm-text'].textContent = `${state.items.length} SN dan seluruh progres akan dihapus. Tindakan ini tidak bisa dibatalkan.`;
  openLayer(el['confirm-modal']);
  el['confirm-cancel'].focus({ preventScroll: true });
}

function closeConfirm() {
  closeLayer(el['confirm-modal']);
  if (!el['rekap-modal'].hidden) el['reset-btn'].focus({ preventScroll: true });
}

function resetSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  scanner?.stop();
  state = null;
  itemIndex.clear();
  lastScan.clear();
  completeAnnounced = false;
  el['rekap-modal'].hidden = true;
  el['confirm-modal'].hidden = true;
  document.body.classList.remove('modal-open');
  el['sn-input'].value = '';
  el['file-note'].textContent = '';
  el['file-input'].value = '';
  el['search-input'].value = '';
  search = '';
  el['search-clear'].hidden = true;
  hideImportError();
  updatePreview();
  showImportView();
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
  requestAnimationFrame(() => el['sn-input'].focus({ preventScroll: true }));
  toast('Sesi baru siap', 'info');
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

function handleGlobalKeydown(event) {
  if (event.key === 'Escape') {
    if (!el['confirm-modal'].hidden) {
      event.preventDefault();
      closeConfirm();
    } else if (!el['rekap-modal'].hidden) {
      event.preventDefault();
      closeRekap();
    }
    return;
  }
  if (event.key === 'Tab') {
    const modal = !el['confirm-modal'].hidden
      ? el['confirm-modal']
      : !el['rekap-modal'].hidden
        ? el['rekap-modal']
        : null;
    if (modal) trapFocus(modal, event);
  }
}

/* ------------------------------------------------------------------ wiring */

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

  el['search-input'].addEventListener('input', () => {
    search = el['search-input'].value;
    el['search-clear'].hidden = !search;
    renderList();
  });
  el['search-clear'].addEventListener('click', () => {
    search = '';
    el['search-input'].value = '';
    el['search-clear'].hidden = true;
    renderList();
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
    if (row) toggleItem(Number(row.dataset.idx));
  });

  el['rekap-btn'].addEventListener('click', openRekap);
  el['rekap-close'].addEventListener('click', closeRekap);
  el['copy-report'].addEventListener('click', () => copyWithFeedback(buildReport(), 'Laporan'));
  el['copy-left'].addEventListener('click', () =>
    copyWithFeedback(buildLeftReport(), 'Daftar sisa'),
  );
  el['reset-btn'].addEventListener('click', openConfirm);
  el['confirm-cancel'].addEventListener('click', closeConfirm);
  el['confirm-reset'].addEventListener('click', () => {
    closeLayer(el['confirm-modal']);
    closeLayer(el['rekap-modal']);
    resetSession();
  });

  el['idle-start'].addEventListener('click', activateCamera);
  el['camera-retry'].addEventListener('click', activateCamera);
  el['pause-btn'].addEventListener('click', togglePause);
  el['paused-resume'].addEventListener('click', togglePause);
  el['torch-btn'].addEventListener('click', toggleTorch);

  document.querySelectorAll('[data-close]').forEach((node) => {
    node.addEventListener('click', closeRekap);
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

  const saved = loadState();
  if (saved) {
    state = saved;
    reindex();
    showScanView({ autoStart: false });
  } else {
    showImportView();
  }

  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__snc = {
      scan: handleScan,
      toggle: toggleItem,
      getState: () => (state ? JSON.parse(JSON.stringify(state)) : null),
      report: buildReport,
      leftReport: buildLeftReport,
      openRekap,
      reset: resetSession,
      activateCamera,
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
