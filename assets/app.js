/** StockScan, UI, camera flow, inventory and exports. */

import {
  SessionStore, CATEGORIES, BRANDS, EXPORT_HEADERS, addScan, addExpectedItem, setExpected, replaceItem,
  deleteItem, filterItems, exportRows, sessionSummary,
  formatStamp, nowIso, collectRecap,
} from './sessions.js?v=20261127j';
import { parseSnValues, parseCsv, parseSnFile, normalizeSn } from './scan-core.js?v=20261127j';
import { CameraScanner, decodeImageFile } from './scanner.js?v=20261127j';
import { FeedbackAudio } from './audio.js';
import { toCsv, toTsv, stampForFilename } from './export.js';
import { buildWorkbook } from './xlsx.js?v=20261127j';
import { readXlsxRows } from './xlsx-read.js?v=20261127j';

const $ = (id) => document.getElementById(id);
const store = new SessionStore();
const audio = new FeedbackAudio();
const settings = loadSettings();

let mode = store.state.lastMode === 'match' ? 'match' : 'collect';
let session = store.ensure(mode);
let currentView = 'home';
let filter = { query: '', category: '', duplicates: false, today: false, sort: 'newest' };
let scanQuery = '';
let scanPageSize = 60;
let pageSize = 100;
let selected = { index: -1, sn: '', lastAt: '', status: '' };
let editing = { index: -1, add: false };
let confirmCallback = null;
let promptCallback = null;
let exportSessionId = null;
let lastScan = null;
let previousView = 'home';
let detailOrigin = 'home';
let cooldown = new Map();
let frameTimer = 0;
let toastTimer = 0;

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem('stockscan/settings') || '{}');
    return { sound: raw.sound !== false, vibration: raw.vibration !== false };
  } catch {
    return { sound: true, vibration: true };
  }
}

function saveSettings() {
  try {
    localStorage.setItem('stockscan/settings', JSON.stringify(settings));
  } catch {
    /* storage may be disabled; settings remain in memory */
  }
}

function showView(name) {
  if (currentView === 'scan' && name !== 'scan') scanner.stop();
  previousView = currentView;
  currentView = name;
  for (const view of document.querySelectorAll('.view')) view.hidden = view.id !== `${name}-view`;
  if (name === 'home') renderHome();
  if (name === 'inventory') renderInventory();
  if (name === 'sessions') renderSessions();
  if (name === 'scan') {
    $('scan-view').classList.add('is-idle');
    $('camera-loading').hidden = true;
    $('camera-error').hidden = true;
    $('paused-overlay').hidden = true;
    $('camera-idle').hidden = false;
    $('camera-mode').textContent = mode === 'match' ? 'Cocokkan Daftar' : 'Scan Bebas';
    $('camera-date').textContent = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    renderScanSheet();
  }
}

function toast(message, variant = '') {
  const node = $('toast');
  node.textContent = message;
  node.className = `toast${variant ? ` is-${variant}` : ''}`;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 2600);
}

function openModal(id) {
  $(id).hidden = false;
  document.body.style.overflow = 'hidden';
  const focusable = $(id).querySelector('input, textarea, button');
  focusable?.focus();
}

function closeModal(id) {
  $(id).hidden = true;
  if (!document.querySelector('.modal:not([hidden])')) document.body.style.overflow = '';
}

function askConfirm(text, callback, label = 'Ya, lanjutkan') {
  $('confirm-text').textContent = text;
  $('confirm-ok').textContent = label;
  confirmCallback = callback;
  openModal('confirm-modal');
}

function askPrompt(title, value, callback, label = 'Simpan') {
  $('prompt-title').textContent = title;
  $('prompt-input').value = value || '';
  $('prompt-ok').textContent = label;
  promptCallback = callback;
  openModal('prompt-modal');
}

function safeFilename(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sesi';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Disalin ke clipboard', 'success');
  } catch {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    try { document.execCommand('copy'); toast('Disalin ke clipboard', 'success'); }
    catch { toast('Tidak dapat menyalin', 'warning'); }
    helper.remove();
  }
}


function renderHome() {
  $('collect-count').textContent = `${sessionSummary(store.active('collect') || { items: [] }).unique} item`;
  renderMode();
}

function resetSessionFilters() {
  scanQuery = '';
  scanPageSize = 60;
  pageSize = 100;
  filter = { ...filter, query: '', category: '', duplicates: false, today: false };
  $('scan-search').value = '';
  $('search-input').value = '';
  $('category-filter').value = '';
  $('search-clear').hidden = true;
  document.querySelectorAll('.chip[data-filter]').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.filter === 'all');
  });
}

