/**
 * Minimal XLSX reader for importing a serial-number column.
 * Uses the browser's DecompressionStream; no external dependency.
 * Only the first worksheet and shared strings are needed for import.
 */

function findSignature(bytes, signature, fromEnd = false) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (fromEnd) {
    for (let i = bytes.length - 22; i >= 0; i -= 1) {
      if (view.getUint32(i, true) === signature) return i;
    }
  } else {
    for (let i = 0; i < bytes.length - 4; i += 1) {
      if (view.getUint32(i, true) === signature) return i;
    }
  }
  return -1;
}

async function inflate(bytes, method) {
  if (method === 0) return bytes;
  if (method !== 8) throw new Error('Kompresi XLSX tidak didukung');
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser tidak mendukung pembacaan XLSX. Gunakan CSV atau TXT.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findSignature(bytes, 0x06054b50, true);
  if (eocd < 0) throw new Error('File XLSX tidak valid');
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = {};

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (view.getUint32(localOffset, true) === 0x04034b50) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const source = bytes.subarray(start, start + compressedSize);
      entries[name] = await inflate(source, method);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function cellText(cell, shared) {
  if (!cell) return '';
  const type = cell.getAttribute('t');
  if (type === 'inlineStr') {
    return [...cell.getElementsByTagName('t')].map((node) => node.textContent).join('');
  }
  const valueNode = cell.getElementsByTagName('v')[0];
  const value = valueNode?.textContent ?? '';
  if (type === 's') return shared[Number(value)] ?? '';
  return value;
}

/** Returns rows of strings from the first worksheet. */
export async function readXlsxRows(file) {
  const entries = await unzip(new Uint8Array(await file.arrayBuffer()));
  const shared = [];
  if (entries['xl/sharedStrings.xml']) {
    const doc = new DOMParser().parseFromString(
      new TextDecoder().decode(entries['xl/sharedStrings.xml']),
      'application/xml',
    );
    for (const item of doc.getElementsByTagName('si')) {
      shared.push([...item.getElementsByTagName('t')].map((node) => node.textContent).join(''));
    }
  }
  const sheetName =
    Object.keys(entries).find((name) => /^xl\/worksheets\/sheet1\.xml$/.test(name))
    || Object.keys(entries).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetName) throw new Error('Sheet tidak ditemukan dalam file XLSX');
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(entries[sheetName]), 'application/xml');
  const rows = [];
  for (const row of doc.getElementsByTagName('row')) {
    const cells = [];
    for (const cell of row.getElementsByTagName('c')) cells.push(cellText(cell, shared));
    rows.push(cells);
  }
  return rows;
}
