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
await page.fill('#sn-input', 'ZTEGC1234567\nZTEGC1234568\nMAC0011223344');
await page.click('#start-btn');

await page.waitForFunction(
  () => {
    const video = document.getElementById('camera-video');
    return video && video.videoWidth > 0 && video.readyState >= 2;
  },
  { timeout: 15000 },
);

const camera = await page.evaluate(() => {
  const video = document.getElementById('camera-video');
  return {
    width: video.videoWidth,
    height: video.videoHeight,
    paused: video.paused,
    errorVisible: !document.getElementById('camera-error').hidden,
    scanner: window.__snc.scannerInfo(),
  };
});
console.log('camera', camera);

try {
  await page.waitForFunction(
    () => document.getElementById('found-count').textContent === '1',
    { timeout: 20000 },
  );
} catch {
  console.log('no automatic detection');
}

const result = await page.evaluate(() => ({
  found: document.getElementById('found-count').textContent,
  total: document.getElementById('total-count').textContent,
  hint: document.getElementById('scan-hint').textContent,
  hintKind: document.getElementById('scan-hint').dataset.kind,
  toast: document.getElementById('toast-text').textContent,
  state: window.__snc.getState(),
  errorVisible: !document.getElementById('camera-error').hidden,
}));
console.log(JSON.stringify(result, null, 2));
console.log('errors', errors);

await page.screenshot({
  path: fileURLToPath(new URL('./e2e-scan.png', import.meta.url)),
});
await browser.close();
