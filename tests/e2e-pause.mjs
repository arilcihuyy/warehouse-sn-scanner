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

const desktop = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  permissions: ['camera'],
});
const page = await desktop.newPage();
await page.goto('http://127.0.0.1:4173/?debug=1');
await page.evaluate(() => localStorage.removeItem('warehouse-sn-scanner/v1'));
await page.reload();
await page.fill('#sn-input', 'ZTEGC1234567\nZTEGC1234568\nMAC0011223344');
await page.click('#start-btn');
await page.waitForFunction(() => document.getElementById('camera-video').videoWidth > 0, {
  timeout: 15000,
});
await page.waitForTimeout(300);
await page.screenshot({
  path: fileURLToPath(new URL('./landscape-scan.png', import.meta.url)),
});

await page.click('#pause-btn');
await page.waitForTimeout(300);
const paused = await page.evaluate(() => ({
  overlay: !document.getElementById('paused-overlay').hidden,
  buttonClass: document.getElementById('pause-btn').classList.contains('is-paused'),
  videoPaused: document.getElementById('camera-video').paused,
  scanner: window.__snc.scannerInfo(),
}));
console.log('paused', paused);
await page.screenshot({
  path: fileURLToPath(new URL('./landscape-paused.png', import.meta.url)),
});

await page.click('#paused-resume');
await page.waitForTimeout(500);
const resumed = await page.evaluate(() => ({
  overlay: !document.getElementById('paused-overlay').hidden,
  buttonClass: document.getElementById('pause-btn').classList.contains('is-paused'),
  videoPaused: document.getElementById('camera-video').paused,
  scanner: window.__snc.scannerInfo(),
}));
console.log('resumed', resumed);

await browser.close();