function renderMode() {
  document.querySelectorAll('.mode-tab[data-mode]').forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  $('collect-panel').hidden = mode !== 'collect';
  $('match-panel').hidden = mode !== 'match';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function renderInventory() {
  const list = $('sn-list');
  const items = filterItems(session.items, filter);
  $('inventory-subtitle').textContent = `${session.name} · ${session.items.length} item`;
  $('search-clear').hidden = !filter.query;
  $('list-empty').hidden = items.length > 0;
  const visible = items.slice(0, pageSize);
  list.innerHTML = visible.map((item) => {
    const index = session.items.indexOf(item);
    const tags = [`<span class="tag">${escapeHtml(item.brand)}</span>`, `<span class="tag">${escapeHtml(item.category)}</span>`];
    if (Number(item.scanCount || 1) > 1) tags.push(`<span class="tag dup">${item.scanCount}× scan</span>`);
    tags.push(`<span class="tag qty">${item.qty} unit</span>`);
    if (item.status === 'found') tags.push('<span class="tag">Ketemu</span>');
    return `
      <button class="item-row" type="button" data-index="${index}">
        <span class="item-row-icon"><svg><use href="#i-barcode"/></svg></span>
        <span class="item-row-main">
          <strong>${escapeHtml(item.name || item.sn)}</strong>
          <span class="sn">${escapeHtml(item.sn)}</span>
          <span class="item-row-meta">${tags.join('')}</span>
          <span class="item-row-time">${formatStamp(item.lastAt || item.scannedAt || item.firstAt)}</span>
        </span>
        <svg class="chev"><use href="#i-chevron"/></svg>
      </button>`;
  }).join('');
  $('load-more').hidden = items.length <= pageSize;
  $('load-more').textContent = `Muat lebih banyak (${items.length - pageSize} tersisa)`;
}

function renderSessions() {
  const modeFilter = document.querySelector('.mode-tab[data-session-mode].is-active')?.dataset.sessionMode || 'collect';
  const list = store.list(modeFilter);
  $('session-list').innerHTML = list.length ? list.map((item) => {
    const summary = sessionSummary(item);
    const active = store.state.activeIds[modeFilter] === item.id;
    return `
      <article class="session-card${active ? ' is-active' : ''}">
        <div class="session-card-head"><div><h3>${escapeHtml(item.name)}</h3><p>Mulai ${formatStamp(item.createdAt)}</p></div>${active ? '<span class="badge badge-primary">Aktif</span>' : ''}</div>
        <div class="session-stats">
          <span><b>${summary.unique}</b>item</span>
          <span><b>${summary.totalScans}</b>scan</span>
          <span><b>${summary.duplicates}</b>duplikat</span>
        </div>
        <div class="session-actions">
          <button class="btn btn-soft btn-small" data-action="resume" data-id="${escapeHtml(item.id)}" type="button">Lanjutkan</button>
          <button class="btn btn-soft btn-small" data-action="rename" data-id="${escapeHtml(item.id)}" type="button">Rename</button>
          <button class="btn btn-soft btn-small" data-action="export" data-id="${escapeHtml(item.id)}" type="button">Ekspor</button>
          <button class="btn btn-soft btn-small" data-action="clear" data-id="${escapeHtml(item.id)}" type="button">Kosongkan</button>
          <button class="btn btn-danger btn-small" data-action="delete" data-id="${escapeHtml(item.id)}" type="button">Hapus</button>
        </div>
      </article>`;
  }).join('') : '<div class="empty-state"><strong>Belum ada sesi</strong><p>Buat sesi baru untuk memisahkan pekerjaan.</p></div>';
}

function renderDetail() {
  const index = session.items.findIndex((item) => normalizeSn(item.sn) === normalizeSn(selected.sn));
  const item = session.items[index];
  if (!item) {
    toast('Item tidak ditemukan', 'warning');
    showView(detailOrigin === 'scan' ? 'scan' : 'inventory');
    return;
  }
  selected.index = index;
  $('detail-sn').textContent = item.sn;
  $('detail-format').textContent = item.format || 'Barcode / QR';
  $('detail-name').textContent = item.name || '-';
  $('detail-brand').textContent = item.brand;
  $('detail-category').textContent = item.category;
  $('detail-qty').textContent = `${item.qty} unit`;
  $('detail-location').textContent = item.location || '-';
  $('detail-scans').textContent = `${session.mode === 'match' ? (item.status === 'found' ? 1 : 0) : (item.scanCount || 1)}×`;
  $('detail-time').textContent = formatStamp(item.lastAt || item.scannedAt || item.firstAt);
  $('detail-notes').textContent = item.notes || '-';
  $('detail-subtitle').textContent = session.name;
}

function updateResultCard(result) {
  const card = $('result-card');
  const status = $('scan-status');
  const item = result.item || {};
  status.className = 'badge';
  if (result.status === 'new' || result.status === 'match') {
    status.classList.add('badge-success');
    status.textContent = result.status === 'match' ? 'Cocok' : 'Tersimpan';
  } else if (result.status === 'dup' || result.status === 'already' || result.status === 'unmatched-dup') {
    status.classList.add('badge-warning');
    status.textContent = 'Duplikat';
  } else if (result.status === 'unmatched') {
    status.classList.add('badge-warning');
    status.textContent = 'Tidak cocok';
  } else {
    status.classList.add('badge-neutral');
    status.textContent = 'Tidak valid';
  }
  $('scan-value').textContent = item.sn || '-';
  $('scan-time').textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const detail = [];
  if (item.brand) detail.push(item.brand);
  if (item.qty) detail.push(`${item.qty} unit`);
  if (result.status === 'dup') detail.push('SN sudah ada di sesi ini');
  if (result.status === 'unmatched') detail.push('tidak ada dalam daftar');
  $('scan-meta').textContent = detail.join(' · ') || 'Hasil pemindaian akan muncul di sini.';
  $('open-detail-btn').hidden = result.status !== 'new' && result.status !== 'match';
  card.dataset.status = result.status;
  renderScanSheet();
  flashFrame(result.status);
}

function shortTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function renderScanSheet() {
  const summary = sessionSummary(session);
  $('session-count').textContent = String(summary.unique);
  const brands = new Set(session.items.map((item) => item.brand).filter(Boolean)).size;
  $('scan-summary-sub').textContent = mode === 'match'
    ? `${summary.matched} cocok · ${summary.remaining} sisa`
    : `${brands} merk · ${summary.totalScans} scan`;
  $('rekap-label').textContent = mode === 'match' ? 'Rekap' : 'Ekspor';
  $('rekap-sub').textContent = mode === 'match' ? `${summary.matched}/${summary.unique}` : `${summary.unique} SN`;

  const activeBrand = session.activeBrand || 'auto';
  $('brand-chips').innerHTML = ['auto', ...BRANDS].map((brand) => {
    const label = brand === 'auto' ? 'Auto' : brand;
    return `<button class="brand-chip${activeBrand === brand ? ' is-active' : ''}" type="button" data-brand="${escapeHtml(brand)}">${escapeHtml(label)}</button>`;
  }).join('');

  const items = filterItems(session.items, { query: scanQuery, sort: 'newest' });
  $('scan-list-empty').hidden = items.length > 0;
  $('scan-list-empty').textContent = scanQuery ? 'SN tidak ditemukan.' : 'Belum ada SN di sesi ini.';
  const visible = items.slice(0, scanPageSize);
  $('scan-list').innerHTML = visible.map((item) => {
    const index = session.items.indexOf(item);
    const scans = Number(item.scanCount || 1);
    const pill = mode === 'match'
      ? (item.status === 'found' ? 'OK' : '…')
      : `×${scans}`;
    const time = shortTime(item.lastAt || item.scannedAt || item.firstAt);
    const meta = mode === 'match'
      ? [item.brand, item.status === 'found' ? 'Cocok' : 'Belum', time].filter(Boolean).join(' · ')
      : [item.brand, time, `${scans}× scan`].filter(Boolean).join(' · ');
    return `
      <div class="scan-row">
        <span class="scan-count-pill${scans > 1 ? ' is-dup' : ''}">${escapeHtml(pill)}</span>
        <button class="scan-row-main" type="button" data-index="${index}">
          <strong>${escapeHtml(item.sn)}</strong>
          <span>${escapeHtml(meta)}</span>
        </button>
        <button class="scan-row-edit" type="button" data-edit="${index}" aria-label="Edit ${escapeHtml(item.sn)}"><svg><use href="#i-edit"/></svg></button>
      </div>`;
  }).join('');
  $('scan-list-more').hidden = items.length <= scanPageSize;
  $('scan-list-more').textContent = `Muat lebih banyak (${Math.max(0, items.length - scanPageSize)} tersisa)`;
}

function flashFrame(status) {
  const frame = $('scan-frame');
  clearTimeout(frameTimer);
  frame.className = 'scan-frame';
  if (status === 'new' || status === 'match') frame.classList.add('is-hit');
  else if (status.startsWith('dup') || status.startsWith('unmatch')) frame.classList.add('is-dup');
  frameTimer = setTimeout(() => { frame.className = 'scan-frame'; }, 700);
}


const scanner = new CameraScanner({
  video: $('camera-video'),
  stage: $('camera-stage'),
  frame: $('scan-frame'),
  onDetect: (text) => handleScan(text),
  onTorchChange: (supported, on) => {
    $('torch-btn').hidden = !supported;
    $('torch-btn').classList.toggle('is-on', on);
  },
  onEnded: () => showCameraError('Kamera terputus. Hubungkan kembali lalu coba lagi.'),
});

function showCameraError(message) {
  $('camera-loading').hidden = true;
  $('camera-error-text').textContent = message;
  $('camera-error').hidden = false;
  $('camera-idle').hidden = true;
  $('paused-overlay').hidden = true;
}

function cameraErrorMessage(error) {
  if (!error) return 'Kamera tidak dapat dibuka.';
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    return 'Akses kamera ditolak. Izinkan kamera lewat ikon gembok di address bar.';
  }
  if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    return 'Kamera tidak ditemukan pada perangkat ini.';
  }
  if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.';
  }
  if (error.name === 'NotSupportedError' || !navigator.mediaDevices) {
    return 'Browser ini tidak mendukung kamera. Buka di Chrome atau Safari melalui HTTPS.';
  }
  return error.message || 'Kamera tidak dapat dibuka.';
}

