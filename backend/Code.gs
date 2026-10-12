/**
 * Ranfurlie Safety - read & sign backend.
 *
 * Google Apps Script bound to the "Ranfurlie Safety Register" Google Sheet.
 *   1. Extensions > Apps Script, paste this file over Code.gs, save.
 *   2. Run setup() once (or Safety menu > Set up / repair) and approve access.
 *   3. Deploy > New deployment > Web app: Execute as Me, Who has access: Anyone.
 *      Put the /exec URL into site/config.js on GitHub.
 *
 * What it does
 *   - Every 10 min: picks up files dropped into the Drive Library folder, gives them a code,
 *     shares them view-only by link, bumps the version when a file changes, rebuilds the
 *     Matrix tab and the dashboard data files.
 *   - Web API for the staff page: library list, sign-in with 4-digit PIN, sign a document
 *     (drawn signature saved to the private Signatures folder, row added to Register).
 *   - 7am on reminder days: tags staff in Slack (incoming webhook) when sign-offs are due or overdue.
 */

const TZ = 'Australia/Melbourne';
const TAB = {
  MATRIX: 'Matrix', REGISTER: 'Register', STAFF: 'Staff', DOCS: 'Documents',
  REMINDERS: 'Reminders', SETTINGS: 'Settings', README: 'Read me'
};
const HEAD = {
  Register: ['Signed at', 'Receipt', 'Staff', 'Code', 'Document', 'Version', 'Risk', 'Valid until', 'Read time (sec)', 'Signature', 'Declaration', 'Device'],
  Staff: ['Name', 'Slack ID', 'Role', 'Site', 'Groups', 'PIN', 'Active', 'Start date', 'Notes'],
  Documents: ['Code', 'Title', 'Category', 'Risk', 'Applies to', 'Renew (months)', 'Read time (sec)', 'Summary', 'Status', 'Version', 'Updated', 'File ID', 'File name', 'Link', 'Added', 'Notes'],
  Reminders: ['Sent at', 'Staff', 'Slack ID', 'Overdue', 'Due', 'Codes'],
  Settings: ['Key', 'Value', 'What it does']
};
const CATEGORIES = ['General OHS & Emergency', 'Chemicals & Spraying', 'Machinery & Plant SWPs', 'Workshop & Tools', 'Other'];
const CATEGORY_PREFIX = { 'General OHS & Emergency': 'OHS', 'Chemicals & Spraying': 'CHM', 'Machinery & Plant SWPs': 'SWP', 'Workshop & Tools': 'WKS' };
const DECLARATION = 'I have read and understood this procedure and will follow it. I will ask my supervisor if anything is unclear.';

/* ---------------------------------------------------------------- seed data */

const SEED_SETTINGS = [
  ['LIBRARY_FOLDER_ID', '1NHiuRAGHVQrcQnjRsTo01g3CzL29tIOk', 'Drive folder staff documents are uploaded to (sub-folder = category)'],
  ['SIGNATURE_FOLDER_ID', '1p_ir20e0XcOXv2nXxShMRZjFzAgPPruZ', 'Private folder for signature images'],
  ['STATUS_CSV_ID', '1F_SDRU6fVcZjAGWKi9ks7iXE3puSDgPY', 'Dashboard data file'],
  ['REGISTER_CSV_ID', '18NFyRWSId_0kZi8kvCBvvmI32fKTM8kL', 'Dashboard data file'],
  ['STAFF_CSV_ID', '1MgPGk4db8wSIe577MxW_kLCVQlKUiL3X', 'Dashboard data file'],
  ['DOCUMENTS_CSV_ID', '1DD_lRV9ROWhNFIfagrFFFCV5rlc0yxko', 'Dashboard data file'],
  ['SITE_URL', 'https://andranf.github.io/ranfurlie-safety/', 'Staff sign-off page (linked in Slack reminders)'],
  ['SLACK_WEBHOOK_URL', '', 'Slack incoming webhook for reminders (the webhook sets the channel)'],
  ['SLACK_CHANNEL', '#safe-work-procedures', 'Label only - the channel the webhook posts to'],
  ['GO_LIVE_DATE', '2026-10-13', 'First due dates count from this date'],
  ['RENEW_MONTHS_HIGH', 6, 'Re-sign interval for High risk documents (months)'],
  ['RENEW_MONTHS_MEDIUM', 12, 'Re-sign interval for Medium risk documents (months)'],
  ['RENEW_MONTHS_LOW', 24, 'Re-sign interval for Low risk documents (months)'],
  ['FIRST_DUE_DAYS_HIGH', 14, 'Days to sign a High risk document the first time (or after it is updated)'],
  ['FIRST_DUE_DAYS_MEDIUM', 42, 'Days to sign a Medium risk document the first time'],
  ['FIRST_DUE_DAYS_LOW', 90, 'Days to sign a Low risk document the first time'],
  ['READ_SECONDS_HIGH', 90, 'Minimum time a document must be open before it can be signed'],
  ['READ_SECONDS_MEDIUM', 60, ''],
  ['READ_SECONDS_LOW', 30, ''],
  ['REMIND_DAYS_BEFORE', 14, 'Start tagging staff this many days before a sign-off falls due'],
  ['REMIND_REPEAT_DAYS', 7, 'Re-tag while still outstanding (and straight away when something goes overdue)'],
  ['REMIND_ON_DAYS', 'Mon,Tue,Wed,Thu,Fri', 'Days reminders can post (7am)'],
  ['RESIGN_ON_UPDATE', 'TRUE', 'When a document file is updated, everyone re-signs the new version'],
  ['PIN_SALT', '', 'Do not change - protects staff PINs (filled in by setup)']
];

