// Ranfurlie Safety - TurfDog pre-start reader (v1.0, 13 Oct 2026).
//
// The hourly pre-start task loads this into a logged-in TurfDog tab (turfdog.net/dashboard):
//   const src = await (await fetch('https://raw.githubusercontent.com/andranf/ranfurlie-safety/main/tools/turfdog-prestart.js', { cache: 'no-store' })).text();
//   new Function('KEY', 'API', src)('<PRESTART_KEY>', '<web app /exec URL>');
// then calls  await __TD.next()  with a 2 second pause between calls until the answer starts with "done" or "error".
//
// Each call does one short step. The tab is usually in the background, where page timers are throttled, so nothing
// here waits on a page timer: the task's own pause between calls gives TurfDog time to render.
// Steps: whiteboard shifts 1-3 (task, staff, machines) -> Staff > Safety > Safety Checklists > Pre-Check (today's
// pre-starts, then the "Issues only" filter) -> POST to the Ranfurlie Safety web app (action 'prestart').
// Read only: it never changes anything in TurfDog (the Issues only filter is switched back off).

const TD_VERSION = 'reader 1.0';
const TD_KEY = KEY;
const TD_API = API;

const txt = el => ((el && el.innerText) || '').replace(/\s+/g, ' ').trim();
const all = sel => Array.from(document.querySelectorAll(sel));
const byText = (sel, t) => all(sel).find(e => txt(e) === t);
const press = el => {
  try {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  } catch (e) { /* older browsers */ }
  el.click();
};
const pad = n => ('0' + n).slice(-2);
const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TODAY = dayKey(new Date());

const S = { stage: 'board', shift: 1, board: {}, sig: {}, same: {}, done: {}, checks: null, issues: null, steps: 0, warn: '', result: '' };

