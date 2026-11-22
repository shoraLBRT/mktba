/**
 * CSV export of the statistics tables (N-08, #102), built in the browser from what the dashboard
 * already loaded: no endpoint of its own. RFC 4180 quoting with a comma, CRLF rows and a UTF-8 BOM,
 * so Excel reads the Cyrillic text; a text cell that a spreadsheet would run as a formula (search
 * queries are typed by readers) is prefixed with an apostrophe.
 */

export type CsvCell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

const cell = (value: CsvCell) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** The rows (the header first) as CSV text, without the BOM. */
export const toCsv = (rows: CsvCell[][]) => rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';

/** Hands the browser a CSV file to save. */
export const downloadCsv = (fileName: string, rows: CsvCell[][]) => {
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/** `analytics-<name>-<from>-<to>.csv`. */
export const csvFileName = (name: string, period: { from: string; to: string }) =>
  `analytics-${name}-${period.from}-${period.to}.csv`;