const SEED_STAFF = [
  ['Andy Anderson', 'U06BCCG4HT9', 'Course Superintendent', 'Ranfurlie / Amstel', 'All, Crew, Spray, Plant, Chainsaw', '', true, '', ''],
  ['Ben Hartley', 'U06NBNSR9LG', 'Course Operations', 'Ranfurlie / Amstel', 'All, Crew, Spray, Plant, Chainsaw, Workshop', '', true, '', ''],
  ['Neil Harper', 'U06FJ0J1RH8', 'Crew Lead', 'Ranfurlie', 'All, Crew, Spray, Plant, Chainsaw', '', true, '', ''],
  ['Kyle Craig', 'U06FWK6ND5X', 'Greenkeeper', 'Ranfurlie', 'All, Crew', '', true, '', ''],
  ['Nathan Drew', 'U06FJ0J5DS6', 'Greenkeeper', 'Ranfurlie', 'All, Crew', '', true, '', ''],
  ['Nathan Ferguson', 'U06H9J0LBEC', 'Greenkeeper', 'Ranfurlie', 'All, Crew', '', true, '', ''],
  ['Nicholas Debrincat', 'U07QSB7MDK5', 'Greenkeeper', 'Ranfurlie', 'All, Crew', '', true, '', ''],
  ['Brodie Macdonald', 'U0839HLQA8G', 'Greenkeeper', 'Ranfurlie', 'All, Crew', '', true, '', ''],
  ['Flynn Sinclair', 'U08C1SVFSFR', 'Greenkeeper', 'Ranfurlie', 'All, Crew', '', true, '', ''],
  ['James King', 'U08D57N6JSC', 'Greenkeeper', 'Ranfurlie', 'All, Crew', '', true, '', ''],
  ['Joshua Cope', 'U08ENB28AQZ', 'Greenkeeper', 'Ranfurlie', 'All, Crew', '', true, '', ''],
  ['Mitch Mahoney', 'U08K55E3QJU', 'Greenkeeper', 'Ranfurlie', 'All, Crew', '', true, '', ''],
  ['Katherine Duong', 'U08M3KGRHJ6', 'Greenkeeper', 'Ranfurlie', 'All, Crew', '', true, '', ''],
  ['Samuel Cope', 'U09LN1Q8QH2', 'Greenkeeper', 'Ranfurlie', 'All, Crew', '', true, '', ''],
  ['Tremayne Gallagher', 'U09V6AVPUDP', 'Greenkeeper', 'Amstel', 'All, Crew', '', true, '', ''],
  ['Michael K', 'U07QSB7HVM1', 'Contractor', 'Ranfurlie', 'All, Workshop', '', false, '', 'Set Active to TRUE if he works on site']
];

// code, title, risk, applies to, summary
const SEED_DOCS = [
  ['OHS-01', 'Course Maintenance Site Induction', 'Medium', 'All', "Sign-in, hours, who's who, site layout, key hazards and the rules everyone works to."],
  ['OHS-02', 'Emergency Procedures & Evacuation', 'High', 'All', 'Raising the alarm, evacuating the shed and course, assembly points and who takes charge.'],
  ['OHS-03', 'Medical Emergency & Ambulance Access', 'High', 'All', 'First aid kits, defibrillator, calling 000 and getting an ambulance to the right hole.'],
  ['OHS-04', 'Lightning & Severe Weather', 'High', 'All', 'When to stop work, where to shelter, clearing staff off course and storm clean-up hazards.'],
  ['OHS-05', 'Heat Stress & Hot Weather Work', 'Medium', 'All', 'Hydration, shade and rest breaks, adjusted start times and spotting heat illness early.'],
  ['OHS-06', 'Fire Danger Days & Total Fire Bans', 'High', 'All', 'What changes on high fire danger and Total Fire Ban days: machinery, hot work and extinguishers.'],
  ['OHS-07', 'Fire Extinguishers & Fire Wardens', 'Medium', 'All', 'Extinguisher types and locations, how to use them and the fire warden roles.'],
  ['OHS-08', 'Spill Response & Spill Kits', 'High', 'All', 'Spill kit locations, stop-contain-absorb-report, and protecting drains and waterways.'],
  ['OHS-09', 'Hazardous Chemicals - SDS, Labels & Storage', 'High', 'All', 'Reading labels and SDS, the chemical register, storage, segregation and first aid.'],
  ['OHS-10', 'Fuel Handling & Refuelling', 'Medium', 'All', 'Refuelling machines and jerry cans safely, ignition sources and fuel storage.'],
  ['OHS-11', 'Manual Handling', 'Medium', 'All', 'Safe lifting, team lifts and mechanical aids for sand, bags, cups, pipe and parts.'],
  ['OHS-12', 'PPE - Selection, Use & Care', 'Medium', 'All', 'What PPE each task needs, fitting it properly, cleaning, storage and replacement.'],
  ['OHS-13', 'Hazard, Incident & Near-Miss Reporting', 'Medium', 'All', 'What to report, how and when, and what happens after you report it.'],
  ['OHS-14', 'Pre-start Checks & Out-of-Service Tagging', 'Medium', 'Crew', 'Daily machine pre-starts, recording faults and tagging unsafe equipment out of service.'],
  ['OHS-15', 'Isolation & Lockout/Tagout', 'High', 'Crew', 'Isolating machines and energy sources before clearing, adjusting or repairing.'],
  ['OHS-16', 'Working Around Golfers', 'Medium', 'Crew', 'Right of way, waiting for groups, stray ball risk and signalling while working in play.'],
  ['OHS-17', 'Slopes, Batters & Rollover Prevention', 'High', 'Crew', 'ROPS and seatbelts, slope limits, wet ground and safe direction of travel on banks.'],
  ['OHS-18', 'Working Near Water', 'High', 'Crew', 'Lake and dam edges, machinery near batters, rescue equipment and the buddy rule.'],
  ['OHS-19', 'Working Alone & Check-in', 'Medium', 'All', 'When working alone is allowed, check-in times, phone cover and what to do if someone is missing.'],
  ['OHS-20', 'Digging, Trenching & Underground Services', 'High', 'Crew', 'Locating services before you dig, safe trench depths, spoil and collapse risk.'],
  ['OHS-21', 'Confined Spaces - Pits, Tanks & Pump Station', 'High', 'Crew', 'Recognising confined spaces, no-entry rules and when a permit and standby person are needed.'],
  ['OHS-22', 'Working at Heights & Ladders', 'High', 'Crew', 'Ladder selection and set-up, three points of contact, roofs, mezzanines and edges.'],
  ['OHS-23', 'Electrical Safety & Test-and-Tag', 'Medium', 'All', 'Leads and power tools, test-and-tag, wet conditions, overhead lines and reporting damage.'],
  ['OHS-24', 'Sun Protection & UV', 'Low', 'All', 'Sunscreen, hats, sleeves and eyewear, and checking the UV index.'],
  ['OHS-25', 'Noise & Hearing Protection', 'Low', 'All', 'Which machines need hearing protection and how to wear and look after it.'],
  ['OHS-26', 'Dust & Respirable Silica', 'Medium', 'Crew', 'Dust from sand, cores, concrete and pavers: wet methods, extraction and respirators.'],
  ['OHS-27', 'Snakes, Bees & Wildlife', 'Medium', 'All', 'Avoiding snakes, bite and sting first aid, allergies and wildlife on course.'],
  ['OHS-28', 'Vehicles & Traffic on Site', 'Medium', 'All', 'Speed limits, paths and car park, reversing, passengers and seatbelts.'],
  ['OHS-29', 'Towing & Trailers', 'Medium', 'Crew', 'Hitching, safety chains, load limits, tipping trailers and reversing with a trailer.'],
  ['OHS-30', 'Irrigation - Pressurised Lines & Pump Station', 'Medium', 'Crew', 'Isolating and depressurising before repairs, pump station hazards and high-pressure water.'],
  ['OHS-31', 'Fit for Work - Fatigue, Drugs & Alcohol', 'Low', 'All', 'Turning up fit for work, fatigue, medication and the drug and alcohol rules.'],
  ['OHS-32', 'Workplace Behaviour - Bullying & Harassment', 'Low', 'All', "Expected behaviour, what isn't acceptable and how to raise a concern."],
  ['OHS-33', 'Asbestos Awareness', 'Low', 'All', 'Where asbestos may be found in older buildings and what to do if you suspect it.'],
  ['CHM-01', 'Pesticide Mixing, Loading & Application', 'High', 'Spray', 'Reading the label, PPE, mixing and filling, application, wash-down and records.'],
  ['CHM-02', 'Respirators - Fit, Seal Check & Cartridges', 'High', 'Spray', 'Fit and seal checks every time, cartridge types and change-out, cleaning and storage.'],
  ['CHM-03', 'Chemical Store, Decanting & Container Disposal', 'Medium', 'Spray', 'Store rules, decanting, triple rinsing and disposing of empty containers.'],
  ['CHM-04', 'Spray Records, Signage & Re-entry', 'Medium', 'Spray', 'Completing the spray record, posting signs and re-entry periods for staff and golfers.'],
  ['CHM-05', 'Chemical Exposure - Decontamination & First Aid', 'High', 'Spray', 'What to do after skin, eye or inhalation exposure, decontamination and getting help.'],
  ['CHM-06', 'Granular Fertiliser & Spreaders', 'Low', 'Crew', 'Handling bags, calibrating and using spreaders, cleaning up and keeping product off hard surfaces.'],
  ['WKS-01', 'Workshop Rules & Housekeeping', 'Medium', 'Crew', 'Who can use what, keeping walkways clear, waste, oils and parts washers.'],
  ['WKS-02', 'Jacking, Lifting & Supporting Machinery', 'High', 'Workshop', 'Hoists, jacks and stands, raising cutting units and never working under an unsupported load.'],
  ['WKS-03', 'Batteries & Charging', 'Medium', 'Crew', 'Lead-acid and lithium batteries, charging areas, damaged batteries and fire risk.'],
  ['WKS-04', 'Hot Work - Welding, Cutting & Grinding', 'High', 'Workshop', 'Hot work permits, fire watch, PPE, gas cylinders and fume control.'],
  ['WKS-05', 'Reel & Bedknife Grinding', 'Medium', 'Workshop', 'Setting up and running the grinders, guards, PPE and handling sharp reels.'],
  ['WKS-06', 'Wash Bay & Pressure Washer', 'Low', 'Crew', 'Washing down machines safely: electrics, slips, eye protection and wash water.']
];

