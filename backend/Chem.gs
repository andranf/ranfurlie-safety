/*
 * Dangerous goods & hazardous substances register - part of every monthly inspection (all areas).
 *
 * Tabs:  'Chem Register' - the register: one row per dangerous good / hazardous substance held, per area
 *                          (Status 'On register', or 'Checking' while a new label photo is being determined).
 *        'Chem Archive'  - rows taken OFF the register: 'Removed' (no longer held) and 'Not DG or hazardous'
 *                          (determined: neither, so never on the register). Kept so a product is only assessed once.
 *        'Chem Log'      - every change (added, removed, determined).
 *
 * Each month the inspector marks every product on the area's register Still here or Gone, and photographs the label of
 * anything that is not listed. A scheduled Claude check reads each label photo, finds the SDS and decides whether the
 * product is a dangerous good (SDS section 14) and/or a hazardous substance (SDS section 2). If it is either, it goes on
 * the register; if it is neither, it does not. A product already determined anywhere is matched by name straight away.
 *
 * Hooks in Code.gs:  doGet  chemRegister (public), chemPending, chemAll (key)
 *                    doPost chemDetermine, chemImport (key)
 * Key = Settings PRESTART_KEY (same check as the pre-start and document review endpoints).
 *                    inspSubmit_ -> chemApply_(...)   inspSubmitSlack_ -> x.chem line
 * Manual run: setupChemRegister, chemSeedFuel
 */
const CHEM_TAB = { REG: 'Chem Register', ARC: 'Chem Archive', LOG: 'Chem Log' };
const CHEM_HEAD = {
  'Chem Register': ['ID', 'Area', 'Product', 'Where kept', 'Most held', 'Status', 'Dangerous goods', 'DG class', 'UN no.', 'Packing group',
    'Hazardous substance', 'Basis', 'Poison schedule', 'SDS link', 'SDS date', 'Determined by', 'Determined at',
    'Added by', 'Added at', 'Last checked', 'Last checked by', 'Removed at', 'Removed by', 'Removed note', 'Photos', 'Photo IDs', 'Notes'],
  'Chem Log': ['When', 'Area', 'ID', 'Product', 'Event', 'By', 'Receipt', 'Detail']
};
CHEM_HEAD['Chem Archive'] = CHEM_HEAD['Chem Register'];
const CHEM_STATUS = { ON: 'On register', CHECK: 'Checking', NOT: 'Not DG or hazardous', GONE: 'Removed' };

function setupChemRegister() { chemEnsure_(true); console.log('Chem Register and Chem Log tabs ready.'); }

function chemEnsure_(force) {
  const props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty('chem_ready') === '2') return;
  const ss = book_();
  const when = 'ddd d mmm yy h:mm am/pm';
  [CHEM_TAB.REG, CHEM_TAB.ARC, CHEM_TAB.LOG].forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name, ss.getSheets().length);
    if (sh.getLastRow() === 0) {
      const head = CHEM_HEAD[name];
      sh.getRange(1, 1, 1, head.length).setValues([head]);
      styleHeader_(sh, head.length);
      const at = h => head.indexOf(h) + 1;
      if (name !== CHEM_TAB.LOG) {
        ['Determined at', 'Added at', 'Last checked', 'Removed at'].forEach(h => sh.getRange(2, at(h), 3000, 1).setNumberFormat(when));
        ['UN no.', 'Most held', 'SDS date', 'DG class', 'Packing group', 'Poison schedule'].forEach(h => sh.getRange(2, at(h), 3000, 1).setNumberFormat('@'));
        sh.setColumnWidth(at('Product'), 240); sh.setColumnWidth(at('Where kept'), 170); sh.setColumnWidth(at('Basis'), 320);
      } else {
        sh.getRange(2, 1, 20000, 1).setNumberFormat(when);
        sh.setColumnWidth(4, 240); sh.setColumnWidth(8, 420);
      }
    } else {
      CHEM_HEAD[name].forEach(h => ensureColumn_(sh, h));
    }
  });
  props.setProperty('chem_ready', '2');
}

function chemAuth_(key) {
  prestartAuth_(settings_(), key);
}

