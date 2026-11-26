/**
 * Minimal XLSX writer: spreadsheets are a ZIP of XML parts.
 * Entries are stored (method 0), so no compression library is needed.
 */

const encoder = new TextEncoder();
const DOS_TIME = 0;
const DOS_DATE = 0x21; // 1980-01-01

let crcTable = null;

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

export function crc32(bytes) {
  if (!crcTable) crcTable = makeCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Build a ZIP archive with every entry stored uncompressed. */
export function zipStore(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data;
    const checksum = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, DOS_TIME, true);
    localView.setUint16(12, DOS_DATE, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);

    chunks.push(local, data);

    const header = new Uint8Array(46 + name.length);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x02014b50, true);
    headerView.setUint16(4, 20, true);
    headerView.setUint16(6, 20, true);
    headerView.setUint16(8, 0x0800, true);
    headerView.setUint16(10, 0, true);
    headerView.setUint16(12, DOS_TIME, true);
    headerView.setUint16(14, DOS_DATE, true);
    headerView.setUint32(16, checksum, true);
    headerView.setUint32(20, data.length, true);
    headerView.setUint32(24, data.length, true);
    headerView.setUint16(28, name.length, true);
    headerView.setUint16(30, 0, true);
    headerView.setUint16(32, 0, true);
    headerView.setUint16(34, 0, true);
    headerView.setUint16(36, 0, true);
    headerView.setUint32(38, 0, true);
    headerView.setUint32(42, offset, true);
    header.set(name, 46);
    central.push(header);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return concatBytes([...chunks, ...central, end]);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colName(index) {
  let name = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sanitizeSheetName(value) {
  const clean = String(value || 'Sheet1')
    .replace(/[\\/?*[\]:]/g, '')
    .trim()
    .slice(0, 31);
  return clean || 'Sheet1';
}

function cellXml(ref, value, styleId) {
  const style = styleId ? ` s="${styleId}"` : '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  }
  const raw = String(value ?? '').slice(0, 32767);
  const text = escapeXml(raw);
  const preserve = /^\s|\s$/.test(raw) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}"${style} t="inlineStr"><is><t${preserve}>${text}</t></is></c>`;
}

function rowXml(rowNumber, values, isHeader, colCount) {
  const cells = [];
  for (let i = 0; i < colCount; i += 1) {
    cells.push(cellXml(`${colName(i + 1)}${rowNumber}`, values[i], isHeader ? 1 : 0));
  }
  return `<row r="${rowNumber}">${cells.join('')}</row>`;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function sheetXml(name, headers, rows, widths, colCount) {
  const lastRow = rows.length + 1;
  const dimension = `A1:${colName(colCount)}${lastRow}`;
  const columns =
    widths && widths.length
      ? `<cols>${widths
          .map(
            (width, index) =>
              `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
          )
          .join('')}</cols>`
      : '';
  const body = [rowXml(1, headers, true, colCount)];
  rows.forEach((row, index) => body.push(rowXml(index + 2, row, false, colCount)));

  return (
    `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="${dimension}"/>` +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    columns +
    `<sheetData>${body.join('')}</sheetData>` +
    `<autoFilter ref="${dimension}"/>` +
    `</worksheet>`
  );
}

const STYLES =
  `${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  '<fonts count="2">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function uniqueSheetNames(names) {
  const used = new Set();
  return names.map((raw, index) => {
    const base = sanitizeSheetName(raw || `Sheet${index + 1}`);
    let name = base;
    let suffix = 2;
    while (used.has(name.toLowerCase())) {
      const tail = ` ${suffix}`;
      name = `${base.slice(0, 31 - tail.length)}${tail}`;
      suffix += 1;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

export function buildWorkbook({ sheets = [] } = {}) {
  const list = sheets.length ? sheets : [{ name: 'Sheet1', headers: [], rows: [] }];
  const names = uniqueSheetNames(list.map((sheet, index) => sheet.name || `Sheet${index + 1}`));

  const sheetParts = list.map((sheet, index) => {
    const headers = sheet.headers || [];
    const rows = sheet.rows || [];
    const widths = sheet.widths || [];
    let colCount = headers.length;
    for (const row of rows) colCount = Math.max(colCount, row.length);
    colCount = Math.max(1, colCount);
    return {
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: encoder.encode(sheetXml(names[index], headers, rows, widths, colCount)),
    };
  });

  const overrides = names
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');
  const workbookSheets = names
    .map(
      (name, index) =>
        `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');
  const workbookRels = names
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('');
  const stylesRel =
    `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;

  const parts = [
    {
      name: '[Content_Types].xml',
      data: encoder.encode(
        `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          overrides +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          '</Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: encoder.encode(
        `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: encoder.encode(
        `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets>${workbookSheets}</sheets>` +
          '</workbook>',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encoder.encode(
        `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          workbookRels +
          stylesRel +
          '</Relationships>',
      ),
    },
    ...sheetParts,
    { name: 'xl/styles.xml', data: encoder.encode(STYLES) },
  ];

  return zipStore(parts);
}

export function buildXlsx({ sheetName = 'Sheet1', headers = [], rows = [], widths = [] } = {}) {
  return buildWorkbook({ sheets: [{ name: sheetName, headers, rows, widths }] });
}
