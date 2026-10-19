/**
 * Ranfurlie Safety - read & sign backend.
 *
 * Standalone Google Apps Script project ("Ranfurlie Safety") that runs the
 * "Ranfurlie Safety Register" Google Sheet (SHEET_ID below).
 *   1. Paste this file over Code.gs, save.
 *   2. Run setup() once and approve access.
 *   3. Deploy > New deployment > Web app: Execute as Me, Who has access: Anyone.
 *      Put the /exec URL into docs/config.js on GitHub.
 * Manual runs from the editor: syncNow, previewReminders, sendRemindersNow, setup.
 *
 * What it does
 *   - Every 10 min: picks up files dropped into the Drive Library folder, gives them a code,
 *     shares them view-only by link, bumps the version when a file changes, rebuilds the
 *     Matrix tab and the dashboard data files.
 *   - Web API for the staff page: library list, sign-in by name or personal link, sign a document
 *     (drawn signature saved to the private Signatures folder, row added to Register).
 *   - 7am on reminder days: tags staff in Slack (incoming webhook) when sign-offs are due or overdue.
 *   - Shed keys (docs/keys.html): staff take a weekend key (key SOP must be current, terms ticked,
 *     drawn signature) and scan it back in. Keys and Key Log tabs. From 10am Tuesday any key still
 *     out is called out in Slack, then again each weekday until it is back. Lost keys alert at once.
 * Manual runs for keys: setupKeys, previewKeyCallout.
 *   - Monthly H&S inspections (docs/inspection.html, dashboard docs/inspection-dashboard.html): staff answer
 *     every line Yes / No / N/A on their phone (No = description + photos, N/A = reason), sign and submit.
 *     Inspections, Inspection Defects and Inspection Answers tabs are the register. Defects are closed out and
 *     inspections reviewed from the dashboard (name, note, signature). Slack summary on submit; reminder when due.
 * Manual runs for inspections: setupInspections, previewInspectionReminder.
 */