async function activateCamera() {
  $('scan-view').classList.remove('is-idle');
  renderScanSheet();
  $('camera-error').hidden = true;
  $('camera-idle').hidden = true;
  $('paused-overlay').hidden = true;
  $('camera-loading').hidden = false;
  try {
    await scanner.start();
    $('camera-loading').hidden = true;
    $('pause-btn').innerHTML = '<svg><use href="#i-pause"/></svg>';
    if (navigator.mediaDevices?.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        $('switch-btn').hidden = devices.filter((device) => device.kind === 'videoinput').length < 2;
      } catch {
        $('switch-btn').hidden = true;
      }
    }
  } catch (error) {
    $('camera-loading').hidden = true;
    if (error.name !== 'AbortError') showCameraError(cameraErrorMessage(error));
  }
}

function handleScan(raw, meta = {}) {
  const text = String(raw ?? '').trim();
  const key = normalizeSn(text);
  if (!key) return null;
  const now = Date.now();
  if (now - (cooldown.get(key) || 0) < 1500) return null;
  cooldown.set(key, now);
  if (cooldown.size > 500) cooldown = new Map([...cooldown].slice(-200));

  const result = addScan(session, text, { ...meta, at: nowIso() });
  if (result.status === 'invalid') {
    updateResultCard(result);
    return result;
  }
  store.replace(session.id, result.session);
  session = store.byId(session.id);
  lastScan = { ...result, sn: result.item?.sn || text };
  updateResultCard(result);
  feedback(result.status);
  renderHome();
  if (currentView === 'inventory') renderInventory();
  if (currentView === 'sessions') renderSessions();
  return result;
}

