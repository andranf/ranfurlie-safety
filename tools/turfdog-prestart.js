// Ranfurlie Safety - TurfDog pre-start reader (v1.2, 13 Oct 2026).
//
// The hourly pre-start task loads this into a logged-in TurfDog tab (turfdog.net/dashboard):
//   const src = await (await fetch('https://raw.githubusercontent.com/andranf/ranfurlie-safety/main/tools/turfdog-prestart.js', { cache: 'no-store' })).text();
//   new Function('KEY', 'API', src)('<PRESTART_KEY>', '<web app /exec URL>');
// then calls  await __TD.next()  with a short pause between calls until the answer starts with "done" or "error",
// and fetches the result from the web app: GET ?action=prestartPlan&key=<key>&run=<__TD.run>.
//
// Each call does one short step. The tab is usually in the background, where page timers are throttled, so nothing
// here waits on a page timer: the task's own pause between calls gives TurfDog time to render.
// Steps: whiteboard shifts 1-3 (task, staff, machines) -> Staff > Safety > Safety Checklists > Pre-Check (today's
// pre-starts, then the "Issues only" filter) -> POST to the Ranfurlie Safety web app (action 'prestart').
// Read only: it never changes anything in TurfDog (the Issues only filter is switched back off).

const TD_VERSION = 'reader 1.2';
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

const S = { stage: 'board', run: Math.random().toString(36).slice(2, 10), board: {}, last: null, same: 0, from: null, since: 0, cLast: null, cSame: 0, cFrom: null, checks: null, issues: null, steps: 0, warn: '', result: '' };

// The toolbar's "19 tasks" is the showing shift's task count; it updates before the cards do.
const NOT_TASKS = ['calendar events', 'notes', 'course map', 'available staff'];
function taskCount() {
  const m = txt(document.querySelector('main')).match(/\b(\d+)\s+tasks?\b/);
  return m ? Number(m[1]) : null;
}
function cardCount() {
  return all('main h3').filter(h => NOT_TASKS.indexOf(txt(h).toLowerCase()) < 0).length;
}

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

// who is on which task, order ignored (TurfDog can redraw the same board in a different order)
const peopleOf = rows => JSON.stringify(rows.map(r => r.task + '|' + r.staff).sort());

// Reads whichever shift is showing once it has settled, then switches to the next unread one.
// TurfDog keeps showing the old shift for a few seconds after a switch (first as it was, then without machines),
// so after a switch a read only counts once the people on the board have changed and two reads agree.
// In a background tab TurfDog can take a minute or more to redraw: the task keeps calling until it is done.
function boardStep() {
  const main = document.querySelector('main') || document.body;
  if (/Loading workboard/i.test(main.innerText)) return 'waiting for the board to load';
  const btns = [1, 2, 3].map(n => document.querySelector('button[aria-label="Shift ' + n + '"]'));
  if (!btns[0]) {
    const w = byText('button', 'Whiteboard');
    S.wb = (S.wb || 0) + 1;
    if (w && S.wb % 5 === 1) { w.click(); return 'opening the whiteboard'; }
    return 'waiting for the board';
  }
  const d = boardDate();
  if (d === null) return 'waiting for the board date';
  if (d !== true) return 'error: the board is showing ' + d + ', not today';
  const active = btns.findIndex(b => b && /\bbg-primary\b/.test(b.className)) + 1;
  const rows = chips();
  const sig = JSON.stringify(rows);
  if (sig !== S.last) { S.last = sig; S.same = 0; if (!S.since) S.since = Date.now(); return 'reading the board'; }
  S.same++;
  // every task card for this shift must be drawn (allow 90 s in case TurfDog's layout changes)
  const want = taskCount();
  if (active && !S.board[active] && want !== null && cardCount() !== want && Date.now() - S.since < 90000) return 'reading shift ' + active;
  let msg = '';
  if (active && !S.board[active]) {
    // After a switch TurfDog keeps drawing the old shift (first as it was, then without machines) for up to a minute.
    // So the board must differ from the one before the switch and from every shift already read, and hold steady for
    // three reads. If it doesn't differ (two shifts really the same, or both empty) trust it after 60 s.
    const ppl = peopleOf(rows);
    const seen = rows.length && (ppl === S.from || Object.keys(S.board).some(k => peopleOf(S.board[k]) === ppl));
    const sinceClick = S.clickAt ? Date.now() - S.clickAt : Infinity;
    if (seen && sinceClick < 60000) return 'reading shift ' + active;
    const noMachines = !rows.some(r => r.machines.length);
    if (S.same < (S.clickAt || noMachines ? 3 : 1)) return 'reading shift ' + active;
    S.board[active] = rows;
    S.from = null;
    S.since = 0;
    msg = 'shift ' + active + ': ' + rows.length + ' on the board, ' + rows.filter(r => r.machines.length).length + ' with machines';
  }
  const todo = [1, 2, 3].filter(n => !S.board[n]);
  if (!todo.length) { S.stage = 'checksNav'; return msg || 'board read'; }
  if (msg) return msg;
  const b = btns[todo[0] - 1];
  if (!b) { S.board[todo[0]] = []; return 'no shift ' + todo[0] + ' button'; }
  S.from = peopleOf(rows);
  S.clickAt = Date.now();
  S.since = 0;
  S.last = null;
  b.click();
  return 'switching to shift ' + todo[0];
}