const TZ = 'Australia/Melbourne';
const SHEET_ID = '1VFFfJz8YBAOjSDBJ2odzth0TTt0NODHoyzJzMbCSksE';
let BOOK_ = null;
function book_() { return BOOK_ || (BOOK_ = SpreadsheetApp.openById(SHEET_ID)); }
const TAB = {
  MATRIX: 'Matrix', REGISTER: 'Register', STAFF: 'Staff', DOCS: 'Documents', QUIZ: 'Questions',
  REMINDERS: 'Reminders', SETTINGS: 'Settings', README: 'Read me',
  KEYS: 'Keys', KEYLOG: 'Key Log',
  PRESTARTS: 'Pre-starts', BOOKINGS: 'Machine Bookings', MACHINES: 'Machines'
};
const HEAD = {
  Register: ['Signed at', 'Receipt', 'Staff', 'Code', 'Document', 'Version', 'Risk', 'Valid until', 'Read time (sec)', 'Signature', 'Declaration', 'Device', 'Knowledge check'],
  Staff: ['Name', 'Slack ID', 'Role', 'Site', 'Groups', 'PIN', 'Active', 'Start date', 'Notes', 'TurfDog name'],
  'Pre-starts': ['Done at', 'Staff', 'Machine', 'Checklist', 'Items', 'Issues', 'On the board', 'Logged at'],
  'Machine Bookings': ['Date', 'Shift', 'Task', 'Staff', 'Machine', 'Pre-start', 'Pre-start at', 'SWP', 'SWP status', 'Reminders', 'Last reminder', 'Notes'],
  Machines: ['Machine', 'Model', 'Type', 'SWP', 'Pre-start', 'Last booked', 'Last pre-start', 'Notes'],
  Documents: ['Code', 'Title', 'Category', 'Risk', 'Applies to', 'Renew (months)', 'Read time (sec)', 'Summary', 'Status', 'Version', 'Updated', 'File ID', 'File name', 'Link', 'Added', 'Notes'],
  Questions: ['Code', 'No.', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer', 'Why'],
  Reminders: ['Sent at', 'Staff', 'Slack ID', 'Overdue', 'Due', 'Codes'],
  Settings: ['Key', 'Value', 'What it does'],
  Keys: ['Key', 'Description', 'Active', 'Status', 'With', 'Since', 'Due back', 'Notes'],
  'Key Log': ['Out at', 'Receipt', 'Key', 'Staff', 'Due back', 'Key SOP', 'Agreed to', 'Signature', 'Device', 'Returned at', 'Returned by', 'Status', 'Callouts', 'Last callout', 'Lost report', 'Notes']
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
  ['EASY_READ_FOLDER_ID', '1Lxh8A1-jVhK9uF0gHaZWKUAPIQpgV21h', 'Private folder for the phone-friendly copies of each document (made automatically)'],
  ['PIN_SALT', '', 'Do not change - makes each person\'s personal link (filled in by setup)'],
  ['KEY_PAGE_URL', 'https://andranf.github.io/ranfurlie-safety/keys.html', 'Shed key page - the wall QR codes open this (?out to take a key, ?in to return one)'],
  ['KEY_SWP_CODE', 'OHS-34', 'Key SOP staff must have signed (and be current on) before they can take a key'],
  ['KEY_SWP_REQUIRED', 'TRUE', 'TRUE = no key until the key SOP is signed. FALSE = allow it, but the Key Log shows NOT SIGNED'],
  ['KEY_DUE_DAY', 'Tue', 'Keys are due back by this day (the next one after the key is taken)'],
  ['KEY_DUE_TIME', '10:00', 'Due back time (24 h). Keys still out are called out in Slack from this time'],
  ['KEY_REPEAT_DAILY', 'TRUE', 'Call out an unreturned key again at the due time each weekday until it is scanned back in'],
  ['KEY_ALERT_CC', 'U06BCCG4HT9 U06NBNSR9LG U06FJ0J1RH8', 'Slack IDs tagged on overdue and missing key posts (Andrew, Ben, Neil)'],
  ['KEY_SLACK_WEBHOOK_URL', '', 'Webhook for key posts - leave blank to use SLACK_WEBHOOK_URL'],
  ['INSP_PAGE_URL', 'https://andranf.github.io/ranfurlie-safety/inspection.html', 'Monthly H&S inspection page (staff)'],
  ['INSP_DASH_URL', 'https://andranf.github.io/ranfurlie-safety/inspection-dashboard.html', 'Inspection dashboard (linked in Slack posts)'],
  ['INSP_EVERY_DAYS', 31, 'An area is due for its next inspection this many days after the last one'],
  ['INSP_REMIND', 'TRUE', 'Post a Slack reminder at 7am on weekdays when an area is due, then weekly until it is done'],
  ['INSP_ALERT_CC', 'U06BCCG4HT9 U06NBNSR9LG U06FJ0J1RH8', 'Slack IDs tagged on High defects and overdue inspections (Andrew, Ben, Neil)'],
  ['INSP_SLACK_WEBHOOK_URL', '', 'Webhook for inspection posts - leave blank to use SLACK_WEBHOOK_URL'],
  ['INSP_PHOTO_FOLDER_ID', '', 'Drive folder for defect photos (made automatically, view-by-link so the dashboard can show them)'],
  ['INSP_GO_LIVE', '', 'Inspections started (filled in automatically). The first one is due a week after this'],
  ['PRESTART_KEY', '', 'Key the hourly TurfDog pre-start task sends with its data (filled in by setupPrestart). Keep it private'],
  ['PRESTART_SHIFT_FROM', '1=06:00, 2=10:00, 3=12:00', 'Chase pre-starts for machines on each TurfDog shift from this time (24 h)'],
  ['PRESTART_ESCALATE_AFTER', 2, 'From this reminder on, PRESTART_CC are tagged too (the first post counts as reminder 1)'],
  ['PRESTART_CC', 'U06FJ0J1RH8 U06NBNSR9LG', 'Slack IDs tagged when a pre-start is still not done (Neil, Ben)'],
  ['PRESTART_SKIP_TASKS', 'Workshop', 'TurfDog tasks where a booked machine needs no pre-start, e.g. servicing it in the workshop (comma list)'],
  ['PRESTART_MATCH', 'type', 'type = a pre-start on another machine of the same Type (Machines tab) counts. exact = it must be the booked machine'],
  ['PRESTART_SWP', 'TRUE', 'Once a day, tag people booked on a machine whose SWP they still have to sign (or is overdue)'],
  ['PRESTART_SUMMARY_AFTER', '13:30', 'The first run after this time sends Andrew the day\'s pre-start summary (once a day)'],
  ['FOCUS_QUEUE', 'OHS-04, OHS-06, SWP-02, SWP-07, OHS-01, SWP-01, OHS-31, OHS-28, OHS-11, OHS-13, OHS-05, OHS-19, OHS-27, OHS-32, SWP-03, SWP-04, SWP-05, SWP-06, SWP-08, OHS-34, OHS-35', 'Documents pushed in #ohs one at a time, in this order: everyone it applies to is tagged each weekday until they have all signed, then the next one goes up. Documents everyone has already signed are skipped'],
  ['NEW_DOC_REVIEW', 'TRUE', 'New documents (and new versions) dropped in the Drive Library wait as "To review" until the daily Claude check passes them; FALSE = they go live straight away'],
  ['FOCUS_SKIP', '', 'Staff left out of the #ohs push for now, e.g. on leave (comma list of names)'],
  ['FOCUS_CC_FROM', 3, 'From this day of chasing the same document, Neil and Ben are tagged too (FOCUS_CC)'],
  ['FOCUS_CC', 'U06FJ0J1RH8 U06NBNSR9LG', 'Slack IDs tagged on the #ohs push from day FOCUS_CC_FROM (Neil, Ben)']
];

// TurfDog machines (equipment list, 13 Oct 2026) -> the SWP that covers them. Machine = the name exactly as TurfDog shows it.
// Type: a pre-start on any machine of the same Type counts (Settings PRESTART_MATCH). Pre-start FALSE = never chased.
// Machines added to TurfDog later are added automatically on the first day they're booked.
const SEED_MACHINES = [
  ["1000L Tank 1", "Silvan 1000L Tank", "1000L Tank", "", true, "", "", ""],
  ["1000L Tank 2", "Silvan 1000L Tank", "1000L Tank", "", true, "", "", ""],
  ["2000L Tank 1", "Silvan 2000L Tank", "2000L Tank", "", true, "", "", ""],
  ["200L Tank 1", "Silvan 200L Tank", "200L Tank", "", true, "", "", ""],
  ["350W 1", "Electric Chainsaw Sharpener 350W", "350W", "", true, "", "", ""],
  ["5800", "Toro Multi Pro 5800-D", "5800", "", true, "", "", ""],
  ["600L Spray Tank 1", "Silvan 600L Spray Tank", "600L Spray Tank", "", true, "", "", ""],
  ["600L Spray Tank 2", "Silvan 600L Spray Tank", "600L Spray Tank", "", true, "", "", ""],
  ["Air Compressor 1", "McMillan Air Compressor", "Air Compressor", "", true, "", "", ""],
  ["Air2G2 Probe 1", "Sustainable Machinery Air2G2 Probe", "Air2G2 Probe", "", true, "", "", ""],
  ["Amstel Zero Turn 1", "Victa ZTX", "Amstel Zero Turn", "", true, "", "", ""],
  ["Autonomous picker 1", "FJDynamics Autonomous picker", "Autonomous picker", "", true, "", "", ""],
  ["Backpack Blower 1", "Husqvarna Backpack Blower", "Backpack Blower", "", true, "", "", ""],
  ["Backpack Blower 1", "Kress Backpack Blower", "Backpack Blower", "", true, "", "", ""],
  ["Backpack Blower 2", "Kress Backpack Blower", "Backpack Blower", "", true, "", "", ""],
  ["Backpack Sprayer 15L 1", "Milwaukee Sprayer 15L", "Backpack Sprayer 15L", "", true, "", "", ""],
  ["Backpack Sprayer 15L 2", "Milwaukee Sprayer 15L", "Backpack Sprayer 15L", "", true, "", "", ""],
  ["Backpack Sprayer 15L 3", "Milwaukee Sprayer 15L", "Backpack Sprayer 15L", "", true, "", "", ""],
  ["Backpack Sprayer 15L 4", "Milwaukee Sprayer 15L", "Backpack Sprayer 15L", "", true, "", "", ""],
  ["Blower 1", "Toro Pro Force 44552", "Blower", "", true, "", "", ""],
  ["Blower 2", "Toro Pro Force 44552", "Blower", "", true, "", "", ""],
  ["Boom Kleen 1", "Barmac Boom Kleen", "Boom Kleen", "", true, "", "", ""],
  ["Brandt Mechanic Works 1", "John Deere Brandt Mechanic Works", "Brandt Mechanic Works", "", false, "", "", ""],
  ["Bucket Loader 1", "Titan Bucket Loader", "Bucket Loader", "", true, "", "", ""],
  ["Bunker Rake 1", "Toro Sand Pro 3040", "Bunker rake", "SWP-08", true, "", "", "Sand Pro 3040 - check SWP-08 covers it"],
  ["Dozer blade 1", "Melbourne Tractor Dozer blade", "Dozer blade", "", true, "", "", ""],
  ["Drainage Sand 1", "Sandbelt Industries Drainage Sand", "Drainage Sand", "", false, "", "", ""],
  ["Drop saw 1", "Ozita Drop saw", "Drop saw", "", true, "", "", ""],
  ["Edger 1", "Atom Edger", "Edger", "", true, "", "", ""],
  ["Electric Blower 1", "Milwaukee Electric Blower", "Electric Blower", "", true, "", "", ""],
  ["Electric Blower 2", "Milwaukee Electric Blower", "Electric Blower", "", true, "", "", ""],
  ["Electric Blower Single 1", "Milwaukee E-Blower Single", "Electric Blower Single", "", true, "", "", ""],
  ["Electric Blower Single 2", "Milwaukee E-Blower Single", "Electric Blower Single", "", true, "", "", ""],
  ["Electric Whipper Snipper 1", "Milwaukee Electric Whipper Snipper", "Electric Whipper Snipper", "", true, "", "", ""],
  ["ENZED Repair Works 1", "ENZED Repair Works", "ENZED Repair Works", "", false, "", "", ""],
  ["Excavator 1", "Kobelco SK35SR-7", "Excavator", "SWP-07", true, "", "", ""],
  ["Fert Spreader 1", "Gamberini Fert Spreader", "Fert Spreader", "", true, "", "", ""],
  ["Flowsmart 1", "ICL H2Pro Flowsmart", "Flowsmart", "", false, "", "", ""],
  ["Fly Mow 1", "Toro HoverPro 450", "Fly Mow", "", true, "", "", ""],
  ["Gas Gun 1", "Hunter Gas Gun", "Gas Gun", "", true, "", "", ""],
  ["GPS/Rover Kit 1", "GPS/Rover Kit", "GPS/Rover Kit", "", false, "", "", ""],
  ["Green Sprayer 1", "BA Pumps GK75 Greens Keeper", "Green Sprayer", "", true, "", "", ""],
  ["Greens Mower - Electric Walk Behind 1", "Toro Greensmaster eFlex 1021", "Greens Mower - Electric Walk Behind", "", true, "", "", ""],
  ["Greens Mower - Walk Behind 1", "Toro Greensmaster Flex 2120", "Greens Mower - Walk Behind", "", true, "", "", ""],
  ["Greens Mower - Walk Behind 2", "Toro Greensmaster Flex 2120", "Greens Mower - Walk Behind", "", true, "", "", ""],
  ["Greens Mower - Walk Behind 3", "Toro Greensmaster Flex 2120", "Greens Mower - Walk Behind", "", true, "", "", ""],
  ["Greens Mower - Walk Behind 4", "Toro Greensmaster Flex 2120", "Greens Mower - Walk Behind", "", true, "", "", ""],
  ["Greens Mower - Walk Behind 5", "Toro Greensmaster Flex 2120", "Greens Mower - Walk Behind", "", true, "", "", ""],
  ["Greens Mower - Walk Behind 6", "Toro Greensmaster Flex 2120", "Greens Mower - Walk Behind", "", true, "", "", ""],
  ["Greens Roller 1", "Tru-Turf RE50", "Greens Roller", "", true, "", "", ""],
  ["Greens Roller 2", "Tru-Turf RE50", "Greens Roller", "", true, "", "", ""],
  ["Greensmower Trailers 1", "Toro Greensmower Trailers", "Greensmower Trailers", "", true, "", "", ""],
  ["Greensmower Trailers 2", "Toro Greensmower Trailers", "Greensmower Trailers", "", true, "", "", ""],
  ["Groundsmaster 4300 1", "Toro Groundsmaster 4300-D", "Groundsmaster 4300", "", true, "", "", ""],
  ["GS3 Ball 1", "Deacon GS3 Ball", "GS3 Ball", "", false, "", "", ""],
  ["Handheld Sprayer 7L 1", "Milwaukee Sprayer 7L", "Handheld Sprayer 7L", "", true, "", "", ""],
  ["Hedge Trimmer 1", "Stihl Hedge Trimmer", "Hedge Trimmer", "", true, "", "", ""],
  ["Hedge Trimmer 24\" 1", "Milwaukee Hedge trimmer 24\"", "Hedge Trimmer 24\"", "", true, "", "", ""],
  ["Hoist", "Molnar Hoist", "Hoist", "", true, "", "", ""],
  ["JD Greens Mower 1", "John Deere 2550 PrecisionCut", "JD Greens Mower", "SWP-05", true, "", "", ""],
  ["JD Sprayer 1", "John Deere HD200 Sprayer on ProGator 2030A", "JD Sprayer", "", true, "", "", ""],
  ["Kress charging station 1", "Kress charging station", "Kress charging station", "", false, "", "", ""],
  ["L5740 1", "Kubota L5740 HST", "L5740", "", true, "", "", ""],
  ["Locator Kit 1", "Leica Locator Kit", "Locator Kit", "", false, "", "", ""],
  ["Massey FL 2850 1", "Massey Ferguson 2850M FL loader", "Massey FL 2850", "", true, "", "", ""],
  ["Milwaukee Chainsaw 1", "Milwaukee Chainsaw", "Milwaukee Chainsaw", "", true, "", "", ""],
  ["Milwaukee Cut-off 1", "Milwaukee Cut-off", "Milwaukee Cut-off", "", true, "", "", ""],
  ["Milwaukee Hole Dozer 1", "Milwaukee Hole Dozer", "Milwaukee Hole Dozer", "", true, "", "", ""],
  ["Milwaukee Polisher 1", "Milwaukee Polisher", "Milwaukee Polisher", "", true, "", "", ""],
  ["Misc 1", "Ranfurlie Misc", "Misc", "", false, "", "", ""],
  ["Moisture Probe 1", "Field Scout Moisture Probe", "Moisture Probe", "", false, "", "", ""],
  ["Moisture Probe 2", "Field Scout TDR250", "Moisture Probe", "", false, "", "", ""],
  ["Mower - Walk Behind 1", "Kress / Victa / Masport walk-behind mower", "Mower - Walk Behind", "", true, "", "", ""],
  ["Per 4 Max 1", "Floratine Per 4 Max", "Per 4 Max", "", false, "", "", ""],
  ["Petro Vibratory Compactor 1", "Wacker Neuson Vibratory Compactor", "Petro Vibratory Compactor", "", true, "", "", ""],
  ["Petrol Roller 1", "Tru Turf Petrol Roller", "Petrol Roller", "", true, "", "", ""],
  ["Petrol Tiller 1", "Husqvarna Petrol Tiller", "Petrol Tiller", "", true, "", "", ""],
  ["Pole Saw Attachment 1", "Milwaukee Pole Saw Attachment", "Pole Saw Attachment", "", true, "", "", ""],
  ["Power Head 1", "Milwaukee Power Head", "Power Head", "", true, "", "", ""],
  ["ProCore 648s 1", "Toro ProCore 648s", "ProCore 648s", "", true, "", "", ""],
  ["Quik-Lok Rubber Broom 1", "Milwaukee Quik-Lok Rubber Broom", "Quik-Lok Rubber Broom", "", true, "", "", ""],
  ["Range Pro 100 Ball collector 1", "Toro Range Pro 100", "Range Pro 100 Ball collector", "", true, "", "", ""],
  ["Reciprocating Saw 1", "Milwaukee Reciprocating Saw", "Reciprocating Saw", "", true, "", "", ""],
  ["Reelmaster 5010 Fairway Mower 1", "Toro Reelmaster 5010-H", "Reelmaster 5010 Fairway Mower", "SWP-06", true, "", "", ""],
  ["Reelmaster 5010 Fairway Mower 2", "Toro Reelmaster 5010-H", "Reelmaster 5010 Fairway Mower", "SWP-06", true, "", "", ""],
  ["Reelmaster 5010 Fairway Mower 3", "Toro Reelmaster 5010-H", "Reelmaster 5010 Fairway Mower", "SWP-06", true, "", "", ""],
  ["Repair Works 1", "Melbourne Tractors / Toro Repair Works", "Repair Works", "", false, "", "", ""],
  ["RMS Kit 1", "Turf Troniq RMS Kit", "RMS Kit", "", false, "", "", ""],
  ["Robotic mower 1", "Kress Robotic mower", "Robotic mower", "", true, "", "", ""],
  ["Rough Mower 1", "Toro Rough Mower", "Rough Mower", "", true, "", "", ""],
  ["Sand 1", "Sandbelt Industries Sand", "Sand", "", false, "", "", ""],
  ["SandPro 5040 1", "Toro Sand Pro 5040", "Bunker rake", "SWP-08", true, "", "", ""],
  ["Seeder 1", "1st Products UA60 Aera-Vator", "Seeder", "", true, "", "", ""],
  ["Seeder Shaft 1", "Aust Agri Seeder Shaft", "Seeder Shaft", "", true, "", "", ""],
  ["Shole Holecutter System 1", "Tacit Shole Holecutter System", "Shole Holecutter System", "", true, "", "", ""],
  ["Shole Holecutter System 2", "Tacit Shole Holecutter System", "Shole Holecutter System", "", true, "", "", ""],
  ["Slasher VIN 1831 1", "Silvan Slasher", "Slasher VIN 1831", "", true, "", "", ""],
  ["Small Verti-Drain 1", "Redexim Small Verti-Drain", "Small Verti-Drain", "", true, "", "", ""],
  ["Sod Cutter 1", "Ryan Jr. Sod Cutter", "Sod Cutter", "", true, "", "", ""],
  ["Spray Sheet 1", "Spray Log Spray Sheet", "Spray Sheet", "", false, "", "", ""],
  ["Spraying 1", "Chemical mixing area SOP", "Spraying", "", false, "", "", ""],
  ["Stihl Invoices 1", "Stihl Invoices", "Stihl Invoices", "", false, "", "", ""],
  ["Surrounds Mower 1", "John Deere 8000A E-Cut Hybrid", "Surrounds Mower", "SWP-04", true, "", "", ""],
  ["Terra Rake 2.3m 1", "Wiedenmann Terra Rake 230", "Terra Rake 2.3m", "", true, "", "", ""],
  ["Top Dresser 1", "Turfco WideSpin 1550", "Top Dresser", "", true, "", "", ""],
  ["Toro 93-2242 1", "Oil Filter & Head Assy - Hyd Toro 93-2242", "Toro 93-2242", "", false, "", "", ""],
  ["Toro Greens Mower 1", "Toro Greensmaster eTriFlex 3370", "Toro Greens Mower", "SWP-03", true, "", "", ""],
  ["Toro Greens Mower 2", "Toro Greensmaster eTriFlex 3370", "Toro Greens Mower", "SWP-03", true, "", "", ""],
  ["Toro Tees Mower 1", "Toro Greensmaster 3150-Q", "Toro Tees Mower", "", true, "", "", ""],
  ["Toro Workman 1", "Toro Workman", "Workman", "SWP-01", true, "", "", ""],
  ["Toro Workman 2", "Toro Workman", "Workman", "SWP-01", true, "", "", ""],
  ["Track Loader 1", "New Holland C227", "Track Loader", "SWP-02", true, "", "", ""],
  ["Tractor 1", "John Deere 3520", "Tractor", "", true, "", "", ""],
  ["Tractor 2", "John Deere 3520", "Tractor", "", true, "", "", ""],
  ["Trailer 1", "Dean / Roshar Trailer", "Trailer", "", true, "", "", ""],
  ["Trailer 2", "Dean Trailer", "Trailer", "", true, "", "", ""],
  ["Trailer 3", "Dean Trailer", "Trailer", "", true, "", "", ""],
  ["Trenching Machine 1", "TrenchMaster 150", "Trenching Machine", "", true, "", "", ""],
  ["Turf Pro Auto Mower 500 1", "Toro Turf Pro 500", "Turf Pro Auto Mower 500", "", true, "", "", ""],
  ["turfRad sensor 1", "Toro TurfRad", "turfRad sensor", "", false, "", "", ""],
  ["UMX Heavy Duty 1", "Yamaha UMX Heavy Duty", "UMX Heavy Duty", "SWP-01", true, "", "", ""],
  ["Ute 1", "Mitsubishi Triton GLX", "Ute", "", true, "", "", ""],
  ["Verti Drain 1", "Redexim Verti-Drain 7215", "Verti Drain", "", true, "", "", ""],
  ["Verti Drain 2", "Redexim Verti-Drain 7215", "Verti Drain", "", true, "", "", ""],
  ["Water Pump 1", "Honda Water Pump", "Water Pump", "", true, "", "", ""],
  ["Welder 1", "Cigweld Welder", "Welder", "", true, "", "", ""],
  ["Wet/Dry Vacuum 1", "Milwaukee Wet/Dry Vacuum", "Wet/Dry Vacuum", "", true, "", "", ""],
  ["Whipper Snipper 1", "Kress / Stihl Whipper Snipper", "Whipper Snipper", "", true, "", "", ""],
  ["Whipper Snipper 2", "Stihl Whipper Snipper", "Whipper Snipper", "", true, "", "", ""],
  ["Whipper Snipper 3", "Stihl Whipper Snipper", "Whipper Snipper", "", true, "", "", ""],
  ["Whipper Snipper 4", "Stihl Whipper Snipper", "Whipper Snipper", "", true, "", "", ""],
  ["Whipper Snipper 5", "Stihl Whipper Snipper", "Whipper Snipper", "", true, "", "", ""],
  ["Whipper Snipper 6", "Stihl Whipper Snipper", "Whipper Snipper", "", true, "", "", ""],
  ["Workman GTX 1", "Toro Workman GTX Electric 07043", "Workman", "SWP-01", true, "", "", ""],
  ["Workman GTX 2", "Toro Workman GTX Electric 07043", "Workman", "SWP-01", true, "", "", ""],
  ["Workman GTX 3", "Toro Workman GTX Lithium 07433TC", "Workman", "SWP-01", true, "", "", ""],
  ["Workman GTX 4", "Toro Workman GTX Lithium 07433TC", "Workman", "SWP-01", true, "", "", ""],
  ["Workman MDX 1", "Toro Workman MDX", "Workman", "SWP-01", true, "", "", ""],
  ["Workman MDX 2", "Toro Workman MDX", "Workman", "SWP-01", true, "", "", ""],
  ["Workman MDX 3", "Toro Workman MDX", "Workman", "SWP-01", true, "", "", ""],
  ["Workman MDX 4", "Toro Workman MDX", "Workman", "SWP-01", true, "", "", ""],
  ["Workman MDX 5", "Toro Workman MDX", "Workman", "SWP-01", true, "", "", ""],
  ["Z-trac 1", "John Deere Z997R", "Z-trac", "", true, "", "", ""]
];

const SEED_KEYS = [
  ['Key #2', 'Weekend spare shed key', true, '', '', '', '', ''],
  ['Key #3', 'Weekend spare shed key', true, '', '', '', '', ''],
  ['Key #4', 'Weekend spare shed key', true, '', '', '', '', '']
];

const SEED_STAFF = [
  ['Andrew Anderson', 'U06BCCG4HT9', 'Course Superintendent', 'Ranfurlie / Amstel', 'All, Crew, Spray, Plant, Chainsaw', '', true, '', ''],
  ['Ben Hartley', 'U06NBNSR9LG', 'Course Operations', 'Ranfurlie / Amstel', 'All, Crew, Spray, Plant, Chainsaw, Workshop', '', true, '', ''],
  ['Neil Harper', 'U06FJ0J1RH8', 'Crew Lead', 'Ranfurlie', 'All, Crew, Spray, Plant, Chainsaw', '', true, '', ''],
  ['Kyle Craig', 'U06FWK6ND5X', 'Greenkeeper', 'Ranfurlie', 'All, Crew, Plant', '', true, '', ''],
  ['Nathan Drew', 'U06FJ0J5DS6', 'Greenkeeper', 'Ranfurlie', 'All, Crew, Plant', '', true, '', ''],
  ['Nathan Ferguson', 'U06H9J0LBEC', 'Greenkeeper', 'Ranfurlie', 'All, Crew, Plant', '', true, '', ''],
  ['Nicholas Debrincat', 'U07QSB7MDK5', 'Greenkeeper', 'Ranfurlie', 'All, Crew', '', true, '', ''],
  ['Brodie Macdonald', 'U0839HLQA8G', 'Greenkeeper', 'Ranfurlie', 'All, Crew, Plant', '', true, '', ''],
  ['Flynn Sinclair', 'U08C1SVFSFR', 'Greenkeeper', 'Ranfurlie', 'All, Crew, Plant', '', true, '', ''],
  ['James King', 'U08D57N6JSC', 'Greenkeeper', 'Ranfurlie', 'All, Crew, Plant', '', true, '', ''],
  ['Joshua Cope', 'U08ENB28AQZ', 'Greenkeeper', 'Ranfurlie', 'All, Crew, Plant', '', true, '', ''],
  ['Mitch Mahoney', 'U08K55E3QJU', 'Greenkeeper', 'Ranfurlie', 'All, Crew, Plant', '', true, '', ''],
  ['Katherine Duong', 'U08M3KGRHJ6', 'Greenkeeper', 'Ranfurlie', 'All, Crew, Plant', '', true, '', ''],
  ['Samuel Cope', 'U09LN1Q8QH2', 'Greenkeeper', 'Ranfurlie', 'All, Crew, Plant', '', true, '', ''],
  ['Tremayne Gallagher', 'U09V6AVPUDP', 'Greenkeeper', 'Amstel', 'All, Crew, Plant', '', true, '', ''],
  ['Michael Kruse', 'U07QSB7HVM1', 'Grounds Person', 'Ranfurlie', 'All, Crew, Plant', '', true, '', '']
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
  ['OHS-32', 'Bullying, Harassment & Discrimination', 'Medium', 'All', 'What bullying, sexual harassment, discrimination and victimisation are, how to report, and what happens next. Includes a knowledge check.'],
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

// Knowledge checks: code, no., question, options A-D, answer letter, why (shown after answering).
// Staff answer every question correctly (wrong ones come back round) before they can sign.
const SEED_QUESTIONS = [
  ['OHS-32', 1, 'Which of these is workplace bullying?',
    'Your supervisor tells you your bunker edges are not up to standard and shows you how to fix them',
    'A leading hand mocks a greenkeeper in front of the crew most days and keeps giving him the worst jobs as payback',
    'You are rostered on for a weekend under the fair rotation',
    'A one-off disagreement about which mowing pattern to use',
    'B', 'Bullying is repeated, unreasonable behaviour that creates a risk to health and safety. Fair feedback, fair rostering and one-off disagreements are not bullying.'],
  ['OHS-32', 2, 'Someone posts a crude sexual meme in the crew group chat. Nobody complains. Is that OK?',
    'Yes - nobody complained about it',
    'Yes - it was not aimed at anyone',
    'No - it can still be sexual harassment',
    'Only if it is posted in work hours',
    'C', 'Work group chats are part of the workplace, day or night. People often stay quiet because they feel they cannot object.'],
  ['OHS-32', 3, 'Does sexual harassment have to happen more than once before it counts?',
    'Yes - it has to be a pattern',
    'No - a single incident can be sexual harassment',
    'Only if the person said "stop" the first time',
    'Only if it is physical',
    'B', 'Unlike bullying, one incident is enough. It does not have to be physical, and the person does not have to have said stop.'],
  ['OHS-32', 4, 'While you are raking a bunker, a golfer swears at you and hits a ball towards you. What should you do?',
    'Shout back so they know it is not OK',
    'Ignore it - golfers are part of the job',
    'Get safe, radio your supervisor, report it',
    'Confront them when they reach the tee',
    'C', 'Abuse and aggression from golfers or members is never part of the job. Get safe, do not escalate, and report it so the Club can follow up.'],
  ['OHS-32', 5, 'After Tom reports a leading hand, the crew stops including him at smoko and he gets every 5am bunker job. What is this?',
    'Reasonable management action',
    'Normal crew dynamics and banter',
    'Victimisation, which is unlawful',
    'A fair result of complaining',
    'C', 'Treating someone badly because they made a complaint is victimisation. It is unlawful and treated as serious misconduct.'],
  ['OHS-32', 6, 'Which of these is reasonable management action, and NOT bullying?',
    'Raising missed pre-starts privately and agreeing a plan',
    'Calling someone "useless" over the radio to the crew',
    'Cutting someone\'s overtime because they complained',
    'Changing someone\'s tasks again and again so they fail',
    'A', 'Feedback and performance management are fine when they are done fairly and respectfully - in private, specific, and with support.'],
  ['OHS-32', 7, 'You see a co-worker cornering an apprentice in the shed and commenting on her body. She looks uncomfortable. What is a good response?',
    'Stay out of it - it is not your business',
    'Interrupt safely, check she is OK, report it',
    'Film it and share it in the crew group chat',
    'Wait and see whether it happens again',
    'B', 'Bystanders can stop harassment. Use the 5 Ds - direct, distract, delegate, delay, document - and only act if it is safe.'],
  ['OHS-32', 8, 'Who can you report bullying or harassment to?',
    'Only your direct supervisor, nobody else',
    'Only the police, never anyone at work',
    'Any manager you trust, or an outside agency',
    'Nobody unless you have a witness or proof',
    'C', 'You can use any of these. You do not need proof or witnesses, and if the problem is your supervisor, go around them.'],
  ['OHS-32', 9, 'A new apprentice is sent to the shop for "a long weight", filmed, and the video is shared in the crew chat. The jokes go on for weeks. What is this?',
    'A harmless tradition',
    'Fine, as long as the apprentice laughs along',
    'Hazing that can be bullying - it is not allowed here',
    'OK, as long as nobody films it',
    'C', 'Initiations and pranks on new starters are banned. Repeated humiliation of a junior worker is bullying, and laughing along does not mean they are OK with it.'],
  ['OHS-32', 10, 'At the end-of-season function at the pub, after hours, a staff member keeps putting his arm around a colleague and commenting on her body after she moves away. Does this policy apply?',
    'No - it happened after work hours',
    'No - it was not at the Club itself',
    'Yes - work functions are covered',
    'Only if a manager saw it happen',
    'C', 'Anything connected to work is covered, including functions, travel and group chats. Unwelcome touching and comments about someone\'s body are sexual harassment, and touching can be a crime.'],
  ['OHS-32', 11, 'After a greenkeeper tells her supervisor she is pregnant, he takes her off spraying and overtime "for her own good" without talking to her. What is the issue?',
    'Nothing - he is just being considerate',
    'It may be discrimination - he should ask her',
    'It is reasonable management action',
    'It only matters if she complains',
    'B', 'Decisions based on assumptions about pregnancy can be discrimination. Real safety risks are assessed and managed with the worker, not decided for her.'],
  ['OHS-32', 12, 'A complaint is investigated but cannot be proven. What does that mean?',
    'It was false, so the complainant is disciplined',
    'Not proven is not the same as a false complaint',
    'The accused can now take action against them',
    'The person who complained cannot report again',
    'B', 'Genuine complaints are protected even if they cannot be proven. Payback against the person who complained would be victimisation.']
];

const README_LINES = [
  'Ranfurlie Safety Register',
  '',
  "Adding documents: drop the file (PDF, Word or Google Doc) into the matching sub-folder of 'Ranfurlie Safety > Library'. Within 10 minutes it gets a code, appears on the staff page and is added to the Documents tab. New machinery SWPs get a Risk and 'Applies to' guessed from the name - check them.",
  "Seeded documents: start the file name with the code (e.g. 'OHS-08 Spill Response.pdf') or use the exact title, and it links to that row.",
  'Updating a document: upload a new version over the old file in Drive (Manage versions), or upload a new file starting with the same code. Everyone re-signs the new version.',
  "Risk: High / Medium / Low sets how often it is re-signed (Settings: 6 / 12 / 24 months) and how long it must be open before signing. Override one document with 'Renew (months)' or 'Read time (sec)'.",
  'Applies to: All = every active staff member. Otherwise it matches the Groups on the Staff tab: Crew, Spray, Plant, Chainsaw, Workshop. Use commas for more than one.',
  "Knowledge checks: add questions on the Questions tab (one row per question: the document Code, No., the question, up to four options, the Answer letter and a short 'Why'). Staff must answer every question correctly - wrong ones come back round with the explanation - before they can sign. The Register's 'Knowledge check' column shows how many they got right first time.",
  'Retire a document: set Status to Retired. It drops off the staff page and nobody is chased for it.',
  "Guests: put 'Guest' in someone's Groups (e.g. a manager reviewing a module). They only get documents whose Applies to includes 'Guest', and they are never tagged in Slack.",
  'New staff: add a row on the Staff tab with their Slack ID, Groups, Active = TRUE and a Start date. Their first due dates count from the start date.',
  'Signing in: no PIN. Staff pick their name once and their phone remembers them. Each Slack reminder carries their own link that opens straight to their list. Every signature records the drawn signature, time, read time and device.',
  'Reminders: 7am on the days in Settings. Staff are tagged in Slack from 14 days before a sign-off falls due, weekly while it is outstanding, and straight away when it goes overdue.',
  'Matrix: rebuilt automatically. Green = current, amber = due soon or still to sign, red = overdue, grey = not required.',
  "Manual runs: open the 'Ranfurlie Safety' Apps Script project and run syncNow, previewReminders or sendRemindersNow (results show in the execution log).",
  '',
  'SHED KEYS',
  "Keys tab: one row per weekend spare key. The Key name is what staff tap on the page, so match the key tag (e.g. 'Key #2'). Untick Active to take a key out of use. Status, With, Since and Due back fill in automatically.",
  'Taking a key (QR code KEY OUT): pick name, the key SOP (Settings KEY_SWP_CODE) must be signed and current, tick each term including the lost-key responsibility, sign. A row goes into Key Log with the time, due-back time and signature.',
  'Returning a key (QR code KEY BACK): pick name, tap the key, confirm it is back in its spot. Anyone can return a key for someone else - Returned by shows who. Returned after the due time = Returned late.',
  'Due back: the next Tuesday after the key is taken, 10am (KEY_DUE_DAY / KEY_DUE_TIME). From 10am Tuesday every key still out is posted in Slack tagging the holder plus Andrew, Ben and Neil (KEY_ALERT_CC), then again at 10am each weekday until it is scanned back in.',
  "Missing key: 'Lost or missing key?' on the return page posts a Slack alert straight away and marks the key Lost. If it turns up, return it as normal and Slack is told it is back.",
  "Fixing a record: type the time into 'Returned at' on the Key Log row (or set Status to Returned) and it closes. Manual runs: setupKeys, previewKeyCallout.",
  '',
  'MONTHLY H&S INSPECTIONS',
  'Staff page: INSP_PAGE_URL (inspection.html). Pick the area and your name, then answer every line Yes / No / N/A. A No needs a description (photos optional, up to 3). An N/A needs a reason. Equipment cards (AEDs, first aid kits, extinguishers) can be marked All OK or N/A as a whole. Expiry and service dates that have passed become defects automatically. Answers are saved on the phone as you go.',
  'Submitting: the inspector ticks the declaration and signs. The Inspections tab records the start time, submit time, minutes taken, counts, score (Yes as a % of Yes + No), checklist version, device and signature. Every answer goes to Inspection Answers with the time it was answered.',
  "Defects: one row each on Inspection Defects with a priority. If the same line is still open from an earlier inspection, that row is updated instead (Times seen, Last seen, Latest note). Ones fixed on the spot are closed straight away. Everything else stays Open until someone closes it out on the dashboard with their name, what was done and a signature.",
  'Dashboard: INSP_DASH_URL. Score trend, pass rate by section, repeat failures, expiries and service dates, the defect register (close-out), inspection history (full record, Superintendent review and sign) and the N/A register. CSV export.',
  'Slack: a summary posts when an inspection is submitted (High defects tag INSP_ALERT_CC). At 7am on weekdays an area that is due gets a reminder, then weekly until it is done (INSP_EVERY_DAYS, INSP_REMIND).',
  'Changing the checklist: edit docs/inspect-checklists.js on GitHub and bump its version. Manual runs: setupInspections, previewInspectionReminder.',
  '',
  'TURFDOG PRE-STARTS AND MACHINE SWPs',
  "Every hour from 6am a scheduled Claude task reads the TurfDog board (who has which machine on each shift) and the TurfDog pre-check log, and sends both here. Pre-starts tab = a copy of every TurfDog pre-start. Machine Bookings tab = every person/machine on the board each day, with Pre-start (Done / Not done / Not due yet / Not needed) and the machine's SWP status for that person.",
  "Slack (#safe-work-procedures): the first time each day someone is on a machine with no pre-start, they are tagged in one post. Each hour after that, anyone still outstanding is tagged again in that post's thread; from reminder 2 (PRESTART_ESCALATE_AFTER) Neil and Ben are tagged too (PRESTART_CC). When everyone is done the thread gets an 'All pre-starts done'. Shift 2 and 3 machines are chased from the times in PRESTART_SHIFT_FROM.",
  "Machine SWPs: the Machines tab links each TurfDog machine to its SWP code. Anyone booked on a machine whose SWP they haven't signed (or is overdue) is tagged once a day in the same post with the SWP to sign. How often an SWP is re-signed still comes from its Risk on the Documents tab.",
  "Machines tab: Machine = the name exactly as TurfDog shows it. Type = machines that share a pre-start rule (a pre-start on Workman MDX 4 counts for someone booked on Workman MDX 2 - set PRESTART_MATCH to exact to stop that). Pre-start unticked = never chased (probes, sand, paperwork). New machines from TurfDog are added automatically - fill in their SWP.",
  "Names: TurfDog names are matched to the Staff tab (Josh = Joshua, Nick = Nicholas, Michael Kruse = Michael K). If someone isn't matched, put their TurfDog name in the Staff tab's 'TurfDog name' column.",
  'Andrew gets a DM straight away when a pre-start reports a fault, and a summary of the day after 1:30pm (PRESTART_SUMMARY_AFTER): who never did one, pre-starts on a different machine to the board, checklists that don\'t match the machine, and booked machines with no SWP linked.',
  'Tasks where a booked machine needs no pre-start (e.g. Workshop, where the machine is being serviced): PRESTART_SKIP_TASKS. Manual runs: setupPrestart, previewPrestart.',
  '',
  'ONE DOCUMENT AT A TIME IN #OHS',
  "A weekday Claude task (9:47am) pushes the documents in FOCUS_QUEUE one at a time in Slack #ohs: one post with the link and everyone who still has to sign it tagged, then each weekday the people still outstanding are tagged again in that post's thread (Neil and Ben too from day FOCUS_CC_FROM). When everyone it applies to has signed, the thread gets a thank you and the next document goes up. Documents everyone has already signed are skipped. Leave someone out for now (e.g. on leave) with FOCUS_SKIP. Manual run: previewFocus."
];

/* ------------------------------------------------------- manual runs */

function syncNow() {
  syncLibrary_();
  refreshOutputs_();
  console.log('Library synced, matrix and dashboard data rebuilt.');
}

function previewReminders() {
  const r = remind_({ dryRun: true, force: true });
  console.log(r.text || 'Nobody needs a reminder today.');
}

function sendRemindersNow() {
  const r = remind_({ dryRun: false, force: true });
  console.log(r.message + (r.text ? '\n' + r.text : ''));
}

/* ----------------------------------------------------------------- setup */

function setup() {
  const ss = book_();
  ss.setSpreadsheetTimeZone(TZ);
  ensureSheets_();
  ensureSettings_();
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
  console.log('Set up complete. Sync runs every 10 minutes; reminders at 7am.');
  return 'ok';
}

function ensureSheets_() {
  const ss = book_();
  const order = [TAB.MATRIX, TAB.REGISTER, TAB.PRESTARTS, TAB.BOOKINGS, TAB.KEYS, TAB.KEYLOG, TAB.STAFF, TAB.DOCS, TAB.MACHINES,
    TAB.QUIZ, TAB.REMINDERS, TAB.SETTINGS, TAB.README];
  order.forEach((name, i) => {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      // new tab goes straight after the nearest earlier tab in the order (other tabs, e.g. Inspections, stay put)
      let at = 0;
      for (let j = i - 1; j >= 0; j--) { const prev = ss.getSheetByName(order[j]); if (prev) { at = prev.getIndex(); break; } }
      sh = ss.insertSheet(name, at);
    }
    const empty = sh.getLastRow() === 0;
    if (name === TAB.README && !empty) {
      sh.clear();
      sh.getRange(1, 1, README_LINES.length, 1).setValues(README_LINES.map(l => [l])).setWrap(true).setVerticalAlignment('top');
      sh.getRange(1, 1).setFontSize(14).setFontWeight('bold').setFontColor('#1F4D3A');
      return;
    }
    if (HEAD[name] && empty) {
      sh.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]]);
      styleHeader_(sh, HEAD[name].length);
    }
    if (HEAD[name] && !empty) HEAD[name].forEach(h => ensureColumn_(sh, h));   // add any new columns to existing tabs
    if (!empty) return;
    if (name === TAB.QUIZ) {
      sh.getRange(2, 1, SEED_QUESTIONS.length, SEED_QUESTIONS[0].length).setValues(SEED_QUESTIONS);
      sh.getRange(2, 1, 500, HEAD.Questions.length).setWrap(true).setVerticalAlignment('top');
      sh.getRange(2, 8, 500, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['A', 'B', 'C', 'D'], true).build()).setHorizontalAlignment('center');
      [70, 45, 330, 210, 210, 210, 210, 70, 360].forEach((w, j) => sh.setColumnWidth(j + 1, w));
    }
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
    if (name === TAB.KEYS) {
      sh.getRange(2, 1, SEED_KEYS.length, SEED_KEYS[0].length).setValues(SEED_KEYS);
      sh.getRange(2, 3, 100, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      sh.getRange(2, 3, SEED_KEYS.length, 1).setValues(SEED_KEYS.map(r => [r[2]]));
      sh.getRange(2, 6, 100, 2).setNumberFormat('ddd d mmm h:mm am/pm');
      [110, 220, 60, 90, 160, 150, 150, 300].forEach((w, j) => sh.setColumnWidth(j + 1, w));
    }
    if (name === TAB.KEYLOG) {
      [1, 5, 10, 14].forEach(c => sh.getRange(2, c, 5000, 1).setNumberFormat('ddd d mmm yy h:mm am/pm'));
      [150, 150, 80, 150, 150, 120, 320, 80, 200, 150, 170, 110, 75, 150, 300, 240].forEach((w, j) => sh.setColumnWidth(j + 1, w));
    }
    if (name === TAB.MACHINES) {
      sh.getRange(2, 1, SEED_MACHINES.length, SEED_MACHINES[0].length).setValues(SEED_MACHINES);
      sh.getRange(2, 5, 400, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      sh.getRange(2, 5, SEED_MACHINES.length, 1).setValues(SEED_MACHINES.map(r => [r[4]]));
      sh.getRange(2, 6, 400, 1).setNumberFormat('yyyy-mm-dd');
      sh.getRange(2, 7, 400, 1).setNumberFormat('@');
      [230, 230, 190, 80, 75, 100, 130, 300].forEach((w, j) => sh.setColumnWidth(j + 1, w));
    }
    if (name === TAB.BOOKINGS) {
      sh.getRange(2, 1, 5000, 1).setNumberFormat('yyyy-mm-dd');
      sh.getRange(2, 7, 5000, 1).setNumberFormat('@');
      sh.getRange(2, 11, 5000, 1).setNumberFormat('h:mm am/pm');
      [95, 50, 190, 150, 230, 95, 85, 90, 180, 85, 100, 260].forEach((w, j) => sh.setColumnWidth(j + 1, w));
    }
    if (name === TAB.PRESTARTS) {
      sh.getRange(2, 1, 5000, 1).setNumberFormat('@');
      sh.getRange(2, 8, 5000, 1).setNumberFormat('yyyy-mm-dd hh:mm');
      [130, 150, 230, 300, 55, 60, 260, 130].forEach((w, j) => sh.setColumnWidth(j + 1, w));
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

function ensureColumn_(sh, name) {
  const n = Math.max(1, sh.getLastColumn());
  const have = sh.getRange(1, 1, 1, n).getValues()[0].map(h => String(h).trim());
  if (have.indexOf(name) >= 0) return have.indexOf(name) + 1;
  const col = have[n - 1] === '' && n === 1 ? 1 : n + 1;
  sh.getRange(1, col).setValue(name);
  styleHeader_(sh, col);
  return col;
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
    if (p.action === 'doc') return json_(easyDoc_(p.code));
    if (p.action === 'inspStatus') return json_(inspStatus_());
    if (p.action === 'inspData') return json_(inspData_(p));
    if (p.action === 'inspRecord') return json_(inspRecord_(p));
    if (p.action === 'prestartPlan') return json_(prestartPlan_(p));
    if (p.action === 'prestartPosted') return json_(prestartPosted_(p));
    if (p.action === 'prestartFlag') return json_(prestartFlag_(p));
    if (p.action === 'focusPlan') return json_(focusPlan_(p));
    if (p.action === 'focusPosted') return json_(focusPosted_(p));
    if (p.action === 'reviewList') return json_(reviewList_(p));
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
    if (b.action === 'keys') return json_(keys_(b));
    if (b.action === 'keyOut') return json_(keyOut_(b));
    if (b.action === 'keyIn') return json_(keyIn_(b));
    if (b.action === 'keyLost') return json_(keyLost_(b));
    if (b.action === 'inspSubmit') return json_(inspSubmit_(b));
    if (b.action === 'inspClose') return json_(inspClose_(b));
    if (b.action === 'inspReview') return json_(inspReview_(b));
    if (b.action === 'prestart') return json_(prestart_(b));
    if (b.action === 'reviewDone') return json_(reviewDone_(b));
    if (b.action === 'reviewImport') return json_(reviewImport_(b));
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
  let quiz = {};
  try { quiz = quizzes_(); } catch (e) { console.warn('questions: ' + e); }
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
    updated: toKey_(d.Updated),
    quiz: quiz[String(d.Code).trim().toUpperCase()] || undefined
  })).sort(byCategoryThenCode_);
  const staff = read_(TAB.STAFF).rows.filter(isActive_).map(r => String(r.Name).trim()).sort();
  const out = { ok: true, docs, staff, categories: CATEGORIES, declaration: DECLARATION, generated: new Date().toISOString() };
  try { cache.put('library', JSON.stringify(out), 300); } catch (e) {}
  return out;
}

