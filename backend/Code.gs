/**
 * health log backend — Google Apps Script web app.
 *
 * paste this whole file into a new Apps Script project at script.google.com,
 * then Deploy -> New deployment -> Web app:
 *   - execute as: Me
 *   - who has access: Anyone
 * copy the web app URL (https://script.google.com/macros/s/.../exec) and
 * paste it into the health log app on first run. the URL is the write key
 * for the sheet — don't share it, and never put it in the repo.
 *
 * also set the script timezone to America/Chicago (project settings, gear
 * icon) so "today" and the datetimes match the sheet.
 *
 * API:
 *   GET  -> {status:"ok", app:"health log", time} (health check)
 *   POST {action:"append", tab:"Mood Log", values:[[ ... ]]}
 *        -> {row: N, tab} — appends one row, returns the row it landed on
 *   POST {action:"today", tab:"Mood Log"}
 *        -> {tab, rows:[{row, values}]} — today's rows, for the history list
 */

var SHEET_ID = "1N-7mGhUGKBb5OjkgBHWlhDWnDROJdwAMzYCSbVOqAC8";

var TABS = ["Mood Log", "Pain Log", "Food Log", "Vitals", "Sleep Log", "Period Log"];

function doGet() {
  return jsonOut({ status: "ok", app: "health log", time: new Date().toISOString() });
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.action === "append") return jsonOut(append_(req));
    if (req.action === "today") return jsonOut(today_(req));
    return jsonOut({ error: "unknown action: " + req.action });
  } catch (err) {
    return jsonOut({ error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet_(tab) {
  if (TABS.indexOf(tab) === -1) throw new Error("unknown tab: " + tab);
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tab);
  if (!sh) throw new Error("tab not found: " + tab);
  return sh;
}

// Last row with anything in column A. We CANNOT use appendRow() or
// getLastRow() here: helper/formula columns (Mood Log I-M, Pain Log K-L) are
// prefilled hundreds of rows down, so the sheet's "last row" is way past the
// real data. Column A only ever holds real entries, so it is the anchor.
function lastDataRow_(sh) {
  var vals = sh.getRange(1, 1, sh.getMaxRows(), 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    var v = vals[i][0];
    if (v !== "" && v !== null && v !== undefined) return i + 1;
  }
  return 0;
}

// Turn an ISO-ish datetime string into a real Date so the sheet stores a
// datetime value (the Mood Log date formula needs a real date, not text).
// Date-only strings ("2026-11-11") are built from parts so they land on
// local midnight — new Date("2026-11-11") would parse as UTC midnight and
// show up as the previous evening in Chicago time.
function toDate_(v) {
  if (typeof v !== "string" || v === "") return v;
  var m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var d = new Date(v);
  return isNaN(d.getTime()) ? v : d;
}

function append_(req) {
  var sh = sheet_(req.tab);
  var rows = req.values || [];
  if (!rows.length || !rows[0].length) throw new Error("no values");
  var row = lastDataRow_(sh) + 1;
  var values = rows[0].slice();
  values[0] = toDate_(values[0]);
  if (req.tab === "Period Log") {
    // D (cycle day) + F (cycle start?) hold prefilled formulas — write
    // around them. frontend sends [date, flow, symptoms, notes].
    sh.getRange(row, 1, 1, 3).setValues([[values[0], values[1] || "", values[2] || ""]]);
    sh.getRange(row, 5, 1, 1).setValues([[values[3] || ""]]);
    return { row: row, tab: req.tab };
  }
  sh.getRange(row, 1, 1, values.length).setValues([values]);
  if (req.tab === "Mood Log") {
    // score + date formulas for the row the entry actually landed on.
    // meds-only rows have a blank mood, so the score formula evaluates
    // empty — that's fine and normal.
    sh.getRange(row, 9, 1, 2).setFormulas([[
      '=IF(B' + row + '="","",MATCH(B' + row + ',Lists!$E$3:$E$7,0)-1)',
      '=IF(A' + row + '="","",INT(A' + row + '))'
    ]]);
  }
  return { row: row, tab: req.tab };
}

function today_(req) {
  var sh = sheet_(req.tab);
  var tz = Session.getScriptTimeZone();
  var todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var last = lastDataRow_(sh);
  if (last < 2) return { tab: req.tab, rows: [] };
  var data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var d = data[i][0];
    var day = null;
    if (d instanceof Date) {
      day = Utilities.formatDate(d, tz, "yyyy-MM-dd");
    } else if (typeof d === "string" && d !== "") {
      // tolerate older text dates: compare the parsed date part
      var parsed = new Date(d);
      if (!isNaN(parsed.getTime())) day = Utilities.formatDate(parsed, tz, "yyyy-MM-dd");
    }
    if (day !== todayStr) continue;
    rows.push({ row: i + 2, values: data[i] });
  }
  return { tab: req.tab, rows: rows };
}
