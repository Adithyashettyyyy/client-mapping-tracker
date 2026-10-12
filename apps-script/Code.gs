/**
 * Mapping Desk ↔ Google Sheet link.
 *
 * Paste this into the sheet: Extensions → Apps Script → Code.gs. The Mapping Desk
 * server calls it to read the sheet and to write dashboard edits into it, and it
 * tells the server when someone edits the sheet. Setup steps are in the README
 * ("Google Sheet sync").
 *
 * Script properties (Project Settings → Script properties):
 *   SYNC_SECRET  the same value as SHEET_SYNC_SECRET on the server
 *   SERVER_URL   the dashboard address, e.g. https://client-mapping-tracker.onrender.com
 */

/** Server → sheet: { secret, tab, action: "read" | "apply", ops }. */
function doPost(e) {
  var request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ error: 'Bad request.' });
  }
  var secret = PropertiesService.getScriptProperties().getProperty('SYNC_SECRET');
  if (!secret || request.secret !== secret) return reply({ error: 'Wrong or missing secret. Check SYNC_SECRET in the script properties.' });

  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = request.tab
      ? ss.getSheetByName(request.tab)
      : ss.getSheets().filter(function (tab) { return tab.getName() !== OWNERS_TAB; })[0];
    if (!sheet) return reply({ error: 'The sheet has no tab named "' + request.tab + '".' });
    if (request.action === 'read') return reply(readSheet(ss, sheet));
    if (request.action === 'apply') {
      applyOps(ss, sheet, request.ops || []);
      SpreadsheetApp.flush();
      return reply({ ok: true });
    }
    return reply({ error: 'Unknown action.' });
  } catch (err) {
    return reply({ error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

/** Opening the web app URL in a browser just confirms it is deployed. */
function doGet() {
  return ContentService.createTextOutput('Mapping Desk sheet link is running.');
}

var OWNERS_TAB = 'Owners';

/** All values in the clients tab and the Owners tab. Dates are sent as YYYY-MM-DD in the sheet's time zone. */
function readSheet(ss, sheet) {
  var tz = ss.getSpreadsheetTimeZone();
  var range = sheet.getDataRange();
  var values = range.getValues().map(function (row) {
    return row.map(function (value) {
      return value instanceof Date ? Utilities.formatDate(value, tz, 'yyyy-MM-dd') : value;
    });
  });
  var ownersSheet = ss.getSheetByName(OWNERS_TAB);
  return {
    url: ss.getUrl() + '#gid=' + sheet.getSheetId(),
    title: sheet.getName(),
    rowCount: sheet.getMaxRows(),
    values: values,
    formulas: range.getFormulas(),
    owners: ownersSheet ? ownersSheet.getDataRange().getValues() : null,
  };
}

/** The Owners tab, created with its header the first time it's needed. */
function ownersTab(ss) {
  var tab = ss.getSheetByName(OWNERS_TAB);
  if (!tab) {
    tab = ss.insertSheet(OWNERS_TAB, ss.getNumSheets());
    tab.getRange(1, 1).setValue('Owner').setFontWeight('bold');
    tab.setFrozenRows(1);
  }
  return tab;
}

/** Applies the server's edits in order. Rows and columns are 1-based; op.sheet "owners" targets the Owners tab. */
function applyOps(ss, clientsSheet, ops) {
  var tz = ss.getSpreadsheetTimeZone();
  var width = clientsSheet.getMaxColumns();
  ops.forEach(function (op) {
    var sheet = op.sheet === 'owners' ? ownersTab(ss) : clientsSheet;
    if (op.op === 'set') {
      var row = op.values.map(function (value) {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? Utilities.parseDate(value, tz, 'yyyy-MM-dd') : value;
      });
      sheet.getRange(op.row, op.column, 1, row.length).setValues([row]);
    } else if (op.op === 'formulas') {
      sheet.getRange(op.row, op.column, op.formulas.length, 1).setFormulas(op.formulas.map(function (formula) { return [formula]; }));
    } else if (op.op === 'addRows') {
      sheet.insertRowsAfter(sheet.getMaxRows(), op.count);
    } else if (op.op === 'copyFormat') {
      sheet.getRange(op.fromRow, 1, 1, width)
        .copyTo(sheet.getRange(op.toRow, 1, op.numRows, width), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    } else if (op.op === 'copyFormula') {
      // Use the nearest formula above (e.g. Mapping Status) so new rows get it too.
      if (op.fromRow < 2) return;
      var formulas = sheet.getRange(2, op.column, op.fromRow - 1, 1).getFormulasR1C1();
      for (var r = formulas.length - 1; r >= 0; r--) {
        if (formulas[r][0]) {
          sheet.getRange(op.toRow, op.column, op.numRows, 1).setFormulaR1C1(formulas[r][0]);
          break;
        }
      }
    } else if (op.op === 'deleteRows') {
      op.rows.forEach(function (rowNumber) { sheet.deleteRow(rowNumber); });
    } else {
      throw new Error('Unknown edit "' + op.op + '".');
    }
  });
}

/** Run once from the editor (select it, click Run): lets edits in the sheet reach the dashboard right away. */
function setUpTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'notifyServer') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('notifyServer').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onChange().create();
}

/** Sheet → server: asks the dashboard to sync now. */
function notifyServer() {
  var props = PropertiesService.getScriptProperties();
  var server = props.getProperty('SERVER_URL');
  if (!server) return;
  UrlFetchApp.fetch(server.replace(/\/+$/, '') + '/api/sheet/sync', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ secret: props.getProperty('SYNC_SECRET') }),
    muteHttpExceptions: true,
  });
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