function me_(b) {
  const ctx = context_();
  const st = who_(ctx, b);
  return Object.assign({ ok: true, name: String(st.Name).trim(), link: personalLink_(st, ctx.s) }, myItems_(ctx, st));
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
    const st = who_(ctx, b);
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
    const name = String(st.Name).trim();
    const code = String(doc.Code).trim();
    const check = knowledgeCheck_(code, b);

    const now = new Date();
    const fileName = Utilities.formatDate(now, TZ, 'yyyy-MM-dd HHmm') + ' ' + name + ' ' + code + ' v' + ver + '.png';
    const file = DriveApp.getFolderById(ctx.s.SIGNATURE_FOLDER_ID).createFile(Utilities.newBlob(Utilities.base64Decode(m[1]), 'image/png', fileName));
    const until = addMonths_(dayKey_(now), renewMonths_(doc, ctx.s));
    const receipt = 'RGC-' + Utilities.formatDate(now, TZ, 'yyMMdd') + '-' + sha_(name + '|' + code + '|' + ver + '|' + now.getTime()).slice(0, 6).toUpperCase();
    const reg = sheet_(TAB.REGISTER);
    if (check) ensureColumn_(reg, 'Knowledge check');
    const head = reg.getRange(1, 1, 1, reg.getLastColumn()).getValues()[0].map(h => String(h).trim());
    const row = {
      'Signed at': now, 'Receipt': receipt, 'Staff': name, 'Code': code, 'Document': String(doc.Title).trim(), 'Version': ver,
      'Risk': riskOf_(doc), 'Valid until': until, 'Read time (sec)': readSecs, 'Signature': '=HYPERLINK("' + file.getUrl() + '","View")',
      'Declaration': DECLARATION, 'Device': String(b.ua || '').slice(0, 160), 'Knowledge check': check
    };
    reg.appendRow(head.map(h => (h in row ? row[h] : '')));
    PropertiesService.getScriptProperties().setProperty('dirty', '1');
    return { ok: true, receipt, code, signedAt: Utilities.formatDate(now, TZ, 'd MMM yyyy, h:mm a'), validUntil: until, check };
  } finally {
    lock.releaseLock();
  }
}

// No PIN: staff pick their name (remembered on their phone) or open their personal link from Slack.
function who_(ctx, b) {
  const tok = String(b.u || '').trim().toLowerCase();
  const n = norm_(b.name);
  const st = ctx.staff.find(r => isActive_(r) && (tok ? token_(r.Name, ctx.s) === tok : norm_(r.Name) === n));
  if (!st) throw new Error(tok ? 'This link is out of date - pick your name instead.' : 'Name not found - see your supervisor.');
  return st;
}

// Knowledge check: every question must have been answered correctly before signing.
function knowledgeCheck_(code, b) {
  let qs = [];
  try { qs = quizzes_()[String(code).trim().toUpperCase()] || []; } catch (e) { qs = []; }
  if (!qs.length) return '';
  const a = (b && typeof b.answers === 'object' && b.answers) || {};
  if (qs.some(q => Number(a[q.n]) !== q.answer)) throw new Error('Finish the knowledge check before signing.');
  const first = Math.max(0, Math.min(qs.length, Math.round(num_(b.quizFirstTry, qs.length))));
  return 'Passed ' + qs.length + '/' + qs.length + ' - ' + first + ' right first time';
}

// Questions tab -> { CODE: [{ n, q, options, answer, why }] } (answer = index into options).
function quizzes_() {
  const sh = book_().getSheetByName(TAB.QUIZ);
  if (!sh || sh.getLastRow() < 2) return {};
  const out = {};
  read_(TAB.QUIZ).rows.forEach(r => {
    const code = String(r.Code || '').trim().toUpperCase();
    const q = String(r.Question || '').trim();
    if (!code || !q) return;
    const key = 'ABCD'.indexOf(String(r.Answer || '').trim().toUpperCase().charAt(0));
    const options = [];
    let answer = -1;
    ['Option A', 'Option B', 'Option C', 'Option D'].forEach((k, i) => {
      const o = String(r[k] || '').trim();
      if (!o) return;
      if (i === key) answer = options.length;
      options.push(o);
    });
    if (answer < 0 || options.length < 2) return;
    const list = out[code] = out[code] || [];
    list.push({ n: num_(r['No.'], 0) || list.length + 1, q, options, answer, why: String(r.Why || '').trim() });
  });
  Object.keys(out).forEach(k => out[k].sort((x, y) => x.n - y.n));
  return out;
}

function token_(name, s) {
  return sha_(norm_(name) + '|link|' + String(s.PIN_SALT || '')).slice(0, 10);
}

function personalLink_(st, s) {
  const base = String(s.SITE_URL || '').trim();
  return base ? base + (base.indexOf('?') >= 0 ? '&' : '?') + 'u=' + token_(st.Name, s) : '';
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
  const started = Date.now();
  try { keyCallouts_({ dryRun: false }); } catch (e) { console.error('key callouts failed: ' + e); }
  const props = PropertiesService.getScriptProperties();
  let changed = false;
  try { changed = syncLibrary_(); } catch (e) { console.error('sync failed: ' + e); }
  const today = dayKey_(new Date());
  if (changed || props.getProperty('dirty') === '1' || props.getProperty('lastRefresh') !== today) refreshOutputs_();
  try { buildEasyRead_(4, started + 240000); } catch (e) { console.error('easy read failed: ' + e); }
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

  const review = reviewOn_(s);
  const props = PropertiesService.getScriptProperties();
  const pend = reviewPending_(props);
  let pendChanged = false;
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
        'Status': review ? 'To review' : 'Live', 'Version': 1, 'Updated': fresh.getLastUpdated(), 'File ID': id, 'File name': fresh.getName(),
        'Link': fresh.getUrl(), 'Added': today, 'Notes': review ? 'Added from Drive ' + today + ' - waiting for review' : 'Added from Drive ' + today + ' - check Risk and Applies to'
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
    const status = String(doc.Status).trim();
    // A new version of a document staff can already see waits for review; the current file stays live meanwhile.
    if (review && linkedId && linkedId !== id && status === 'Live') {
      if (!pend[code] || pend[code].id !== id) {
        if (!m) { try { f.setName(code + ' ' + name); } catch (e) {} }
        share_(f);
        pend[code] = { id, name: DriveApp.getFileById(id).getName(), at: today };
        pendChanged = true;
        writeRow_(t, doc._row, { 'Notes': 'New version uploaded ' + today + ' - waiting for review' });
        changed = true;
      }
      return;
    }
    if (pend[code] && pend[code].id !== id && linkedId === id) { /* the pending file was removed: keep the live one */ delete pend[code]; pendChanged = true; }
    if (linkedId !== id) {
      if (!m) { try { f.setName(code + ' ' + name); } catch (e) {} }
      share_(f);
      const fresh = DriveApp.getFileById(id);
      upd['File ID'] = id;
      upd['File name'] = fresh.getName();
      upd['Link'] = fresh.getUrl();
      if (linkedId && status !== 'To review') {
        upd['Version'] = num_(doc.Version, 1) + 1;
        upd['Updated'] = new Date();
      } else {
        upd['Version'] = Math.max(1, num_(doc.Version, 0));
        upd['Updated'] = fresh.getLastUpdated();
        upd['Added'] = today;
      }
      if (status !== 'Retired') upd['Status'] = review && status !== 'Live' ? 'To review' : 'Live';
      if (review && status !== 'Live' && status !== 'Retired') upd['Notes'] = 'File added ' + today + ' - waiting for review';
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
    const c = String(d.Code).trim();
    const st = String(d.Status).trim();
    if ((st === 'Live' || st === 'To review') && !seen[c]) {
      writeRow_(t, d._row, { 'Status': 'Not uploaded' });
      d.Status = 'Not uploaded';
      changed = true;
    }
    if (pend[c] && !seen[c]) { delete pend[c]; pendChanged = true; }
  });
  if (pendChanged) props.setProperty('review:pending', JSON.stringify(pend));
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
    .trim()
    .replace(/^(SOP|SWP|SWMS)\b[\s:-]*/i, '')
    .replace(/[\s-]*\b(SOP|SWP|SWMS)\b\s*(draft)?$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ----------------------------------------------------------- easy read */
// A phone-friendly copy of each live document: converted to a Google Doc, exported as HTML with
// images inlined, saved in the private Easy read folder and served by doGet(action=doc).

const EASY_READ_FOLDER_DEFAULT = '1Lxh8A1-jVhK9uF0gHaZWKUAPIQpgV21h';
const EASY_CONVERTIBLE = /wordprocessingml|msword|application\/pdf|application\/rtf|opendocument\.text|text\/plain/;

function easyKey_(code) { return 'er:' + String(code).trim().toUpperCase(); }

function easyState_(code) {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(easyKey_(code)) || 'null'); } catch (e) { return null; }
}

function buildEasyRead_(maxDocs, deadline) {
  const s = settings_();
  const folderId = String(s.EASY_READ_FOLDER_ID || EASY_READ_FOLDER_DEFAULT).trim();
  const props = PropertiesService.getScriptProperties();
  const docs = read_(TAB.DOCS).rows.filter(isLive_);
  const done = [];
  for (let i = 0; i < docs.length; i++) {
    if (done.length >= maxDocs || Date.now() > deadline) break;
    const d = docs[i];
    const code = String(d.Code).trim();
    const ver = num_(d.Version, 1);
    const fid = String(d['File ID']).trim();
    const cur = easyState_(code);
    if (cur && cur.v === ver && cur.src === fid) continue;
    try {
      const html = makeEasyRead_(fid, folderId);
      const f = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(html, 'text/html', code + ' v' + ver + ' easy read.html'));
      if (cur && cur.id) { try { DriveApp.getFileById(cur.id).setTrashed(true); } catch (e) {} }
      props.setProperty(easyKey_(code), JSON.stringify({ id: f.getId(), v: ver, src: fid }));
      done.push(code);
    } catch (e) {
      props.setProperty(easyKey_(code), JSON.stringify({ failed: String(e).slice(0, 200), v: ver, src: fid }));
      done.push(code + ' (failed: ' + String(e).slice(0, 120) + ')');
    }
  }
  if (done.length) console.log('Easy read: ' + done.join(', '));
  return done;
}

