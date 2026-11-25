import { chromium } from 'playwright-core';

const executablePath =
  process.env.CHROME_PATH ||
  '/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto('http://127.0.0.1:4173/');
await page.evaluate(() => localStorage.removeItem('warehouse-sn-scanner/v1'));
await page.reload();

const csv = Buffer.from('No,SN,MAC Address\n1,ZTEGC9000001,AA:BB\n2,ZTEGC9000002,CC:DD\n3,ZTEGC9000001,EE:FF\n');
await page.setInputFiles('#file-input', {
  name: 'daftar.csv',
  mimeType: 'text/csv',
  buffer: csv,
});
await page.waitForTimeout(300);
console.log(
  'csv',
  await page.evaluate(() => ({
    value: document.getElementById('sn-input').value,
    preview: document.getElementById('preview-count').textContent,
    note: document.getElementById('file-note').textContent,
    disabled: document.getElementById('start-btn').disabled,
  })),
);

const txt = Buffer.from('  zte9000003 , ZTE9000004\n\nZTE9000003\n');
await page.setInputFiles('#file-input', {
  name: 'daftar.txt',
  mimeType: 'text/plain',
  buffer: txt,
});
await page.waitForTimeout(300);
console.log(
  'txt',
  await page.evaluate(() => ({
    value: document.getElementById('sn-input').value,
    preview: document.getElementById('preview-count').textContent,
    note: document.getElementById('file-note').textContent,
    disabled: document.getElementById('start-btn').disabled,
  })),
);
console.log('errors', errors);
await browser.close();