const README_LINES = [
  'Ranfurlie Safety Register',
  '',
  "Adding documents: drop the file (PDF, Word or Google Doc) into the matching sub-folder of 'Ranfurlie Safety > Library'. Within 10 minutes it gets a code, appears on the staff page and is added to the Documents tab. New machinery SWPs get a Risk and 'Applies to' guessed from the name - check them.",
  "Seeded documents: start the file name with the code (e.g. 'OHS-08 Spill Response.pdf') or use the exact title, and it links to that row.",
  'Updating a document: upload a new version over the old file in Drive (Manage versions), or upload a new file starting with the same code. Everyone re-signs the new version.',
  "Risk: High / Medium / Low sets how often it is re-signed (Settings: 6 / 12 / 24 months) and how long it must be open before signing. Override one document with 'Renew (months)' or 'Read time (sec)'.",
  'Applies to: All = every active staff member. Otherwise it matches the Groups on the Staff tab: Crew, Spray, Plant, Chainsaw, Workshop. Use commas for more than one.',
  'Retire a document: set Status to Retired. It drops off the staff page and nobody is chased for it.',
  'New staff: add a row on the Staff tab with their Slack ID, Groups, Active = TRUE and a Start date. Their first due dates count from the start date.',
  'PINs: staff create their own 4-digit PIN the first time they sign in. To reset one, clear their PIN cell. You can also type a 4-digit PIN in yourself - it is protected the next time they sign in.',
  'Reminders: 7am on the days in Settings. Staff are tagged in Slack from 14 days before a sign-off falls due, weekly while it is outstanding, and straight away when it goes overdue.',
  'Matrix: rebuilt automatically. Green = current, amber = due soon or still to sign, red = overdue, grey = not required.',
  'Menu: Safety > Sync now / Preview reminders / Send reminders now / Set up or repair.'
];

/* ------------------------------------------------------------------ menu */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Safety')
    .addItem('Sync now', 'menuSync')
    .addItem('Preview reminders (no post)', 'menuPreview')
    .addItem('Send reminders now', 'menuRemind')
    .addSeparator()
    .addItem('Set up / repair', 'setup')
    .addToUi();
}

function menuSync() {
  syncLibrary_();
  refreshOutputs_();
  SpreadsheetApp.getActive().toast('Library synced and matrix rebuilt.', 'Safety', 5);
}

function menuPreview() {
  const r = remind_({ dryRun: true, force: true });
  SpreadsheetApp.getUi().alert('Reminder preview', r.text || 'Nobody needs a reminder today.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function menuRemind() {
  const r = remind_({ dryRun: false, force: true });
  SpreadsheetApp.getUi().alert('Reminders', r.message, SpreadsheetApp.getUi().ButtonSet.OK);
}

/* ----------------------------------------------------------------- setup */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  ensureSheets_();
  const s = settings_();
  if (!String(s.PIN_SALT || '').trim()) setSetting_('PIN_SALT', Utilities.getUuid().replace(/-/g, '').slice(0, 24));
  try {
    DriveApp.getFolderById(s.LIBRARY_FOLDER_ID).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    console.warn('Could not share library folder: ' + e);
  }
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('sendReminders').timeBased().atHour(7).everyDays(1).inTimezone(TZ).create();
  syncLibrary_();
  refreshOutputs_();
  try { ss.toast('Set up complete. Sync runs every 10 minutes; reminders at 7am.', 'Safety', 8); } catch (e) {}
  return 'ok';
}