function makeEasyRead_(fileId, folderId) {
  const hdr = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  const src = DriveApp.getFileById(fileId);
  const mime = src.getMimeType();
  let docId = fileId;
  let temp = '';
  if (mime !== MimeType.GOOGLE_DOCS) {
    if (!EASY_CONVERTIBLE.test(mime)) throw new Error('file type not supported: ' + mime);
    const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '/copy?fields=id&supportsAllDrives=true', {
      method: 'post', contentType: 'application/json', headers: hdr, muteHttpExceptions: true,
      payload: JSON.stringify({ name: 'tmp easy read - ' + src.getName(), mimeType: MimeType.GOOGLE_DOCS, parents: [folderId] })
    });
    if (res.getResponseCode() !== 200) throw new Error('convert ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 160));
    docId = temp = JSON.parse(res.getContentText()).id;
  }
  try {
    const ex = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + docId + '/export?mimeType=application%2Fzip', { headers: hdr, muteHttpExceptions: true });
    if (ex.getResponseCode() !== 200) throw new Error('export ' + ex.getResponseCode() + ' ' + ex.getContentText().slice(0, 160));
    const parts = Utilities.unzip(ex.getBlob().setContentType('application/zip'));
    const page = parts.filter(b => /\.html?$/i.test(b.getName()))[0];
    if (!page) throw new Error('export had no HTML');
    let html = page.getDataAsString('UTF-8');
    parts.forEach(b => {
      const nm = b.getName();
      if (!/\.(png|jpe?g|gif|bmp)$/i.test(nm)) return;
      const base = nm.split('/').pop();
      const type = /png$/i.test(nm) ? 'image/png' : /gif$/i.test(nm) ? 'image/gif' : /bmp$/i.test(nm) ? 'image/bmp' : 'image/jpeg';
      html = html.split('images/' + base).join('data:' + type + ';base64,' + Utilities.base64Encode(b.getBytes()));
    });
    return cleanEasyRead_(html);
  } finally {
    if (temp) { try { DriveApp.getFileById(temp).setTrashed(true); } catch (e) {} }
  }
}

function cleanEasyRead_(html) {
  const styles = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n');
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let body = m ? m[1] : html;
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<(iframe|object|embed|form|link|meta)[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*("|')\s*javascript:[^"']*\1/gi, 'href="#"');
  return '<!doctype html><html><head><meta charset="utf-8">' + styles + '</head><body class="doc-content">' + body + '</body></html>';
}

function easyDoc_(code) {
  const c = String(code || '').trim().toUpperCase();
  const d = read_(TAB.DOCS).rows.filter(isLive_).filter(r => String(r.Code).trim().toUpperCase() === c)[0];
  if (!d) return { ok: false, error: 'Document not found' };
  const cur = easyState_(c);
  if (!cur || !cur.id || cur.v !== num_(d.Version, 1) || cur.src !== String(d['File ID']).trim()) return { ok: true, html: '' };
  const cache = CacheService.getScriptCache();
  const key = 'erh:' + cur.id;
  const hit = cache.get(key);
  if (hit) return { ok: true, html: hit, version: cur.v };
  const html = DriveApp.getFileById(cur.id).getBlob().getDataAsString('UTF-8');
  try { if (html.length < 90000) cache.put(key, html, 21600); } catch (e) {}
  return { ok: true, html, version: cur.v };
}

// Manual run: build any missing phone-friendly copies now (also retries ones that failed).
function buildEasyReadNow() {
  const s = settings_();
  if (!String(s.EASY_READ_FOLDER_ID || '').trim()) setSetting_('EASY_READ_FOLDER_ID', EASY_READ_FOLDER_DEFAULT);
  const props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).forEach(k => {
    if (k.indexOf('er:') === 0) { const v = easyState_(k.slice(3)); if (v && v.failed) props.deleteProperty(k); }
  });
  const done = buildEasyRead_(50, Date.now() + 300000);
  console.log(done.length ? 'Built: ' + done.join(', ') : 'All phone-friendly copies are up to date.');
}

// One-off tidy: strip a leading/trailing SOP/SWP from titles of documents added from Drive.
function tidyTitles() {
  const t = read_(TAB.DOCS);
  let n = 0;
  t.rows.forEach(d => {
    if (!/^Added from Drive/.test(String(d.Notes || ''))) return;
    const clean = cleanTitle_(String(d.Title || ''));
    if (clean && clean !== String(d.Title)) { writeRow_(t, d._row, { 'Title': clean }); n++; }
  });
  CacheService.getScriptCache().remove('library');
  PropertiesService.getScriptProperties().setProperty('dirty', '1');
  console.log('Titles tidied: ' + n);
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
  try { inspReminders_({ dryRun: false, force: false }); } catch (e) { console.error('inspection reminder failed: ' + e); }
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
    if (isGuest_(i.staff)) return;   // guests are never tagged in the crew channel
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
    const link = personalLink_(st, s);
    lines.push('• ' + (slack ? '<@' + slack + '>' : '*' + name + '*') + ' - ' + parts.join(' · ') + (link ? ' - <' + link + '|open your list>' : ''));
    log.push([new Date(), name, slack, od.length, due.length, list.map(i => (i.status === 'Overdue' ? '!' : '') + String(i.doc.Code).trim()).join(' ')]);
  });

  if (!lines.length) return { message: 'Nobody needs a reminder today.', text: '' };
  const text = ':clipboard: *Safety sign-offs due*\n' + lines.join('\n') + '\nTap your link, read each document and sign. All documents: ' + String(s.SITE_URL || '').trim();
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

/* ----------------------------------------------------------- shed keys */
// Weekend spare keys for the maintenance shed. Page: docs/keys.html (?out = take, ?in = return).
// Keys tab = the keys; Key Log tab = one row per sign-out, closed when the key is scanned back in.

const KEY_CLOSED = ['returned', 'returned late', 'written off', 'cancelled'];

// Manual run: add the key tabs and settings (also happens automatically on first use).
function setupKeys() {
  ensureSheets_();
  ensureSettings_();
  refreshKeysTab_(keyCtx_());
  console.log('Shed keys ready. Keys: ' + read_(TAB.KEYS).rows.map(r => r.Key).join(', '));
}

// Manual run: show what the Slack callout would say right now (ignores the time of day, posts nothing).
function previewKeyCallout() {
  const r = keyCallouts_({ dryRun: true, force: true });
  console.log(r.text || 'No keys are overdue.');
}

// Any new Settings rows added since the sheet was built.
function ensureSettings_() {
  const sh = sheet_(TAB.SETTINGS);
  const have = sh.getDataRange().getValues().slice(1).map(r => String(r[0] || '').trim());
  const add = SEED_SETTINGS.filter(r => have.indexOf(r[0]) < 0);
  if (!add.length) return;
  const at = sh.getLastRow() + 1;
  sh.getRange(at, 2, add.length, 1).setNumberFormat('@');
  sh.getRange(at, 1, add.length, 3).setValues(add.map(r => [r[0], String(r[1]), r[2]]));
}

function keyCtx_() {
  const ss = book_();
  if (!ss.getSheetByName(TAB.KEYS) || !ss.getSheetByName(TAB.KEYLOG)) ensureSheets_();
  if (!('KEY_DUE_DAY' in settings_())) ensureSettings_();
  const ctx = context_();
  const keys = read_(TAB.KEYS);
  const log = read_(TAB.KEYLOG);
  const open = {};
  log.rows.forEach(r => { if (isOpenKey_(r)) open[norm_(r.Key)] = r; });
  return Object.assign(ctx, { keys, log, open, now: new Date() });
}

function isOpenKey_(r) {
  if (!String(r.Key || '').trim()) return false;
  if (r['Returned at'] !== '' && r['Returned at'] !== null && r['Returned at'] !== undefined) return false;
  return KEY_CLOSED.indexOf(String(r.Status || '').trim().toLowerCase()) < 0;
}
function keyActive_(r) { return !!String(r.Key || '').trim() && (r.Active === '' || bool_(r.Active)); }
function keyIsLost_(r) { return String(r.Status || '').trim().toLowerCase() === 'lost'; }
function asDate_(v) { if (v instanceof Date) return isNaN(v.getTime()) ? null : v; const d = v ? new Date(v) : null; return d && !isNaN(d.getTime()) ? d : null; }

function keyTime_(s) {
  const v = s.KEY_DUE_TIME;
  if (v instanceof Date) return Utilities.formatDate(v, book_().getSpreadsheetTimeZone(), 'HH:mm');
  const m = String(v || '10:00').match(/(\d{1,2})(?::(\d{2}))?/);
  return m ? ('0' + Math.min(23, Number(m[1]))).slice(-2) + ':' + (m[2] || '00') : '10:00';
}
function keyDow_(s) {
  const i = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(String(s.KEY_DUE_DAY || 'Tue').trim().slice(0, 3).toLowerCase());
  return i < 0 ? 2 : i + 1;
}
function dowOf_(d) { return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(Utilities.formatDate(d, TZ, 'EEE').toLowerCase().slice(0, 3)) + 1; }   // 1 = Mon ... 7 = Sun

// Due back: the next due day after today (a key taken on a Tuesday is due the following Tuesday).
function keyDue_(when, s) {
  let add = (keyDow_(s) - dowOf_(when) + 7) % 7;
  if (add === 0) add = 7;
  return Utilities.parseDate(addDays_(dayKey_(when), add) + ' ' + keyTime_(s), TZ, 'yyyy-MM-dd HH:mm');
}

function clock_(d) { return Utilities.formatDate(d, TZ, 'h:mm a').toLowerCase().replace(':00 ', '').replace(' ', ''); }
function when_(d) { d = asDate_(d); return d ? Utilities.formatDate(d, TZ, 'EEE d MMM') + ', ' + clock_(d) : ''; }
function dueText_(d) { d = asDate_(d); return d ? clock_(d) + ' ' + Utilities.formatDate(d, TZ, 'EEE d MMM') : ''; }
function dueRule_(s) {
  const day = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][keyDow_(s) - 1];
  return clock_(Utilities.parseDate('2026-01-01 ' + keyTime_(s), TZ, 'yyyy-MM-dd HH:mm')) + ' ' + day;
}

function keySop_(kc, st) {
  const code = String(kc.s.KEY_SWP_CODE || '').trim().toUpperCase();
  if (!code) return null;
  const doc = kc.docs.find(d => String(d.Code).trim().toUpperCase() === code && isLive_(d));
  if (!doc) return null;
  const out = { code, title: String(doc.Title).trim(), required: bool_(kc.s.KEY_SWP_REQUIRED) };
  if (!st) return out;
  const i = itemStatus_(kc, st, doc);
  return Object.assign(out, { ok: i.status === 'Current' || i.status === 'Due soon', signed: i.signed || '', validUntil: i.validUntil || '', outdated: !!i.outdated });
}

// The terms ticked when a key is taken. The page shows exactly these and the Key Log stores them.
function keyTerms_(kc) {
  const sop = keySop_(kc, null);
  const t = [];
  if (sop) t.push({ id: 'sop', text: 'I have read and signed ' + sop.code + ' ' + sop.title + ' and will follow it.' });
  t.push({ id: 'hold', text: 'I will keep the key on me at all times - never left in a vehicle, machine, locker or toolbox - and I will not lend, hand on or copy it.' });
  t.push({ id: 'lock', text: 'I will lock the shed every time I leave, return the key straight after my last shift, and scan it back in by ' + dueRule_(kc.s) + ' at the latest.' });
  t.push({ id: 'report', text: 'I will report a lost or missing key to my Supervisor or the Course Superintendent straight away - not wait while I keep looking.' });
  return {
    terms: t,
    liability: {
      title: 'Lost keys - your responsibility',
      text: 'One key opens every shed door. If it is lost, every lock may have to be replaced, and the Club\'s machinery and equipment are at risk until they are. ' +
        'From now until it is scanned back in, this key is my responsibility. I understand that losing the key, not reporting a loss straight away, or not returning it on time may result in disciplinary action.',
      tick: 'I accept responsibility for this key.'
    }
  };
}

function keyList_(kc) {
  return kc.keys.rows.filter(keyActive_).map(r => {
    const name = String(r.Key).trim();
    const o = kc.open[norm_(name)];
    const due = o ? asDate_(o['Due back']) : null;
    return {
      key: name, desc: String(r.Description || '').trim(),
      status: o ? (keyIsLost_(o) ? 'Lost' : 'Out') : 'In',
      with: o ? String(o.Staff || '').trim() : '',
      since: o ? when_(o['Out at']) : '',
      due: due ? dueText_(due) : '',
      overdue: !!(o && !keyIsLost_(o) && due && due <= kc.now)
    };
  });
}

// Page load: keys, staff, due-back time and (once a name is known) the key SOP status.
function keys_(b) {
  const kc = keyCtx_();
  let st = null, whoErr = '';
  if (String(b.u || b.name || '').trim()) { try { st = who_(kc, b); } catch (e) { whoErr = msg_(e); } }
  const t = keyTerms_(kc);
  return {
    ok: true,
    staff: kc.staff.filter(isActive_).map(r => String(r.Name).trim()).sort(),
    me: st ? String(st.Name).trim() : '', whoError: whoErr,
    keys: keyList_(kc),
    sop: keySop_(kc, st),
    dueBack: dueText_(keyDue_(kc.now, kc.s)), dueRule: dueRule_(kc.s),
    terms: t.terms, liability: t.liability,
    siteUrl: String(kc.s.SITE_URL || '').trim()
  };
}

function keyOut_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const kc = keyCtx_();
    const st = who_(kc, b);
    const name = String(st.Name).trim();
    const kr = kc.keys.rows.filter(keyActive_).find(r => norm_(r.Key) === norm_(b.key));
    if (!kr) throw new Error('That key is not on the list. Reload the page.');
    const key = String(kr.Key).trim();
    const o = kc.open[norm_(key)];
    if (o && keyIsLost_(o)) throw new Error(key + ' is reported missing. If it has turned up, return it on the Return a key tab first.');
    if (o) throw new Error(key + (norm_(o.Staff) === norm_(name) ? ' is already signed out to you.' : ' is already signed out to ' + String(o.Staff).trim() + '. Pick another key.'));
    const sop = keySop_(kc, st);
    if (sop && sop.required && !sop.ok) throw new Error('Read and sign ' + sop.code + ' ' + sop.title + ' before you take a key.');
    if (b.ack !== true) throw new Error('Tick every box to take the key.');
    const m = String(b.signature || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!m || m[1].length < 200 || m[1].length > 600000) throw new Error('Please sign with your finger.');

    const now = new Date();
    const due = keyDue_(now, kc.s);
    const file = DriveApp.getFolderById(kc.s.SIGNATURE_FOLDER_ID).createFile(
      Utilities.newBlob(Utilities.base64Decode(m[1]), 'image/png', Utilities.formatDate(now, TZ, 'yyyy-MM-dd HHmm') + ' ' + name + ' ' + key + ' key out.png'));
    const receipt = 'KEY-' + Utilities.formatDate(now, TZ, 'yyMMdd') + '-' + sha_(name + '|' + key + '|' + now.getTime()).slice(0, 5).toUpperCase();
    const t = keyTerms_(kc);
    const agreed = t.terms.map(x => x.text).concat([t.liability.text]).join(' | ');
    const sopText = sop ? (sop.ok ? sop.code + ' signed ' + sop.signed : sop.code + ' NOT SIGNED') : 'n/a';
    const row = {
      'Out at': now, 'Receipt': receipt, 'Key': key, 'Staff': name, 'Due back': due, 'Key SOP': sopText, 'Agreed to': agreed,
      'Signature': '=HYPERLINK("' + file.getUrl() + '","View")', 'Device': String(b.ua || '').slice(0, 160), 'Status': 'Out', 'Callouts': 0
    };
    kc.log.sh.appendRow(kc.log.head.map(h => (h in row ? row[h] : '')));
    refreshKeysTab_(keyCtx_());
    return { ok: true, receipt, key, outAt: when_(now), dueBack: dueText_(due) };
  } finally {
    lock.releaseLock();
  }
}

function keyIn_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const kc = keyCtx_();
    const st = who_(kc, b);
    const name = String(st.Name).trim();
    const o = kc.open[norm_(b.key)];
    if (!o) throw new Error('That key is already signed back in.');
    if (b.stored !== true) throw new Error('Tick the box once the key is back in its spot.');
    const key = String(o.Key).trim();
    const holder = String(o.Staff || '').trim();
    const now = new Date();
    const due = asDate_(o['Due back']);
    const late = !!(due && now > due);
    const wasLost = keyIsLost_(o);
    writeRow_(kc.log, o._row, {
      'Returned at': now,
      'Returned by': !holder || norm_(holder) === norm_(name) || /^\(/.test(holder) ? name : name + ' (for ' + holder + ')',
      'Status': late ? 'Returned late' : 'Returned',
      'Notes': (String(o.Notes || '').trim() ? String(o.Notes).trim() + ' · ' : '') + (wasLost ? 'Found and returned' : '')
    });
    if (wasLost || num_(o.Callouts, 0) > 0) {
      keySlack_(kc.s, ':white_check_mark: *' + key + ' is back* - returned by ' + slackName_(kc, name) + ', ' + when_(now) + (wasLost ? ' (was reported missing)' : ''));
    }
    refreshKeysTab_(keyCtx_());
    return { ok: true, key, returnedAt: when_(now), late, dueBack: due ? dueText_(due) : '' };
  } finally {
    lock.releaseLock();
  }
}

function keyLost_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const kc = keyCtx_();
    const st = who_(kc, b);
    const name = String(st.Name).trim();
    const kr = kc.keys.rows.filter(keyActive_).find(r => norm_(r.Key) === norm_(b.key));
    if (!kr) throw new Error('Pick the key that is missing.');
    const key = String(kr.Key).trim();
    const where = String(b.where || '').trim().slice(0, 200);
    const last = String(b.when || '').trim().slice(0, 120);
    if (!where) throw new Error('Say where the key was last seen.');
    const now = new Date();
    const report = when_(now) + ' - reported by ' + name + '. Last seen: ' + where + (last ? '. Last used: ' + last : '');
    const o = kc.open[norm_(key)];
    let holderLine;
    if (o) {
      writeRow_(kc.log, o._row, { 'Status': 'Lost', 'Lost report': (String(o['Lost report'] || '').trim() ? String(o['Lost report']).trim() + ' || ' : '') + report });
      holderLine = 'Signed out to ' + slackName_(kc, o.Staff) + ' since ' + when_(o['Out at']);
    } else {
      const row = { 'Out at': now, 'Key': key, 'Staff': '(not signed out)', 'Status': 'Lost', 'Callouts': 0, 'Lost report': report, 'Device': String(b.ua || '').slice(0, 160) };
      kc.log.sh.appendRow(kc.log.head.map(h => (h in row ? row[h] : '')));
      holderLine = 'Not signed out - missing from its spot';
    }
    const text = ':rotating_light: *Shed key missing - ' + key + '*\n' +
      'Reported by ' + slackName_(kc, name) + ', ' + when_(now) + '\n' + holderLine + '\n' +
      'Last seen: ' + where + (last ? ' · Last used: ' + last : '') + cc_(kc.s);
    const posted = keySlack_(kc.s, text);
    refreshKeysTab_(keyCtx_());
    return { ok: true, key, posted };
  } finally {
    lock.releaseLock();
  }
}

