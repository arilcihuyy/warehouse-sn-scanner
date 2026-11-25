/**
 * Warehouse SN Scanner — pure helpers.
 * No DOM state here: parsing, normalisation, ROI mapping and ZXing decoding.
 */

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;
const CSV_HEADER =
  /^(sn|s\/n|serial|serial\s*(number|no\.?)|serialnumber|no\.?\s*sn|nomor\s*sn|kode\s*sn|sn\s*perangkat)$/i;

/** Matching key: trim, uppercase, drop whitespace and invisible characters. */
export function normalizeSn(value) {
  return String(value ?? '')
    .replace(ZERO_WIDTH, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function cleanToken(value) {
  return String(value ?? '')
    .replace(ZERO_WIDTH, '')
    .trim()
    .replace(/^["'`]+/, '')
    .replace(/["'`]+$/, '')
    .trim();
}

function pushUnique(state, raw) {
  const display = cleanToken(raw);
  if (!display) return;
  const key = normalizeSn(display);
  if (!key) return;
  if (state.seen.has(key)) {
    state.duplicates += 1;
    return;
  }
  state.seen.add(key);
  state.items.push(display.toUpperCase());
}

/**
 * Paste-friendly parser: newline, comma, semicolon, tab or whitespace separated.
 * Returns unique, uppercase SN strings plus a duplicate count.
 */
export function parseSnText(text) {
  const state = { seen: new Set(), items: [], duplicates: 0 };
  const tokens = String(text ?? '').split(/[\s,;]+/);
  for (const token of tokens) pushUnique(state, token);
  return { items: state.items, duplicates: state.duplicates };
}

function detectDelimiter(line) {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') quoted = !quoted;
      else if (ch === candidate && !quoted) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function splitDelimited(line, delimiter) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

/**
 * CSV parser with header detection (SN / Serial / Serial Number).
 * Falls back to the first non-empty cell when no header is found.
 */
export function parseCsv(text) {
  const lines = String(text ?? '')
    .replace(ZERO_WIDTH, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  if (!lines.length) return { items: [], duplicates: 0 };

  const delimiter = detectDelimiter(lines[0]);
  const rows = lines.map((line) => splitDelimited(line, delimiter));
  const header = rows[0].map((cell) => cleanToken(cell).toLowerCase());
  let column = header.findIndex((cell) => CSV_HEADER.test(cell));
  let start = 0;
  if (column >= 0) start = 1;
  else column = 0;

  const state = { seen: new Set(), items: [], duplicates: 0 };
  const hasHeader = start === 1;
  for (let r = start; r < rows.length; r += 1) {
    const row = rows[r];
    const cell = hasHeader ? row[column] : row.find((value) => cleanToken(value)) ?? '';
    pushUnique(state, cell);
  }
  return { items: state.items, duplicates: state.duplicates };
}

/** Pick the right parser from the file name and a light CSV sniff. */
export function parseSnFile(text, filename = '') {
  const firstLine = String(text ?? '').split(/\r?\n/, 1)[0] ?? '';
  const looksLikeCsv =
    /[,;\t]/.test(firstLine) &&
    /(^|[,;\t])\s*"?(sn|serial|serial\s*number|serialnumber)\b/i.test(firstLine);
  if (/\.csv$/i.test(filename) || looksLikeCsv) return parseCsv(text);
  return parseSnText(text);
}

/**
 * Map the on-screen scan frame to a source rectangle in the video frame.
 * The video is displayed with object-fit: cover, so the mapping has to undo
 * the cover scale and the centring offsets before cropping.
 */
export function computeSourceRoi({ videoWidth, videoHeight, stageWidth, stageHeight, frame }) {
  if (!videoWidth || !videoHeight || !stageWidth || !stageHeight || !frame) return null;
  if (frame.width <= 0 || frame.height <= 0) return null;

  const scale = Math.max(stageWidth / videoWidth, stageHeight / videoHeight);
  const displayedWidth = videoWidth * scale;
  const displayedHeight = videoHeight * scale;
  const offsetX = (stageWidth - displayedWidth) / 2;
  const offsetY = (stageHeight - displayedHeight) / 2;

  const x0 = Math.max(0, Math.min(videoWidth, (frame.x - offsetX) / scale));
  const y0 = Math.max(0, Math.min(videoHeight, (frame.y - offsetY) / scale));
  const x1 = Math.max(0, Math.min(videoWidth, (frame.x + frame.width - offsetX) / scale));
  const y1 = Math.max(0, Math.min(videoHeight, (frame.y + frame.height - offsetY) / scale));

  const sw = x1 - x0;
  const sh = y1 - y0;
  if (sw < 8 || sh < 4) return null;
  return { sx: x0, sy: y0, sw, sh };
}

/**
 * Build a decoder bound to a ZXing namespace (window.ZXing).
 * Returns text or null. Decoding is synchronous so frames cannot overlap.
 */
export function createDecoder(ZXing) {
  if (!ZXing) throw new Error('ZXing tidak termuat');
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.CODE_128,
    ZXing.BarcodeFormat.CODE_39,
    ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.QR_CODE,
    ZXing.BarcodeFormat.DATA_MATRIX,
  ]);
  // No TRY_HARDER: the crop is close and clean; the harder pass is expensive
  // and is the main cause of jank on low-end phones.

  const reader = new ZXing.MultiFormatReader();
  reader.setHints(hints);
  let warned = false;
  let luminanceBuffer = new Uint8ClampedArray(0);

  return function decodeCanvas(canvas) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const size = width * height;
    if (luminanceBuffer.length !== size) luminanceBuffer = new Uint8ClampedArray(size);
    const luminances = luminanceBuffer;
    for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
      luminances[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    }

    try {
      const source = new ZXing.RGBLuminanceSource(luminances, width, height);
      const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
      const result = reader.decode(bitmap);
      return result ? result.getText() : null;
    } catch (error) {
      // NotFoundException is the normal "no barcode in the strip" result.
      if (!warned && error && error.name && !/NotFound/.test(error.name)) {
        warned = true;
        console.warn('[scanner] decode error:', error);
      }
      return null;
    }
  };
}

export function formatShortDate(iso, locale = 'id-ID') {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
  })
    .format(date)
    .replace(/\./g, '')
    .toUpperCase();
}

export function formatTime(iso, locale = 'id-ID') {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDateTime(iso, locale = 'id-ID') {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