function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const order = [TAB.MATRIX, TAB.REGISTER, TAB.STAFF, TAB.DOCS, TAB.REMINDERS, TAB.SETTINGS, TAB.README];
  order.forEach((name, i) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name, i);
    const empty = sh.getLastRow() === 0;
    if (HEAD[name] && empty) {
      sh.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]]);
      styleHeader_(sh, HEAD[name].length);
    }
    if (!empty) return;
    if (name === TAB.SETTINGS) {
      sh.getRange(2, 2, SEED_SETTINGS.length, 1).setNumberFormat('@');
      sh.getRange(2, 1, SEED_SETTINGS.length, 3).setValues(SEED_SETTINGS.map(r => [r[0], String(r[1]), r[2]]));
      sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 380); sh.setColumnWidth(3, 520);
    }
    if (name === TAB.STAFF) {
      sh.getRange(2, 6, 300, 1).setNumberFormat('@');
      sh.getRange(2, 8, 300, 1).setNumberFormat('yyyy-mm-dd');
      sh.getRange(2, 1, SEED_STAFF.length, SEED_STAFF[0].length).setValues(SEED_STAFF);
      sh.getRange(2, 7, 300, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      sh.getRange(2, 7, SEED_STAFF.length, 1).setValues(SEED_STAFF.map(r => [r[6]]));
      [170, 110, 160, 130, 280, 110, 70, 100, 260].forEach((w, j) => sh.setColumnWidth(j + 1, w));
    }
    if (name === TAB.DOCS) {
      const rows = SEED_DOCS.map(d => [d[0], d[1], CATEGORIES[['OHS', 'CHM', 'SWP', 'WKS'].indexOf(d[0].slice(0, 3))], d[2], d[3], '', '', d[4], 'Not uploaded', 0, '', '', '', '', '', '']);
      sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
      sh.getRange(2, 4, 600, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['High', 'Medium', 'Low'], true).build());
      sh.getRange(2, 9, 600, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Live', 'Not uploaded', 'Retired'], true).build());
      sh.getRange(2, 11, 600, 1).setNumberFormat('yyyy-mm-dd hh:mm');
      sh.getRange(2, 15, 600, 1).setNumberFormat('yyyy-mm-dd');
      [70, 300, 170, 70, 110, 80, 80, 420, 95, 60, 120, 110, 240, 70, 90, 240].forEach((w, j) => sh.setColumnWidth(j + 1, w));
    }
    if (name === TAB.REGISTER) {
      sh.getRange(2, 1, 5000, 1).setNumberFormat('yyyy-mm-dd hh:mm');
      sh.getRange(2, 8, 5000, 1).setNumberFormat('yyyy-mm-dd');
      [130, 130, 150, 70, 280, 60, 70, 95, 80, 80, 300, 220].forEach((w, j) => sh.setColumnWidth(j + 1, w));
    }
    if (name === TAB.REMINDERS) {
      sh.getRange(2, 1, 5000, 1).setNumberFormat('yyyy-mm-dd hh:mm');
      [130, 160, 110, 70, 70, 500].forEach((w, j) => sh.setColumnWidth(j + 1, w));
    }
    if (name === TAB.README) {
      sh.getRange(1, 1, README_LINES.length, 1).setValues(README_LINES.map(l => [l])).setWrap(true).setVerticalAlignment('top');
      sh.setColumnWidth(1, 900);
      sh.getRange(1, 1).setFontSize(14).setFontWeight('bold').setFontColor('#1F4D3A');
    }
    if (name === TAB.MATRIX) {
      sh.getRange(1, 1).setValue('The matrix builds itself once documents are uploaded to the Library folder.');
    }
  });
  const stray = ss.getSheetByName('Sheet1');
  if (stray && ss.getSheets().length > 1 && stray.getLastRow() === 0) ss.deleteSheet(stray);
}

function styleHeader_(sh, n) {
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F4D3A').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 30);
  sh.setFrozenRows(1);
}

/* ------------------------------------------------------------- web app */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (!p.action || p.action === 'library') return json_(library_());
    if (p.action === 'ping') return json_({ ok: true, time: new Date().toISOString() });
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: msg_(err) });
  }
}

function doPost(e) {
  let b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  try {
    if (b.action === 'me') return json_(me_(b));
    if (b.action === 'sign') return json_(sign_(b));
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: msg_(err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function msg_(err) { return String((err && err.message) || err); }

function library_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('library');
  if (hit) return JSON.parse(hit);
  const s = settings_();
  const docs = read_(TAB.DOCS).rows.filter(isLive_).map(d => ({
    code: String(d.Code).trim(),
    title: String(d.Title).trim(),
    category: String(d.Category || 'Other').trim(),
    risk: riskOf_(d),
    applies: String(d['Applies to'] || 'All'),
    summary: String(d.Summary || ''),
    version: num_(d.Version, 1),
    readSeconds: readSeconds_(d, s),
    renewMonths: renewMonths_(d, s),
    preview: previewUrl_(d),
    open: String(d.Link || ''),
    updated: toKey_(d.Updated)
  })).sort(byCategoryThenCode_);
  const staff = read_(TAB.STAFF).rows.filter(isActive_).map(r => String(r.Name).trim()).sort();
  const out = { ok: true, docs, staff, categories: CATEGORIES, declaration: DECLARATION, generated: new Date().toISOString() };
  try { cache.put('library', JSON.stringify(out), 300); } catch (e) {}
  return out;
}

function me_(b) {
  const ctx = context_();
  const a = auth_(ctx, b.name, b.pin, b.newPin);
  if (a.needPin) return { ok: true, needPin: true, name: String(a.staff.Name).trim() };
  return Object.assign({ ok: true, name: String(a.staff.Name).trim(), pinSet: !!a.pinSet }, myItems_(ctx, a.staff));
}

function myItems_(ctx, st) {
  const items = {};
  const counts = { 'Overdue': 0, 'Due soon': 0, 'To sign': 0, 'Current': 0 };
  ctx.docs.filter(isLive_).forEach(d => {
    const code = String(d.Code).trim();
    if (applies_(d, st)) {
      const i = itemStatus_(ctx, st, d);
      counts[i.status]++;
      items[code] = { required: true, status: i.status, signed: i.signed, validUntil: i.validUntil, due: i.due, daysLeft: i.daysLeft, outdated: !!i.outdated };
    } else {
      const ack = ctx.latest[norm_(st.Name) + '|' + code];
      items[code] = { required: false, signed: ack ? ack.signed : '' };
    }
  });
  return { items, counts };
}

function sign_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ctx = context_();
    const a = auth_(ctx, b.name, b.pin);
    if (a.needPin) throw new Error('Create your PIN first.');
    const st = a.staff;
    const doc = ctx.docs.find(d => String(d.Code).trim() === String(b.code || '').trim() && isLive_(d));
    if (!doc) throw new Error('That document is no longer available. Reload the page.');
    const ver = num_(doc.Version, 1);
    if (num_(b.version, -1) !== ver) throw new Error('This document has just been updated. Reload the page and read the new version.');
    const minRead = readSeconds_(doc, ctx.s);
    const readSecs = Math.round(num_(b.readSeconds, 0));
    if (readSecs + 2 < minRead) throw new Error('Keep the document open for at least ' + minRead + ' seconds before signing.');
    if (b.declare !== true) throw new Error('Tick the declaration to sign.');
    const m = String(b.signature || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!m || m[1].length < 200 || m[1].length > 600000) throw new Error('Please draw your signature.');

    const now = new Date();
    const name = String(st.Name).trim();
    const code = String(doc.Code).trim();
    const fileName = Utilities.formatDate(now, TZ, 'yyyy-MM-dd HHmm') + ' ' + name + ' ' + code + ' v' + ver + '.png';
    const file = DriveApp.getFolderById(ctx.s.SIGNATURE_FOLDER_ID).createFile(Utilities.newBlob(Utilities.base64Decode(m[1]), 'image/png', fileName));
    const until = addMonths_(dayKey_(now), renewMonths_(doc, ctx.s));
    const receipt = 'RGC-' + Utilities.formatDate(now, TZ, 'yyMMdd') + '-' + sha_(name + '|' + code + '|' + ver + '|' + now.getTime()).slice(0, 6).toUpperCase();
    sheet_(TAB.REGISTER).appendRow([
      now, receipt, name, code, String(doc.Title).trim(), ver, riskOf_(doc), until, readSecs,
      '=HYPERLINK("' + file.getUrl() + '","View")', DECLARATION, String(b.ua || '').slice(0, 160)
    ]);
    PropertiesService.getScriptProperties().setProperty('dirty', '1');
    return { ok: true, receipt, code, signedAt: Utilities.formatDate(now, TZ, 'd MMM yyyy, h:mm a'), validUntil: until };
  } finally {
    lock.releaseLock();
  }
}

