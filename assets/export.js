/** CSV/TSV builders — pure string output, no DOM. */

function text(value) {
  return value == null ? '' : String(value);
}

function quoteCsv(value, delimiter) {
  const raw = text(value);
  if (raw === '') return '';
  const needsQuotes =
    raw.includes(delimiter) ||
    raw.includes('"') ||
    /[\r\n]/.test(raw) ||
    /^\s|\s$/.test(raw);
  return needsQuotes ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function toCsv(headers, rows, delimiter = ';') {
  const lines = [headers.map((value) => quoteCsv(value, delimiter)).join(delimiter)];
  for (const row of rows) {
    lines.push(row.map((value) => quoteCsv(value, delimiter)).join(delimiter));
  }
  return lines.join('\n');
}

export function toTsv(headers, rows) {
  const clean = (value) => text(value).replace(/[\t\r\n]+/g, ' ');
  const lines = [headers.map(clean).join('\t')];
  for (const row of rows) lines.push(row.map(clean).join('\t'));
  return lines.join('\n');
}

export function stampForFilename(date = new Date()) {
  const pad = (number) => String(number).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}
