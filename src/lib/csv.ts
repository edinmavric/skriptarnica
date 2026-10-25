/**
 * Minimal RFC 4180 CSV (SPEC §4.10 import and reports). Handles quoted fields, escaped quotes,
 * CRLF/LF, a UTF-8 BOM, and `;` or `,` delimiters (Serbian Excel exports use `;`).
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  // Count delimiters in the header outside quoted sections.
  const header = (text.split(/\r?\n/, 1)[0] ?? '').replace(/"(?:[^"]|"")*"/g, '');
  const delimiter =
    (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field === '') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

/** Rows as objects keyed by the (trimmed, lowercased) header row. */
export function parseCsvRecords(input: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(input);
  if (!header) return [];
  const keys = header.map((key) => key.trim().toLowerCase());
  return rows.map((cells) =>
    Object.fromEntries(keys.map((key, index) => [key, (cells[index] ?? '').trim()])),
  );
}

/**
 * Serializes for spreadsheets. Cells starting with = + - @ (or tab/CR) are prefixed with ' so
 * Excel doesn't evaluate them (CSV formula injection), except plain negative numbers.
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text) && !/^-\d+(\.\d+)?$/.test(text)) text = `'${text}`;
    return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}