function auth_(ctx, name, pin, newPin) {
  const n = norm_(name);
  const st = ctx.staff.find(r => norm_(r.Name) === n && isActive_(r));
  if (!st) throw new Error('Name not found - see your supervisor.');
  const cache = CacheService.getScriptCache();
  const failKey = 'fail:' + n;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 5) throw new Error('Too many wrong PINs. Wait 15 minutes or ask your supervisor to reset it.');
  let stored = String(st.PIN === null || st.PIN === undefined ? '' : st.PIN).trim();
  if (/^\d{1,4}$/.test(stored)) stored = ('0000' + stored).slice(-4);
  if (!stored) {
    if (!/^\d{4}$/.test(String(newPin || ''))) return { needPin: true, staff: st };
    setPin_(st, String(newPin), ctx.s);
    return { staff: st, pinSet: true };
  }
  const p = String(pin || '').trim();
  if (!/^\d{4}$/.test(p)) throw new Error('Enter your 4-digit PIN.');
  const ok = stored.indexOf('h:') === 0 ? stored === pinHash_(st.Name, p, ctx.s) : stored === p;
  if (!ok) {
    cache.put(failKey, String(fails + 1), 900);
    throw new Error("PIN doesn't match." + (fails >= 3 ? ' One more wrong try locks it for 15 minutes.' : ''));
  }
  if (stored.indexOf('h:') !== 0) setPin_(st, p, ctx.s);
  cache.remove(failKey);
  return { staff: st };
}

function setPin_(st, pin, s) {
  const t = read_(TAB.STAFF);
  t.sh.getRange(st._row, t.col('PIN')).setNumberFormat('@').setValue(pinHash_(st.Name, pin, s));
}

function pinHash_(name, pin, s) {
  return 'h:' + sha_(norm_(name) + '|' + pin + '|' + String(s.PIN_SALT || '')).slice(0, 32);
}

/* -------------------------------------------------------------- status */

function context_() {
  const s = settings_();
  const staff = read_(TAB.STAFF).rows.filter(r => String(r.Name || '').trim());
  const docs = read_(TAB.DOCS).rows.filter(r => String(r.Code || '').trim());
  const reg = read_(TAB.REGISTER).rows;
  const latest = {};
  reg.forEach(r => {
    const when = r['Signed at'] instanceof Date ? r['Signed at'] : new Date(r['Signed at']);
    if (isNaN(when.getTime())) return;
    const k = norm_(r.Staff) + '|' + String(r.Code).trim();
    if (!latest[k] || when.getTime() > latest[k].t) latest[k] = { t: when.getTime(), signed: dayKey_(when), version: num_(r.Version, 1) };
  });
  return { s, staff, docs, reg, latest, today: dayKey_(new Date()) };
}

function itemStatus_(ctx, st, doc) {
  const s = ctx.s;
  const lead = num_(s.REMIND_DAYS_BEFORE, 14);
  const ver = num_(doc.Version, 1);
  const ack = ctx.latest[norm_(st.Name) + '|' + String(doc.Code).trim()];
  const valid = ack && (!bool_(s.RESIGN_ON_UPDATE) || ack.version >= ver);
  if (valid) {
    const until = addMonths_(ack.signed, renewMonths_(doc, s));
    const left = dnum_(until) - dnum_(ctx.today);
    return { status: left < 0 ? 'Overdue' : (left <= lead ? 'Due soon' : 'Current'), signed: ack.signed, validUntil: until, due: until, daysLeft: left };
  }
  let base = toKey_(s.GO_LIVE_DATE) || ctx.today;
  [toKey_(doc.Added), toKey_(st['Start date']), ack ? toKey_(doc.Updated) : ''].forEach(k => { if (k && k > base) base = k; });
  const due = addDays_(base, num_(s['FIRST_DUE_DAYS_' + riskOf_(doc).toUpperCase()], 30));
  const left = dnum_(due) - dnum_(ctx.today);
  return { status: left < 0 ? 'Overdue' : 'To sign', signed: ack ? ack.signed : '', validUntil: '', due, daysLeft: left, outdated: !!ack };
}

function computeAll_(ctx) {
  const activeStaff = ctx.staff.filter(isActive_);
  const live = ctx.docs.filter(isLive_).sort(byCategoryThenCode_);
  const items = [];
  activeStaff.forEach(st => live.forEach(doc => {
    if (applies_(doc, st)) items.push(Object.assign({ staff: st, doc }, itemStatus_(ctx, st, doc)));
  }));
  return { items, activeStaff, live };
}

/* ------------------------------------------------------- library sync */

function tick() {
  const props = PropertiesService.getScriptProperties();
  let changed = false;
  try { changed = syncLibrary_(); } catch (e) { console.error('sync failed: ' + e); }
  const today = dayKey_(new Date());
  if (changed || props.getProperty('dirty') === '1' || props.getProperty('lastRefresh') !== today) refreshOutputs_();
}