// Runs from tick() every 10 minutes. From the due time on the due day, every key still out is posted
// once; then again at the due time each weekday while it is still out (KEY_REPEAT_DAILY).
function keyCallouts_(opt) {
  const ss = book_();
  if (!ss.getSheetByName(TAB.KEYLOG)) return { text: '' };
  const s = settings_();
  if (!('KEY_DUE_DAY' in s)) return { text: '' };
  const now = new Date();
  const today = dayKey_(now);
  if (!opt.force && Utilities.formatDate(now, TZ, 'HH:mm') < keyTime_(s)) return { text: '' };
  const weekday = dowOf_(now) <= 5;
  const repeat = bool_(s.KEY_REPEAT_DAILY);
  const log = read_(TAB.KEYLOG);
  const list = log.rows.filter(r => {
    if (!isOpenKey_(r) || keyIsLost_(r)) return false;
    const due = asDate_(r['Due back']);
    if (!due || due > now) return false;
    const lastDay = toKey_(r['Last callout']);
    if (opt.force) return true;
    if (lastDay === today) return false;
    return !lastDay || (repeat && weekday);
  }).sort((a, b) => (asDate_(a['Due back']) || 0) - (asDate_(b['Due back']) || 0));
  if (!list.length) return { text: '' };

  const ctx = { staff: read_(TAB.STAFF).rows, s };
  const page = String(s.KEY_PAGE_URL || '').trim();
  const lines = list.map(r => {
    const due = asDate_(r['Due back']);
    const days = dnum_(today) - dnum_(dayKey_(due));
    const st = ctx.staff.find(x => norm_(x.Name) === norm_(r.Staff));
    const link = page && st ? page + '?in&u=' + token_(st.Name, s) : page ? page + '?in' : '';
    return '• ' + slackName_(ctx, r.Staff) + ' has *' + String(r.Key).trim() + '* - out since ' + when_(r['Out at']) +
      (days > 0 ? ' · ' + days + (days === 1 ? ' day' : ' days') + ' overdue' : '') + (link ? ' · <' + link + '|scan it back in>' : '');
  });
  const text = ':key: *Shed ' + (list.length > 1 ? 'keys' : 'key') + ' not returned* - due back by ' + dueRule_(s) + '\n' + lines.join('\n') +
    '\nBring it back and scan the KEY BACK code on the shed wall.' + cc_(s);
  if (opt.dryRun) return { text };

  if (!keySlack_(s, text)) return { text, posted: false };
  const cCallouts = log.col('Callouts'), cLast = log.col('Last callout');
  list.forEach(r => {
    if (cCallouts > 0) log.sh.getRange(r._row, cCallouts).setValue(num_(r.Callouts, 0) + 1);
    if (cLast > 0) log.sh.getRange(r._row, cLast).setValue(now);
  });
  try { refreshKeysTab_(keyCtx_()); } catch (e) { console.warn('keys tab ' + e); }
  console.log('Key callout posted for ' + list.length + ' key(s).');
  return { text, posted: true };
}

function cc_(s) {
  const ids = String(s.KEY_ALERT_CC || '').split(/[\s,;]+/).filter(x => /^[UW][A-Z0-9]{6,}$/.test(x));
  return ids.length ? '\ncc ' + ids.map(x => '<@' + x + '>').join(' ') : '';
}

function slackName_(ctx, name) {
  const n = String(name || '').trim();
  const st = (ctx.staff || []).find(x => norm_(x.Name) === norm_(n));
  const id = st ? String(st['Slack ID'] || '').trim() : '';
  return id ? '<@' + id + '>' : '*' + (n || 'Unknown') + '*';
}

function keySlack_(s, text) {
  const hook = String(s.KEY_SLACK_WEBHOOK_URL || '').trim() || String(s.SLACK_WEBHOOK_URL || '').trim();
  if (!hook) { console.warn('No Slack webhook in Settings - key post not sent:\n' + text); return false; }
  try {
    const res = UrlFetchApp.fetch(hook, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text, link_names: true }), muteHttpExceptions: true });
    if (res.getResponseCode() === 200) return true;
    console.warn('Slack returned ' + res.getResponseCode() + ': ' + res.getContentText());
  } catch (e) {
    console.warn('Slack post failed: ' + e);
  }
  return false;
}

// Status / With / Since / Due back on the Keys tab, so the sheet shows where every key is.
function refreshKeysTab_(kc) {
  const t = kc.keys;
  const cols = ['Status', 'With', 'Since', 'Due back'].map(h => t.col(h));
  if (cols.some(c => c < 1)) return;
  t.rows.forEach(r => {
    if (!String(r.Key || '').trim()) return;
    const o = kc.open[norm_(r.Key)];
    const due = o ? asDate_(o['Due back']) : null;
    let status = 'In';
    if (!keyActive_(r)) status = 'Not in use';
    else if (o && keyIsLost_(o)) status = 'MISSING';
    else if (o && due && due <= kc.now) status = 'OVERDUE';
    else if (o) status = 'Out';
    const vals = [status, o ? String(o.Staff || '').trim() : '', o ? asDate_(o['Out at']) || '' : '', due || ''];
    cols.forEach((c, i) => t.sh.getRange(r._row, c).setValue(vals[i]));
    const bg = { 'In': '#D9F2E3', 'Out': '#FFF1C2', 'OVERDUE': '#F8D0CC', 'MISSING': '#F8D0CC', 'Not in use': '#EEEEEE' }[status];
    t.sh.getRange(r._row, cols[0]).setBackground(bg).setFontWeight(status === 'In' || status === 'Not in use' ? 'normal' : 'bold');
  });
}

/* ------------------------------------------------ TurfDog pre-starts */
// The hourly pre-start task reads today's TurfDog board (who has which machine on each shift) and the TurfDog
// pre-check log (Staff > Safety > Safety Checklists > Pre-Check) in Chrome, and posts both here
// (POST action 'prestart' with PRESTART_KEY). This:
//   - copies every pre-start into the Pre-starts tab and every machine booking into Machine Bookings,
//   - adds any machine it hasn't seen to the Machines tab (Type, SWP, whether it needs a pre-start),
//   - works out who is on a machine with no pre-start yet, and who hasn't signed that machine's SWP,
//   - writes the Slack text. The task fetches it (GET prestartPlan), posts it in #safe-work-procedures
//     (one post a day, then a reply in its thread each hour until everyone is done) and reports back
//     (GET prestartPosted) so reminder counts and the day's thread are kept.
// Manual runs: setupPrestart (tabs, settings, key), previewPrestart (the last plan).

const PRESTART_NOT_MACHINE = /invoice|spray sheet|^spraying\b|^sand\b|drainage sand|repair works|mechanic works|^misc\b|moisture probe|sensor|gps|locator|rms kit|flowsmart|per 4 max|gs3 ball|93-2242|charging station/i;

function setupPrestart() {
  ensureSheets_();
  ensureSettings_();
  if (!String(settings_().PRESTART_KEY || '').trim()) setSetting_('PRESTART_KEY', Utilities.getUuid().replace(/-/g, ''));
  console.log('Pre-start tabs ready: ' + [TAB.PRESTARTS, TAB.BOOKINGS, TAB.MACHINES].join(', ') + '. Key is in Settings > PRESTART_KEY.');
}

function previewPrestart() {
  const plan = JSON.parse(PropertiesService.getScriptProperties().getProperty('ps:plan') || '{}');
  console.log(plan.date ? JSON.stringify({ date: plan.date, time: plan.time, summary: plan.summaryLine, post: plan.post, dm: plan.dm }, null, 2) : 'No pre-start data yet today.');
}

function prestartAuth_(s, key) {
  const want = String(s.PRESTART_KEY || '').trim();
  if (!want || String(key || '').trim() !== want) throw new Error('Not allowed');
}

// POST from the TurfDog reader: { key, today, board: [{ shift, task, staff, machines: [] }], shiftsRead, checks, issues }
// checks / issues: [{ at: 'yyyy-mm-dd HH:mm', staff, machine, checklist, items }]
function prestart_(b) {
  const s0 = settings_();
  prestartAuth_(s0, b.key);
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ss = book_();
    if (![TAB.PRESTARTS, TAB.BOOKINGS, TAB.MACHINES].every(n => ss.getSheetByName(n))) { ensureSheets_(); ensureSettings_(); }
    const s = settings_();
    const now = new Date();
    const today = dayKey_(now);
    const hhmm = Utilities.formatDate(now, TZ, 'HH:mm');
    if (b.today && String(b.today) !== today) throw new Error('TurfDog is showing ' + b.today + ', not today (' + today + ')');
    const ctx = context_();
    const who = memoStaff_(ctx.staff);
    const mc = machines_();
    const skip = groups_(s.PRESTART_SKIP_TASKS);
    const shiftsRead = (Array.isArray(b.shiftsRead) && b.shiftsRead.length ? b.shiftsRead : [1, 2, 3]).map(Number);

    const issueKeys = {};
    (Array.isArray(b.issues) ? b.issues : []).map(cleanCheck_).filter(Boolean).forEach(c => { issueKeys[c.key] = true; });
    const checks = (Array.isArray(b.checks) ? b.checks : []).map(cleanCheck_).filter(c => c && c.day === today);
    checks.forEach(c => { c.issues = !!issueKeys[c.key]; });

    const board = [];
    (Array.isArray(b.board) ? b.board : []).forEach(x => {
      const staff = String((x && x.staff) || '').trim();
      if (!staff || /^testing account/i.test(staff)) return;
      (Array.isArray(x.machines) ? x.machines : []).map(m => String(m || '').trim()).filter(m => m && !/^assign equipment$/i.test(m))
        .forEach(m => board.push({ shift: Math.max(1, Math.round(num_(x.shift, 1))), task: String(x.task || '').trim(), staff, machine: m }));
    });

    addMachines_(mc, board.map(x => x.machine).concat(checks.map(c => c.machine)), today);

    const live = {};
    ctx.docs.filter(isLive_).forEach(d => { live[String(d.Code).trim().toUpperCase()] = d; });
    const exact = norm_(s.PRESTART_MATCH) === 'exact';
    const byTime = (x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0);
    const evals = board.map(x => {
      const st = who(x.staff);
      const mine = checks.filter(c => samePerson_(who, c.staff, x.staff));
      const onIt = mine.filter(c => norm_(c.machine) === norm_(x.machine)).sort(byTime)[0];
      const type = machineType_(mc, x.machine);
      const sameType = !onIt && !exact ? mine.filter(c => machineType_(mc, c.machine) === type).sort(byTime)[0] : null;
      const skipped = skip.indexOf(norm_(x.task)) >= 0;
      const needs = machineNeedsPrestart_(mc, x.machine);
      let pre, at = '', note = '';
      if (!needs) pre = 'Not needed';
      else if (skipped) pre = 'Not needed (' + x.task + ')';
      else if (onIt) { pre = 'Done'; at = onIt.time; }
      else if (sameType) { pre = 'Done'; at = sameType.time; note = 'Pre-start done on ' + sameType.machine; }
      else if (hhmm < shiftFrom_(s, x.shift)) pre = 'Not due yet';
      else pre = 'Not done';
      const swps = machineSwps_(mc, x.machine);
      const swpOut = [];
      if (st && !skipped) swps.filter(c => live[c]).forEach(c => {
        const i = itemStatus_(ctx, st, live[c]);
        if (i.status === 'To sign' || i.status === 'Overdue') swpOut.push({ code: c, title: String(live[c].Title).trim(), status: i.status, due: i.due, outdated: !!i.outdated });
      });
      if (!st) note = (note ? note + '. ' : '') + 'Not on the Staff tab';
      return Object.assign({}, x, { st, pre, at, note, swps, swpOut, skipped, type });
    });

    writeBookings_(today, evals, shiftsRead);
    logPrestarts_(checks, evals, mc, who);
    touchMachines_(mc, evals, checks, today);

    const plan = prestartPlanBuild_(s, today, hhmm, evals, checks, mc, who);
    plan.run = String(b.run || '').slice(0, 20);
    const props = PropertiesService.getScriptProperties();
    props.setProperty('ps:plan', JSON.stringify(plan));
    prunePrestartState_(props, today);
    return { ok: true, summary: plan.summaryLine, post: plan.post ? plan.post.kind : '', dm: plan.dm ? 'yes' : '' };
  } finally {
    lock.releaseLock();
  }
}

// TurfDog pre-check row -> { day, time, at, staff, machine, checklist, items, key }
function cleanCheck_(c) {
  if (!c) return null;
  const m = String(c.at || '').trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  const staff = String(c.staff || '').trim(), machine = String(c.machine || '').trim();
  if (!m || !staff || !machine) return null;
  const time = ('0' + m[2]).slice(-2) + ':' + m[3];
  const at = m[1] + ' ' + time;
  return { day: m[1], time, at, staff, machine, checklist: String(c.checklist || '').trim(), items: String(c.items || '').trim(), key: at + '|' + tdClean_(staff) + '|' + norm_(machine) };
}

