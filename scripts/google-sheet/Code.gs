/**
 * KYFR onboarding leads: receives one lead from the web app and writes it to the "Leads" tab.
 *
 * Setup (once): open the spreadsheet, Extensions > Apps Script, paste this file, then
 * Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 * Copy the web app URL into VITE_LEADS_WEBHOOK_URL (see README).
 *
 * @OnlyCurrentDoc  (limits the permission Google asks for to this one spreadsheet)
 */

const SHEET_NAME = 'Leads';
const FIRST_DATA_ROW = 3; // row 1 = group band, row 2 = column headers
const MAX_SEARCH_ROWS = 5000; // how far back to look for a repeat of the same session

// Same order as the sheet's columns and src/data/lead-columns.json (a test keeps them in step).
const COLUMNS = [
  'submittedAt', 'phone', 'email', 'age',
  'dependents', 'income', 'spending', 'incomeRank',
  'savings', 'sip', 'retirementCorpus', 'runwayMonths',
  'emi', 'creditScore', 'emiPct', 'cardBalance',
  'cardLimit', 'cardUtilPct', 'creditBand', 'lifeCover',
  'healthCover', 'readiness', 'sevSavings', 'sevCredit',
  'sevInsurance', 'sevInvesting', 'priority1', 'priority2',
  'priority3', 'device', 'utmSource', 'utmMedium',
  'utmCampaign', 'referrer', 'sessionId', 'followUp',
  'notes'
];
const TEAM_COLUMNS = ['followUp', 'notes'];
// Display format per column, applied on every write so rows look right whatever the sheet inherited.
const FORMATS = {
  submittedAt: "dd mmm yyyy, hh:mm",
  phone: "@",
  email: "@",
  age: "0",
  dependents: "0",
  income: "[>=10000000]\"₹\"##\\,##\\,##\\,##0;[>=100000]\"₹\"##\\,##\\,##0;\"₹\"##,##0",
  spending: "[>=10000000]\"₹\"##\\,##\\,##\\,##0;[>=100000]\"₹\"##\\,##\\,##0;\"₹\"##,##0",
  incomeRank: "\"Top \"0.0\"%\"",
  savings: "[>=10000000]\"₹\"##\\,##\\,##\\,##0;[>=100000]\"₹\"##\\,##\\,##0;\"₹\"##,##0",
  sip: "[>=10000000]\"₹\"##\\,##\\,##\\,##0;[>=100000]\"₹\"##\\,##\\,##0;\"₹\"##,##0",
  retirementCorpus: "[>=10000000]\"₹\"##\\,##\\,##\\,##0;[>=100000]\"₹\"##\\,##\\,##0;\"₹\"##,##0",
  runwayMonths: "0.0\" mo\"",
  emi: "[>=10000000]\"₹\"##\\,##\\,##\\,##0;[>=100000]\"₹\"##\\,##\\,##0;\"₹\"##,##0",
  creditScore: "0",
  emiPct: "0\"%\"",
  cardBalance: "[>=10000000]\"₹\"##\\,##\\,##\\,##0;[>=100000]\"₹\"##\\,##\\,##0;\"₹\"##,##0",
  cardLimit: "[>=10000000]\"₹\"##\\,##\\,##\\,##0;[>=100000]\"₹\"##\\,##\\,##0;\"₹\"##,##0",
  cardUtilPct: "0\"%\"",
  creditBand: "@",
  lifeCover: "[>=10000000]\"₹\"##\\,##\\,##\\,##0;[>=100000]\"₹\"##\\,##\\,##0;\"₹\"##,##0",
  healthCover: "[>=10000000]\"₹\"##\\,##\\,##\\,##0;[>=100000]\"₹\"##\\,##\\,##0;\"₹\"##,##0",
  readiness: "0",
  sevSavings: "@",
  sevCredit: "@",
  sevInsurance: "@",
  sevInvesting: "@",
  priority1: "@",
  priority2: "@",
  priority3: "@",
  device: "@",
  utmSource: "@",
  utmMedium: "@",
  utmCampaign: "@",
  referrer: "@",
  sessionId: "@",
  followUp: "@",
  notes: "@"
};
const NUMERIC = [
  'age', 'dependents', 'income', 'spending',
  'incomeRank', 'savings', 'sip', 'retirementCorpus',
  'runwayMonths', 'emi', 'creditScore', 'emiPct',
  'cardBalance', 'cardLimit', 'cardUtilPct', 'lifeCover',
  'healthCover', 'readiness'
];