// Manual run: the two fuel bay tanks, as the compound's starting register.
function chemSeedFuel() {
  const r = chemImportRows_([
    { area: 'compound', product: 'Unleaded petrol', where: 'Fuel bay tank', held: '1,000 L', dg: true, dgClass: '3', un: '1203', pg: 'II', haz: true,
      basis: 'Petrol: UN 1203, Class 3 flammable liquid, packing group II. Hazardous substance (carcinogen, mutagen, aspiration hazard). Supplier SDS to be attached.' },
    { area: 'compound', product: 'Diesel', where: 'Fuel bay tank', held: '1,000 L', dg: true, dgClass: 'C1 combustible liquid', un: '', pg: '', haz: true,
      basis: 'Diesel: C1 combustible liquid under the Victorian storage and handling regulations. Hazardous substance (aspiration hazard, suspected carcinogen). Supplier SDS to be attached.' }
  ], 'Starting list (20 Nov 2026)');
  console.log(JSON.stringify(r));
}

// Take rows off the register: copy them to the Archive tab, then delete them (bottom up so row numbers hold).
function chemMove_(t, rows, upd) {
  if (!rows.length) return;
  const arc = sheet_(CHEM_TAB.ARC);
  const out = rows.map(r => t.head.map(h => (upd && upd[r._row] && h in upd[r._row] ? upd[r._row][h] : (r[h] === undefined ? '' : r[h]))));
  arc.getRange(arc.getLastRow() + 1, 1, out.length, t.head.length).setValues(out);
  rows.map(r => r._row).sort((a, b) => b - a).forEach(n => t.sh.deleteRow(n));
}

// Determinations already made, by product name (register + archive).
function chemKnown_(t) {
  const known = {};
  read_(CHEM_TAB.ARC).rows.concat(t.rows).forEach(r => { if (chemDetermined_(r)) known[chemNorm_(r.Product)] = r; });
  return known;
}

function chemNorm_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function chemYes_(v) { return v === true || /^(yes|true|y|1)$/i.test(String(v === null || v === undefined ? '' : v).trim()); }
function chemLive_(r) { const st = String(r.Status).trim(); return st === CHEM_STATUS.ON || st === CHEM_STATUS.CHECK; }
function chemDetermined_(r) { return String(r['Determined at'] || '') !== ''; }

function chemOut_(r) {
  return {
    id: String(r.ID), product: String(r.Product), where: String(r['Where kept'] || ''), held: String(r['Most held'] || ''), status: String(r.Status).trim(),
    dg: chemYes_(r['Dangerous goods']), dgClass: String(r['DG class'] || ''), un: String(r['UN no.'] || ''), pg: String(r['Packing group'] || ''),
    haz: chemYes_(r['Hazardous substance']), schedule: String(r['Poison schedule'] || ''), lastChecked: inspIso_(r['Last checked'])
  };
}

// GET chemRegister&site=compound : the area's current register (what the inspector checks this month).
function chemRegister_(p) {
  chemEnsure_();
  const area = inspArea_(p.site || p.area);
  const items = read_(CHEM_TAB.REG).rows.filter(r => String(r.Area) === area && chemLive_(r)).map(chemOut_);
  const k = x => (x.where + '|' + x.product).toLowerCase();
  items.sort((a, b) => (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0));
  return { ok: true, area, items };
}

function chemLog_(rows) {
  if (!rows.length) return;
  const lg = sheet_(CHEM_TAB.LOG);
  lg.getRange(lg.getLastRow() + 1, 1, rows.length, CHEM_HEAD[CHEM_TAB.LOG].length).setValues(rows);
}

// Copy a determination already made for the same product (any area) onto a new row.
function chemCopy_(row, k) {
  ['Dangerous goods', 'DG class', 'UN no.', 'Packing group', 'Hazardous substance', 'Basis', 'Poison schedule', 'SDS link', 'SDS date'].forEach(h => { row[h] = k[h]; });
  row['Determined by'] = 'Matched to ' + k.ID;
}

