import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const executablePath =
  process.env.CHROME_PATH ||
  '/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const y4m = fileURLToPath(new URL('./fixtures/scan.y4m', import.meta.url));

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
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto('http://127.0.0.1:4173/?debug=1');
await page.evaluate(() => localStorage.removeItem('warehouse-sn-scanner/v1'));
await page.reload();
await page.fill('#sn-input', 'ZTEGC1234567\nZTEGC1234568');
await page.click('#start-btn');
await page.waitForFunction(
  () => document.getElementById('camera-video').videoWidth > 0,
  { timeout: 15000 },
);
await page.waitForFunction(
  () => document.getElementById('found-count').textContent === '1',
  { timeout: 20000 },
);
await page.evaluate(() => window.__snc.scan('ZTEGC1234568'));
await page.waitForTimeout(500);

const complete = await page.evaluate(() => ({
  found: document.getElementById('found-count').textContent,
  total: document.getElementById('total-count').textContent,
  pct: document.getElementById('progress-pct').textContent,
  completeLineVisible: !document.getElementById('complete-line').hidden,
  toast: document.getElementById('toast-text').textContent,
  rekapCount: document.getElementById('rekap-count').textContent,
}));
console.log('complete', complete);
await page.screenshot({
  path: fileURLToPath(new URL('./e2e-complete.png', import.meta.url)),
});

await page.evaluate(() => window.__snc.toggle(0));
await page.waitForTimeout(200);
const afterUncheck = await page.evaluate(() => ({
  found: document.getElementById('found-count').textContent,
  completeLineVisible: !document.getElementById('complete-line').hidden,
}));
console.log('afterUncheck', afterUncheck);
await page.evaluate(() => window.__snc.toggle(0));
await page.waitForTimeout(200);
const afterRecheck = await page.evaluate(() => ({
  found: document.getElementById('found-count').textContent,
  completeLineVisible: !document.getElementById('complete-line').hidden,
}));
console.log('afterRecheck', afterRecheck);

await page.click('#rekap-btn');
await page.waitForTimeout(300);
const rekap = await page.evaluate(() => ({
  total: document.getElementById('sum-total').textContent,
  found: document.getElementById('sum-found').textContent,
  left: document.getElementById('sum-left').textContent,
  copyLeftDisabled: document.getElementById('copy-left').disabled,
  leftEmpty: document.querySelector('#left-list .rekap-empty')?.textContent,
}));
console.log('rekap', rekap);

await page.click('#reset-btn');
await page.waitForTimeout(200);
await page.click('#confirm-reset');
await page.waitForTimeout(500);
const reset = await page.evaluate(() => ({
  importVisible: !document.getElementById('import-view').hidden,
  scanHidden: document.getElementById('scan-view').hidden,
  storage: localStorage.getItem('warehouse-sn-scanner/v1'),
  scanner: window.__snc.scannerInfo(),
  textarea: document.getElementById('sn-input').value,
}));
console.log('reset', reset);
console.log('errors', errors);

await browser.close();
