import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const executablePath =
  process.env.CHROME_PATH ||
  '/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto('http://127.0.0.1:4173/?debug=1');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(300);
await page.click('.mode-tab[data-mode="collect"]');
await page.click('#collect-start');
await page.waitForTimeout(800);

console.log(
  'brand bar',
  await page.evaluate(() => ({
    visible: !document.getElementById('brand-bar').hidden,
    chips: [...document.querySelectorAll('.brand-chip')].map((chip) => ({
      brand: chip.dataset.brand,
      active: chip.classList.contains('is-active'),
    })),
  })),
);

async function scan(code, wait = 1650) {
  await page.evaluate((value) => window.__snc.scan(value), code);
  await page.waitForTimeout(wait);
}

await scan('ZTEGC-1001', 300);
await scan('HWTC-2002', 300);
await scan('FHTT-3003', 300);
await scan('RCM-4004', 300);
console.log(
  'auto brands',
  await page.evaluate(() => ({
    unique: document.getElementById('found-count').textContent,
    rows: [...document.querySelectorAll('#sn-list .sn-row')].map((row) => ({
      sn: row.querySelector('.sn-code').textContent,
      meta: row.querySelector('.sn-meta').textContent,
    })),
  })),
);

await page.click('.brand-chip[data-brand="ZTE"]');
await scan('MYSTERY-5005', 300);
await page.click('.brand-chip[data-brand="auto"]');
await scan('UNKNOWN-6006', 300);
console.log(
  'manual override',
  await page.evaluate(() => ({
    active: document.querySelector('.brand-chip.is-active')?.dataset.brand,
    rows: [...document.querySelectorAll('#sn-list .sn-row')].map((row) => ({
      sn: row.querySelector('.sn-code').textContent,
      meta: row.querySelector('.sn-meta').textContent,
    })),
    store: window.__snc.getStore().collect,
  })),
);

// Edit MYSTERY-5005 into FiberHome.
await page.locator('#sn-list .sn-row', { hasText: 'MYSTERY-5005' }).click();
await page.waitForTimeout(250);
await page.selectOption('#edit-brand', 'FiberHome');
await page.click('#edit-form button[type="submit"]');
await page.waitForTimeout(250);
console.log(
  'after edit brand',
  await page.evaluate(() => ({
    rows: [...document.querySelectorAll('#sn-list .sn-row')].map((row) => ({
      sn: row.querySelector('.sn-code').textContent,
      meta: row.querySelector('.sn-meta').textContent,
    })),
    brands: window.__snc.summary(),
  })),
);

await page.click('#rekap-btn');
await page.waitForTimeout(300);
await page.screenshot({ path: fileURLToPath(new URL('./e2e-brands.png', import.meta.url)) });
const downloadPromise = page.waitForEvent('download');
await page.click('#export-xlsx');
const download = await downloadPromise;
await download.saveAs(fileURLToPath(new URL('./e2e-brands.xlsx', import.meta.url)));
console.log('xlsx', download.suggestedFilename());

await page.click('.brand-chip[data-brand="RCM"]');
await page.waitForTimeout(200);
await page.reload();
await page.waitForTimeout(500);
console.log(
  'after reload',
  await page.evaluate(() => ({
    mode: window.__snc.mode(),
    active: document.querySelector('.brand-chip.is-active')?.dataset.brand,
    unique: document.getElementById('found-count').textContent,
  })),
);
console.log('errors', errors);
await browser.close();
