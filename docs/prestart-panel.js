/* Machine pre-starts view for the safety dashboard (inspection-dashboard.html, "Machine pre-starts" tab).
 * Data: GET action=prestartStats&days=N -> the Machine Bookings tab (who was on which machine each day,
 * whether TurfDog shows a pre-start, and how many times they were tagged for it).
 */
(function () {
  'use strict';

  var I = window.INSP, el = I.el, esc = I.esc;
  var $ = function (id) { return document.getElementById(id); };
  var NS = 'http://www.w3.org/2000/svg';
  var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var KINDS = [
    { k: 'ontime', label: 'Done, no reminder', color: 'var(--yes)' },
    { k: 'nudged', label: 'Done after a reminder', color: 'var(--warn)' },
    { k: 'missed', label: 'Missed', color: 'var(--no)' },
    { k: 'todo', label: 'Still to do today', color: '#E3A39B' }
  ];
  // Counting starts 22 Oct 2026: from 14 to 21 Oct the hourly check was still being fixed (machine names not
  // matching, a frozen TurfDog log) and tagged some people who had done their pre-start.
  var START = '2026-10-22';
  var res = null, rows = [], today = '';

  function cls(r) {
    if (r.pre === 'Done') return r.reminders > 0 ? 'nudged' : 'ontime';
    if (r.pre === 'Not done') return r.date < today ? 'missed' : 'todo';
    if (r.pre === 'Not due yet') return r.date < today ? 'unknown' : 'pending';
    return 'skip';
  }
  function pct(a, b) { return b ? Math.round(100 * a / b) : null; }
  function count(list, k) { return list.filter(function (r) { return r.c === k; }).length; }
  function keyDate(k) { var p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDay(k, n) { var d = keyDate(k); d.setDate(d.getDate() + n); return I.keyOf ? I.keyOf(d) : d.toISOString().slice(0, 10); }
  function nice(k) { var d = keyDate(k); return DAY[d.getDay()] + ' ' + d.getDate() + ' ' + I.MON[d.getMonth()]; }

  function show(months) {
    $('psView').hidden = false;
    $('dTitle').textContent = 'Machine pre-starts';
    $('dSub').textContent = 'Loading…';
    var days = Math.min(400, Math.round(Number(months || 12) * 30.5));
    return I.get({ action: 'prestartStats', days: days }).then(function (r) {
      res = r;
      today = r.today;
      rows = (r.rows || []).map(function (a) {
        var o = {}; (r.cols || []).forEach(function (c, i) { o[c] = a[i]; });
        o.reminders = Number(o.reminders) || 0;
        o.c = cls(o);
        return o;
      }).filter(function (o) { return o.date >= START; });
      render();
    }).catch(function (x) {
      $('dSub').textContent = '';
      $('psKpis').innerHTML = '';
      $('psKpis').appendChild(el('div', { class: 'empty-s', text: 'Could not load the pre-start register: ' + x.message }));
    });
  }
  function hide() { if ($('psView')) $('psView').hidden = true; }

  function render() {
    var need = rows.filter(function (r) { return r.c === 'ontime' || r.c === 'nudged' || r.c === 'missed'; });
    var days = {};
    rows.forEach(function (r) { days[r.date] = true; });
    var nDays = Object.keys(days).length;
    $('dSub').textContent = nDays
      ? need.length + ' machine bookings that needed a pre-start over ' + nDays + ' day' + (nDays === 1 ? '' : 's') + ' · updated ' + I.clock(new Date())
      : 'No pre-start data in this period yet.';
    renderKpis(need);
    renderDaily();
    renderPeople();
    renderMisses();
    $('psFoot').textContent = 'From TurfDog: the hourly pre-start check (6am to 2pm) reads who is on which machine and the pre-check log, and tags anyone who hasn’t done theirs in #safe-work-procedures. Counted from 22 Oct 2026 (14 to 21 Oct left out while the check was being fixed). Register: Machine Bookings tab.';
  }

  /* ----- KPI tiles */
  function kpi(i, label, value, sub, flags, chart, alert) {
    var kv = typeof value === 'string' ? el('div', { class: 'kv', text: value }) : value;
    return el('div', { class: 'kpi' + (alert ? ' alert' : ''), style: '--i:' + i }, [
      el('div', { class: 'kl', text: label }), kv,
      el('div', { class: 'ks' }, Array.isArray(sub) ? sub : [sub]),
      flags ? el('div', {}, flags) : null,
      el('div', { class: 'kc' }, chart || [])
    ]);
  }
  function meter(p, color) {
    return el('div', { class: 'meter', title: (p || 0) + '%' }, [el('span', { style: 'width:' + (p || 0) + '%' + (color ? ';background:' + color : '') })]);
  }
  function spark(vals, lo, hi) {
    var w = 160, h = 34;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'mini-spark');
    if (!vals.length) return svg;
    var x = function (j) { return vals.length === 1 ? w / 2 : 3 + j * (w - 6) / (vals.length - 1); };
    var y = function (v) { return h - 3 - (Math.max(lo, Math.min(hi, v)) - lo) / ((hi - lo) || 1) * (h - 6); };
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', vals.map(function (v, j) { return (j ? 'L' : 'M') + x(j).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' '));
    p.setAttribute('class', 'draw'); p.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(p);
    var c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x(vals.length - 1)); c.setAttribute('cy', y(vals[vals.length - 1])); c.setAttribute('r', 3);
    svg.appendChild(c);
    requestAnimationFrame(function () { try { p.style.setProperty('--len', p.getTotalLength()); } catch (e) {} });
    return svg;
  }

  function byDay() {
    var map = {};
    rows.forEach(function (r) {
      var d = map[r.date] = map[r.date] || { date: r.date, ontime: 0, nudged: 0, missed: 0, todo: 0, pending: 0 };
      if (d[r.c] !== undefined) d[r.c]++;
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }

  function renderKpis(need) {
    var box = $('psKpis');
    box.innerHTML = '';
    var i = 0;
    var done = count(need, 'ontime') + count(need, 'nudged');
    var rate = pct(done, need.length);
    var daily = byDay().filter(function (d) { return d.date < today && d.ontime + d.nudged + d.missed > 0; });
    var rates = daily.map(function (d) { return 100 * (d.ontime + d.nudged) / (d.ontime + d.nudged + d.missed); });

    // 1. Pre-start rate
    var kv1 = el('div', { class: 'kv' });
    box.appendChild(kpi(i++, 'Pre-starts done', kv1, need.length ? [el('b', { text: done }), ' of ' + need.length + ' bookings'] : 'Nothing to count yet',
      rate === null ? null : [rate >= 100 ? el('span', { class: 'flag ok', text: '✓ Every one done' }) : rate >= 90 ? el('span', { class: 'flag soon', text: 'Close: aim for 100%' }) : el('span', { class: 'flag bad', text: '⚠ Below 90%' })],
      [spark(rates, Math.min(50, Math.floor(Math.min.apply(null, rates.concat([100])) / 10) * 10), 100)], rate !== null && rate < 90));
    if (rate === null) kv1.textContent = '—'; else I.countUp(kv1, rate, { suffix: '%' });

    // 2. Done before any reminder
    var first = count(need, 'ontime'), nudged = count(need, 'nudged');
    var fr = pct(first, need.length);
    var kv2 = el('div', { class: 'kv' });
    box.appendChild(kpi(i++, 'Done without a reminder', kv2, nudged ? [el('b', { text: nudged }), ' only done after being tagged'] : 'Nobody needed a tag',
      null, [meter(fr), el('div', { class: 'months-l' }, [el('span', { text: first + ' first time' }), el('span', { text: nudged + ' after a tag' })])]));
    if (fr === null) kv2.textContent = '—'; else I.countUp(kv2, fr, { suffix: '%' });

    // 3. Missed
    var missed = need.filter(function (r) { return r.c === 'missed'; });
    var people = {}; missed.forEach(function (r) { people[r.staff] = 1; });
    var last14 = [];
    for (var d = 13; d >= 0; d--) {
      var k = addDay(today, -d - 1);
      last14.push({ k: k, n: missed.filter(function (r) { return r.date === k; }).length });
    }
    var maxM = Math.max.apply(null, last14.map(function (x) { return x.n; }).concat([1]));
    var bars = el('div', { class: 'minibars', 'aria-label': 'Missed pre-starts, last 14 days' }, last14.map(function (x, j) {
      return el('span', { style: 'height:' + Math.max(4, Math.round(100 * x.n / maxM)) + '%;--i:' + j + (x.n ? '' : ';opacity:.35'), title: nice(x.k) + ': ' + x.n + ' missed' });
    }));
    var kv3 = el('div', { class: 'kv' });
    box.appendChild(kpi(i++, 'Missed', kv3, missed.length ? [el('b', { text: Object.keys(people).length + ' ' + (Object.keys(people).length === 1 ? 'person' : 'people') }), ' in the period'] : 'None missed',
      null, [bars, el('div', { class: 'months-l' }, [el('span', { text: '14 days ago' }), el('span', { text: 'yesterday' })])], missed.length > 0));
    I.countUp(kv3, missed.length, { dur: 700 });

    // 4. Today so far
    var t = rows.filter(function (r) { return r.date === today; });
    var tDone = count(t, 'ontime') + count(t, 'nudged'), tTodo = count(t, 'todo'), tPend = count(t, 'pending');
    var tFlags = [];
    if (!t.length) tFlags.push(el('span', { class: 'flag na', text: 'No check run today yet' }));
    if (tTodo) tFlags.push(el('span', { class: 'flag bad', text: '⚠ ' + tTodo + ' still to do' }));
    if (tPend) tFlags.push(el('span', { class: 'flag na', text: tPend + ' not due yet' }));
    if (t.length && !tTodo && !tPend && tDone) tFlags.push(el('span', { class: 'flag ok', text: '✓ All done' }));
    box.appendChild(kpi(i++, 'Today so far', t.length ? tDone + ' / ' + (tDone + tTodo) : '—', t.length ? 'pre-starts done of those due' : nice(today),
      tFlags, [meter(pct(tDone, tDone + tTodo))], tTodo > 0));

    // 5. Last check
    var lr = String(res.lastRun || '');
    var lrDay = lr.slice(0, 10), lrTime = lr.slice(11, 16);
    // The check runs at about 5 past each hour, 6am to 2pm. Late = the newest run is more than 70 minutes
    // older than the run that should have happened most recently.
    var now = new Date(), exp = new Date(now);
    if (now.getHours() < 6 || (now.getHours() === 6 && now.getMinutes() < 5)) { exp.setDate(exp.getDate() - 1); exp.setHours(14, 5, 0, 0); }
    else exp.setHours(Math.min(14, now.getMinutes() >= 5 ? now.getHours() : now.getHours() - 1), 5, 0, 0);
    var lrAt = lr ? new Date(lrDay + 'T' + (lrTime || '00:00') + ':00') : null;
    var late = !lrAt || isNaN(lrAt) || lrAt < new Date(exp.getTime() - 70 * 60000);
    box.appendChild(kpi(i++, 'Last check', lr ? (lrDay === today ? 'Today ' : nice(lrDay) + ' ') + lrTime : '\u2014', 'Runs every hour, 6am to 2pm',
      [late ? el('span', { class: 'flag bad', text: '\u26a0 Runs missed since then' }) : el('span', { class: 'flag ok', text: '\u2713 Running' })], [], late));
  }

  /* ----- daily stacked bars with hover tooltip */
  function renderDaily() {
    var box = $('psDaily');
    box.innerHTML = '';
    var data = byDay();
    if (!data.length) { box.appendChild(el('div', { class: 'empty-s', text: 'The chart fills in once the hourly check has run.' })); $('psLegend').innerHTML = ''; return; }
    var first = data[0].date, list = [], map = {};
    data.forEach(function (d) { map[d.date] = d; });
    for (var k = first, n = 0; k <= today && n < 400; k = addDay(k, 1), n++) list.push(map[k] || { date: k, ontime: 0, nudged: 0, missed: 0, todo: 0, pending: 0, none: true });
    var W = Math.max(300, Math.round(box.clientWidth || 640)), H = W < 480 ? 190 : 220, L = 30, R = 8, T = 18, B = 28;
    var maxV = Math.max.apply(null, list.map(function (d) { return d.ontime + d.nudged + d.missed + d.todo; }).concat([4]));
    maxV = Math.ceil(maxV / 4) * 4;
    var slot = (W - L - R) / list.length, bw = Math.max(3, Math.min(26, slot - 3));
    var y = function (v) { return T + (maxV - v) / maxV * (H - T - B); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Pre-starts each day"><g class="grid">';
    for (var v = 0; v <= maxV; v += maxV / 4) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
    s += '</g><g class="axis">';
    for (v = 0; v <= maxV; v += maxV / 4) s += '<text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    var every = Math.max(1, Math.ceil(list.length / Math.floor((W - L - R) / 52)));
    var lastLab = -1e9;
    list.forEach(function (d, j) {
      var isLast = j === list.length - 1;
      if (j % every && !isLast) return;
      if (isLast && j - lastLab < every * 0.8) return;
      lastLab = j;
      var dd = keyDate(d.date);
      s += '<text x="' + (L + slot * j + slot / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + dd.getDate() + ' ' + I.MON[dd.getMonth()] + '</text>';
    });
    s += '</g><g class="ps-cols">';
    list.forEach(function (d, j) {
      var x = L + slot * j + (slot - bw) / 2, base = 0;
      if (d.none) { s += '<rect class="ps-none" x="' + x + '" y="' + (y(0) - 2) + '" width="' + bw + '" height="2" rx="1"/>'; return; }
      KINDS.forEach(function (kd) {
        var c = d[kd.k];
        if (!c) return;
        var y0 = y(base), y1 = y(base + c);
        var h = Math.max(1, y0 - y1 - 2);
        s += '<rect class="ps-seg" style="--i:' + j + ';fill:' + kd.color + '" x="' + x.toFixed(1) + '" y="' + (y1 + 1).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + Math.min(4, bw / 3) + '"/>';
        base += c;
      });
    });
    s += '</g>';
    var lastPast = list.filter(function (d) { return d.date < today && d.ontime + d.nudged + d.missed; }).pop();
    if (lastPast) {
      var j = list.indexOf(lastPast), tot = lastPast.ontime + lastPast.nudged + lastPast.missed;
      s += '<text class="lbl" x="' + (L + slot * j + slot / 2) + '" y="' + (y(tot + lastPast.todo) - 6) + '" text-anchor="middle">' + Math.round(100 * (lastPast.ontime + lastPast.nudged) / tot) + '%</text>';
    }
    s += '<rect class="hit" id="psHit" x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '"/></svg>';
    box.innerHTML = s;
    var tip = el('div', { class: 'tip', hidden: true });
    box.appendChild(tip);
    var svg = box.querySelector('svg');
    function move(ev) {
      var r = svg.getBoundingClientRect();
      var j = Math.max(0, Math.min(list.length - 1, Math.floor(((ev.clientX - r.left) / r.width * W - L) / slot)));
      var d = list[j];
      var tot = d.ontime + d.nudged + d.missed;
      tip.hidden = false;
      tip.innerHTML = d.none ? '<b>' + esc(nice(d.date)) + '</b><br>No check that day'
        : '<b>' + esc(nice(d.date)) + '</b>' + (tot ? ' · ' + Math.round(100 * (d.ontime + d.nudged) / tot) + '% done' : '') +
          '<br>' + d.ontime + ' done, no reminder<br>' + d.nudged + ' done after a reminder<br>' + d.missed + ' missed' + (d.todo ? '<br>' + d.todo + ' still to do' : '') + (d.pending ? '<br>' + d.pending + ' not due yet' : '');
      tip.style.left = ((L + slot * j + slot / 2) / W * r.width) + 'px';
      tip.style.top = (y(tot + d.todo) / H * r.height) + 'px';
    }
    var hit = box.querySelector('#psHit');
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', function () { tip.hidden = true; });
    var used = KINDS.filter(function (kd) { return list.some(function (d) { return d[kd.k]; }); });
    $('psLegend').innerHTML = '';
    used.forEach(function (kd) { $('psLegend').appendChild(el('span', {}, [el('i', { style: 'background:' + kd.color }), kd.label])); });
  }

  /* ----- by person */
  function renderPeople() {
    var tb = $('psPeople');
    tb.innerHTML = '';
    var map = {};
    rows.forEach(function (r) {
      if (['ontime', 'nudged', 'missed'].indexOf(r.c) < 0) return;
      var p = map[r.staff] = map[r.staff] || { name: r.staff, ontime: 0, nudged: 0, missed: 0, last: '' };
      p[r.c]++;
      if (r.c === 'missed' && r.date > p.last) p.last = r.date;
    });
    var list = Object.keys(map).map(function (k) { var p = map[k]; p.n = p.ontime + p.nudged + p.missed; p.rate = Math.round(100 * (p.ontime + p.nudged) / p.n); return p; });
    if (!list.length) { tb.appendChild(el('tr', {}, [el('td', { class: 'empty-s', text: 'Nobody yet.' })])); return; }
    list.sort(function (a, b) { return a.rate - b.rate || b.missed - a.missed || b.nudged - a.nudged || a.name.localeCompare(b.name); });
    tb.appendChild(el('thead', {}, [el('tr', {}, ['Person', 'Done', 'First time', 'After tag', 'Missed', 'Last miss'].map(function (h) { return el('th', { text: h }); }))]));
    var body = el('tbody');
    list.forEach(function (p, j) {
      var col = p.rate >= 100 ? 'var(--yes)' : p.rate >= 90 ? 'var(--warn)' : 'var(--no)';
      body.appendChild(el('tr', { style: '--i:' + j }, [
        el('td', { class: 'nowrap', text: p.name }),
        el('td', { class: 'ps-rate' }, [el('span', { class: 'ps-pct', text: p.rate + '%' }), el('div', { class: 'meter' }, [el('span', { style: 'width:' + p.rate + '%;background:' + col })])]),
        el('td', { text: String(p.ontime) }),
        el('td', { text: String(p.nudged) }),
        el('td', {}, [p.missed ? el('span', { class: 'flag bad', text: '⚠ ' + p.missed }) : el('span', { class: 'flag ok', text: '✓ 0' })]),
        el('td', { class: 'nowrap muted', text: p.last ? nice(p.last) : '' })
      ]));
    });
    tb.appendChild(body);
  }

  /* ----- missed list */
  function renderMisses() {
    var tb = $('psMisses');
    tb.innerHTML = '';
    var list = rows.filter(function (r) { return r.c === 'missed' || r.c === 'todo'; })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : a.staff.localeCompare(b.staff); }).slice(0, 60);
    if (!list.length) { tb.appendChild(el('tr', {}, [el('td', { class: 'empty-s', text: 'No missed pre-starts in this period.' })])); return; }
    tb.appendChild(el('thead', {}, [el('tr', {}, ['Day', 'Person', 'Machine', 'Job', 'Tags'].map(function (h) { return el('th', { text: h }); }))]));
    var body = el('tbody');
    list.forEach(function (r, j) {
      body.appendChild(el('tr', { style: '--i:' + j }, [
        el('td', { class: 'nowrap' }, [nice(r.date), r.c === 'todo' ? el('span', { class: 'flag soon', text: 'today' }) : null]),
        el('td', { class: 'nowrap', text: r.staff }),
        el('td', { text: r.machine }),
        el('td', { class: 'muted', text: r.task }),
        el('td', { text: r.reminders ? r.reminders + '×' : '—' })
      ]));
    });
    tb.appendChild(body);
  }

  function exportCsv() {
    var head = ['Date', 'Shift', 'Job', 'Person', 'Machine', 'Pre-start', 'Pre-start at', 'Times tagged', 'Result'];
    var names = { ontime: 'Done, no reminder', nudged: 'Done after a reminder', missed: 'Missed', todo: 'Still to do', pending: 'Not due yet', unknown: 'Not checked', skip: 'Not counted' };
    var lines = [head].concat(rows.map(function (r) { return [r.date, r.shift, r.task, r.staff, r.machine, r.pre, r.at, r.reminders, names[r.c] || '']; }));
    var text = lines.map(function (l) { return l.map(function (v) { v = String(v === undefined || v === null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
    var a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: 'pre-starts-' + today + '.csv' });
    document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var b = $('psCsv');
    if (b) b.addEventListener('click', exportCsv);
  });

  window.PrestartPanel = { show: show, hide: hide, rerender: function () { if (res && !$('psView').hidden) renderDaily(); } };
})();