function feedback(status) {
  const duplicate = ['dup', 'already', 'unmatched-dup'].includes(status);
  if (settings.sound) {
    if (duplicate) audio.duplicate();
    else if (status === 'unmatched') audio.tone?.(520, 0, 0.07, 0.08);
    else audio.success();
  }
  if (settings.vibration && navigator.vibrate) navigator.vibrate(duplicate ? 50 : 80);
}

function startScan(nextMode) {
  mode = nextMode === 'match' ? 'match' : 'collect';
  store.setMode(mode);
  session = store.ensure(mode);
  audio.unlock();
  showView('scan');
  $('camera-idle').hidden = false;
  renderMode();
}


function openEditor(index = -1, add = false) {
  const item = add ? null : session.items[index];
  editing = { index, add, sn: item?.sn || '' };
  $('edit-title').textContent = add ? 'Tambah Item' : 'Edit Item';
  $('edit-sn').value = item?.sn || '';
  $('edit-name').value = item?.name || '';
  $('edit-brand').value = item?.brand || 'auto';
  $('edit-category').value = item?.category || 'Perangkat';
  $('edit-qty').value = item?.qty || 1;
  $('edit-location').value = item?.location || '';
  $('edit-notes').value = item?.notes || '';
  $('edit-format').value = item?.format || '';
  $('edit-delete').hidden = add || !item;
  openModal('edit-modal');
}

function saveEditor(event) {
  event.preventDefault();
  const sn = $('edit-sn').value.trim();
  if (!sn) { toast('SN wajib diisi', 'warning'); return; }
  const patch = {
    sn,
    name: $('edit-name').value.trim(),
    brand: $('edit-brand').value,
    category: $('edit-category').value,
    qty: Math.max(1, Number($('edit-qty').value) || 1),
    location: $('edit-location').value.trim(),
    notes: $('edit-notes').value,
    format: $('edit-format').value,
  };
  if (editing.add) {
    const result = session.mode === 'match'
      ? addExpectedItem(session, sn, patch)
      : addScan(session, sn, patch);
    if (!result || result.status === 'invalid') {
      toast('SN tidak valid', 'warning');
      return;
    }
    if (result.status === 'dup' || result.status === 'already') {
      toast('SN ini sudah tercatat', 'warning');
      closeModal('edit-modal');
      return;
    }
    store.replace(session.id, result.session);
    session = store.byId(session.id);
    toast(session.mode === 'match' ? 'Item ditambahkan ke daftar target' : 'Item ditambahkan', 'success');
  } else {
    const currentIndex = session.items.findIndex(
      (item) => normalizeSn(item.sn) === normalizeSn(editing.sn),
    );
    if (currentIndex < 0) {
      toast('Item tidak ditemukan', 'warning');
      closeModal('edit-modal');
      return;
    }
    const next = replaceItem(session, currentIndex, patch);
    if (!next) {
      toast('SN sudah ada di sesi ini', 'warning');
      return;
    }
    store.replace(session.id, next);
    session = store.byId(session.id);
    selected.sn = next.items[currentIndex].sn;
    toast('Perubahan disimpan', 'success');
  }
  closeModal('edit-modal');
  renderHome();
  renderInventory();
  renderSessions();
  renderScanSheet();
  if (currentView === 'detail') renderDetail();
}


