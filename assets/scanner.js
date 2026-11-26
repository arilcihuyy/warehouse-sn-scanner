import { computeSourceRoi, createDecoder } from './scan-core.js';

const DECODE_INTERVAL_MS = 120;

/**
 * Camera + crop + decode loop.
 * The video fills the stage with object-fit: cover; only the thin frame
 * rectangle is copied into the decoder canvas, which keeps neighbouring
 * barcodes on a modem label out of play.
 */
export class CameraScanner {
  constructor({ video, stage, frame, onDetect, onTorchChange, onEnded }) {
    this.video = video;
    this.stage = stage;
    this.frame = frame;
    this.onDetect = onDetect;
    this.onTorchChange = onTorchChange;
    this.onEnded = onEnded;

    this.stream = null;
    this.track = null;
    this.running = false;
    this.paused = false;
    this.starting = null;
    this.generation = 0;
    this.timer = 0;
    this.torchOn = false;
    this.torchSupported = false;
    this.facingMode = 'environment';
    this.wakeLock = null;

    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    this.geometry = null;
    this.geometryAt = 0;

    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory;
    this.maxWidth = cores >= 8 ? 900 : cores >= 6 ? 760 : 640;
    if (memory && memory <= 4) this.maxWidth = Math.min(this.maxWidth, 640);
    this.maxHeight = cores >= 8 ? 360 : 320;

    this.worker = null;
    this.workerFailed = false;
    this.workerGeneration = 0;
    this.frameId = 0;
    this.decoding = false;
    this.lastDecodeMs = 0;
    this.slowDecodes = 0;
    this.decodeSync = null;

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.running && !this.paused) {
        this.video.play().catch(() => {});
        this.requestWakeLock();
      }
    });
    window.addEventListener('resize', () => {
      this.geometry = null;
    });
  }

  get isRunning() {
    return this.running;
  }

  get isPaused() {
    return this.paused;
  }

  createWorker() {
    if (typeof Worker === 'undefined') {
      this.workerFailed = true;
      return;
    }
    try {
      this.worker = new Worker(new URL('./scan-worker.js', import.meta.url));
      this.worker.addEventListener('message', (event) => this.handleWorkerMessage(event.data));
      this.worker.addEventListener('error', (event) => {
        console.warn('[scanner] decode worker gagal, pakai main thread', event.message || event);
        this.workerFailed = true;
        this.decoding = false;
        try {
          this.worker.terminate();
        } catch {
          /* ignore */
        }
        this.worker = null;
      });
    } catch (error) {
      console.warn('[scanner] worker tidak tersedia', error);
      this.workerFailed = true;
    }
  }

  handleWorkerMessage({ id, generation, text, ms }) {
    if (generation !== this.workerGeneration) return;
    this.decoding = false;
    this.lastDecodeMs = ms || 0;
    if (this.lastDecodeMs > 120) {
      this.slowDecodes += 1;
      if (this.slowDecodes >= 3 && this.maxWidth > 480) {
        this.maxWidth = Math.max(480, this.maxWidth - 80);
        this.slowDecodes = 0;
      }
    } else {
      this.slowDecodes = 0;
    }
    if (text && this.running && !this.paused) this.onDetect?.(text);
  }

  async start() {
    if (this.running) return;
    if (this.starting) return this.starting;
    const generation = (this.generation += 1);
    this.workerGeneration += 1;
    this.frameId = 0;
    this.decoding = false;
    this.geometry = null;
    this.slowDecodes = 0;
    const task = this.startInternal(generation);
    this.starting = task;
    try {
      await task;
    } finally {
      if (this.starting === task) this.starting = null;
    }
  }

  /** Abandon a getUserMedia call that is stuck on a permission prompt. */
  abortStart() {
    this.starting = null;
    this.stop();
  }

  async startInternal(generation) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const error = new Error('getUserMedia tidak didukung');
      error.name = 'NotSupportedError';
      throw error;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
      });
    } catch (error) {
      if (['OverconstrainedError', 'NotFoundError', 'TypeError'].includes(error.name)) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: this.facingMode } },
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }
      } else {
        throw error;
      }
    }

    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      const error = new Error('Kamera dibatalkan');
      error.name = 'AbortError';
      throw error;
    }

    this.stream = stream;
    this.track = stream.getVideoTracks()[0] || null;
    if (this.track) {
      this.track.addEventListener('ended', () => {
        if (!this.running) return;
        this.stop();
        this.onEnded?.();
      });
    }

    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.setAttribute('playsinline', '');
    await this.video.play();

    if (generation !== this.generation) {
      this.stop();
      const error = new Error('Kamera dibatalkan');
      error.name = 'AbortError';
      throw error;
    }

    this.running = true;
    this.paused = false;
    this.frameId = 0;
    this.decoding = false;
    this.configureTorch();
    this.requestWakeLock();
    if (!this.worker && !this.workerFailed) this.createWorker();
    this.tick();
  }

  configureTorch() {
    let supported = false;
    try {
      const capabilities = this.track && this.track.getCapabilities ? this.track.getCapabilities() : null;
      supported = Boolean(capabilities && capabilities.torch);
    } catch {
      supported = false;
    }
    this.torchSupported = supported;
    this.onTorchChange?.(supported, false);
  }

  async toggleTorch() {
    if (!this.track || !this.torchSupported) return false;
    const next = !this.torchOn;
    try {
      await this.track.applyConstraints({ advanced: [{ torch: next }] });
      this.torchOn = next;
      this.onTorchChange?.(true, next);
      return next;
    } catch (error) {
      this.torchSupported = false;
      this.torchOn = false;
      this.onTorchChange?.(false, false);
      throw error;
    }
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    clearTimeout(this.timer);
    this.timer = 0;
    if (this.torchOn && this.track) {
      this.track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      this.torchOn = false;
      this.onTorchChange?.(this.torchSupported, false);
    }
    try {
      this.video.pause();
    } catch {
      /* ignore */
    }
    this.releaseWakeLock();
  }

  async resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    try {
      await this.video.play();
    } catch {
      /* the loop will keep waiting for a playable video */
    }
    this.requestWakeLock();
    this.tick();
  }

  stop() {
    this.generation += 1;
    this.starting = null;
    this.running = false;
    this.paused = false;
    this.workerGeneration += 1;
    this.decoding = false;
    clearTimeout(this.timer);
    this.timer = 0;
    try {
      this.video.pause();
    } catch {
      /* ignore */
    }
    this.video.srcObject = null;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
    }
    this.stream = null;
    this.track = null;
    this.torchOn = false;
    this.torchSupported = false;
    this.onTorchChange?.(false, false);
    this.releaseWakeLock();
  }

  /** Restart preview on the other camera while keeping the scan state. */
  async switchCamera() {
    const wasRunning = this.running;
    const wasPaused = this.paused;
    this.stop();
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    if (wasRunning) {
      await this.start();
      if (wasPaused) this.pause();
    }
    return this.facingMode;
  }

  tick() {
    if (!this.running || this.paused) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.running || this.paused) return;
      if (!document.hidden && this.video.readyState >= 2 && this.video.videoWidth) {
        try {
          this.scanFrame();
        } catch (error) {
          console.warn('[scanner] frame error:', error);
        }
      }
      this.tick();
    }, DECODE_INTERVAL_MS);
  }

  scanFrame() {
    if (this.worker && !this.workerFailed && this.decoding) return;
    const now = performance.now();
    if (!this.geometry || now - this.geometryAt > 1000) {
      const stageRect = this.stage.getBoundingClientRect();
      const frameRect = this.frame.getBoundingClientRect();
      if (!stageRect.width || !frameRect.width) return;
      this.geometry = {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        frame: {
          x: frameRect.left - stageRect.left,
          y: frameRect.top - stageRect.top,
          width: frameRect.width,
          height: frameRect.height,
        },
      };
      this.geometryAt = now;
    }

    const roi = computeSourceRoi({
      videoWidth: this.video.videoWidth,
      videoHeight: this.video.videoHeight,
      ...this.geometry,
    });
    if (!roi) return;

    const scale = Math.min(this.maxWidth / roi.sw, this.maxHeight / roi.sh, 3);
    const targetWidth = Math.max(1, Math.round(roi.sw * scale));
    const targetHeight = Math.max(1, Math.round(roi.sh * scale));
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }

    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = 'high';
    this.context.drawImage(
      this.video,
      roi.sx,
      roi.sy,
      roi.sw,
      roi.sh,
      0,
      0,
      targetWidth,
      targetHeight,
    );

    if (this.worker && !this.workerFailed) {
      const imageData = this.context.getImageData(0, 0, targetWidth, targetHeight);
      this.decoding = true;
      this.frameId += 1;
      this.worker.postMessage(
        {
          buffer: imageData.data.buffer,
          width: targetWidth,
          height: targetHeight,
          id: this.frameId,
          generation: this.workerGeneration,
        },
        [imageData.data.buffer],
      );
      return;
    }

    if (!this.decodeSync) this.decodeSync = createDecoder(window.ZXing);
    const text = this.decodeSync(this.canvas);
    if (text) this.onDetect?.(text);
  }

  async requestWakeLock() {
    if (!('wakeLock' in navigator) || this.wakeLock) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch {
      this.wakeLock = null;
    }
  }

  releaseWakeLock() {
    try {
      this.wakeLock?.release();
    } catch {
      /* ignore */
    }
    this.wakeLock = null;
  }
}

/** Decode a barcode from a picked/gallery image using the vendored ZXing. */
export async function decodeImageFile(file) {
  if (!file) return null;
  const bitmap = typeof createImageBitmap === 'function'
    ? await createImageBitmap(file)
    : await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = URL.createObjectURL(file);
      });
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  const decoder = createDecoder(window.ZXing);
  return decoder(canvas);
}
