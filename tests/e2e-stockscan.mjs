import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { buildWorkbook } from '../assets/xlsx.js';

const executablePath = process.env.CHROME_PATH || '/usr/bin/chromium';
const y4m = fileURLToPath(new URL('./fixtures/scan.y4m', import.meta.url));
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${y4m}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  permissions: ['camera'],
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

let passed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log('PASS', name); }
  else { console.error('FAIL', name); process.exitCode = 1; }
}

await page.goto(base);
await page.evaluate(() => {
  localStorage.clear();
});
await page.reload();
await page.waitForSelector('#home-view:not([hidden])');

check('home shows the greeting', (await page.locator('.greeting h1').getAttribute('aria-label')).toLowerCase().includes('mau scan'));
check('home shows three primary actions', await page.locator('#start-scan-btn, #nav-inventory, #manual-btn').count() === 3);

// XLSX import through the real file input.
const importPath = fileURLToPath(new URL('./screenshots/import-sn.xlsx', import.meta.url));
fs.writeFileSync(importPath, buildWorkbook({
  sheets: [{ name: 'SN', headers: ['SN'], rows: [['ZX-001'], ['ZX-002'], ['ZX-003']] }],
}));
await page.setInputFiles('#file-input', importPath);
await page.waitForFunction(() => document.getElementById('preview-count').textContent.includes('3 SN'));
check('XLSX list import reads serial numbers', true);

// Camera scanning with Chromium fake video.
await page.click('#start-scan-btn');
check('mode tabs default to Scan Bebas', await page.locator('.mode-tab[data-mode="collect"]').evaluate((node) => node.classList.contains('is-active')));
await page.click('#collect-start');
await page.waitForFunction(() => {
  const video = document.getElementById('camera-video');
  return video && video.videoWidth > 0 && video.readyState >= 2;
}, { timeout: 15000 });
check('camera preview is running', true);
check('no camera error overlay', await page.locator('#camera-error').isHidden());

const frameMetrics = await page.evaluate(() => {
  const stage = document.getElementById('camera-stage').getBoundingClientRect();
  const frame = document.getElementById('scan-frame').getBoundingClientRect();
  return { stageWidth: stage.width, stageHeight: stage.height, frameWidth: frame.width, frameHeight: frame.height };
});
check('scan frame is a thin strip',
  frameMetrics.frameWidth >= frameMetrics.stageWidth * 0.8
  && frameMetrics.frameHeight <= frameMetrics.stageHeight * 0.3
  && frameMetrics.frameWidth / frameMetrics.frameHeight >= 3);

try {
  await page.waitForFunction(() => {
    const value = document.getElementById('scan-value').textContent;
    return value && value !== '-' && value !== '—';
  }, { timeout: 20000 });
  check('barcode detected from camera', true);
} catch {
  check('barcode detected from camera', false);
}

const firstValue = await page.locator('#scan-value').innerText();
if (firstValue && firstValue !== '-' && firstValue !== '—') {
  const scansBefore = await page.evaluate(() => window.__stockscan.session().items[0]?.scanCount);
  await page.waitForTimeout(1700);
  await page.evaluate((value) => window.__stockscan.scan(value), firstValue);
  check('duplicate scan shows warning badge', (await page.locator('#scan-status').innerText()).includes('Duplikat'));
  const scansAfter = await page.evaluate(() => window.__stockscan.session().items[0]?.scanCount);
  check('duplicate scan does not increment scan count', scansAfter === scansBefore);
  const duplicateScans = await page.evaluate(() => window.__stockscan.session().duplicateScans);
  check('duplicate scan is counted separately', duplicateScans >= 1);
}

// Manual entry through the editor.
await page.click('#home-btn');
await page.click('#manual-btn');
await page.fill('#edit-sn', 'MANUAL-9001');
await page.fill('#edit-name', 'Router uji');
await page.selectOption('#edit-brand', 'Huawei');
await page.fill('#edit-qty', '2');
await page.click('#edit-form button[type="submit"]');
await page.click('#nav-inventory');
check('manual item appears in inventory', (await page.locator('#sn-list').innerText()).includes('MANUAL-9001'));

// Search and filters.
await page.fill('#search-input', 'router');
check('search finds item by product name', await page.locator('.item-row').count() === 1);
await page.fill('#search-input', '');
await page.click('.chip[data-filter="duplicates"]');
check('duplicate filter is empty after rejecting repeats', await page.locator('.item-row').count() === 0);
await page.click('.chip[data-filter="all"]');

// Edit item.
await page.locator('.item-row').first().click();
check('detail view opens', await page.locator('#detail-view').isVisible());
await page.click('#detail-edit');
await page.fill('#edit-sn', 'MANUAL-9002');
await page.click('#edit-form button[type="submit"]');
await page.click('#detail-back');
check('edited SN is visible', (await page.locator('#sn-list').innerText()).includes('MANUAL-9002'));

// Delete item with confirmation.
await page.locator('.item-row').first().click();
await page.click('#detail-edit');
await page.click('#edit-delete');
await page.click('#confirm-ok');
check('deleted item is gone', !(await page.locator('#sn-list').innerText()).includes('MANUAL-9002'));

// Sessions persist and can be created.
await page.click('#nav-sessions');
const before = await page.locator('.session-card').count();
await page.click('#new-session-btn');
await page.fill('#prompt-input', 'Shift Malam');
await page.click('#prompt-ok');
check('new session created', await page.locator('.session-card').count() === before + 1);

// Export produces a real file.
await page.click('#sessions-back');
if (!(await page.locator('#inventory-view').isVisible())) await page.click('#nav-inventory');
await page.click('#inventory-export');
await page.click('#export-xlsx');
check('Excel filename prompt appears', await page.locator('#prompt-modal').isVisible());
await page.fill('#prompt-input', 'rekap-test');
const downloadPromise = page.waitForEvent('download');
await page.click('#prompt-ok');
const download = await downloadPromise;
const path = await download.path();
check('XLSX download generated', fs.existsSync(path) && fs.statSync(path).size > 1000);
check('XLSX uses custom filename', await download.suggestedFilename() === 'rekap-test.xlsx');

// Reload persistence.
await page.reload();
await page.waitForSelector('#home-view:not([hidden])');
await page.click('#nav-inventory');
await page.click('#nav-sessions');
check('sessions survive reload', (await page.locator('#session-list').innerText()).includes('Shift Malam'));

await page.setViewportSize({ width: 360, height: 640 });
await page.click('#sessions-back');
if (await page.locator('#inventory-view').isVisible()) await page.click('#inventory-back');
await page.screenshot({ path: fileURLToPath(new URL('./screenshots/stockscan-home-360.png', import.meta.url)), fullPage: true });

check('no console or page errors', errors.length === 0);
if (errors.length) console.error(errors.slice(0, 6).join('\n'));

console.log(`\n${passed} checks passed`);
await browser.close();