// Horizontal alignment per column, applied with the formats on every new row.
const ALIGN = {
  submittedAt: 'left',
  phone: 'left',
  email: 'left',
  age: 'center',
  dependents: 'center',
  income: 'right',
  spending: 'right',
  incomeRank: 'center',
  savings: 'right',
  sip: 'right',
  retirementCorpus: 'right',
  runwayMonths: 'center',
  emi: 'right',
  creditScore: 'center',
  emiPct: 'center',
  cardBalance: 'right',
  cardLimit: 'right',
  cardUtilPct: 'center',
  creditBand: 'center',
  lifeCover: 'right',
  healthCover: 'right',
  readiness: 'center',
  sevSavings: 'center',
  sevCredit: 'center',
  sevInsurance: 'center',
  sevInvesting: 'center',
  priority1: 'left',
  priority2: 'left',
  priority3: 'left',
  device: 'left',
  utmSource: 'left',
  utmMedium: 'left',
  utmCampaign: 'left',
  referrer: 'left',
  sessionId: 'left',
  followUp: 'center',
  notes: 'left'
};

function doGet() {
  return json_({ ok: true, service: 'kyfr-leads' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const lead = JSON.parse(e.postData.contents);
    const problem = validate_(lead);
    if (problem) return json_({ ok: false, error: problem });
    save_(lead);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'server' });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function validate_(lead) {
  if (!lead || typeof lead !== 'object') return 'bad payload';
  if (!/^\+91[6-9]\d{9}$/.test(String(lead.phone || ''))) return 'bad phone';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(lead.email || ''))) return 'bad email';
  return null;
}

function save_(lead) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Missing tab: ' + SHEET_NAME);

  const payloadKeys = COLUMNS.filter(function (k) { return k !== 'submittedAt' && TEAM_COLUMNS.indexOf(k) < 0; });
  const values = payloadKeys.map(function (k) { return clean_(k, lead[k]); });
  const firstPayloadCol = COLUMNS.indexOf(payloadKeys[0]) + 1;

  // The same session sent twice (a retry after a bad connection) updates its row instead of adding one.
  let row = findSessionRow_(sheet, String(lead.sessionId || ''));
  if (!row) {
    row = Math.max(sheet.getLastRow() + 1, FIRST_DATA_ROW);
    const whole = sheet.getRange(row, 1, 1, COLUMNS.length);
    whole.setNumberFormats([COLUMNS.map(function (k) { return FORMATS[k]; })]);
    whole.setHorizontalAlignments([COLUMNS.map(function (k) { return ALIGN[k]; })]);
    whole.setVerticalAlignment('middle').setFontFamily('Roboto').setFontSize(10).setFontColor('#241B33');
    sheet.getRange(row, COLUMNS.indexOf('sessionId') + 1).setFontColor('#7A7388');
    sheet.getRange(row, 1).setValue(new Date());
    sheet.getRange(row, COLUMNS.indexOf('followUp') + 1).setValue('New');
  }
  sheet.getRange(row, firstPayloadCol, 1, values.length).setValues([values]);
}

function findSessionRow_(sheet, sessionId) {
  if (!sessionId) return 0;
  const last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return 0;
  const col = COLUMNS.indexOf('sessionId') + 1;
  const start = Math.max(FIRST_DATA_ROW, last - MAX_SEARCH_ROWS + 1);
  const seen = sheet.getRange(start, col, last - start + 1, 1).getValues();
  for (let i = seen.length - 1; i >= 0; i--) if (String(seen[i][0]) === sessionId) return start + i;
  return 0;
}

function clean_(key, value) {
  if (value === undefined || value === null || value === '') return '';
  if (NUMERIC.indexOf(key) >= 0) {
    const n = Number(value);
    return isFinite(n) ? n : '';
  }
  let text = String(value).slice(0, 200);
  // Stop anything a visitor types from being read as a formula. The phone column is plain text, so a leading + is safe there.
  if (key !== 'phone' && /^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