// "Tue, Oct 13" on the whiteboard date button -> true when it is today
function boardDate() {
  const t = all('button').map(txt).find(x => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*[A-Z][a-z]{2}\s+\d{1,2}$/.test(x));
  if (!t) return null;
  const d = new Date();
  return t.replace(/\s+/g, ' ') === DOW[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate() ? true : t;
}

// Every staff chip on the whiteboard: { task, staff, machines[] }
function chips() {
  return all('button[aria-label="Choose the machine this crew member is using"]').map(b => {
    const chip = b.closest('[aria-roledescription="draggable"]') || b.parentElement;
    let c = chip.parentElement;
    while (c && !c.querySelector('h3,h4')) c = c.parentElement;
    const task = c ? txt(c.querySelector('h3,h4')) : '';
    const t = (b.getAttribute('title') || '').trim();
    const machines = !t || /^assign equipment$/i.test(t) ? [] : t.split(/\s*,\s*|\s+·\s+/).filter(Boolean);
    return { task, staff: txt(chip.querySelector('p')), machines };
  }).filter(r => r.staff && !/^available staff/i.test(r.task));
}

function boardStep() {
  const n = S.shift;
  const sb = document.querySelector('button[aria-label="Shift ' + n + '"]');
  if (!sb) {
    const w = byText('button', 'Whiteboard');
    if (w) { w.click(); return 'opening the whiteboard'; }
    return 'waiting for the board';
  }
  const d = boardDate();
  if (d === null) return 'waiting for the board date';
  if (d !== true) return 'error: the board is showing ' + d + ', not today';
  if (!/\bbg-primary\b/.test(sb.className)) { sb.click(); S.sig[n] = null; S.same[n] = 0; return 'switching to shift ' + n; }
  const rows = chips();
  const sig = JSON.stringify(rows);
  if (S.sig[n] !== sig) { S.sig[n] = sig; S.same[n] = 0; return 'reading shift ' + n; }
  S.same[n] = (S.same[n] || 0) + 1;
  // After a shift change TurfDog briefly shows the old shift's people with no machines. Accept a read once it is
  // steady, and wait longer if it still looks like the previous shift.
  const people = JSON.stringify(rows.map(r => [r.task, r.staff]));
  const prev = S.done[n - 1];
  if (prev && rows.length && people === prev && S.same[n] < 4) return 'reading shift ' + n;
  S.board[n] = rows;
  S.done[n] = people;
  const msg = 'shift ' + n + ': ' + rows.length + ' on the board, ' + rows.filter(r => r.machines.length).length + ' with machines';
  if (n < 3) S.shift = n + 1;
  else S.stage = 'checksNav';
  return msg;
}

function checksNav() {
  if (byText('button', 'Issues only') && document.querySelector('table')) { S.stage = 'checks'; S.sig.c = null; return 'pre-check log open'; }
  const pc = all('[role=tab],button').find(e => txt(e) === 'Pre-Check');
  if (pc) { press(pc); return 'opening Pre-Check'; }
  const sc = all('h2,h3,h4').find(e => txt(e) === 'Safety Checklists');
  if (sc) { sc.click(); return 'opening Safety Checklists'; }
  const sf = all('[role=tab]').find(e => txt(e) === 'Safety');
  if (sf) { press(sf); return 'opening Safety'; }
  const st = byText('button', 'Staff');
  if (st) { st.click(); return 'opening Staff'; }
  return 'waiting for the page';
}

// "Oct 13, 2026 8:48 AM" -> "2026-10-13 08:48" (the PC's local time = Melbourne)
function parseAt(s) {
  const d = new Date(String(s).replace(/\s+/g, ' ').trim());
  if (isNaN(d.getTime())) return '';
  return dayKey(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function readChecks(issues) {
  const io = byText('button', 'Issues only');
  if (!io) { S.stage = 'checksNav'; return 'reopening the pre-check log'; }
  const on = io.getAttribute('aria-pressed') === 'true';
  if (on !== issues) { io.click(); S.sig.c = null; return issues ? 'filtering to issues' : 'clearing the issues filter'; }
  const rows = all('table tbody tr').map(tr => Array.from(tr.querySelectorAll('td')).map(txt)).filter(c => c.length >= 4)
    .map(c => ({ at: parseAt(c[0]), staff: c[1], machine: c[2], checklist: c[3], items: c[4] || '' })).filter(r => r.at && r.staff && r.machine);
  const sig = JSON.stringify(rows);
  if (S.sig.c !== sig) { S.sig.c = sig; return 'reading ' + (issues ? 'issues' : 'pre-starts'); }
  const todays = rows.filter(r => r.at.slice(0, 10) === TODAY);
  if (issues) {
    S.issues = todays;
    io.click();
    S.stage = 'send';
    return todays.length + ' with issues today';
  }
  S.checks = todays;
  const more = all('button').find(b => /^(next|load more|show more|older)$/i.test(txt(b)) && !b.disabled);
  if (rows.length && todays.length === rows.length && more) S.warn = 'every pre-start on the page is today and there is another page';
  S.stage = 'issues';
  return todays.length + ' pre-starts today';
}

async function send() {
  const board = [];
  [1, 2, 3].forEach(n => (S.board[n] || []).forEach(r => board.push({ shift: n, task: r.task, staff: r.staff, machines: r.machines })));
  const body = { action: 'prestart', key: TD_KEY, today: TODAY, board, shiftsRead: Object.keys(S.board).map(Number), checks: S.checks || [], issues: S.issues || [], reader: TD_VERSION };
  let j;
  try {
    const r = await fetch(TD_API, { method: 'POST', body: JSON.stringify(body) });
    j = await r.json();
  } catch (e) {
    return 'error: could not reach the safety web app (' + String(e && e.message || e).slice(0, 80) + ')';
  }
  if (!j || !j.ok) return 'error: safety web app said ' + String(j && j.error || 'no reply').slice(0, 150);
  S.stage = 'done';
  S.result = j.summary + (j.post ? ' | to post: ' + j.post : ' | nothing to post') + (j.dm ? ' | DM for Andrew' : '') + (S.warn ? ' | ' + S.warn : '');
  return 'done: ' + S.result;
}

async function next() {
  S.steps++;
  if (/\/auth/.test(location.pathname) || byText('button', 'Login')) return 'error: TurfDog is logged out';
  if (S.steps > 60) return 'error: stuck at ' + S.stage + ' after 60 steps';
  try {
    if (S.stage === 'board') return boardStep();
    if (S.stage === 'checksNav') return checksNav();
    if (S.stage === 'checks') return readChecks(false);
    if (S.stage === 'issues') return readChecks(true);
    if (S.stage === 'send') return await send();
    return 'done: ' + S.result;
  } catch (e) {
    return 'error: ' + S.stage + ': ' + String(e && e.message || e).slice(0, 150);
  }
}

window.__TD = {
  version: TD_VERSION,
  next,
  // short peek at what has been read so far (for checking a run by hand)
  peek: () => JSON.stringify({ stage: S.stage, board: S.board, checks: S.checks, issues: S.issues }).slice(0, 900)
};
return TD_VERSION + ' loaded';