// Called from inspSubmit_ with the inspection's chem block: { here: [id], gone: [{ id, note }], added: [{ name, where, held, photos }], none }.
function chemApply_(o) {
  const c = o.b && o.b.chem;
  if (!c || typeof c !== 'object') return null;
  chemEnsure_();
  const t = read_(CHEM_TAB.REG);
  const byId = {}, liveByName = {}, known = chemKnown_(t);
  t.rows.forEach(r => {
    byId[String(r.ID)] = r;
    if (String(r.Area) === o.area && chemLive_(r)) liveByName[chemNorm_(r.Product)] = r;
  });
  const moves = [], moveUpd = {};
  const log = [];
  const ev = (id, product, event, detail) => log.push([o.now, o.area, id, product, event, o.name, o.receipt, String(detail || '').slice(0, 1500)]);
  const res = { here: 0, gone: 0, added: 0, checking: 0, onRegister: 0, notNeeded: 0, names: [] };

  // Still here: stamp Last checked in one write.
  const last = t.sh.getLastRow();
  const lcCol = t.col('Last checked'), lbCol = t.col('Last checked by');
  if (last > 1 && lcCol > 0 && lbCol > 0) {
    const lc = t.sh.getRange(2, lcCol, last - 1, 1).getValues();
    const lb = t.sh.getRange(2, lbCol, last - 1, 1).getValues();
    const stamp = r => { lc[r._row - 2][0] = o.now; lb[r._row - 2][0] = o.name; };
    (Array.isArray(c.here) ? c.here.slice(0, 800) : []).forEach(id => {
      const r = byId[String(id)];
      if (!r || String(r.Area) !== o.area || !chemLive_(r)) return;
      stamp(r); res.here++;
    });
    (Array.isArray(c.added) ? c.added : []).forEach(a => {   // typed a product that is already on this area's register
      const r = liveByName[chemNorm_(a && a.name)];
      if (r && a) { stamp(r); a._dup = r; }
    });
    t.sh.getRange(2, lcCol, last - 1, 1).setValues(lc);
    t.sh.getRange(2, lbCol, last - 1, 1).setValues(lb);
  }

  // Gone: off the register.
  (Array.isArray(c.gone) ? c.gone.slice(0, 400) : []).forEach(g => {
    const r = byId[String(g && g.id)];
    if (!r || String(r.Area) !== o.area || !chemLive_(r)) return;
    if (moveUpd[r._row]) return;
    moveUpd[r._row] = { 'Status': CHEM_STATUS.GONE, 'Removed at': o.now, 'Removed by': o.name, 'Removed note': String(g.note || '').slice(0, 300), 'Last checked': o.now, 'Last checked by': o.name };
    moves.push(r);
    ev(r.ID, r.Product, 'Removed', String(g.note || '').trim() || 'No longer held');
    res.gone++;
  });

  // New: label photo saved, then matched to an earlier determination or queued for the SDS check.
  const newRows = [];
  (Array.isArray(c.added) ? c.added.slice(0, 40) : []).forEach((a, i) => {
    if (!a) return;
    const product = String(a.name || '').trim().slice(0, 120);
    if (a._dup) { ev(a._dup.ID, a._dup.Product, 'Already on register', 'Entered again as "' + product + '"'); return; }
    const ph = o.savePhotos(a.photos, o.receipt + ' CHEM ' + (i + 1));
    if (!product && !ph.ids.length) return;
    const id = 'CH-' + Utilities.formatDate(o.now, TZ, 'yyMMdd') + '-' + sha_(o.area + '|' + product + '|' + i + '|' + o.now.getTime()).slice(0, 5).toUpperCase();
    const k = product ? known[chemNorm_(product)] : null;
    const label = k ? String(k.Product) : (product || 'Unnamed product (see photo)');
    if (k && !chemYes_(k['Dangerous goods']) && !chemYes_(k['Hazardous substance'])) {
      ev(id, label, 'Not added', 'Already determined (' + k.ID + '): not a dangerous good or hazardous substance' + (ph.urls.length ? '. Photo: ' + ph.urls[0] : ''));
      res.notNeeded++; res.names.push(label + ' (not DG or hazardous, not added)');
      return;
    }
    const row = { 'ID': id, 'Area': o.area, 'Product': label, 'Where kept': String(a.where || '').trim().slice(0, 120), 'Most held': String(a.held || '').trim().slice(0, 60),
      'Status': CHEM_STATUS.CHECK, 'Added by': o.name, 'Added at': o.now, 'Last checked': o.now, 'Last checked by': o.name,
      'Photos': ph.urls.join('\n'), 'Photo IDs': ph.ids.join(',') };
    if (k) {
      chemCopy_(row, k); row['Determined at'] = o.now; row['Status'] = CHEM_STATUS.ON;
      res.onRegister++; res.names.push(label + ' (on the register)');
      ev(id, label, 'Added', 'On the register, matched to ' + k.ID);
    } else {
      res.checking++; res.names.push(label + ' (being checked)');
      ev(id, label, 'Added', 'Label photo taken. Waiting on the SDS check' + (ph.urls.length ? '. Photo: ' + ph.urls[0] : ''));
    }
    newRows.push(t.head.map(h => (h in row ? row[h] : '')));
    res.added++;
  });
  if (newRows.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, newRows.length, t.head.length).setValues(newRows);
  chemMove_(t, moves, moveUpd);
  chemLog_(log);
  return res;
}

