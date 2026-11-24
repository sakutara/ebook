/**
 * Story-request dedupe for the Google Form response Sheet.
 *
 * Install:
 *   1. Open the response Sheet → Extensions → Apps Script.
 *   2. Replace the default code with this file and save.
 *   3. Triggers (clock icon) → Add trigger → function `onFormSubmit`,
 *      event source "From spreadsheet", event type "On form submit".
 *   4. Select `dedupeAll` in the function picker and Run it once to clean existing rows.
 *
 * Rows whose normalised title is empty or already seen above are deleted from the Sheet.
 * This does not delete responses kept in the Form's own Responses tab.
 *
 * Plain ES2019 for Apps Script V8: no import/export, no TypeScript.
 */

// Change to the exact question text of the title field in the Form.
var TITLE_HEADER = 'Tên truyện';

/** Same rules as src/domain/title.ts `normalize`. */
function normalizeTitle(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * @param {Array} titles title column values without the header row
 * @return {number[]} ascending 0-based indexes to delete (empty, or normalised title seen earlier)
 */
function duplicateRowIndexes(titles) {
  var seen = {};
  var out = [];
  for (var i = 0; i < titles.length; i++) {
    var key = normalizeTitle(titles[i]);
    if (key === '' || seen.hasOwnProperty(key)) {
      out.push(i);
    } else {
      seen[key] = true;
    }
  }
  return out;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {number} 1-based column whose row-1 header equals TITLE_HEADER; throws if missing
 */
function findTitleColumn(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var c = 0; c < headers.length; c++) {
    if (String(headers[c]).trim() === TITLE_HEADER.trim()) return c + 1;
  }
  throw new Error('Column "' + TITLE_HEADER + '" not found in row 1');
}

/**
 * Form-submit trigger. Deletes the newly submitted row (e.range.getRow()) when its title is
 * empty or already present in an earlier row.
 * Sheet: e.range.getSheet() when available, otherwise the first sheet of the active spreadsheet.
 */
function onFormSubmit(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var row = e.range.getRow();
    var sheet =
      typeof e.range.getSheet === 'function'
        ? e.range.getSheet()
        : SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var col = findTitleColumn(sheet);
    var count = row - 1;
    if (count < 1) return;
    var values = sheet.getRange(2, col, count, 1).getValues();
    var titles = [];
    for (var i = 0; i < values.length; i++) titles.push(values[i][0]);
    var dupes = duplicateRowIndexes(titles);
    if (dupes.length > 0 && dupes[dupes.length - 1] === count - 1) {
      sheet.deleteRow(row);
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Manual full pass over the first sheet of the active spreadsheet. Deletes duplicate rows
 * bottom-up so earlier row numbers stay valid.
 */
function dedupeAll() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var col = findTitleColumn(sheet);
    var values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
    var titles = [];
    for (var i = 0; i < values.length; i++) titles.push(values[i][0]);
    var dupes = duplicateRowIndexes(titles);
    for (var d = dupes.length - 1; d >= 0; d--) {
      sheet.deleteRow(dupes[d] + 2);
    }
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    normalizeTitle: normalizeTitle,
    duplicateRowIndexes: duplicateRowIndexes,
    findTitleColumn: findTitleColumn,
    onFormSubmit: onFormSubmit,
    dedupeAll: dedupeAll,
  };
}