// TurfDog names: drop "nicknames", emojis and punctuation.
function tdClean_(v) {
  return String(v || '').replace(/["“”][^"“”]*["“”]/g, ' ').replace(/[‘’']/g, '')
    .replace(/[^A-Za-z0-9À-ÿ -]/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

// TurfDog name -> Staff row. 'TurfDog name' column first, then the name, then first-name stem + surname
// (Josh = Joshua, Nick = Nicholas, Michael Kruse = Michael K).
function staffFor_(staff, name) {
  const n = tdClean_(name);
  if (!n) return null;
  let hit = staff.filter(r => tdClean_(r['TurfDog name']) === n);
  if (hit.length) return hit[0];
  hit = staff.filter(r => tdClean_(r.Name) === n);
  if (hit.length) return hit.filter(isActive_)[0] || hit[0];
  const p = n.split(' '), f = p[0], l = p.slice(1).join(' ');
  if (!l) return null;
  const stem = (a, b) => a === b || (a.length >= 3 && b.length >= 3 && a.slice(0, 3) === b.slice(0, 3));
  hit = staff.filter(r => {
    const q = tdClean_(r.Name).split(' '), rf = q[0], rl = q.slice(1).join(' ');
    if (!rl || !stem(f, rf)) return false;
    return rl === l || (rl.length === 1 && l.charAt(0) === rl) || (l.length === 1 && rl.charAt(0) === l);
  });
  if (hit.length > 1) hit = hit.filter(isActive_);
  return hit.length === 1 ? hit[0] : null;
}

function memoStaff_(staff) {
  const memo = {};
  return name => {
    const k = tdClean_(name);
    if (!(k in memo)) memo[k] = staffFor_(staff, name);
    return memo[k];
  };
}

function samePerson_(who, a, b) {
  if (tdClean_(a) === tdClean_(b)) return true;
  const x = who(a);
  return !!x && x === who(b);
}

function machines_() {
  const t = read_(TAB.MACHINES);
  const by = {};
  t.rows.forEach(r => { const k = norm_(r.Machine); if (k && !by[k]) by[k] = r; });
  return { t, by };
}

function machineType_(mc, name) {
  const r = mc.by[norm_(name)];
  const t = r ? String(r.Type || '').trim() : '';
  return norm_(t || String(name).replace(/\s+\d+\s*$/, ''));
}

function machineNeedsPrestart_(mc, name) {
  const r = mc.by[norm_(name)];
  if (r && r['Pre-start'] !== '' && r['Pre-start'] !== null && r['Pre-start'] !== undefined) return bool_(r['Pre-start']);
  return !PRESTART_NOT_MACHINE.test(String(name));
}

function machineSwps_(mc, name) {
  const r = mc.by[norm_(name)];
  return r ? String(r.SWP || '').toUpperCase().split(/[\s,;]+/).filter(c => /^[A-Z]{3}-\d+$/.test(c)) : [];
}

function addMachines_(mc, names, today) {
  const add = [];
  names.forEach(n => {
    const k = norm_(n);
    if (!k || mc.by[k]) return;
    const row = { Machine: n, Model: '', Type: String(n).replace(/\s+\d+\s*$/, ''), SWP: '', 'Pre-start': !PRESTART_NOT_MACHINE.test(n), 'Last booked': '', 'Last pre-start': '', Notes: 'New in TurfDog ' + today + ' - add its SWP' };
    mc.by[k] = row;
    add.push(row);
  });
  if (!add.length) return;
  // first row after the last named machine (the Pre-start checkboxes run further down the sheet)
  const at = mc.t.rows.filter(r => String(r.Machine || '').trim()).reduce((m, r) => Math.max(m, r._row), 1) + 1;
  mc.t.sh.getRange(at, 1, add.length, mc.t.head.length).setValues(add.map(r => mc.t.head.map(h => (h in r ? r[h] : ''))));
  add.forEach((r, i) => { r._row = at + i; });
}

function touchMachines_(mc, evals, checks, today) {
  const last = {};
  evals.forEach(e => { const k = norm_(e.machine); (last[k] = last[k] || {}).booked = today; });
  checks.forEach(c => { const k = norm_(c.machine); const o = last[k] = last[k] || {}; if (!o.pre || c.at > o.pre) o.pre = c.at; });
  const cB = mc.t.col('Last booked'), cP = mc.t.col('Last pre-start');
  Object.keys(last).forEach(k => {
    const r = mc.by[k];
    if (!r || !r._row) return;
    if (last[k].booked && cB > 0 && toKey_(r['Last booked']) !== today) mc.t.sh.getRange(r._row, cB).setValue(today);
    const lp = r['Last pre-start'] instanceof Date ? Utilities.formatDate(r['Last pre-start'], TZ, 'yyyy-MM-dd HH:mm') : String(r['Last pre-start'] || '');
    if (last[k].pre && cP > 0 && lp < last[k].pre) mc.t.sh.getRange(r._row, cP).setValue(last[k].pre);
  });
}

function shiftFrom_(s, n) {
  const m = String(s.PRESTART_SHIFT_FROM || '').match(new RegExp('(?:^|[,;\\s])' + n + '\\s*=\\s*(\\d{1,2})[:.](\\d{2})'));
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : (n === 1 ? '06:00' : '23:59');
}

// Machine Bookings: one row per shift / person / machine per day, updated on every run.
function writeBookings_(today, evals, shiftsRead) {
  const t = read_(TAB.BOOKINGS);
  const keyOf = (shift, staff, machine) => [num_(shift, 1), tdClean_(staff), norm_(machine)].join('|');
  const have = {};
  t.rows.filter(r => toKey_(r.Date) === today).forEach(r => { have[keyOf(r.Shift, r.Staff, r.Machine)] = r; });
  const seen = {}, add = [];
  evals.forEach(e => {
    const k = keyOf(e.shift, e.staff, e.machine);
    if (seen[k]) { e.dup = seen[k]; return; }
    seen[k] = e;
    const swpStatus = !e.st ? '' : !e.swps.length ? 'No SWP linked' :
      e.swpOut.length ? e.swpOut.map(x => x.code + (x.status === 'Overdue' ? ' overdue' : ' to sign')).join(', ') : 'Signed';
    const vals = { 'Task': e.task, 'Pre-start': e.pre, 'Pre-start at': e.at, 'SWP': e.swps.join(', '), 'SWP status': swpStatus, 'Notes': e.note };
    const r = have[k];
    if (r) {
      Object.keys(vals).forEach(h => { const c = t.col(h); if (c > 0 && String(r[h]) !== String(vals[h])) t.sh.getRange(r._row, c).setValue(vals[h]); });
      e.row = r._row;
      e.reminders = num_(r.Reminders, 0);
    } else {
      e.reminders = 0;
      add.push([e, Object.assign({ 'Date': today, 'Shift': e.shift, 'Staff': e.staff, 'Machine': e.machine, 'Reminders': 0, 'Last reminder': '' }, vals)]);
    }
  });
  // Bookings taken off a shift we just read: keep the row (history) but stop chasing it.
  Object.keys(have).forEach(k => {
    const r = have[k];
    if (seen[k] || shiftsRead.indexOf(num_(r.Shift, 1)) < 0) return;
    if (/^(Done|Off the board|Not needed)/.test(String(r['Pre-start']))) return;
    const c = t.col('Pre-start');
    if (c > 0) t.sh.getRange(r._row, c).setValue('Off the board');
  });
  if (add.length) {
    const at = t.sh.getLastRow() + 1;
    t.sh.getRange(at, 1, add.length, t.head.length).setValues(add.map(a => t.head.map(h => (h in a[1] ? a[1][h] : ''))));
    add.forEach((a, i) => { a[0].row = at + i; });
  }
  evals.forEach(e => { if (e.dup) { e.row = e.dup.row; e.reminders = e.dup.reminders; } });
}

// Pre-starts tab: a copy of the TurfDog pre-check log, with whether it matches the board.
function logPrestarts_(checks, evals, mc, who) {
  if (!checks.length) return;
  const t = read_(TAB.PRESTARTS);
  const have = {};
  t.rows.forEach(r => {
    const v = r['Done at'];
    const at = v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm') : String(v).trim().slice(0, 16);
    have[at + '|' + tdClean_(r.Staff) + '|' + norm_(r.Machine)] = r;
  });
  const add = [];
  checks.forEach(c => {
    const mine = evals.filter(e => samePerson_(who, e.staff, c.staff));
    const same = mine.find(e => norm_(e.machine) === norm_(c.machine));
    const typ = !same && mine.find(e => e.type === machineType_(mc, c.machine));
    const onBoard = same ? 'Yes' : typ ? 'Same type - board says ' + typ.machine : mine.length ? 'No - board says ' + mine.map(e => e.machine).join(', ') : 'Not booked on the board';
    const fits = checklistFits_(mc, c);
    const r = have[c.key];
    if (r) {
      if (c.issues && String(r.Issues) !== 'Yes') t.sh.getRange(r._row, t.col('Issues')).setValue('Yes');
      if (String(r['On the board']).split('.')[0] !== onBoard) t.sh.getRange(r._row, t.col('On the board')).setValue(onBoard + (fits ? '' : '. Checklist does not match the machine'));
      return;
    }
    have[c.key] = true;
    add.push({ 'Done at': c.at, 'Staff': c.staff, 'Machine': c.machine, 'Checklist': c.checklist, 'Items': c.items, 'Issues': c.issues ? 'Yes' : '',
      'On the board': onBoard + (fits ? '' : '. Checklist does not match the machine'), 'Logged at': new Date() });
  });
  if (!add.length) return;
  add.sort((x, y) => (x['Done at'] < y['Done at'] ? -1 : 1));
  const at = t.sh.getLastRow() + 1;
  t.sh.getRange(at, 1, add.length, t.head.length).setValues(add.map(r => t.head.map(h => (h in r ? r[h] : ''))));
}

// Does the checklist name share a word with the machine (or its Type)? "Gamberini Fertiliser Spreader" on a Workman doesn't.
function checklistFits_(mc, c) {
  const stop = { pre: 1, start: 1, use: 1, check: 1, checks: 1, checklist: 1, safety: 1, toro: 1, john: 1, deere: 1, the: 1, and: 1, daily: 1, operator: 1 };
  const words = v => tdClean_(v).split(/[\s-]+/).filter(w => w.length >= 3 && !stop[w]);
  const cl = words(c.checklist);
  if (!cl.length) return true;
  const r = mc.by[norm_(c.machine)];
  const mw = words(c.machine + ' ' + machineType_(mc, c.machine) + ' ' + (r ? String(r.Model || '') : ''));
  return cl.some(w => mw.indexOf(w) >= 0);
}

function prestartState_(props, today) {
  let st = {};
  try { st = JSON.parse(props.getProperty('ps:' + today) || '{}'); } catch (e) { st = {}; }
  return Object.assign({ header: '', thread: '', open: false, summary: false, issues: [], flags: [] }, st);
}

function prunePrestartState_(props, today) {
  if (typeof props.getKeys !== 'function') return;
  const cut = addDays_(today, -14);
  props.getKeys().filter(k => /^ps:\d{4}-\d{2}-\d{2}$/.test(k) && k.slice(3) < cut).forEach(k => props.deleteProperty(k));
}

// What to post. One post a day in the channel, then replies in its thread.
function prestartPlanBuild_(s, today, hhmm, evals, checks, mc, who) {
  const props = PropertiesService.getScriptProperties();
  const state = prestartState_(props, today);
  const site = String(s.SITE_URL || '').trim();
  const tag = e => {
    const id = e.st ? String(e.st['Slack ID'] || '').trim() : '';
    return /^[UW][A-Z0-9]{6,}$/.test(id) ? '<@' + id + '>' : '**' + e.staff + '**';
  };
  const personKey = e => (e.st ? 'S:' + norm_(e.st.Name) : 'T:' + tdClean_(e.staff));

  // Pre-starts not done, one line per person
  const out = {};
  evals.filter(e => e.pre === 'Not done').forEach(e => {
    const o = out[personKey(e)] = out[personKey(e)] || { who: tag(e), name: e.staff, machines: [], rows: [], reminders: 0 };
    if (o.machines.indexOf(e.machine) < 0) o.machines.push(e.machine);
    if (e.row && o.rows.indexOf(e.row) < 0) o.rows.push(e.row);
    o.reminders = Math.max(o.reminders, e.reminders || 0);
  });
  const people = Object.keys(out).map(k => out[k]).sort((a, b) => a.name.localeCompare(b.name));
  const rows = [].concat.apply([], people.map(o => o.rows));

  // SWPs not signed for machines booked today
  const swp = {};
  if (bool_(s.PRESTART_SWP)) evals.filter(e => e.swpOut.length).forEach(e => {
    const o = swp[personKey(e)] = swp[personKey(e)] || { who: tag(e), name: e.staff, docs: {} };
    e.swpOut.forEach(x => { o.docs[x.code] = x; });
  });
  const swpPeople = Object.keys(swp).map(k => swp[k]).sort((a, b) => a.name.localeCompare(b.name));
  const swpText = x => x.code + ' ' + x.title + (x.status === 'Overdue' ? ' (overdue)' : x.outdated ? ' (updated, sign by ' + nice_(x.due) + ')' : ' (sign by ' + nice_(x.due) + ')');
  const list = a => (a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a.join(''));
  const line = o => '• ' + o.who + ' ' + list(o.machines);
  const escAt = Math.max(1, num_(s.PRESTART_ESCALATE_AFTER, 2));
  const cc = String(s.PRESTART_CC || '').split(/[\s,;]+/).filter(x => /^[UW][A-Z0-9]{6,}$/.test(x));

  let post = null;
  if (!state.header) {
    if (people.length || (swpPeople.length && hhmm >= shiftFrom_(s, 1))) {
      const t = [];
      if (people.length) {
        t.push(':construction_worker: **Pre-starts not done yet** - ' + nice_(today));
        people.forEach(o => t.push(line(o)));
        t.push('Do your pre-start in TurfDog before you start the machine.');
        if (people.some(o => o.reminders + 1 >= escAt) && cc.length) t.push('cc ' + cc.map(x => '<@' + x + '>').join(' '));
      }
      if (swpPeople.length) {
        if (t.length) t.push('');
        t.push(':clipboard: **SWPs to sign for the machines you\'re on' + (people.length ? '' : ' - ' + nice_(today)) + '**');
        swpPeople.forEach(o => t.push('• ' + o.who + ' ' + Object.keys(o.docs).sort().map(c => swpText(o.docs[c])).join(' · ')));
        t.push('Read and sign on the safety page: ' + site);
      }
      post = { kind: 'header', text: t.join('\n'), thread: '', rows, open: people.length > 0 };
    }
  } else if (people.length) {
    const t = [':rotating_light: **Pre-start still not done** (' + clock_(new Date()) + ')'];
    people.forEach(o => t.push(line(o)));
    t.push('Do it in TurfDog before you use the machine.');
    if (people.some(o => o.reminders + 1 >= escAt) && cc.length) t.push('cc ' + cc.map(x => '<@' + x + '>').join(' '));
    post = { kind: 'reminder', text: t.join('\n'), thread: state.thread, rows, open: true };
  } else if (state.open) {
    post = { kind: 'allDone', text: ':white_check_mark: All pre-starts done.', thread: state.thread, rows: [], open: false };
  }

  // DM to Andrew: new faults straight away, the day summary once in the afternoon
  const dm = [];
  const newIssues = checks.filter(c => c.issues && state.issues.indexOf(c.key) < 0);
  if (newIssues.length) {
    dm.push(':warning: **Pre-start fault reported**');
    newIssues.forEach(c => dm.push('• ' + c.staff + ', ' + c.machine + ' at ' + clockOf_(c.time)));
    dm.push('Details in TurfDog: Staff > Safety > Safety Checklists > Pre-Check (Issues only).');
  }
  let summary = false;
  if (!state.summary && hhmm >= String(s.PRESTART_SUMMARY_AFTER || '13:30').trim()) {
    summary = true;
    if (dm.length) dm.push('');
    dm.push.apply(dm, prestartSummary_(today, evals, checks, mc, who));
  }

  const counted = uniqueBookings_(evals);
  const n = k => counted.filter(e => (k === 'Done' ? e.pre === 'Done' : k === 'Not needed' ? /^Not needed/.test(e.pre) : e.pre === k)).length;
  return {
    date: today, time: hhmm, generated: new Date().toISOString(),
    summaryLine: counted.length + ' machine bookings: ' + n('Done') + ' done, ' + n('Not done') + ' not done, ' + n('Not due yet') + ' not due yet, ' + n('Not needed') + ' not needed; ' +
      checks.length + ' pre-starts today; ' + swpPeople.length + ' with SWPs to sign',
    post, dm: dm.join('\n'), dmSummary: summary, dmIssues: newIssues.map(c => c.key)
  };
}

function uniqueBookings_(evals) {
  const seen = {};
  return evals.filter(e => {
    const k = tdClean_(e.staff) + '|' + norm_(e.machine);
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

function clockOf_(hhmm) {
  const p = String(hhmm).split(':').map(Number);
  const h = p[0] % 12 || 12;
  return h + (p[1] ? ':' + ('0' + p[1]).slice(-2) : '') + (p[0] < 12 ? 'am' : 'pm');
}

function prestartSummary_(today, evals, checks, mc, who) {
  const u = uniqueBookings_(evals);
  const done = u.filter(e => e.pre === 'Done'), notDone = u.filter(e => e.pre === 'Not done');
  const out = ['**Pre-starts, ' + nice_(today) + '**',
    u.length + ' machines booked on the board: ' + done.length + ' pre-started, ' + notDone.length + ' not done' +
    (u.length - done.length - notDone.length ? ', ' + (u.length - done.length - notDone.length) + ' not needed or not due' : '') + '.'];
  if (notDone.length) out.push('Not done: ' + notDone.map(e => e.staff + ' (' + e.machine + ')').join(', '));
  const moved = u.filter(e => /^Pre-start done on/.test(e.note));
  if (moved.length) out.push('Pre-start on a different machine to the board: ' + moved.map(e => e.staff + ' (board ' + e.machine + ', ' + e.note.replace(/^Pre-start done on /, 'did ') + ')').join(', '));
  const misfit = checks.filter(c => !checklistFits_(mc, c));
  if (misfit.length) out.push('Checklist doesn\'t match the machine: ' + misfit.map(c => c.staff + ', ' + c.machine + ' on "' + c.checklist + '"').join('; '));
  const offBoard = checks.filter(c => !evals.some(e => samePerson_(who, e.staff, c.staff)));
  if (offBoard.length) out.push('Pre-starts by people not booked on a machine: ' + offBoard.map(c => c.staff + ' (' + c.machine + ')').join(', '));
  const noSwp = [];
  u.forEach(e => { if (!e.skipped && !e.swps.length && /^(Done|Not done)$/.test(e.pre) && noSwp.indexOf(e.machine) < 0) noSwp.push(e.machine); });
  if (noSwp.length) out.push('Booked machines with no SWP linked on the Machines tab: ' + noSwp.join(', '));
  const unknown = [];
  u.forEach(e => {
    if (!e.st && unknown.indexOf(e.staff) < 0) unknown.push(e.staff);
    else if (e.st && !isActive_(e.st) && unknown.indexOf(e.staff + ' (matched ' + String(e.st.Name).trim() + ', not Active)') < 0) unknown.push(e.staff + ' (matched ' + String(e.st.Name).trim() + ', not Active)');
  });
  if (unknown.length) out.push('Check the Staff tab: ' + unknown.join(', '));
  return out;
}

function prestartPlan_(p) {
  prestartAuth_(settings_(), p.key);
  const plan = JSON.parse(PropertiesService.getScriptProperties().getProperty('ps:plan') || '{}');
  const today = dayKey_(new Date());
  if (plan.date !== today) return { ok: false, error: 'No TurfDog data received today yet' };
  if (p.run && String(p.run) !== plan.run) return { ok: false, pending: true, error: 'This run\'s TurfDog data has not arrived yet' };
  const age = (Date.now() - new Date(plan.generated).getTime()) / 60000;
  if (!(age <= 30)) return { ok: false, error: 'TurfDog data is ' + Math.round(age) + ' minutes old - read TurfDog again' };
  return {
    ok: true, run: plan.run, date: plan.date, time: plan.time, summary: plan.summaryLine,
    post: plan.post && !plan.postDone ? { kind: plan.post.kind, text: plan.post.text, thread: plan.post.thread } : null,
    dm: plan.dm && !plan.dmDone ? plan.dm : ''
  };
}

// The task reports what it posted: kind = header | reminder | allDone | dm, ts = the Slack message ts.
function prestartPosted_(p) {
  const s = settings_();
  prestartAuth_(s, p.key);
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const props = PropertiesService.getScriptProperties();
    const plan = JSON.parse(props.getProperty('ps:plan') || '{}');
    const today = dayKey_(new Date());
    if (plan.date !== today) throw new Error('No TurfDog data received today yet');
    const st = prestartState_(props, today);
    const kind = String(p.kind || '').trim();
    const ts = String(p.ts || '').trim();
    if (kind === 'dm') {
      if (plan.dmDone) return { ok: true, already: true };
      if (plan.dmSummary) st.summary = true;
      st.issues = st.issues.concat(plan.dmIssues || []);
      plan.dmDone = true;
    } else if (['header', 'reminder', 'allDone'].indexOf(kind) >= 0) {
      if (!plan.post) throw new Error('Nothing was due to post');
      if (plan.postDone) return { ok: true, already: true };
      if (kind === 'header' || !st.thread) { st.header = ts || 'posted'; st.thread = ts; }
      st.open = !!plan.post.open;
      const rows = plan.post.rows || [];
      if (rows.length) {
        const t = read_(TAB.BOOKINGS);
        const cR = t.col('Reminders'), cL = t.col('Last reminder');
        const byRow = {};
        t.rows.forEach(r => { byRow[r._row] = r; });
        rows.forEach(n => {
          const r = byRow[n];
          if (!r) return;
          if (cR > 0) t.sh.getRange(n, cR).setValue(num_(r.Reminders, 0) + 1);
          if (cL > 0) t.sh.getRange(n, cL).setValue(new Date());
        });
      }
      plan.postDone = true;
    } else {
      throw new Error('Unknown kind');
    }
    props.setProperty('ps:' + today, JSON.stringify(st));
    props.setProperty('ps:plan', JSON.stringify(plan));
    return { ok: true, thread: st.thread };
  } finally {
    lock.releaseLock();
  }
}

// Once-a-day flags for the task's own problem DMs (e.g. TurfDog logged out): first=true only the first time today.
function prestartFlag_(p) {
  prestartAuth_(settings_(), p.key);
  const props = PropertiesService.getScriptProperties();
  const today = dayKey_(new Date());
  const st = prestartState_(props, today);
  const name = String(p.name || '').trim().slice(0, 60);
  if (!name) throw new Error('Missing name');
  if (st.flags.indexOf(name) >= 0) return { ok: true, first: false };
  st.flags.push(name);
  props.setProperty('ps:' + today, JSON.stringify(st));
  return { ok: true, first: true };
}

/* ------------------------------------------------- new documents: daily review */
// Anything dropped in the Drive Library (by Katherine or anyone) waits as "To review" (new documents) or as a pending
// new version (documents already live) until a weekday Claude task has read it. The task calls reviewList, reads each
// file, then reviewDone: 'live' puts it on the staff page with its risk, who it applies to, a knowledge check, its
// machines on the Machines tab and a place at the end of FOCUS_QUEUE; 'hold' leaves it waiting with a note.
// reviewImport moves a file uploaded outside the Library into the right category folder. Uses PRESTART_KEY.

function reviewOn_(s) { return !('NEW_DOC_REVIEW' in s) || String(s.NEW_DOC_REVIEW).trim() === '' || bool_(s.NEW_DOC_REVIEW); }

function reviewPending_(props) {
  try { return JSON.parse((props || PropertiesService.getScriptProperties()).getProperty('review:pending') || '{}'); } catch (e) { return {}; }
}

function reviewFileInfo_(id) {
  try {
    const f = DriveApp.getFileById(id);
    let owner = '';
    try { owner = f.getOwner() ? f.getOwner().getEmail() : ''; } catch (e) {}
    return { fileId: id, fileName: f.getName(), link: f.getUrl(), mime: f.getMimeType(), created: dayKey_(f.getDateCreated()), owner };
  } catch (e) {
    return { fileId: id, error: 'File not found: ' + msg_(e) };
  }
}

function reviewList_(p) {
  const s = settings_();
  prestartAuth_(s, p.key);
  if (!('NEW_DOC_REVIEW' in s)) ensureSettings_();
  try { syncLibrary_(); } catch (e) { console.error('sync before review failed: ' + e); }
  const pend = reviewPending_();
  const docs = read_(TAB.DOCS).rows.filter(r => String(r.Code || '').trim());
  const pending = [];
  docs.forEach(d => {
    const code = String(d.Code).trim();
    const base = { code, title: String(d.Title || '').trim(), category: String(d.Category || '').trim(), risk: riskOf_(d),
      applies: String(d['Applies to'] || '').trim(), status: String(d.Status || '').trim(), version: num_(d.Version, 1), notes: String(d.Notes || '').trim() };
    if (base.status === 'To review' && String(d['File ID'] || '').trim()) pending.push(Object.assign(base, { kind: 'new' }, reviewFileInfo_(String(d['File ID']).trim())));
    else if (pend[code]) pending.push(Object.assign(base, { kind: 'version', liveFileId: String(d['File ID'] || '').trim(), uploaded: pend[code].at }, reviewFileInfo_(pend[code].id)));
  });
  const staffGroups = {};
  read_(TAB.STAFF).rows.filter(isActive_).forEach(st => groups_(st.Groups).forEach(g => { staffGroups[g] = (staffGroups[g] || 0) + 1; }));
  let machines = [];
  try { machines = read_(TAB.MACHINES).rows.map(m => ({ machine: String(m.Machine || '').trim(), type: String(m.Type || '').trim(), model: String(m.Model || '').trim(), swp: String(m.SWP || '').trim() })).filter(m => m.machine); } catch (e) {}
  const quizzes = quizzes_();
  return {
    ok: true, today: dayKey_(new Date()), review: reviewOn_(s), pending,
    docs: docs.map(d => ({ code: String(d.Code).trim(), title: String(d.Title || '').trim(), category: String(d.Category || '').trim(), status: String(d.Status || '').trim(),
      risk: riskOf_(d), applies: String(d['Applies to'] || '').trim(), questions: (quizzes[String(d.Code).trim().toUpperCase()] || []).length })),
    groups: staffGroups, machines, queue: String(s.FOCUS_QUEUE || ''),
    libraryFolderId: String(s.LIBRARY_FOLDER_ID || ''), categories: CATEGORIES
  };
}

// b: { key, code, decision: 'live'|'hold', note, title, risk, applies, summary, readSeconds, questions: [{ q, options: [..4], answer: 'A'..'D' | 0..3, why }], machines: [names], queue }
function reviewDone_(b) {
  const s = settings_();
  prestartAuth_(s, b.key);
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const code = String(b.code || '').trim().toUpperCase();
    const t = read_(TAB.DOCS);
    const d = t.rows.find(r => String(r.Code || '').trim().toUpperCase() === code);
    if (!d) throw new Error('No document ' + code);
    const props = PropertiesService.getScriptProperties();
    const pend = reviewPending_(props);
    const today = dayKey_(new Date());
    const note = String(b.note || '').trim().slice(0, 600);
    const decision = String(b.decision || '').trim().toLowerCase();
    if (decision === 'hold') {
      writeRow_(t, d._row, { 'Notes': 'Held ' + today + ': ' + (note || 'see Andrew') });
      return { ok: true, code, held: true };
    }
    if (decision !== 'live') throw new Error('decision must be live or hold');
    const isVersion = !!pend[code];
    if (!isVersion && String(d.Status || '').trim() !== 'To review') throw new Error(code + ' is not waiting for review');
    const upd = { 'Status': 'Live', 'Notes': 'Reviewed ' + today + (note ? ': ' + note : '') };
    if (isVersion) {
      const f = DriveApp.getFileById(pend[code].id);
      Object.assign(upd, { 'File ID': f.getId(), 'File name': f.getName(), 'Link': f.getUrl(), 'Version': num_(d.Version, 1) + 1, 'Updated': new Date() });
      delete pend[code];
      props.setProperty('review:pending', JSON.stringify(pend));
    }
    const title = String(b.title || '').trim();
    if (title) upd['Title'] = title.slice(0, 120);
    const risk = String(b.risk || '').trim();
    if (['High', 'Medium', 'Low'].indexOf(risk) >= 0) upd['Risk'] = risk;
    const applies = String(b.applies || '').trim();
    if (applies) upd['Applies to'] = applies;
    const summary = String(b.summary || '').trim();
    if (summary) upd['Summary'] = summary.slice(0, 400);
    if (num_(b.readSeconds, 0) > 0) upd['Read time (sec)'] = Math.round(num_(b.readSeconds, 0));
    writeRow_(t, d._row, upd);

    // Knowledge check: replaces any questions this document already had
    let nq = 0;
    const qs = Array.isArray(b.questions) ? b.questions : [];
    if (qs.length) {
      const qt = read_(TAB.QUIZ);
      qt.rows.filter(r => String(r.Code || '').trim().toUpperCase() === code).map(r => r._row).sort((x, y) => y - x).forEach(r => qt.sh.deleteRow(r));
      const rows = [];
      qs.forEach((q, i) => {
        const opts = (Array.isArray(q.options) ? q.options : []).map(o => String(o || '').trim()).filter(Boolean).slice(0, 4);
        let ans = q.answer;
        if (typeof ans === 'number') ans = 'ABCD'.charAt(ans);
        ans = String(ans || '').trim().toUpperCase().charAt(0);
        if (!String(q.q || '').trim() || opts.length < 2 || 'ABCD'.indexOf(ans) < 0 || 'ABCD'.indexOf(ans) >= opts.length) return;
        while (opts.length < 4) opts.push('');
        rows.push(qt.head.map(h => ({ 'Code': code, 'No.': rows.length + 1, 'Question': String(q.q).trim(), 'Option A': opts[0], 'Option B': opts[1], 'Option C': opts[2], 'Option D': opts[3], 'Answer': ans, 'Why': String(q.why || '').trim() })[h] ?? ''));
      });
      if (rows.length) qt.sh.getRange(qt.sh.getLastRow() + 1, 1, rows.length, qt.head.length).setValues(rows);
      nq = rows.length;
    }

    // Machines tab: link this SWP to the machines it covers
    const linked = [];
    const want = (Array.isArray(b.machines) ? b.machines : []).map(x => norm_(x)).filter(Boolean);
    if (want.length) {
      const mt = read_(TAB.MACHINES);
      mt.rows.forEach(r => {
        if (want.indexOf(norm_(r.Machine)) < 0) return;
        const cur = String(r.SWP || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
        if (cur.map(x => x.toUpperCase()).indexOf(code) < 0) { cur.push(code); writeRow_(mt, r._row, { 'SWP': cur.join(', ') }); }
        linked.push(String(r.Machine).trim());
      });
    }

    // #ohs push: new documents join the end of the queue
    let queued = false;
    if (b.queue !== false) {
      const q = String(s.FOCUS_QUEUE || '').split(/[\s,;]+/).filter(Boolean);
      if (q.map(x => x.toUpperCase()).indexOf(code) < 0) { q.push(code); setSetting_('FOCUS_QUEUE', q.join(', ')); queued = true; }
    }
    CacheService.getScriptCache().remove('library');
    props.setProperty('dirty', '1');
    return { ok: true, code, live: true, version: upd['Version'] || num_(d.Version, 1), questions: nq, machines: linked, queued };
  } finally {
    lock.releaseLock();
  }
}

// b: { key, fileId, category } - moves a file uploaded outside the Library into its category folder and syncs it in.
function reviewImport_(b) {
  const s = settings_();
  prestartAuth_(s, b.key);
  const cat = String(b.category || '').trim();
  if (CATEGORIES.indexOf(cat) < 0) throw new Error('category must be one of: ' + CATEGORIES.join(', '));
  const root = DriveApp.getFolderById(s.LIBRARY_FOLDER_ID);
  let target = null;
  const subs = root.getFolders();
  while (subs.hasNext() && !target) { const f = subs.next(); if (catName_(f.getName()) === cat) target = f; }
  if (!target) throw new Error('No Library folder for ' + cat);
  const f = DriveApp.getFileById(String(b.fileId || '').trim());
  f.moveTo(target);
  syncLibrary_();
  const d = read_(TAB.DOCS).rows.find(r => String(r['File ID'] || '').trim() === f.getId());
  const pend = reviewPending_();
  const code = d ? String(d.Code).trim() : (Object.keys(pend).find(c => pend[c].id === f.getId()) || '');
  return { ok: true, moved: target.getName(), code };
}

/* ------------------------------------------- one document at a time in #ohs */
// A Claude task asks for the plan (GET focusPlan) twice each weekday (morning and after lunch), posts it in Slack
// #ohs and reports back (GET focusPosted). The current document is posted once with everyone who still has to sign
// it tagged, then each run the people still outstanding are tagged again in a new post in the channel (not a thread
// reply, so it can't be missed). A run that was missed is caught up by the next one. When everyone it applies to has
// signed, a thank you goes up and then the next document in FOCUS_QUEUE. Uses PRESTART_KEY. Manual run: previewFocus.

function previewFocus() {
  console.log(JSON.stringify(focusPlanBuild_(settings_(), true), null, 2));
}

function focusState_(props) {
  let st = {};
  try { st = JSON.parse(props.getProperty('focus') || '{}'); } catch (e) { st = {}; }
  return Object.assign({ code: '', started: '', thread: '', last: '', slot: '', days: 0, done: [], finished: '' }, st);
}

// 'YYYY-MM-DD am' before midday Melbourne time, 'YYYY-MM-DD pm' after: one #ohs post per half day.
function focusSlot_(d) {
  d = d || new Date();
  return dayKey_(d) + (Number(Utilities.formatDate(d, TZ, 'HH')) < 12 ? ' am' : ' pm');
}
function focusSlotPosted_(st, slot) {
  if (st.slot) return st.slot === slot;
  return st.last === slot.slice(0, 10) && / am$/.test(slot);  // state from before half-day slots: counts as the morning post
}

function focusLink_(s, code) {
  const base = String(s.SITE_URL || '').trim();
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'doc=' + encodeURIComponent(code);
}

// Active staff (not guests, not FOCUS_SKIP) who have to sign this document and haven't signed its current version.
function focusOutstanding_(ctx, s, doc) {
  const skip = String(s.FOCUS_SKIP || '').split(/[,;]/).map(norm_).filter(Boolean);
  const need = [], all = [];
  ctx.staff.filter(isActive_).forEach(st => {
    if (isGuest_(st) || !applies_(doc, st) || skip.indexOf(norm_(st.Name)) >= 0) return;
    all.push(st);
    const i = itemStatus_(ctx, st, doc);
    if (i.status === 'To sign' || i.status === 'Overdue') need.push(st);
  });
  need.sort((a, b) => String(a.Name).localeCompare(String(b.Name)));
  return { need, all };
}

function focusTag_(st) {
  const id = String(st['Slack ID'] || '').trim();
  return /^[UW][A-Z0-9]{6,}$/.test(id) ? '<@' + id + '>' : '**' + String(st.Name).trim() + '**';
}

function focusPlanBuild_(s, preview) {
  const ctx = context_();
  const props = PropertiesService.getScriptProperties();
  const st = focusState_(props);
  const today = ctx.today;
  const live = {};
  ctx.docs.filter(isLive_).forEach(d => { live[String(d.Code).trim().toUpperCase()] = d; });
  const queue = String(s.FOCUS_QUEUE || '').toUpperCase().split(/[\s,;]+/).filter(c => /^[A-Z]{3}-\d+$/.test(c));
  const name = d => String(d.Code).trim() + ' ' + String(d.Title).trim();
  let quizzes = {};
  try { quizzes = quizzes_(); } catch (e) { quizzes = {}; }
  const posts = [];
  let dm = '';

  const slot = focusSlot_();
  if (focusSlotPosted_(st, slot) && !preview) return { today, slot, code: st.code, posts, dm, note: 'Already posted this ' + (/ am$/.test(slot) ? 'morning' : 'afternoon') };

  let cur = st.code && live[st.code] ? live[st.code] : null;
  if (cur) {
    const o = focusOutstanding_(ctx, s, cur);
    if (o.need.length) {
      const day = st.last === today ? (st.days || 1) : (st.days || 1) + 1;
      const cc = String(s.FOCUS_CC || '').split(/[\s,;]+/).filter(x => /^[UW][A-Z0-9]{6,}$/.test(x));
      const t = [':bell: **Still to sign: ' + name(cur) + '** (' + (o.all.length - o.need.length) + ' of ' + o.all.length + ' done)',
        o.need.map(focusTag_).join(' '),
        'Please read and sign it today. We don\'t move on to the next one until everyone has signed.',
        ':point_right: ' + focusLink_(s, st.code)];
      if (day >= num_(s.FOCUS_CC_FROM, 3) && cc.length) t.push('cc ' + cc.map(x => '<@' + x + '>').join(' '));
      posts.push({ kind: 'reminder', code: st.code, thread: '', broadcast: false, text: t.join('\n') });
      return { today, slot, code: st.code, posts, dm, outstanding: o.need.map(x => String(x.Name).trim()) };
    }
    posts.push({ kind: 'done', code: st.code, thread: '', broadcast: false, text: '' });
  }

  // Next document in the queue that someone still has to sign
  const done = st.done.concat(cur ? [st.code] : []);
  let next = null, nextOut = null;
  for (let i = 0; i < queue.length && !next; i++) {
    const d = live[queue[i]];
    if (!d || queue[i] === st.code) continue;
    const o = focusOutstanding_(ctx, s, d);
    if (o.need.length) { next = d; nextOut = o; }
  }
  if (posts.length) posts[0].text = ':white_check_mark: **Everyone has signed ' + name(cur) + '.** Thanks all.' + (next ? ' Next one is up.' : '');
  if (next) {
    const code = String(next.Code).trim();
    const q = (quizzes[code.toUpperCase()] || []).length;
    const t = [':clipboard: **Safe work procedure to sign: ' + name(next) + '**',
      (q ? 'Read it on your phone, answer the ' + q + '-question check and sign.' : 'Read it on your phone and sign.') + ' First time? Pick your name from the list. Your name comes off here once you\'ve signed.',
      ':point_right: ' + focusLink_(s, code),
      nextOut.need.map(focusTag_).join(' ')];
    posts.push({ kind: 'header', code, thread: '', broadcast: false, text: t.join('\n') });
  } else if (!st.finished) {
    dm = 'Everyone has signed every document in the #ohs queue (FOCUS_QUEUE on the Settings tab). Add more codes there to keep it going.';
  }
  return { today, slot, code: next ? String(next.Code).trim() : '', posts, dm, outstanding: nextOut ? nextOut.need.map(x => String(x.Name).trim()) : [], done };
}

function focusPlan_(p) {
  let s = settings_();
  prestartAuth_(s, p.key);
  if (!('FOCUS_QUEUE' in s)) { ensureSettings_(); s = settings_(); }
  const plan = focusPlanBuild_(s, false);
  PropertiesService.getScriptProperties().setProperty('focus:plan', JSON.stringify(plan));
  return Object.assign({ ok: true }, plan);
}

// kind = header | reminder | done | dm, ts = the Slack message ts (header)
function focusPosted_(p) {
  const s = settings_();
  prestartAuth_(s, p.key);
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const props = PropertiesService.getScriptProperties();
    const st = focusState_(props);
    const now = new Date();
    const today = dayKey_(now);
    const kind = String(p.kind || '').trim();
    const code = String(p.code || '').trim().toUpperCase();
    if (kind === 'header') {
      if (!code) throw new Error('Missing code');
      if (st.code === code && st.started === today) return { ok: true, already: true };
      Object.assign(st, { code, started: today, thread: String(p.ts || '').trim(), last: today, days: 1 });
    } else if (kind === 'reminder') {
      if (st.last !== today) { st.last = today; st.days = (st.days || 1) + 1; }
    } else if (kind === 'done') {
      if (st.code && st.done.indexOf(st.code) < 0) st.done.push(st.code);
      st.last = today;
      if (!code || code === st.code) { st.code = ''; st.thread = ''; }
    } else if (kind === 'dm') {
      st.finished = today;
      st.last = today;
    } else {
      throw new Error('Unknown kind');
    }
    st.slot = focusSlot_(now);
    props.setProperty('focus', JSON.stringify(st));
    return { ok: true, state: st };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------- helpers */

function sheet_(name) {
  const sh = book_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab: ' + name + ' - run setup()');
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
  const g = groups_(st.Groups);
  // Guests (e.g. a manager reviewing a module) only get documents that name 'Guest' in Applies to.
  if (g.indexOf('guest') >= 0) return a.indexOf('guest') >= 0;
  if (!a.length || a.indexOf('all') >= 0) return true;
  return a.some(x => g.indexOf(x) >= 0);
}
function isGuest_(st) { return groups_(st.Groups).indexOf('guest') >= 0; }
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

/* =====================================================================
 * MONTHLY H&S INSPECTIONS (docs/inspection.html + inspection-dashboard.html)
 *
 * Staff walk the area on their phone, answer every line Yes / No / N/A
 * (No needs a description and can carry photos, N/A needs a reason),
 * sign with a finger and submit. Three tabs make the register:
 *   Inspections         one row per inspection (times, counts, score, signature, review sign-off)
 *   Inspection Defects  one row per defect, Open until closed out with a name, note and signature
 *   Inspection Answers  every answer from every inspection
 * Slack: a summary posts when an inspection is submitted (High defects tag INSP_ALERT_CC), and a
 * reminder posts at 7am on weekdays once an area is overdue (then weekly until it is done).
 * Manual runs: setupInspections, previewInspectionReminder.
 * ===================================================================== */

const INSP_TAB = { MAIN: 'Inspections', DEF: 'Inspection Defects', ANS: 'Inspection Answers' };
const INSP_HEAD = {
  'Inspections': ['Submitted', 'Receipt', 'Area', 'Area name', 'Inspector', 'Started', 'Finished (device)', 'Minutes', 'Yes', 'No', 'N/A', 'Total', 'Score %',
    'Checklist version', 'Other hazards', 'Declaration', 'Signature', 'Device', 'Client ID', 'Reviewed by', 'Reviewed at', 'Review comment', 'Review signature'],
  'Inspection Defects': ['Defect ID', 'Receipt', 'Area', 'Found at', 'Found by', 'Section', 'Ref', 'Key', 'Item', 'Equipment', 'Description', 'Priority',
    'Times seen', 'Last seen', 'Latest note', 'Photos', 'Photo IDs', 'Status', 'Fixed on the spot', 'Fix note', 'Closed by', 'Closed at', 'Close-out note', 'Close-out signature'],
  'Inspection Answers': ['Submitted', 'Receipt', 'Area', 'Section', 'Key', 'Kind', 'Item', 'Equipment', 'Result', 'Value', 'Last done', 'Comment', 'N/A reason', 'Answered at']
};
const INSP_AREAS = { compound: 'Maintenance compound', clubhouse: 'Clubhouse' };

// Manual run: create the inspection tabs and settings (also happens automatically on first use).
function setupInspections() {
  inspEnsure_(true);
  console.log('Inspection tabs and settings ready.');
}

// Manual run: show what the overdue reminder would say right now (posts nothing).
function previewInspectionReminder() {
  const r = inspReminders_({ dryRun: true, force: true });
  console.log(r || 'No area is due.');
}

function inspEnsure_(force) {
  const ss = book_();
  const props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty('insp_ready') === '4') return;
  if (!('INSP_PAGE_URL' in settings_())) ensureSettings_();
  const widths = {
    'Inspections': [140, 160, 90, 170, 150, 140, 140, 70, 50, 50, 50, 55, 70, 110, 300, 300, 80, 220, 110, 150, 140, 260, 90],
    'Inspection Defects': [190, 160, 90, 140, 150, 70, 55, 170, 330, 200, 330, 75, 70, 140, 280, 260, 120, 75, 80, 220, 150, 140, 300, 90],
    'Inspection Answers': [140, 160, 90, 70, 170, 70, 330, 200, 70, 100, 100, 300, 240, 140]
  };
  const when = 'ddd d mmm yy h:mm am/pm';
  const at = (name, h) => INSP_HEAD[name].indexOf(h) + 1;
  [INSP_TAB.MAIN, INSP_TAB.DEF, INSP_TAB.ANS].forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      const after = ss.getSheetByName(TAB.KEYLOG) || ss.getSheetByName(TAB.REGISTER);
      sh = ss.insertSheet(name, after ? after.getIndex() : ss.getSheets().length);
    }
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, INSP_HEAD[name].length).setValues([INSP_HEAD[name]]);
      styleHeader_(sh, INSP_HEAD[name].length);
      (widths[name] || []).forEach((w, j) => sh.setColumnWidth(j + 1, w));
      if (name === INSP_TAB.MAIN) {
        ['Submitted', 'Started', 'Finished (device)', 'Reviewed at'].forEach(h => sh.getRange(2, at(name, h), 5000, 1).setNumberFormat(when));
      }
      if (name === INSP_TAB.DEF) {
        ['Found at', 'Last seen', 'Closed at'].forEach(h => sh.getRange(2, at(name, h), 5000, 1).setNumberFormat(when));
        sh.getRange(2, at(name, 'Priority'), 5000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['High', 'Medium', 'Low'], true).build());
        sh.getRange(2, at(name, 'Status'), 5000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Open', 'Closed'], true).build());
        sh.getRange(2, at(name, 'Description'), 5000, 1).setWrap(true);
      }
      if (name === INSP_TAB.ANS) {
        sh.getRange(2, at(name, 'Submitted'), 50000, 1).setNumberFormat(when);
        sh.getRange(2, at(name, 'Value'), 50000, 2).setNumberFormat('@');
      }
    } else {
      INSP_HEAD[name].forEach(h => ensureColumn_(sh, h));
    }
  });
  if (!String(settings_().INSP_GO_LIVE || '').trim()) setSetting_('INSP_GO_LIVE', dayKey_(new Date()));
  props.setProperty('insp_ready', '4');
}

function inspSettings_() {
  const s = settings_();
  return {
    s,
    every: num_(s.INSP_EVERY_DAYS, 31),
    page: String(s.INSP_PAGE_URL || '').trim() || 'https://andranf.github.io/ranfurlie-safety/inspection.html',
    dash: String(s.INSP_DASH_URL || '').trim() || 'https://andranf.github.io/ranfurlie-safety/inspection-dashboard.html',
    hook: String(s.INSP_SLACK_WEBHOOK_URL || '').trim() || String(s.SLACK_WEBHOOK_URL || '').trim(),
    cc: String(s.INSP_ALERT_CC || '').split(/[\s,;]+/).filter(x => /^[UW][A-Z0-9]{6,}$/.test(x))
  };
}

function inspIso_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  return v === null || v === undefined ? '' : String(v);
}
function inspDate_(v) { const d = v ? new Date(v) : null; return d && !isNaN(d.getTime()) ? d : ''; }
function inspArea_(v) { const a = String(v || '').trim().toLowerCase(); if (!/^[a-z0-9-]{2,30}$/.test(a)) throw new Error('Unknown area.'); return a; }
function inspBust_() {
  const c = CacheService.getScriptCache();
  const keys = ['insp:status'];
  Object.keys(INSP_AREAS).forEach(a => [6, 12, 24].forEach(m => keys.push('insp:data:' + a + ':' + m)));
  try { c.removeAll(keys); } catch (e) {}
}
function inspSigFile_(s, sig, label) {
  const m = String(sig || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[1].length < 200 || m[1].length > 600000) throw new Error('Please draw your signature.');
  const now = new Date();
  return DriveApp.getFolderById(s.SIGNATURE_FOLDER_ID).createFile(
    Utilities.newBlob(Utilities.base64Decode(m[1]), 'image/png', Utilities.formatDate(now, TZ, 'yyyy-MM-dd HHmm') + ' ' + label + '.png'));
}
function inspPhotoFolder_(s) {
  let id = String(s.INSP_PHOTO_FOLDER_ID || '').trim();
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { id = ''; } }
  let parent = null;
  try { parent = DriveApp.getFileById(SHEET_ID).getParents().next(); } catch (e) {}
  const f = parent ? parent.createFolder('Inspection photos') : DriveApp.createFolder('Ranfurlie Inspection Photos');
  share_(f);   // link-viewable so the dashboard can show thumbnails
  setSetting_('INSP_PHOTO_FOLDER_ID', f.getId());
  return f;
}