function buildExportData(target) {
  const summary = sessionSummary(target);
  if (target.mode !== 'match') {
    const recap = collectRecap(target.items);
    return {
      summary,
      sheets: [{
        name: 'Rekap',
        headers: recap.headers,
        rows: recap.rows,
        widths: [6, ...recap.headers.slice(1).map(() => 26)],
      }],
      rows: recap.rows,
      headers: recap.headers,
    };
  }
  const sheets = [
    {
      name: 'Ringkasan',
      headers: ['Keterangan', 'Nilai'],
      rows: [
        ['Nama sesi', target.name],
        ['Mode', target.mode === 'match' ? 'Cocokkan Daftar' : 'Scan Bebas'],
        ['Tanggal ekspor', formatStamp(nowIso())],
        ['Sesi dimulai', formatStamp(target.createdAt)],
        ['Total scan', summary.totalScans],
        ['Barcode unik', summary.unique],
        ['Duplikat', summary.duplicates],
        ['Total qty', summary.qty],
        ['Ketemu', summary.matched],
        ['Sisa', summary.remaining],
        ['Tidak cocok', summary.unmatched],
        ['Catatan sesi', target.notes || ''],
      ],
      widths: [22, 42],
    },
    { name: 'Inventory', headers: EXPORT_HEADERS, rows: exportRows(target), widths: [6, 22, 24, 14, 14, 9, 14, 20, 26, 11, 10, 12] },
  ];
  if (target.unmatched?.length) {
    sheets.push({
      name: 'Tidak Cocok',
      headers: ['No', 'Barcode/SN', 'Format', 'Waktu', 'Jumlah Scan'],
      rows: target.unmatched.map((item, index) => [index + 1, item.sn, item.format || '', formatStamp(item.at), item.count]),
      widths: [6, 22, 14, 20, 12],
    });
  }
  return { summary, sheets, rows: exportRows(target), headers: EXPORT_HEADERS };
}

function openExport(id = session.id) {
  exportSessionId = id;
  const target = store.byId(id);
  if (!target) return;
  const { summary } = buildExportData(target);
  $('export-summary').innerHTML = `
    <strong>${escapeHtml(target.name)}</strong><br>
    ${summary.unique} barcode unik · ${summary.totalScans} scan · ${summary.duplicates} duplikat<br>
    ${summary.qty} total unit`;
  $('export-share').hidden = !(navigator.share && navigator.canShare);
  openModal('export-modal');
}

function sanitizeExportName(value, fallback) {
  const clean = String(value ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\.xlsx$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '');
  return clean || fallback;
}

