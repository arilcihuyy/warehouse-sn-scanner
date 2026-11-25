import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const executablePath =
  process.env.CHROME_PATH ||
  '/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const y4m = fileURLToPath(new URL('./fixtures/scan.y4m', import.meta.url));
const throttle = Number(process.env.THROTTLE || 4);
const seconds = Number(process.env.SECONDS || 8);

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
await page.addInitScript(() => {
  window.__perf = { longTasks: [], raf: [], decode: [], workerMs: [] };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__perf.longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* unsupported */
  }
  let last = performance.now();
  function loop() {
    const now = performance.now();
    window.__perf.raf.push(now - last);
    last = now;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});

await page.goto('http://127.0.0.1:4173/?debug=1');
await page.evaluate(() => localStorage.removeItem('warehouse-sn-scanner/v1'));
await page.reload();
await page.fill('#sn-input', 'ZTEGC1234567\nZTEGC1234568');
await page.click('#start-btn');
await page.waitForFunction(() => document.getElementById('camera-video').videoWidth > 0, {
  timeout: 15000,
});

const client = await context.newCDPSession(page);
await client.send('Emulation.setCPUThrottlingRate', { rate: throttle });

await page.evaluate(() => {
  const scanner = window.__snc.scannerRef();
  const originalScan = scanner.scanFrame.bind(scanner);
  scanner.scanFrame = function instrumented() {
    const start = performance.now();
    originalScan();
    window.__perf.decode.push(performance.now() - start);
  };
  const originalMessage = scanner.handleWorkerMessage.bind(scanner);
  scanner.handleWorkerMessage = function instrumentedMessage(message) {
    if (typeof message.ms === 'number') window.__perf.workerMs.push(message.ms);
    return originalMessage(message);
  };
  window.__frames = 0;
  const video = document.getElementById('camera-video');
  const countFrame = () => {
    window.__frames += 1;
    video.requestVideoFrameCallback(countFrame);
  };
  video.requestVideoFrameCallback(countFrame);
  window.__perfStart = performance.now();
});

await page.waitForTimeout(seconds * 1000);

const metrics = await page.evaluate(() => {
  const perf = window.__perf;
  const decode = perf.decode.slice(2);
  const raf = perf.raf.slice(2);
  const workerMs = perf.workerMs.slice(2);
  const sorted = (values) => [...values].sort((a, b) => a - b);
  const p = (values, q) => {
    if (!values.length) return 0;
    const index = Math.min(values.length - 1, Math.floor(values.length * q));
    return values[index];
  };
  const ds = sorted(decode);
  const rs = sorted(raf);
  const ws = sorted(workerMs);
  const elapsed = performance.now() - window.__perfStart;
  return {
    camera: {
      width: document.getElementById('camera-video').videoWidth,
      height: document.getElementById('camera-video').videoHeight,
    },
    seconds: elapsed / 1000,
    videoFps: window.__frames / (elapsed / 1000),
    mainFrameCount: decode.length,
    mainFrameAvg: decode.reduce((a, b) => a + b, 0) / Math.max(1, decode.length),
    mainFrameP95: p(ds, 0.95),
    mainFrameMax: Math.max(0, ...decode),
    workerCount: workerMs.length,
    workerAvg: workerMs.reduce((a, b) => a + b, 0) / Math.max(1, workerMs.length),
    workerP95: p(ws, 0.95),
    workerMax: Math.max(0, ...workerMs),
    rafP95: p(rs, 0.95),
    rafMax: Math.max(0, ...raf),
    rafOver50: raf.filter((v) => v > 50).length,
    longTasks: perf.longTasks.length,
    longTaskTotal: perf.longTasks.reduce((a, b) => a + b, 0),
    longTaskMax: Math.max(0, ...perf.longTasks),
  };
});
metrics.throttle = throttle;
console.log(JSON.stringify(metrics, null, 2));
await browser.close();