/* ------------------------------------------------------------ submit */

function inspSubmit_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    inspEnsure_();
    const ctx = context_();
    const st = who_(ctx, b);
    const name = String(st.Name).trim();
    const area = inspArea_(b.site);
    const cfg = inspSettings_();
    const clientId = String(b.clientId || '').slice(0, 40);

    const main = read_(INSP_TAB.MAIN);
    if (clientId) {
      const dup = main.rows.find(r => String(r['Client ID']) === clientId);
      if (dup) return { ok: true, duplicate: true, receipt: String(dup.Receipt), submittedAt: Utilities.formatDate(asDate_(dup.Submitted) || new Date(), TZ, 'd MMM yyyy, h:mm a'), score: dup['Score %'] };
    }
    if (b.declare !== true) throw new Error('Tick the declaration to submit.');
    const answers = Array.isArray(b.answers) ? b.answers : [];
    if (answers.length < 5 || answers.length > 3000) throw new Error('The checklist did not come through. Reload and try again.');

    // Recount on the server and enforce the rules (every No described, every N/A explained).
    let yes = 0, no = 0, na = 0;
    answers.forEach(a => {
      const r = String(a.result || '');
      if (r === 'text') return;
      if (r === 'yes') yes++;
      else if (r === 'no') { no++; if (String(a.comment || '').trim().length < 3) throw new Error('Every No needs a description: ' + String(a.label || a.key)); }
      else if (r === 'na') { na++; if (String(a.naReason || '').trim().length < 3) throw new Error('Every N/A needs a reason: ' + String(a.label || a.key)); }
      else throw new Error('Not every line is answered: ' + String(a.label || a.key));
    });
    const total = yes + no + na;
    const score = yes + no ? Math.round(1000 * yes / (yes + no)) / 10 : '';

    const now = new Date();
    const started = inspDate_(b.startedAt);
    const minutes = started ? Math.max(1, Math.round((now - started) / 60000)) : '';
    const receipt = 'INS-' + Utilities.formatDate(now, TZ, 'yyMMdd') + '-' + sha_(name + '|' + area + '|' + now.getTime() + '|' + clientId).slice(0, 6).toUpperCase();
    const sigFile = inspSigFile_(ctx.s, b.signature, name + ' Inspection ' + area + ' ' + receipt);

    const mainRow = {
      'Submitted': now, 'Receipt': receipt, 'Area': area, 'Area name': String(b.siteName || INSP_AREAS[area] || area).slice(0, 80), 'Inspector': name,
      'Started': started, 'Finished (device)': inspDate_(b.finishedAt), 'Minutes': minutes, 'Yes': yes, 'No': no, 'N/A': na, 'Total': total, 'Score %': score,
      'Checklist version': String(b.version || '').slice(0, 30), 'Other hazards': String(b.other || '').slice(0, 3000),
      'Declaration': String(b.declaration || '').slice(0, 400), 'Signature': '=HYPERLINK("' + sigFile.getUrl() + '","View")',
      'Device': String(b.ua || '').slice(0, 160), 'Client ID': clientId
    };
    main.sh.appendRow(main.head.map(h => (h in mainRow ? mainRow[h] : '')));

    // Answers - one block write
    const ans = read_(INSP_TAB.ANS);
    const aRows = answers.map(a => {
      const o = {
        'Submitted': now, 'Receipt': receipt, 'Area': area, 'Section': String(a.sec || '').slice(0, 8), 'Key': String(a.key || '').slice(0, 80),
        'Kind': String(a.kind || '').slice(0, 12), 'Item': String(a.label || '').slice(0, 300), 'Equipment': String(a.asset || '').slice(0, 120),
        'Result': String(a.result || ''), 'Value': String(a.value || '').slice(0, 120), 'Last done': String(a.last || '').slice(0, 20),
        'Comment': String(a.comment || '').slice(0, 1500), 'N/A reason': String(a.naReason || '').slice(0, 500), 'Answered at': inspDate_(a.at)
      };
      return ans.head.map(h => (h in o ? o[h] : ''));
    });
    if (aRows.length) {
      const at = ans.sh.getLastRow() + 1;
      const vc = ans.col('Value'), lc = ans.col('Last done');
      if (vc > 0) ans.sh.getRange(at, vc, aRows.length, 1).setNumberFormat('@');
      if (lc > 0) ans.sh.getRange(at, lc, aRows.length, 1).setNumberFormat('@');
      ans.sh.getRange(at, 1, aRows.length, ans.head.length).setValues(aRows);
    }

    // Defects - photos to Drive. A defect already open for the same line is updated (Times seen +1), not duplicated.
    const defs = Array.isArray(b.defects) ? b.defects.slice(0, 300) : [];
    const def = read_(INSP_TAB.DEF);
    const openBy = {};
    def.rows.forEach(r => { if (String(r.Area) === area && String(r.Status).trim() !== 'Closed' && String(r.Key)) openBy[String(r.Key)] = r; });
    const rank = { High: 3, Medium: 2, Low: 1 };
    let folder = null, photoErr = '', repeats = 0;
    const dRows = [];
    defs.forEach((d, i) => {
      const id = receipt + '-' + ('0' + (i + 1)).slice(-2);
      const urls = [], ids = [];
      (Array.isArray(d.photos) ? d.photos.slice(0, 3) : []).forEach((p, j) => {
        const m = String(p || '').match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
        if (!m) return;
        try {
          folder = folder || inspPhotoFolder_(ctx.s);
          const f = folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), 'image/' + m[1], id + ' ' + (j + 1) + (m[1] === 'png' ? '.png' : '.jpg')));
          share_(f);
          urls.push(f.getUrl()); ids.push(f.getId());
        } catch (e) { photoErr = String(e); console.warn('photo save failed: ' + e); }
      });
      const fixed = d.fixed === true;
      const pr = ['High', 'Medium', 'Low'].indexOf(String(d.priority)) >= 0 ? String(d.priority) : 'Medium';
      const prev = openBy[String(d.key || '')];
      if (prev) {
        repeats++;
        d.repeat = num_(prev['Times seen'], 1) + 1;
        const upd = { 'Times seen': d.repeat, 'Last seen': now, 'Latest note': (Utilities.formatDate(now, TZ, 'd MMM') + ' ' + name + ': ' + String(d.description || '')).slice(0, 1500) };
        if ((rank[pr] || 2) > (rank[String(prev.Priority)] || 2)) upd.Priority = pr;
        if (urls.length) {
          upd.Photos = [String(prev.Photos || '')].concat(urls).filter(Boolean).join('\n');
          upd['Photo IDs'] = [String(prev['Photo IDs'] || '')].concat(ids).filter(Boolean).join(',');
        }
        if (fixed) Object.assign(upd, { 'Status': 'Closed', 'Fixed on the spot': 'Yes', 'Fix note': String(d.fixNote || '').slice(0, 800), 'Closed by': name, 'Closed at': now,
          'Close-out note': 'Fixed during the inspection' + (d.fixNote ? ': ' + String(d.fixNote).slice(0, 700) : '') });
        writeRow_(def, prev._row, upd);
        return;
      }
      const o = {
        'Defect ID': id, 'Receipt': receipt, 'Area': area, 'Found at': now, 'Found by': name, 'Section': String(d.sec || '').slice(0, 8),
        'Ref': String(d.ref || '').slice(0, 12), 'Key': String(d.key || '').slice(0, 80), 'Item': String(d.label || '').slice(0, 300),
        'Equipment': String(d.asset || '').slice(0, 120), 'Description': String(d.description || '').slice(0, 1500), 'Priority': pr,
        'Times seen': 1, 'Last seen': now, 'Photos': urls.join('\n'), 'Photo IDs': ids.join(','), 'Status': fixed ? 'Closed' : 'Open', 'Fixed on the spot': fixed ? 'Yes' : '',
        'Fix note': fixed ? String(d.fixNote || '').slice(0, 800) : '', 'Closed by': fixed ? name : '', 'Closed at': fixed ? now : '',
        'Close-out note': fixed ? 'Fixed during the inspection' + (d.fixNote ? ': ' + String(d.fixNote).slice(0, 700) : '') : ''
      };
      dRows.push(def.head.map(h => (h in o ? o[h] : '')));
    });
    if (dRows.length) def.sh.getRange(def.sh.getLastRow() + 1, 1, dRows.length, def.head.length).setValues(dRows);

    inspBust_();
    try { inspSubmitSlack_(ctx, cfg, { name, area, areaName: mainRow['Area name'], score, yes, no, na, minutes, defs, receipt }); } catch (e) { console.warn('inspection slack: ' + e); }
    return { ok: true, receipt, submittedAt: Utilities.formatDate(now, TZ, 'd MMM yyyy, h:mm a'), score, photoError: photoErr || undefined };
  } finally {
    lock.releaseLock();
  }
}