function exportFile(kind, requestedName = null) {
  try {
    const target = store.byId(exportSessionId) || session;
    if (!target) {
      toast('Sesi tidak ditemukan', 'warning');
      return;
    }
    const { sheets, rows, headers } = buildExportData(target);
    const tableHeaders = headers || EXPORT_HEADERS;
    const stamp = stampForFilename();
    const defaultBase = `stockscan-${safeFilename(target.name)}-${stamp}`;
    const base = kind === 'xlsx' ? sanitizeExportName(requestedName, defaultBase) : defaultBase;
    if (kind === 'xlsx') {
      downloadBlob(new Blob([buildWorkbook({ sheets })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base}.xlsx`);
      toast('Excel diunduh', 'success');
    } else if (kind === 'csv') {
      downloadBlob(new Blob(['\uFEFF', toCsv(tableHeaders, rows)], { type: 'text/csv;charset=utf-8' }), `${base}.csv`);
      toast('CSV diunduh', 'success');
    } else if (kind === 'tsv') {
      copyText(toTsv(tableHeaders, rows));
    }
  } catch (error) {
    console.error('[stockscan] export gagal', error);
    toast('Ekspor gagal. Coba lagi.', 'warning');
  }
}

async function shareFile() {
  const target = store.byId(exportSessionId) || session;
  const { sheets } = buildExportData(target);
  const blob = new Blob([buildWorkbook({ sheets })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const file = new File([blob], `stockscan-${safeFilename(target.name)}.xlsx`, { type: blob.type });
  if (!navigator.canShare?.({ files: [file] })) {
    toast('Bagikan file tidak didukung browser ini', 'warning');
    return;
  }
  try {
    await navigator.share({ files: [file], title: `Stok ${target.name}` });
  } catch {
    /* user cancelled */
  }
}

function openRekap() {
  const summary = sessionSummary(session);
  $('sum-found').textContent = summary.matched;
  $('sum-left').textContent = summary.remaining;
  $('sum-unmatched').textContent = summary.unmatched;
  $('left-list').innerHTML = session.items.filter((item) => item.status !== 'found')
    .map((item) => `<p>${escapeHtml(item.sn)}</p>`).join('') || '<p class="empty-inline">Semua sudah ketemu.</p>';
  $('unmatched-list').innerHTML = (session.unmatched || [])
    .map((item) => `<p>${escapeHtml(item.sn)} (${item.count}×)</p>`).join('') || '<p class="empty-inline">Tidak ada.</p>';
  openModal('rekap-modal');
}

function reportText() {
  const summary = sessionSummary(session);
  const lines = [
    '*LAPORAN STOCKSCAN*',
    `Sesi: ${session.name}`,
    `Tanggal: ${formatStamp(nowIso())}`,
    `Total scan: ${summary.totalScans}`,
    `Unik: ${summary.unique}`,
    `Duplikat: ${summary.duplicates}`,
    `Ketemu: ${summary.matched}`,
    `Sisa: ${summary.remaining}`,
  ];
  lines.push('', `*BELUM KETEMU (${summary.remaining})*`);
  for (const item of session.items.filter((entry) => entry.status !== 'found')) lines.push(`- ${item.sn}`);
  lines.push('', `*TIDAK COCOK (${summary.unmatched})*`);
  for (const item of session.unmatched || []) lines.push(`- ${item.sn}`);
  return lines.join('\n');
}


async function importList(file) {
  if (!file) return;
  const errorNode = $('import-error');
  errorNode.hidden = true;
  try {
    let values = [];
    if (/\.xlsx$/i.test(file.name)) {
      const rows = await readXlsxRows(file);
      const header = (rows[0] || []).map((cell) => String(cell).trim().toLowerCase());
      const column = header.findIndex((cell) =>
        /^(sn|s\/n|serial|serial\s*(number|no\.?)|serialnumber|no\.?\s*sn|nomor\s*sn|kode\s*sn|kode\s*barang|barcode|sn\s*perangkat)$/.test(cell),
      );
      values = rows.slice(column >= 0 ? 1 : 0)
        .map((row) => String(row[column >= 0 ? column : 0] ?? '').trim())
        .filter(Boolean);
    } else {
      const text = await file.text();
      values = (/\.csv$/i.test(file.name) ? parseCsv(text) : parseSnFile(text, file.name)).items;
    }
    const parsed = parseSnValues(values);
    $('sn-input').value = parsed.items.join('\n');
    updatePreview();
    toast(`${parsed.items.length} SN diimpor`, 'success');
  } catch (error) {
    errorNode.textContent = error.message || 'File tidak dapat dibaca.';
    errorNode.hidden = false;
  }
}

function parseSnEntries(text) {
  return parseSnValues(String(text ?? '').split(/\r?\n/).flatMap((line) => line.split(/[;,\t]/)));
}

function updatePreview() {
  const parsed = parseSnEntries($('sn-input').value);
  $('preview-count').textContent = `${parsed.items.length} SN terdeteksi${parsed.duplicates ? ` · ${parsed.duplicates} duplikat` : ''}`;
}


function wireEvents() {
  document.querySelectorAll('[data-close]').forEach((node) => node.addEventListener('click', () => {
    const modal = node.closest('.modal');
    if (modal) closeModal(modal.id);
  }));

  $('confirm-ok').addEventListener('click', () => {
    const callback = confirmCallback;
    confirmCallback = null;
    closeModal('confirm-modal');
    callback?.();
  });
  $('prompt-ok').addEventListener('click', () => {
    const callback = promptCallback;
    const value = $('prompt-input').value.trim();
    promptCallback = null;
    closeModal('prompt-modal');
    callback?.(value);
  });
  $('prompt-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); $('prompt-ok').click(); }
  });

  document.querySelectorAll('.mode-tab[data-mode]').forEach((tab) => tab.addEventListener('click', () => {
    mode = tab.dataset.mode;
    store.setMode(mode);
    session = store.ensure(mode);
    resetSessionFilters();
    $('camera-mode').textContent = mode === 'match' ? 'Cocokkan Daftar' : 'Scan Bebas';
    renderMode();
    renderHome();
    renderScanSheet();
  }));

  $('start-scan-btn').addEventListener('click', () => startScan(mode));
  $('collect-start').addEventListener('click', activateCamera);
  $('start-btn').addEventListener('click', () => {
    const parsed = parseSnEntries($('sn-input').value);
    if (!parsed.items.length) { toast('Masukkan atau impor daftar SN terlebih dahulu', 'warning'); return; }
    session = store.replace(session.id, setExpected(session, parsed.items));
    store.setMode('match');
    mode = 'match';
    activateCamera();
  });
  $('sn-input').addEventListener('input', updatePreview);
  $('file-btn').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', (event) => {
    importList(event.target.files[0]);
    event.target.value = '';
  });

  $('manual-btn').addEventListener('click', () => openEditor(-1, true));
  $('inventory-add').addEventListener('click', () => openEditor(-1, true));
  $('image-btn').addEventListener('click', () => $('image-input').click());
  $('image-input').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await decodeImageFile(file);
      if (!text) { toast('Barcode tidak ditemukan di gambar', 'warning'); return; }
      const result = handleScan(text, { format: 'Gambar' });
      showView('scan');
      $('camera-idle').hidden = false;
      if (result?.status === 'dup' || result?.status === 'already') toast('SN ini sudah ada di sesi', 'warning');
      else if (result?.status === 'unmatched') toast('Barcode di luar daftar cocokkan', 'warning');
      else if (result?.status === 'new' || result?.status === 'match') toast('Barcode dari gambar tersimpan', 'success');
      else toast('Barcode dari gambar tidak dapat disimpan', 'warning');
    } catch {
      toast('Gambar tidak dapat diproses', 'warning');
    }
  });

  $('edit-form').addEventListener('submit', saveEditor);
  $('edit-delete').addEventListener('click', () => askConfirm('Hapus item ini dari sesi?', () => {
    const index = session.items.findIndex(
      (item) => normalizeSn(item.sn) === normalizeSn(editing.sn),
    );
    const next = index >= 0 ? deleteItem(session, index) : null;
    if (next) {
      store.replace(session.id, next);
      session = store.byId(session.id);
      toast('Item dihapus', 'success');
    }
    closeModal('edit-modal');
    renderHome();
    renderInventory();
    renderScanSheet();
    if (currentView === 'detail') showView(detailOrigin === 'scan' ? 'scan' : 'inventory');
  }, 'Hapus item'));
  $('edit-cancel')?.addEventListener('click', () => closeModal('edit-modal'));
  $('qty-minus')?.addEventListener('click', () => { $('edit-qty').value = Math.max(1, Number($('edit-qty').value) - 1); });
  $('qty-plus')?.addEventListener('click', () => { $('edit-qty').value = Number($('edit-qty').value) + 1; });

  $('home-btn').addEventListener('click', () => showView('home'));
  $('camera-retry').addEventListener('click', activateCamera);
  $('pause-btn').addEventListener('click', () => {
    if (scanner.isPaused) {
      scanner.resume();
      $('paused-overlay').hidden = true;
      $('pause-btn').innerHTML = '<svg><use href="#i-pause"/></svg>';
    } else {
      scanner.pause();
      $('paused-overlay').hidden = false;
      $('pause-btn').innerHTML = '<svg><use href="#i-play"/></svg>';
    }
  });
  $('paused-resume').addEventListener('click', () => {
    scanner.resume();
    $('paused-overlay').hidden = true;
    $('pause-btn').innerHTML = '<svg><use href="#i-pause"/></svg>';
  });
  $('torch-btn').addEventListener('click', async () => {
    try { await scanner.toggleTorch(); } catch { toast('Senter tidak tersedia', 'warning'); }
  });
  $('switch-btn').addEventListener('click', async () => {
    try { await scanner.switchCamera(); toast('Kamera diganti', 'success'); }
    catch { toast('Kamera lain tidak tersedia', 'warning'); }
  });
  $('open-detail-btn').addEventListener('click', () => {
    const index = session.items.findIndex((item) => normalizeSn(item.sn) === normalizeSn(lastScan?.sn || ''));
    if (index >= 0) openDetail(index);
  });

  $('nav-inventory').addEventListener('click', () => showView('inventory'));
  $('nav-sessions').addEventListener('click', () => showView('sessions'));
  $('inventory-back').addEventListener('click', () => showView(previousView === 'scan' ? 'scan' : 'home'));
  $('sessions-back').addEventListener('click', () => {
    const target = previousView === 'scan' || previousView === 'inventory' ? previousView : 'home';
    showView(target);
  });
  $('detail-back').addEventListener('click', () => showView(detailOrigin));
  $('home-search-btn').addEventListener('click', () => showView('inventory'));
  $('profile-btn').addEventListener('click', () => {
    $('sound-toggle').checked = settings.sound;
    $('vibration-toggle').checked = settings.vibration;
    openModal('settings-modal');
  });
  $('sound-toggle').addEventListener('change', (event) => { settings.sound = event.target.checked; saveSettings(); });
  $('vibration-toggle').addEventListener('change', (event) => { settings.vibration = event.target.checked; saveSettings(); });

  $('search-input').addEventListener('input', (event) => {
    filter.query = event.target.value;
    pageSize = 100;
    renderInventory();
  });
  $('search-clear').addEventListener('click', () => { $('search-input').value = ''; filter.query = ''; renderInventory(); });
  document.querySelectorAll('.chip[data-filter]').forEach((chip) => chip.addEventListener('click', () => {
    filter.duplicates = chip.dataset.filter === 'duplicates';
    filter.today = chip.dataset.filter === 'today';
    document.querySelectorAll('.chip[data-filter]').forEach((node) => node.classList.toggle('is-active', node === chip));
    renderInventory();
  }));
  $('category-filter').addEventListener('change', (event) => { filter.category = event.target.value; renderInventory(); });
  $('sort-select').addEventListener('change', (event) => { filter.sort = event.target.value; renderInventory(); });
  $('load-more').addEventListener('click', () => { pageSize += 100; renderInventory(); });
  $('sn-list').addEventListener('click', (event) => {
    const row = event.target.closest('.item-row');
    if (row) openDetail(Number(row.dataset.index));
  });
  $('detail-edit').addEventListener('click', () => openEditor(selected.index));
  $('detail-save').addEventListener('click', () => showView(detailOrigin));
  $('detail-scan-again').addEventListener('click', () => startScan(mode));

  $('sessions-link').addEventListener('click', () => showView('sessions'));
  $('inventory-export').addEventListener('click', () => openExport(session.id));
  $('help-btn').addEventListener('click', () => showView('help'));
  $('help-back').addEventListener('click', () => showView('home'));
  $('manual-scan-btn').addEventListener('click', () => openEditor(-1, true));
  $('brand-chips').addEventListener('click', (event) => {
    const chip = event.target.closest('.brand-chip');
    if (!chip) return;
    session = store.replace(session.id, { ...session, activeBrand: chip.dataset.brand });
    renderScanSheet();
  });
  $('scan-search').addEventListener('input', (event) => {
    scanQuery = event.target.value;
    scanPageSize = 60;
    renderScanSheet();
  });
  $('scan-list-more').addEventListener('click', () => {
    scanPageSize += 60;
    renderScanSheet();
  });
  $('scan-list').addEventListener('click', (event) => {
    const editBtn = event.target.closest('[data-edit]');
    if (editBtn) { openEditor(Number(editBtn.dataset.edit)); return; }
    const row = event.target.closest('.scan-row-main');
    if (row) openDetail(Number(row.dataset.index));
  });
  document.querySelectorAll('.mode-tab[data-session-mode]').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('.mode-tab[data-session-mode]').forEach((node) => node.classList.toggle('is-active', node === tab));
    renderSessions();
  }));
  $('new-session-btn').addEventListener('click', () => {
    const activeMode = document.querySelector('.mode-tab[data-session-mode].is-active')?.dataset.sessionMode || 'collect';
    askPrompt('Nama sesi baru', activeMode === 'match' ? 'Cocokkan Daftar' : 'Scan Bebas', (name) => {
      const created = store.create(activeMode, name || 'Sesi Baru');
      session = created;
      mode = created.mode;
      resetSessionFilters();
      renderSessions();
      renderHome();
      toast('Sesi dibuat', 'success');
    });
  });
  $('session-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    const target = store.byId(id);
    if (!target) return;
    if (action === 'resume') {
      store.switchTo(id);
      session = store.byId(id);
      mode = session.mode;
      store.setMode(mode);
      resetSessionFilters();
      renderMode();
      renderHome();
      renderSessions();
      toast(`Sesi "${target.name}" aktif`, 'success');
    } else if (action === 'rename') {
      askPrompt('Ubah nama sesi', target.name, (name) => {
        const updated = name ? store.rename(id, name) : null;
        if (updated && session?.id === id) session = updated;
        renderSessions();
        renderHome();
        renderScanSheet();
      });
    } else if (action === 'export') {
      openExport(id);
    } else if (action === 'clear') {
      askConfirm(`Kosongkan semua item dalam sesi "${target.name}"?`, () => {
        store.clear(id);
        session = store.byId(session.id) || session;
        renderSessions();
        renderHome();
        renderInventory();
        toast('Sesi dikosongkan', 'success');
      }, 'Kosongkan');
    } else if (action === 'delete') {
      askConfirm(`Hapus sesi "${target.name}" beserta seluruh datanya?`, () => {
        const wasActive = store.state.activeIds[mode] === id;
        store.remove(id);
        session = store.active(mode) || store.ensure(mode);
        if (wasActive) resetSessionFilters();
        renderSessions();
        renderHome();
        renderInventory();
        toast('Sesi dihapus', 'success');
      }, 'Hapus sesi');
    }
  });

  $('rekap-btn').addEventListener('click', () => (mode === 'match' ? openRekap() : openExport(session.id)));
  $('copy-report').addEventListener('click', () => copyText(reportText()));
  $('rekap-export').addEventListener('click', () => { closeModal('rekap-modal'); openExport(session.id); });
  $('export-xlsx').addEventListener('click', () => {
    const target = store.byId(exportSessionId) || session;
    const stamp = stampForFilename();
    const defaultName = `stockscan-${safeFilename(target.name)}-${stamp}`;
    askPrompt('Nama file Excel', defaultName, (value) => exportFile('xlsx', value), 'Unduh');
    $('prompt-input').select();
  });
  $('export-csv').addEventListener('click', () => exportFile('csv'));
  $('export-tsv').addEventListener('click', () => exportFile('tsv'));
  $('export-share').addEventListener('click', shareFile);
  $('export-clear').addEventListener('click', () => {
    const id = exportSessionId;
    closeModal('export-modal');
    askConfirm('Hapus semua item pada sesi ini? Tindakan ini tidak dapat dibatalkan.', () => {
      store.clear(id);
      session = store.byId(id) || store.ensure(mode);
      renderHome();
      renderInventory();
      renderSessions();
      renderScanSheet();
      toast('Sesi dikosongkan', 'success');
    }, 'Kosongkan');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = document.querySelector('.modal:not([hidden])');
    if (open) closeModal(open.id);
    else if (currentView !== 'home') showView('home');
  });
}

function openDetail(index) {
  const item = session.items[index];
  if (!item) return;
  detailOrigin = currentView;
  selected = { index, sn: item.sn, lastAt: item.lastAt || item.scannedAt || item.firstAt, status: item.status || '' };
  renderDetail();
  showView('detail');
}


function init() {
  $('edit-brand').innerHTML = '<option value="auto">Auto</option>' + BRANDS.map((brand) => `<option value="${brand}">${brand}</option>`).join('');
  $('edit-category').innerHTML = CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join('');
  $('category-filter').innerHTML = '<option value="">Semua kategori</option>' + CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join('');
  wireEvents();
  renderMode();
  renderHome();
  renderInventory();
  renderSessions();
  renderScanSheet();
  updatePreview();

  window.__stockscan = {
    scan: (value, meta) => handleScan(value, meta),
    mode: () => mode,
    getState: () => store.state,
    getStore: () => ({
      mode,
      collect: store.list('collect').map((item) => ({ items: item.items })),
      match: store.list('match').map((item) => ({ items: item.items })),
      sessions: store.state.sessions,
    }),
    session: () => session,
    switchMode: (next) => { mode = next; session = store.ensure(mode); renderMode(); renderHome(); },
    showView,
  };
  window.__snc = window.__stockscan;
}

init();