function syncLibrary_() {
  const s = settings_();
  const root = DriveApp.getFolderById(s.LIBRARY_FOLDER_ID);
  const found = [];
  const walk = (folder, category) => {
    const files = folder.getFiles();
    while (files.hasNext()) found.push({ f: files.next(), category: category || 'Other' });
    const subs = folder.getFolders();
    while (subs.hasNext()) {
      const sub = subs.next();
      walk(sub, category || catName_(sub.getName()));
    }
  };
  walk(root, '');

  const t = read_(TAB.DOCS);
  const docs = t.rows.filter(r => String(r.Code || '').trim());
  const byCode = {}, byFile = {};
  docs.forEach(d => {
    byCode[String(d.Code).trim().toUpperCase()] = d;
    const fid = String(d['File ID'] || '').trim();
    if (fid) byFile[fid] = d;
  });
  const seen = {};
  const today = dayKey_(new Date());
  let changed = false;

  // Work out which document row each file belongs to.
  const plan = [];
  found.forEach(({ f, category }) => {
    const name = f.getName();
    const mime = f.getMimeType();
    if (mime === MimeType.SHORTCUT || mime === MimeType.FOLDER || /^(~\$|\.)/.test(name)) return;
    if (f.isTrashed()) return;
    const id = f.getId();
    const m = name.match(/^([A-Za-z]{2,4})-(\d{1,3})(?=\b|_|\s)/);
    let doc = byFile[id];
    if (!doc && m) doc = byCode[(m[1] + '-' + ('0' + m[2]).slice(-Math.max(2, m[2].length))).toUpperCase()];
    if (!doc) {
      const tt = norm_(cleanTitle_(name));
      doc = docs.find(d => !String(d['File ID'] || '').trim() && norm_(d.Title) === tt);
    }
    plan.push({ f, category, name, id, m, doc, created: f.getDateCreated().getTime() });
  });
  // Two files for one code: the newest upload wins (lets you replace a document by uploading a new file).
  const best = {};
  plan.forEach(p => {
    if (!p.doc) return;
    const c = String(p.doc.Code).trim();
    if (!best[c] || p.created > best[c].created) best[c] = p;
  });

  plan.forEach(({ f, category, name, id, m, doc }) => {
    if (doc && best[String(doc.Code).trim()].id !== id) return;

    if (!doc) {
      const prefix = CATEGORY_PREFIX[category] || 'DOC';
      const code = nextCode_(docs, prefix);
      const title = cleanTitle_(name);
      try { f.setName(code + ' ' + name); } catch (e) {}
      share_(f);
      const fresh = DriveApp.getFileById(id);
      const row = {
        'Code': code, 'Title': title, 'Category': category, 'Risk': guessRisk_(title, category),
        'Applies to': guessApplies_(title, category), 'Renew (months)': '', 'Read time (sec)': '', 'Summary': '',
        'Status': 'Live', 'Version': 1, 'Updated': fresh.getLastUpdated(), 'File ID': id, 'File name': fresh.getName(),
        'Link': fresh.getUrl(), 'Added': today, 'Notes': 'Added from Drive ' + today + ' - check Risk and Applies to'
      };
      t.sh.appendRow(t.head.map(h => (h in row ? row[h] : '')));
      row._row = t.sh.getLastRow();
      docs.push(row); byCode[code] = row; byFile[id] = row; seen[code] = true;
      changed = true;
      return;
    }

    const code = String(doc.Code).trim();
    seen[code] = true;
    const upd = {};
    const linkedId = String(doc['File ID'] || '').trim();
    if (linkedId !== id) {
      if (!m) { try { f.setName(code + ' ' + name); } catch (e) {} }
      share_(f);
      const fresh = DriveApp.getFileById(id);
      upd['File ID'] = id;
      upd['File name'] = fresh.getName();
      upd['Link'] = fresh.getUrl();
      if (linkedId) {
        upd['Version'] = num_(doc.Version, 1) + 1;
        upd['Updated'] = new Date();
      } else {
        upd['Version'] = Math.max(1, num_(doc.Version, 0));
        upd['Updated'] = fresh.getLastUpdated();
        upd['Added'] = today;
      }
      if (String(doc.Status).trim() !== 'Retired') upd['Status'] = 'Live';
      byFile[id] = doc;
    } else {
      const prev = doc.Updated instanceof Date ? doc.Updated.getTime() : 0;
      const now = f.getLastUpdated().getTime();
      if (prev && now - prev > 120000) {
        upd['Version'] = num_(doc.Version, 1) + 1;
        upd['Updated'] = f.getLastUpdated();
        upd['File name'] = name;
      }
      if (String(doc.Status).trim() === 'Not uploaded') upd['Status'] = 'Live';
    }
    if (String(doc.Category || '').trim() !== category) upd['Category'] = category;
    if (Object.keys(upd).length) {
      writeRow_(t, doc._row, upd);
      Object.assign(doc, upd);
      changed = true;
    }
  });

  docs.forEach(d => {
    if (String(d.Status).trim() === 'Live' && !seen[String(d.Code).trim()]) {
      writeRow_(t, d._row, { 'Status': 'Not uploaded' });
      d.Status = 'Not uploaded';
      changed = true;
    }
  });
  if (changed) CacheService.getScriptCache().remove('library');
  return changed;
}

function share_(f) {
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { console.warn('share failed ' + e); }
}

function catName_(folderName) {
  const n = String(folderName).replace(/^\d+\s*[-.)]?\s*/, '').trim();
  const hit = CATEGORIES.find(c => norm_(c) === norm_(n));
  return hit || n || 'Other';
}