function inspSubmitSlack_(ctx, cfg, x) {
  if (!cfg.hook) return;
  const open = x.defs.filter(d => d.fixed !== true);
  const high = open.filter(d => d.priority === 'High');
  const lines = [':clipboard: *Monthly inspection: ' + x.areaName + '* by ' + slackName_(ctx, x.name) + (x.score === '' ? '' : ' · *' + x.score + '%*'),
    x.yes + ' yes · ' + x.no + ' defect' + (x.no === 1 ? '' : 's') + ' · ' + x.na + ' N/A' + (x.minutes ? ' · ' + x.minutes + ' min' : '')];
  if (high.length) lines.push(':red_circle: *High:* ' + high.slice(0, 5).map(d => (d.ref ? d.ref + ' ' : '') + (d.asset ? d.asset + ': ' : '') + String(d.description || d.label).slice(0, 80) + (d.repeat ? ' _(seen ' + d.repeat + ' times)_' : '')).join('; ') + (high.length > 5 ? ' (+' + (high.length - 5) + ' more)' : ''));
  const med = open.filter(d => d.priority === 'Medium').length, low = open.filter(d => d.priority === 'Low').length;
  if (med || low) lines.push(':large_orange_circle: ' + [med ? med + ' medium' : '', low ? low + ' low' : ''].filter(Boolean).join(' · '));
  const fixed = x.defs.length - open.length;
  if (fixed) lines.push(':white_check_mark: ' + fixed + ' fixed on the spot');
  lines.push('<' + cfg.dash + '|Open the dashboard>');
  if (high.length && cfg.cc.length) lines.push('cc ' + cfg.cc.map(id => '<@' + id + '>').join(' '));
  UrlFetchApp.fetch(cfg.hook, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text: lines.join('\n'), link_names: true }), muteHttpExceptions: true });
}

/* --------------------------------------------------- close-out / review */

function inspClose_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    inspEnsure_();
    const ctx = context_();
    const name = String(who_(ctx, b).Name).trim();
    const note = String(b.note || '').trim();
    if (note.length < 3) throw new Error('Say what was done to fix it.');
    const t = read_(INSP_TAB.DEF);
    const r = t.rows.find(x => String(x['Defect ID']).trim() === String(b.defectId || '').trim());
    if (!r) throw new Error('Defect not found. Refresh the page.');
    if (String(r.Status).trim() === 'Closed') throw new Error('Already closed out by ' + r['Closed by'] + '.');
    const f = inspSigFile_(ctx.s, b.signature, name + ' close-out ' + r['Defect ID']);
    const now = new Date();
    writeRow_(t, r._row, { 'Status': 'Closed', 'Closed by': name, 'Closed at': now, 'Close-out note': note.slice(0, 1500), 'Close-out signature': '=HYPERLINK("' + f.getUrl() + '","View")' });
    inspBust_();
    return { ok: true, closedAt: now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function inspReview_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    inspEnsure_();
    const ctx = context_();
    const name = String(who_(ctx, b).Name).trim();
    const t = read_(INSP_TAB.MAIN);
    const r = t.rows.find(x => String(x.Receipt).trim() === String(b.id || '').trim());
    if (!r) throw new Error('Inspection not found. Refresh the page.');
    if (String(r['Reviewed by'] || '').trim()) throw new Error('Already reviewed by ' + r['Reviewed by'] + '.');
    const f = inspSigFile_(ctx.s, b.signature, name + ' review ' + r.Receipt);
    const now = new Date();
    writeRow_(t, r._row, { 'Reviewed by': name, 'Reviewed at': now, 'Review comment': String(b.comment || '').slice(0, 1500), 'Review signature': '=HYPERLINK("' + f.getUrl() + '","View")' });
    inspBust_();
    return { ok: true, reviewedAt: now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

/* --------------------------------------------------------------- reads */

function inspMainOut_(r) {
  const sig = String(r.Signature || '').match(/HYPERLINK\("([^"]+)"/);
  return {
    id: String(r.Receipt), site: String(r.Area), siteName: String(r['Area name'] || ''), inspector: String(r.Inspector),
    startedAt: inspIso_(r.Started), submittedAt: inspIso_(r.Submitted), durationMin: r.Minutes, yes: r.Yes, no: r.No, na: r['N/A'], total: r.Total,
    score: r['Score %'], version: String(r['Checklist version'] || ''), other: String(r['Other hazards'] || ''),
    reviewedBy: String(r['Reviewed by'] || ''), reviewedAt: inspIso_(r['Reviewed at']), reviewComment: String(r['Review comment'] || ''),
    declaration: String(r.Declaration || ''), device: String(r.Device || ''), signatureUrl: sig ? sig[1] : ''
  };
}
function inspDefOut_(r) {
  const ids = String(r['Photo IDs'] || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    id: String(r['Defect ID']), receipt: String(r.Receipt), site: String(r.Area), foundAt: inspIso_(r['Found at']), foundBy: String(r['Found by']),
    sec: String(r.Section), ref: String(r.Ref || ''), key: String(r.Key), label: String(r.Item), asset: String(r.Equipment || ''),
    description: String(r.Description || ''), priority: String(r.Priority || 'Medium'), timesSeen: num_(r['Times seen'], 1), lastSeen: inspIso_(r['Last seen']), latestNote: String(r['Latest note'] || ''), status: String(r.Status || 'Open').trim() === 'Closed' ? 'Closed' : 'Open',
    fixedOnSpot: String(r['Fixed on the spot']) === 'Yes', fixNote: String(r['Fix note'] || ''), closedBy: String(r['Closed by'] || ''),
    closedAt: inspIso_(r['Closed at']), closeNote: String(r['Close-out note'] || ''),
    photos: ids.map(id => ({ id, url: 'https://drive.google.com/file/d/' + id + '/view' }))
  };
}
const INSP_ANS_COLS = ['id', 'key', 'sec', 'kind', 'label', 'asset', 'result', 'value', 'last', 'comment', 'naReason'];
function inspAnsOut_(r) {
  const v = r.Value instanceof Date ? dayKey_(r.Value) : String(r.Value || '');
  const l = r['Last done'] instanceof Date ? dayKey_(r['Last done']) : String(r['Last done'] || '');
  return [String(r.Receipt), String(r.Key), String(r.Section), String(r.Kind), String(r.Item), String(r.Equipment || ''), String(r.Result), v, l, String(r.Comment || ''), String(r['N/A reason'] || '')];
}

function inspStatus_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('insp:status');
  if (hit) return JSON.parse(hit);
  inspEnsure_();
  const cfg = inspSettings_();
  const sites = {};
  Object.keys(INSP_AREAS).forEach(a => { sites[a] = { last: null, nextDue: '', openDefects: 0 }; });
  read_(INSP_TAB.MAIN).rows.forEach(r => {
    const a = String(r.Area); const d = asDate_(r.Submitted);
    if (!d) return;
    sites[a] = sites[a] || { last: null, nextDue: '', openDefects: 0 };
    if (!sites[a].last || new Date(sites[a].last.submittedAt) < d) sites[a].last = { id: String(r.Receipt), submittedAt: d.toISOString(), inspector: String(r.Inspector), score: r['Score %'] };
  });
  read_(INSP_TAB.DEF).rows.forEach(r => { const a = String(r.Area); if (sites[a] && String(r.Status).trim() !== 'Closed') sites[a].openDefects++; });
  const goLive = String(cfg.s.INSP_GO_LIVE || '').trim() || dayKey_(new Date());
  Object.keys(sites).forEach(a => {
    const base = sites[a].last ? dayKey_(new Date(sites[a].last.submittedAt)) : goLive;
    sites[a].nextDue = sites[a].last ? addDays_(base, cfg.every) : addDays_(base, 7);   // first one: a week after go-live
  });
  const out = { ok: true, sites, everyDays: cfg.every, generated: new Date().toISOString() };
  try { cache.put('insp:status', JSON.stringify(out), 60); } catch (e) {}
  return out;
}

function inspData_(p) {
  const area = inspArea_(p.site || 'compound');
  const months = [6, 12, 24].indexOf(Number(p.months)) >= 0 ? Number(p.months) : 12;
  const ck = 'insp:data:' + area + ':' + months;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  inspEnsure_();
  const since = new Date(); since.setMonth(since.getMonth() - months);
  const insp = read_(INSP_TAB.MAIN).rows.filter(r => String(r.Area) === area && (asDate_(r.Submitted) || 0) >= since).map(inspMainOut_);
  const ids = {}; insp.forEach(x => { ids[x.id] = 1; });
  const rows = read_(INSP_TAB.ANS).rows
    .filter(r => ids[String(r.Receipt)] && (String(r.Result) === 'no' || String(r.Result) === 'na' || String(r.Kind) === 'date' || String(r.Kind) === 'service'))
    .map(inspAnsOut_);
  const defects = read_(INSP_TAB.DEF).rows
    .filter(r => String(r.Area) === area && (String(r.Status).trim() !== 'Closed' || (asDate_(r['Found at']) || 0) >= since))
    .map(inspDefOut_);
  const staff = read_(TAB.STAFF).rows.filter(isActive_).map(r => String(r.Name).trim()).sort();
  const out = { ok: true, site: area, months, inspections: insp, answers: { cols: INSP_ANS_COLS, rows }, defects, staff, generated: new Date().toISOString() };
  try { const txt = JSON.stringify(out); if (txt.length < 95000) cache.put(ck, txt, 60); } catch (e) {}
  return out;
}

function inspRecord_(p) {
  inspEnsure_();
  const id = String(p.id || '').trim();
  const r = read_(INSP_TAB.MAIN).rows.find(x => String(x.Receipt).trim() === id);
  if (!r) throw new Error('Inspection not found.');
  const answers = read_(INSP_TAB.ANS).rows.filter(x => String(x.Receipt).trim() === id).map(x => {
    const a = inspAnsOut_(x); const o = {};
    INSP_ANS_COLS.forEach((c, i) => { o[c] = a[i]; });
    o.at = inspIso_(x['Answered at']);
    return o;
  });
  const defects = read_(INSP_TAB.DEF).rows.filter(x => String(x.Receipt).trim() === id).map(inspDefOut_);
  return { ok: true, inspection: inspMainOut_(r), answers, defects };
}

/* ------------------------------------------------- overdue reminders */

// Called from the 7am daily trigger. Posts on weekdays once an area is overdue, then weekly.
function inspReminders_(opt) {
  opt = opt || {};
  inspEnsure_();
  const cfg = inspSettings_();
  if (!opt.force && !bool_(cfg.s.INSP_REMIND === '' ? 'TRUE' : cfg.s.INSP_REMIND)) return '';
  const dow = dowOf_(new Date());
  if (!opt.force && dow > 5) return '';
  const st = inspStatus_().sites;
  const props = PropertiesService.getScriptProperties();
  const today = dayKey_(new Date());
  const ctx = context_();
  const out = [];
  Object.keys(st).forEach(a => {
    if (a === 'clubhouse' && !st[a].last) return;   // clubhouse checklist not live yet
    const s = st[a];
    if (!s.nextDue || s.nextDue > today) return;
    const lastSent = props.getProperty('insp_remind_' + a) || '';
    if (!opt.force && lastSent && addDays_(lastSent, 7) > today) return;
    const lines = [':clipboard: *Monthly H&S inspection due: ' + (INSP_AREAS[a] || a) + '*',
      (s.last ? 'Last done ' + nice_(dayKey_(new Date(s.last.submittedAt))) + ' by ' + slackName_(ctx, s.last.inspector) + '.' : 'Not done yet.') +
      (s.openDefects ? ' ' + s.openDefects + ' defect' + (s.openDefects === 1 ? '' : 's') + ' still open.' : '') +
      ' <' + cfg.page + '?site=' + a + '|Start it here>'];
    if (cfg.cc.length) lines.push('cc ' + cfg.cc.map(id => '<@' + id + '>').join(' '));
    const text = lines.join('\n');
    out.push(text);
    if (opt.dryRun || !cfg.hook) return;
    const res = UrlFetchApp.fetch(cfg.hook, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text, link_names: true }), muteHttpExceptions: true });
    if (res.getResponseCode() === 200) props.setProperty('insp_remind_' + a, today);
  });
  return out.join('\n\n');
}