// GET chemPending&key=... : products waiting on a determination (label photos first, then imported lists).
function chemPending_(p) {
  chemAuth_(p.key);
  chemEnsure_();
  const rows = read_(CHEM_TAB.REG).rows.filter(r => String(r.Status).trim() === CHEM_STATUS.CHECK);
  rows.sort((a, b) => (String(b['Photo IDs'] || '') ? 1 : 0) - (String(a['Photo IDs'] || '') ? 1 : 0));
  const items = rows.slice(0, Math.min(60, num_(p.limit, 15))).map(r => ({
    id: String(r.ID), area: String(r.Area), areaName: INSP_AREAS[String(r.Area)] || String(r.Area), product: String(r.Product),
    where: String(r['Where kept'] || ''), held: String(r['Most held'] || ''), addedBy: String(r['Added by'] || ''), addedAt: inspIso_(r['Added at']),
    photoIds: String(r['Photo IDs'] || '').split(',').filter(Boolean), notes: String(r.Notes || '')
  }));
  return { ok: true, total: rows.length, items };
}

// GET chemAll&key=... : every product ever assessed, on or off the register (so nothing is assessed twice).
function chemAll_(p) {
  chemAuth_(p.key);
  chemEnsure_();
  const out = r => ({ id: String(r.ID), area: String(r.Area), product: String(r.Product), status: String(r.Status).trim(), dg: chemYes_(r['Dangerous goods']), haz: chemYes_(r['Hazardous substance']) });
  return { ok: true, register: read_(CHEM_TAB.REG).rows.map(out), archive: read_(CHEM_TAB.ARC).rows.map(out) };
}

// POST chemDetermine { key, by, quiet, items: [{ id, product, dg, dgClass, un, pg, haz, basis, schedule, sdsUrl, sdsDate, where, held, note }] }
function chemDetermine_(b) {
  chemAuth_(b.key);
  chemEnsure_();
  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    const t = read_(CHEM_TAB.REG);
    const byId = {};
    t.rows.forEach(r => { byId[String(r.ID)] = r; });
    const now = new Date(), log = [], done = [], moves = [], moveUpd = {};
    const by = String(b.by || 'Claude (SDS check)').slice(0, 60);
    (Array.isArray(b.items) ? b.items.slice(0, 80) : []).forEach(x => {
      const r = byId[String(x && x.id)];
      if (!r) return;
      const dg = x.dg === true, haz = x.haz === true;
      const upd = { 'Dangerous goods': dg ? 'Yes' : 'No', 'DG class': String(x.dgClass || '').slice(0, 40), 'UN no.': String(x.un || '').slice(0, 12),
        'Packing group': String(x.pg || '').slice(0, 6), 'Hazardous substance': haz ? 'Yes' : 'No', 'Basis': String(x.basis || '').slice(0, 600),
        'Poison schedule': String(x.schedule || '').slice(0, 20), 'SDS link': String(x.sdsUrl || '').slice(0, 400), 'SDS date': String(x.sdsDate || '').slice(0, 20),
        'Determined by': by, 'Determined at': now };
      upd.Status = dg || haz ? CHEM_STATUS.ON : CHEM_STATUS.NOT;
      const product = String(x.product || '').trim().slice(0, 120) || String(r.Product);
      if (product !== String(r.Product)) upd.Product = product;
      if (String(x.where || '').trim() && !String(r['Where kept'] || '').trim()) upd['Where kept'] = String(x.where).trim().slice(0, 120);
      if (String(x.held || '').trim() && !String(r['Most held'] || '').trim()) upd['Most held'] = String(x.held).trim().slice(0, 60);
      if (String(x.note || '').trim()) upd.Notes = String(x.note).trim().slice(0, 600);
      if (dg || haz) writeRow_(t, r._row, upd);
      else if (!moveUpd[r._row]) { moveUpd[r._row] = upd; moves.push(r); }   // neither: off the register, into the archive
      const what = [dg ? 'Dangerous goods' + (x.dgClass ? ' class ' + x.dgClass : '') : '', haz ? 'Hazardous substance' : ''].filter(Boolean).join(' and ');
      log.push([now, r.Area, r.ID, product, 'Determined', by, '', (what ? what + ': on the register. ' : 'Not a dangerous good or hazardous substance: not on the register. ') + String(x.basis || '')]);
      done.push({ area: String(r.Area), product, what, staff: String(r['Photo IDs'] || '') !== '' });
    });
    chemMove_(t, moves, moveUpd);
    chemLog_(log);
    const post = done.filter(d => d.staff);
    if (post.length && b.quiet !== true) {
      try {
        const cfg = inspSettings_();
        if (cfg.hook) {
          const lines = [':test_tube: *Chemical register:* ' + post.length + ' new product' + (post.length === 1 ? '' : 's') + ' checked against the SDS'];
          post.slice(0, 20).forEach(d => lines.push('• ' + d.product + ' (' + (INSP_AREAS[d.area] || d.area) + '): ' + (d.what ? '*' + d.what + '*, on the register' : 'neither, not added')));
          UrlFetchApp.fetch(cfg.hook, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text: lines.join('\n'), link_names: true }), muteHttpExceptions: true });
        }
      } catch (e) { console.warn('chem slack: ' + e); }
    }
    return { ok: true, done: done.length };
  } finally {
    lock.releaseLock();
  }
}