function cleanTitle_(fileName) {
  return String(fileName)
    .replace(/\.[A-Za-z0-9]{2,5}$/, '')
    .replace(/^[A-Za-z]{2,4}-\d{1,3}[\s_-]*/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s*-\s*Copy$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function nextCode_(docs, prefix) {
  let max = 0;
  docs.forEach(d => {
    const m = String(d.Code).trim().match(new RegExp('^' + prefix + '-(\\d+)$', 'i'));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return prefix + '-' + ('0' + (max + 1)).slice(-Math.max(2, String(max + 1).length));
}

function guessRisk_(title, category) {
  const t = String(title).toLowerCase();
  if (/excavat|loader|skid|backhoe|bobcat|tractor|chainsaw|pole ?saw|chipper|mulcher|stump|spray|chemical|pesticide|verti|aera|trench|hoist|weld|ladder|height|confined|elevated|scissor|auger|slasher|flail|wood ?split/.test(t)) return 'High';
  if (/wheelbarrow|hose|broom|hand tools?\b|((battery|cordless).{0,25}blower)|(blower.{0,25}(battery|cordless))/.test(t)) return 'Low';
  if (category === 'Chemicals & Spraying') return 'High';
  return 'Medium';
}

function guessApplies_(title, category) {
  const t = String(title).toLowerCase();
  if (category === 'General OHS & Emergency') return 'All';
  if (/excavat|loader|skid|backhoe|bobcat/.test(t)) return 'Plant';
  if (/chainsaw|pole ?saw|chipper|stump/.test(t)) return 'Chainsaw';
  if (category === 'Chemicals & Spraying' || /spray|chemical|pesticide/.test(t)) return 'Spray';
  if (/weld|hoist|lathe|plasma|oxy|grind|press\b|parts washer/.test(t)) return 'Workshop';
  return 'Crew';
}

function previewUrl_(d) {
  const link = String(d.Link || '');
  const id = String(d['File ID'] || '').trim();
  if (/docs\.google\.com\/(document|spreadsheets|presentation)\//.test(link)) return link.replace(/\/(edit|view)[^/]*$/, '/preview');
  return 'https://drive.google.com/file/d/' + id + '/preview';
}

/* ------------------------------------------------------------ outputs */

function refreshOutputs_() {
  const ctx = context_();
  const all = computeAll_(ctx);
  buildMatrix_(all);
  writeCsvs_(ctx, all);
  const props = PropertiesService.getScriptProperties();
  props.setProperty('dirty', '0');
  props.setProperty('lastRefresh', ctx.today);
  CacheService.getScriptCache().remove('library');
}

function buildMatrix_(all) {
  const sh = sheet_(TAB.MATRIX);
  sh.clear();
  sh.setFrozenRows(0); sh.setFrozenColumns(0);
  const docs = all.live;
  if (!docs.length || !all.activeStaff.length) {
    sh.getRange(1, 1).setValue('The matrix builds itself once documents are uploaded to the Library folder.');
    return;
  }
  const map = {};
  all.items.forEach(i => { map[norm_(i.staff.Name) + '|' + String(i.doc.Code).trim()] = i; });
  const h1 = ['Staff', 'Compliant', 'Overdue'].concat(docs.map(d => String(d.Code).trim()));
  const h2 = ['Updated ' + Utilities.formatDate(new Date(), TZ, 'd MMM yyyy h:mm a'), '', ''].concat(docs.map(d => String(d.Title).trim()));
  const values = [h1, h2];
  const bgs = [h1.map(() => '#1F4D3A'), h2.map(() => '#F3F5F4')];
  all.activeStaff.forEach(st => {
    const row = [String(st.Name).trim(), '', 0];
    const bg = ['#FFFFFF', '#FFFFFF', '#FFFFFF'];
    let req = 0, ok = 0, od = 0;
    docs.forEach(d => {
      const i = map[norm_(st.Name) + '|' + String(d.Code).trim()];
      if (!i) { row.push(''); bg.push('#EEEEEE'); return; }
      req++;
      if (i.status === 'Current') { ok++; row.push('✓ ' + short_(i.validUntil)); bg.push('#D9F2E3'); }
      else if (i.status === 'Due soon') { ok++; row.push('Due ' + short_(i.due)); bg.push('#FFF1C2'); }
      else if (i.status === 'To sign') { row.push('Sign by ' + short_(i.due)); bg.push('#FFF8E1'); }
      else { od++; row.push('OVERDUE'); bg.push('#F8D0CC'); }
    });
    row[1] = req ? Math.round(ok / req * 100) + '%' : '-';
    row[2] = od;
    values.push(row);
    bgs.push(bg);
  });
  const rng = sh.getRange(1, 1, values.length, h1.length);
  rng.setValues(values).setBackgrounds(bgs).setFontSize(9).setVerticalAlignment('middle');
  sh.getRange(1, 1, 1, h1.length).setFontColor('#FFFFFF').setFontWeight('bold');
  sh.getRange(2, 4, 1, docs.length).setTextRotation(90).setVerticalAlignment('bottom').setFontSize(8);
  sh.setRowHeight(2, 190);
  sh.getRange(3, 1, values.length - 2, 1).setFontWeight('bold');
  sh.setColumnWidth(1, 170); sh.setColumnWidth(2, 80); sh.setColumnWidth(3, 65);
  sh.setColumnWidths(4, docs.length, 82);
  sh.setFrozenRows(2); sh.setFrozenColumns(3);
}

function writeCsvs_(ctx, all) {
  const s = ctx.s;
  const status = all.items.map(i => [
    String(i.staff.Name).trim(), String(i.staff.Site || ''), String(i.doc.Code).trim(), String(i.doc.Title).trim(),
    String(i.doc.Category || ''), riskOf_(i.doc), i.status, i.signed || '', i.validUntil || '', i.due || '', i.daysLeft
  ]);
  writeCsv_(s.STATUS_CSV_ID, ['staff', 'site', 'code', 'title', 'category', 'risk', 'status', 'signed', 'valid_until', 'due', 'days_left'], status);

  const reg = ctx.reg.filter(r => r['Signed at'] instanceof Date)
    .sort((a, b) => b['Signed at'] - a['Signed at']).slice(0, 1000)
    .map(r => [Utilities.formatDate(r['Signed at'], TZ, 'yyyy-MM-dd HH:mm'), r.Receipt, r.Staff, r.Code, r.Document, r.Version, r.Risk, toKey_(r['Valid until']), r['Read time (sec)']]);
  writeCsv_(s.REGISTER_CSV_ID, ['signed_at', 'receipt', 'staff', 'code', 'title', 'version', 'risk', 'valid_until', 'read_seconds'], reg);

  const staffRows = all.activeStaff.map(st => {
    const mine = all.items.filter(i => i.staff === st);
    const c = k => mine.filter(i => i.status === k).length;
    const ok = c('Current') + c('Due soon');
    return [String(st.Name).trim(), String(st.Site || ''), String(st.Role || ''), String(st.Groups || ''), mine.length, c('Current'), c('Due soon'), c('To sign'), c('Overdue'), mine.length ? Math.round(ok / mine.length * 100) : ''];
  });
  writeCsv_(s.STAFF_CSV_ID, ['staff', 'site', 'role', 'groups', 'required', 'current', 'due_soon', 'to_sign', 'overdue', 'compliance_pct'], staffRows);

  const docRows = ctx.docs.slice().sort(byCategoryThenCode_).map(d => {
    const mine = all.items.filter(i => i.doc === d);
    return [String(d.Code).trim(), String(d.Title).trim(), String(d.Category || ''), riskOf_(d), String(d['Applies to'] || 'All'), renewMonths_(d, s),
      String(d.Status || ''), num_(d.Version, 0), toKey_(d.Updated), mine.length,
      mine.filter(i => i.status === 'Current' || i.status === 'Due soon').length, mine.filter(i => i.status === 'Overdue').length];
  });
  writeCsv_(s.DOCUMENTS_CSV_ID, ['code', 'title', 'category', 'risk', 'applies_to', 'renew_months', 'status', 'version', 'updated', 'required', 'current', 'overdue'], docRows);
}

function writeCsv_(id, head, rows) {
  if (!String(id || '').trim()) return;
  const esc = v => {
    const x = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
  };
  const text = [head].concat(rows).map(r => r.map(esc).join(',')).join('\n') + '\n';
  try { DriveApp.getFileById(id).setContent(text); } catch (e) { console.warn('csv write failed ' + id + ': ' + e); }
}

/* ----------------------------------------------------------- reminders */

function sendReminders() {
  const r = remind_({ dryRun: false, force: false });
  console.log(r.message);
  return r.message;
}

function remind_(opt) {
  const ctx = context_();
  const s = ctx.s;
  const dow = Utilities.formatDate(new Date(), TZ, 'EEE').toLowerCase();
  const days = String(s.REMIND_ON_DAYS || 'Mon,Tue,Wed,Thu,Fri').split(/[,\s]+/).map(x => x.slice(0, 3).toLowerCase());
  if (!opt.force && days.indexOf(dow) < 0) return { message: 'Not a reminder day.' };
  const lead = num_(s.REMIND_DAYS_BEFORE, 14);
  const repeat = num_(s.REMIND_REPEAT_DAYS, 7);

  const last = {};
  read_(TAB.REMINDERS).rows.forEach(r => {
    const k = norm_(r.Staff);
    const d = toKey_(r['Sent at']);
    if (d && (!last[k] || d >= last[k].day)) last[k] = { day: d, codes: String(r.Codes || '') };
  });

  const all = computeAll_(ctx);
  const byStaff = {};
  all.items.forEach(i => {
    const act = i.status === 'Overdue' || i.status === 'Due soon' || (i.status === 'To sign' && i.daysLeft <= lead);
    if (act) (byStaff[String(i.staff.Name).trim()] = byStaff[String(i.staff.Name).trim()] || []).push(i);
  });

  const lines = [], log = [];
  Object.keys(byStaff).sort().forEach(name => {
    const list = byStaff[name].sort((a, b) => a.daysLeft - b.daysLeft);
    const st = list[0].staff;
    const slack = String(st['Slack ID'] || '').trim();
    const od = list.filter(i => i.status === 'Overdue');
    const due = list.filter(i => i.status !== 'Overdue');
    const prev = last[norm_(name)];
    const since = prev ? dnum_(ctx.today) - dnum_(prev.day) : 9999;
    const prevOd = prev ? (prev.codes.match(/!([A-Z]+-\d+)/g) || []).map(x => x.slice(1)) : [];
    const newOd = od.filter(i => prevOd.indexOf(String(i.doc.Code).trim()) < 0);
    if (!opt.force && (since === 0 || (since < repeat && !newOd.length))) return;
    const parts = [];
    if (od.length) parts.push(od.length + ' overdue: ' + titles_(od));
    if (due.length) parts.push(due.length + ' due, first by ' + nice_(due[0].due) + (od.length ? '' : ': ' + titles_(due)));
    lines.push('• ' + (slack ? '<@' + slack + '>' : '*' + name + '*') + ' - ' + parts.join(' · '));
    log.push([new Date(), name, slack, od.length, due.length, list.map(i => (i.status === 'Overdue' ? '!' : '') + String(i.doc.Code).trim()).join(' ')]);
  });

  if (!lines.length) return { message: 'Nobody needs a reminder today.', text: '' };
  const text = ':clipboard: *Safety sign-offs due*\n' + lines.join('\n') + '\nRead and sign: ' + String(s.SITE_URL || '').trim();
  if (opt.dryRun) return { message: 'Preview only.', text };

  const hook = String(s.SLACK_WEBHOOK_URL || '').trim();
  if (!hook) return { message: 'No SLACK_WEBHOOK_URL in Settings - nothing posted.', text };
  const res = UrlFetchApp.fetch(hook, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text, link_names: true }), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { message: 'Slack returned ' + res.getResponseCode() + ': ' + res.getContentText(), text };
  const sh = sheet_(TAB.REMINDERS);
  sh.getRange(sh.getLastRow() + 1, 1, log.length, log[0].length).setValues(log);
  return { message: 'Posted reminders for ' + log.length + ' staff.', text };
}

function titles_(list) {
  const t = list.slice(0, 3).map(i => String(i.doc.Title).trim());
  return t.join('; ') + (list.length > 3 ? ' +' + (list.length - 3) + ' more' : '');
}

/* ------------------------------------------------------------- helpers */

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Missing tab: ' + name + ' - run Safety > Set up / repair');
  return sh;
}

function read_(name) {
  const sh = sheet_(name);
  const vals = sh.getDataRange().getValues();
  const head = (vals[0] || []).map(h => String(h).trim());
  const rows = [];
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    if (r.every(v => v === '' || v === null)) continue;
    const o = { _row: i + 1 };
    head.forEach((h, j) => { o[h] = r[j]; });
    rows.push(o);
  }
  return { sh, head, rows, col: n => head.indexOf(n) + 1 };
}

function writeRow_(t, row, upd) {
  Object.keys(upd).forEach(k => {
    const c = t.col(k);
    if (c > 0) t.sh.getRange(row, c).setValue(upd[k]);
  });
}

function settings_() {
  const vals = sheet_(TAB.SETTINGS).getDataRange().getValues();
  const s = {};
  vals.slice(1).forEach(r => { const k = String(r[0] || '').trim(); if (k) s[k] = r[1]; });
  return s;
}

function setSetting_(key, value) {
  const sh = sheet_(TAB.SETTINGS);
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === key) { sh.getRange(i + 1, 2).setNumberFormat('@').setValue(value); return; }
  }
  sh.appendRow([key, value, '']);
}

