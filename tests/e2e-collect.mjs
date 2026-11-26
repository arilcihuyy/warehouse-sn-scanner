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
await page.evaluate(() => {
  localStorage.removeItem('warehouse-sn-scanner/v1');
  localStorage.removeItem('warehouse-sn-scanner/v2');
});
await page.reload();
await page.waitForTimeout(300);

const home = await page.evaluate(() => ({
  modeTabs: [...document.querySelectorAll('.mode-tab')].map((tab) => tab.textContent.trim()),
  matchVisible: !document.getElementById('match-panel').hidden,
  collectVisible: !document.getElementById('collect-panel').hidden,
}));
console.log('home', home);

await page.click('.mode-tab[data-mode="collect"]');
await page.waitForTimeout(200);
console.log(
  'collect panel',
  await page.evaluate(() => ({
    visible: !document.getElementById('collect-panel').hidden,
    count: document.getElementById('collect-count').textContent,
    start: document.getElementById('collect-start').textContent.trim(),
  })),
);

await page.click('#collect-start');
await page.waitForTimeout(900);
console.log(
  'scan view',
  await page.evaluate(() => ({
    scanVisible: !document.getElementById('scan-view').hidden,
    mode: window.__snc.mode(),
    cameraError: !document.getElementById('camera-error').hidden,
    tabsHidden: document.getElementById('tabs').hidden,
    manualHidden: document.getElementById('manual-btn').hidden,
  })),
);

async function scan(code, wait = 1650) {
  await page.evaluate((value) => window.__snc.scan(value), code);
  await page.waitForTimeout(wait);
}

await scan('SN-001', 300);
await page.waitForTimeout(1600);
await scan('sn-001', 300);
await scan('SN-002');
console.log(
  'after scans',
  await page.evaluate(() => ({
    unique: document.getElementById('found-count').textContent,
    total: document.getElementById('total-count').textContent,
    rows: [...document.querySelectorAll('#sn-list .sn-row')].map((row) => ({
      sn: row.querySelector('.sn-code').textContent,
      qty: row.querySelector('.sn-qty').textContent,
      meta: row.querySelector('.sn-meta').textContent,
    })),
    store: window.__snc.getStore(),
  })),
);
await page.screenshot({ path: fileURLToPath(new URL('./e2e-collect.png', import.meta.url)) });

// Edit SN-001: qty 2 -> 3, rename.
await page.locator('#sn-list .sn-row', { hasText: 'SN-001' }).click();
await page.waitForTimeout(250);
console.log(
  'edit open',
  await page.evaluate(() => ({
    visible: !document.getElementById('edit-modal').hidden,
    title: document.getElementById('edit-title').textContent,
    sn: document.getElementById('edit-sn').value,
    qty: document.getElementById('edit-qty').textContent,
  })),
);
await page.click('#qty-plus');
await page.fill('#edit-sn', 'SN-001-EDIT');
await page.click('#edit-form button[type="submit"]');
await page.waitForTimeout(250);
console.log(
  'after edit',
  await page.evaluate(() => ({
    unique: document.getElementById('found-count').textContent,
    total: document.getElementById('total-count').textContent,
    first: document.querySelector('#sn-list .sn-row .sn-code').textContent,
  })),
);

// Manual add.
await page.click('#manual-btn');
await page.waitForTimeout(200);
await page.fill('#edit-sn', 'MANUAL-9');
await page.click('#edit-form button[type="submit"]');
await page.waitForTimeout(250);
console.log(
  'after manual',
  await page.evaluate(() => ({
    unique: document.getElementById('found-count').textContent,
    rows: [...document.querySelectorAll('#sn-list .sn-code')].map((node) => node.textContent),
  })),
);

// Duplicate manual SN is rejected.
await page.click('#manual-btn');
await page.waitForTimeout(200);
await page.fill('#edit-sn', 'manual-9');
await page.click('#edit-form button[type="submit"]');
await page.waitForTimeout(200);
console.log(
  'duplicate guard',
  await page.evaluate(() => ({
    visible: !document.getElementById('edit-modal').hidden,
    error: document.getElementById('edit-error').textContent,
  })),
);
await page.click('#edit-cancel');

// Delete MANUAL-9.
await page.locator('#sn-list .sn-row', { hasText: 'MANUAL-9' }).click();
await page.waitForTimeout(200);
await page.click('#edit-delete');
await page.waitForTimeout(250);
console.log(
  'after delete',
  await page.evaluate(() => ({
    unique: document.getElementById('found-count').textContent,
    total: document.getElementById('total-count').textContent,
    rows: [...document.querySelectorAll('#sn-list .sn-code')].map((node) => node.textContent),
  })),
);

// Export XLSX + CSV.
await page.click('#rekap-btn');
await page.waitForTimeout(300);
console.log(
  'export modal',
  await page.evaluate(() => ({
    visible: !document.getElementById('export-modal').hidden,
    unique: document.getElementById('export-unique').textContent,
    total: document.getElementById('export-total').textContent,
  })),
);
await page.screenshot({ path: fileURLToPath(new URL('./e2e-export.png', import.meta.url)) });
const xlsxDownload = page.waitForEvent('download');
await page.click('#export-xlsx');
const xlsx = await xlsxDownload;
await xlsx.saveAs(fileURLToPath(new URL('./e2e-collect.xlsx', import.meta.url)));
console.log('xlsx', xlsx.suggestedFilename());

await page.click('#rekap-btn');
await page.waitForTimeout(250);
const csvDownload = page.waitForEvent('download');
await page.click('#export-csv');
const csv = await csvDownload;
await csv.saveAs(fileURLToPath(new URL('./e2e-collect.csv', import.meta.url)));
console.log('csv', csv.suggestedFilename());

// Reload: collect session must come back.
await page.reload();
await page.waitForTimeout(500);
console.log(
  'after reload',
  await page.evaluate(() => ({
    mode: window.__snc.mode(),
    scanVisible: !document.getElementById('scan-view').hidden,
    unique: document.getElementById('found-count').textContent,
    total: document.getElementById('total-count').textContent,
    rows: [...document.querySelectorAll('#sn-list .sn-code')].map((node) => node.textContent),
  })),
);

// Match mode regression.
await page.click('#home-btn');
await page.waitForTimeout(300);
await page.click('.mode-tab[data-mode="match"]');
await page.fill('#sn-input', 'AAA111\nBBB222');
await page.click('#start-btn');
await page.waitForTimeout(900);
await page.evaluate(() => window.__snc.scan('AAA111'));
await page.waitForTimeout(300);
console.log(
  'match mode',
  await page.evaluate(() => ({
    mode: window.__snc.mode(),
    found: document.getElementById('found-count').textContent,
    total: document.getElementById('total-count').textContent,
    tabsHidden: document.getElementById('tabs').hidden,
  })),
);

console.log('errors', errors);
await browser.close();