// POST chemImport { key, by, items: [{ area, product, where, held, dg, dgClass, un, pg, haz, basis, schedule, sdsUrl, sdsDate, note }] }
// Loads an existing list. Items sent with dg and haz (true/false) are determined; the rest wait on the SDS check.
function chemImport_(b) {
  chemAuth_(b.key);
  return chemImportRows_(b.items, b.by);
}

function chemImportRows_(items, byWho) {
  chemEnsure_();
  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    const t = read_(CHEM_TAB.REG);
    const have = {};
    t.rows.forEach(r => { have[String(r.Area) + '|' + chemNorm_(r.Product)] = 1; });
    read_(CHEM_TAB.ARC).rows.forEach(r => { if (String(r.Status).trim() === CHEM_STATUS.NOT) have[String(r.Area) + '|' + chemNorm_(r.Product)] = 1; });
    const now = new Date(), by = String(byWho || 'Imported list').slice(0, 60), rows = [], arcRows = [], log = [];
    let skipped = 0;
    (Array.isArray(items) ? items.slice(0, 400) : []).forEach((x, i) => {
      const area = inspArea_(x && x.area), product = String((x && x.product) || '').trim().slice(0, 120);
      if (!product) return;
      const key = area + '|' + chemNorm_(product);
      if (have[key]) { skipped++; return; }
      have[key] = 1;
      const set = typeof x.dg === 'boolean' && typeof x.haz === 'boolean';
      const id = 'CH-' + Utilities.formatDate(now, TZ, 'yyMMdd') + '-' + sha_(key + '|' + i + '|' + now.getTime()).slice(0, 5).toUpperCase();
      const row = { 'ID': id, 'Area': area, 'Product': product, 'Where kept': String(x.where || '').slice(0, 120), 'Most held': String(x.held || '').slice(0, 60),
        'Status': set ? (x.dg || x.haz ? CHEM_STATUS.ON : CHEM_STATUS.NOT) : CHEM_STATUS.CHECK, 'Added by': by, 'Added at': now, 'Notes': String(x.note || '').slice(0, 600) };
      if (set) Object.assign(row, { 'Dangerous goods': x.dg ? 'Yes' : 'No', 'DG class': String(x.dgClass || ''), 'UN no.': String(x.un || ''), 'Packing group': String(x.pg || ''),
        'Hazardous substance': x.haz ? 'Yes' : 'No', 'Basis': String(x.basis || '').slice(0, 600), 'Poison schedule': String(x.schedule || ''), 'SDS link': String(x.sdsUrl || ''),
        'SDS date': String(x.sdsDate || ''), 'Determined by': by, 'Determined at': now });
      (row.Status === CHEM_STATUS.NOT ? arcRows : rows).push(t.head.map(h => (h in row ? row[h] : '')));
      log.push([now, area, id, product, 'Imported', by, '', row.Status + (x.basis ? '. ' + String(x.basis).slice(0, 300) : '')]);
    });
    if (rows.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, rows.length, t.head.length).setValues(rows);
    if (arcRows.length) { const arc = sheet_(CHEM_TAB.ARC); arc.getRange(arc.getLastRow() + 1, 1, arcRows.length, t.head.length).setValues(arcRows); }
    chemLog_(log);
    return { ok: true, added: rows.length, notOnRegister: arcRows.length, skipped };
  } finally {
    lock.releaseLock();
  }
}