function checksNav() {
  if (byText('button', 'Issues only') && document.querySelector('table')) { S.stage = 'checks'; S.cLast = null; return 'pre-check log open'; }
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

// The pre-check table. After the Issues only filter is switched, a read only counts once the table has changed
// (or 30 s have passed, e.g. every row has an issue) and two reads agree.
function readChecks(issues) {
  const io = byText('button', 'Issues only');
  if (!io) { S.stage = 'checksNav'; return 'reopening the pre-check log'; }
  const rows = all('table tbody tr').map(tr => Array.from(tr.querySelectorAll('td')).map(txt)).filter(c => c.length >= 4)
    .map(c => ({ at: parseAt(c[0]), staff: c[1], machine: c[2], checklist: c[3], items: c[4] || '' })).filter(r => r.at && r.staff && r.machine);
  const sig = JSON.stringify(rows);
  const on = io.getAttribute('aria-pressed') === 'true';
  if (on !== issues) {
    if (sig !== S.cLast) { S.cLast = sig; return 'reading the pre-check log'; }
    S.cFrom = sig;
    S.cAt = Date.now();
    S.cLast = null;
    io.click();
    return issues ? 'filtering to issues' : 'clearing the issues filter';
  }
  if (sig !== S.cLast) { S.cLast = sig; S.cSame = 0; return 'reading ' + (issues ? 'issues' : 'pre-starts'); }
  S.cSame++;
  if (S.cFrom && sig === S.cFrom && Date.now() - S.cAt < 30000) return 'reading ' + (issues ? 'issues' : 'pre-starts');
  S.cFrom = null;
  const todays = rows.filter(r => r.at.slice(0, 10) === TODAY);
  if (issues) {
    S.issues = todays;
    S.cLast = null;
    io.click();
    S.stage = 'send';
    return todays.length + ' with issues today';
  }
  S.checks = todays;
  S.cLast = null;
  const more = all('button').find(b => /^(next|load more|show more|older)$/i.test(txt(b)) && !b.disabled);
  if (rows.length && todays.length === rows.length && more) S.warn = 'every pre-start on the page is today and there is another page';
  S.stage = 'issues';
  return todays.length + ' pre-starts today';
}

// Sends everything to the web app and returns straight away: in a background tab the reply can take longer than one
// call is allowed to wait, so the task asks the web app for this run's result itself (prestartPlan with run=<id>).
function send() {
  const board = [];
  [1, 2, 3].forEach(n => (S.board[n] || []).forEach(r => board.push({ shift: n, task: r.task, staff: r.staff, machines: r.machines })));
  const body = { action: 'prestart', key: TD_KEY, run: S.run, today: TODAY, board, shiftsRead: Object.keys(S.board).map(Number), checks: S.checks || [], issues: S.issues || [], reader: TD_VERSION };
  S.stage = 'sent';
  S.reply = null;
  fetch(TD_API, { method: 'POST', body: JSON.stringify(body) })
    .then(r => r.json()).then(j => { S.reply = j; })
    .catch(e => { S.reply = { ok: false, error: String(e && e.message || e).slice(0, 120) }; });
  const n = board.filter(r => r.machines.length).length;
  S.result = 'sent run ' + S.run + ': ' + board.length + ' on the board (' + n + ' with machines), ' + (S.checks || []).length + ' pre-starts today, ' + (S.issues || []).length + ' with issues' + (S.warn ? ' | ' + S.warn : '');
  return 'done: ' + S.result;
}

async function next() {
  S.steps++;
  if (/\/auth/.test(location.pathname) || byText('button', 'Login')) return 'error: TurfDog is logged out';
  if (S.steps > 120) return 'error: stuck at ' + S.stage + ' after 120 steps';
  try {
    if (S.stage === 'board') return boardStep();
    if (S.stage === 'checksNav') return checksNav();
    if (S.stage === 'checks') return readChecks(false);
    if (S.stage === 'issues') return readChecks(true);
    if (S.stage === 'send') return send();
    if (S.stage === 'sent' && S.reply && !S.reply.ok) return 'error: safety web app said ' + String(S.reply.error || 'no reply').slice(0, 150);
    return 'done: ' + S.result;
  } catch (e) {
    return 'error: ' + S.stage + ': ' + String(e && e.message || e).slice(0, 150);
  }
}

window.__TD = {
  version: TD_VERSION,
  run: S.run,
  next,
  reply: () => JSON.stringify(S.reply).slice(0, 400),
  // short peek at what has been read so far (for checking a run by hand)
  peek: () => JSON.stringify({ stage: S.stage, board: S.board, checks: S.checks, issues: S.issues }).slice(0, 900)
};
return TD_VERSION + ' loaded';