function isLive_(d) { return String(d.Status || '').trim() === 'Live' && !!String(d['File ID'] || '').trim(); }
function isActive_(st) { return bool_(st.Active) && !!String(st.Name || '').trim(); }
function riskOf_(d) { const r = String(d.Risk || '').trim(); return ['High', 'Medium', 'Low'].indexOf(r) >= 0 ? r : 'Medium'; }
function renewMonths_(d, s) { return num_(d['Renew (months)'], num_(s['RENEW_MONTHS_' + riskOf_(d).toUpperCase()], 12)); }
function readSeconds_(d, s) { return num_(d['Read time (sec)'], num_(s['READ_SECONDS_' + riskOf_(d).toUpperCase()], 60)); }
function groups_(v) { return String(v || '').split(/[,;]/).map(x => x.trim().toLowerCase()).filter(Boolean); }
function applies_(d, st) {
  const a = groups_(d['Applies to']);
  if (!a.length || a.indexOf('all') >= 0) return true;
  const g = groups_(st.Groups);
  return a.some(x => g.indexOf(x) >= 0);
}
function byCategoryThenCode_(a, b) {
  const ca = CATEGORIES.indexOf(String(a.Category || a.category || 'Other').trim());
  const cb = CATEGORIES.indexOf(String(b.Category || b.category || 'Other').trim());
  if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
  return String(a.Code || a.code).localeCompare(String(b.Code || b.code), undefined, { numeric: true });
}
function norm_(v) { return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function num_(v, d) { if (v === '' || v === null || v === undefined) return d; const n = Number(v); return isFinite(n) ? n : d; }
function bool_(v) { return v === true || /^(true|yes|y|1)$/i.test(String(v).trim()); }
function sha_(str) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function dayKey_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function toKey_(v) {
  if (!v) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : dayKey_(v);
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}
function dnum_(key) { const p = key.split('-').map(Number); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000); }
function fromDnum_(n) { return Utilities.formatDate(new Date(n * 86400000), 'UTC', 'yyyy-MM-dd'); }
function addDays_(key, n) { return fromDnum_(dnum_(key) + n); }
function addMonths_(key, months) {
  const p = key.split('-').map(Number);
  let y = p[0], m = p[1] + months;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + Math.min(p[2], dim)).slice(-2);
}
function short_(key) { return key ? Utilities.formatDate(new Date(dnum_(key) * 86400000), 'UTC', 'd/MM/yy') : ''; }
function nice_(key) { return key ? Utilities.formatDate(new Date(dnum_(key) * 86400000), 'UTC', 'EEE d MMM') : ''; }
