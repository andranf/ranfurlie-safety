/* Monthly inspection dashboard. */
(function () {
  'use strict';

  var I = window.INSP, el = I.el, esc = I.esc;
  var LISTS = window.INSPECT_CHECKLISTS || {};
  var $ = function (id) { return document.getElementById(id); };
  var NS = 'http://www.w3.org/2000/svg';

  var site = 'compound';
  var data = null;
  var defFilter = 'open';
  var timer = null;

  function init() {
    var qs = new URLSearchParams(location.search);
    if (qs.get('site') && (LISTS[qs.get('site')] || qs.get('site') === 'prestarts')) site = qs.get('site');
    if (!I.API) { notice('This page is being set up. Check back soon.'); return; }
    renderTabs();
    $('period').addEventListener('change', load);
    $('refresh').addEventListener('click', load);
    Array.prototype.forEach.call($('defFilter').children, function (b) {
      b.addEventListener('click', function () {
        defFilter = b.getAttribute('data-f');
        Array.prototype.forEach.call($('defFilter').children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        renderDefects();
      });
    });
    $('csvDef').addEventListener('click', exportDefects);
    $('csvInsp').addEventListener('click', exportInspections);
    load();
    timer = setInterval(function () { if (!document.hidden && !$('modal').innerHTML) load(true); }, 5 * 60 * 1000);
  }

  function notice(msg) { var n = $('notice'); n.textContent = msg; n.hidden = !msg; }

  function renderTabs() {
    var box = $('siteTabs');
    box.innerHTML = '';
    Object.keys(LISTS).forEach(function (id) {
      var c = LISTS[id];
      box.appendChild(el('button', { type: 'button', 'aria-pressed': String(id === site), disabled: !!c.comingSoon, title: c.comingSoon ? 'Coming soon' : '',
        text: c.name + (c.comingSoon ? ' (soon)' : ''), onclick: function () { site = id; renderTabs(); load(); } }));
    });
    box.appendChild(el('button', { type: 'button', 'aria-pressed': String(site === 'prestarts'), text: 'Machine pre-starts',
      onclick: function () { site = 'prestarts'; renderTabs(); load(); } }));
  }

  function load(quiet) {
    if (site === 'prestarts') {
      $('content').hidden = true;
      if (window.PrestartPanel) window.PrestartPanel.show($('period').value);
      return;
    }
    if (window.PrestartPanel) window.PrestartPanel.hide();
    if (!quiet) $('dSub').textContent = 'Loading…';
    I.get({ action: 'inspData', site: site, months: $('period').value }).then(function (res) {
      data = prep(res);
      notice('');
      render();
    }).catch(function (x) {
      $('dSub').textContent = '';
      notice('Could not load the register: ' + x.message);
    });
  }

  /* ============================================================ data */

  function prep(res) {
    var cl = LISTS[site] || {};
    var insp = (res.inspections || []).slice().sort(function (a, b) { return new Date(a.submittedAt) - new Date(b.submittedAt); });
    var cols = (res.answers && res.answers.cols) || [];
    var ans = ((res.answers && res.answers.rows) || []).map(function (r) { var o = {}; cols.forEach(function (c, i) { o[c] = r[i]; }); return o; });
    var byInsp = {};
    ans.forEach(function (a) { (byInsp[a.id] = byInsp[a.id] || []).push(a); });
    var shorts = {}; (cl.sections || []).forEach(function (x) { shorts[x.id] = x.short || x.title; });
    return { cl: cl, titles: I.sectionTitles(cl), shorts: shorts, qs: I.questions(cl), insp: insp, ans: ans, byInsp: byInsp, defects: res.defects || [], staff: res.staff || [], generated: res.generated };
  }

  function latest() { return data.insp[data.insp.length - 1] || null; }

  /* ========================================================== render */

  function render() {
    var cl = data.cl;
    $('dTitle').textContent = (cl.name || 'Inspections') + ': monthly H&S inspections';
    var last = latest();
    $('dSub').textContent = data.insp.length
      ? data.insp.length + ' inspection' + (data.insp.length === 1 ? '' : 's') + ' in the period · updated ' + I.clock(new Date())
      : 'No inspections recorded yet for this area.';
    $('content').hidden = false;
    renderKpis(last);
    renderTrend();
    renderSections();
    renderRepeats();
    renderExpiries(last);
    renderDefects();
    renderHistory();
    renderNA(last);
    $('foot').textContent = 'Register: Ranfurlie Safety Register (Google Sheet) · Inspections, Inspection Answers and Inspection Defects tabs.';
  }

  /* ----- KPI tiles: number + mini chart */
  function renderKpis(last) {
    var box = $('kpis');
    box.innerHTML = '';
    var every = (data.cl.everyDays || 31);
    var i = 0;

    // 1. Last inspection + 12-month strip
    var dueIn = last ? Math.round((new Date(last.submittedAt).getTime() + every * 86400000 - Date.now()) / 86400000) : null;
    var months = el('div', { class: 'months' });
    var labs = el('div', { class: 'months-l' });
    var now = new Date();
    for (var m = 11; m >= 0; m--) {
      var d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      var done = data.insp.some(function (x) { var t = new Date(x.submittedAt); return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth(); });
      months.appendChild(el('span', { class: (done ? 'done' : '') + (m === 0 ? ' cur' : ''), style: '--i:' + (11 - m), title: I.MON[d.getMonth()] + ' ' + d.getFullYear() + (done ? ': done' : ': not done') }));
    }
    labs.appendChild(el('span', { text: I.MON[new Date(now.getFullYear(), now.getMonth() - 11, 1).getMonth()] }));
    labs.appendChild(el('span', { text: I.MON[now.getMonth()] }));
    var flag1 = !last ? el('span', { class: 'flag bad', text: '⚠ Not done yet' })
      : dueIn < 0 ? el('span', { class: 'flag bad', text: '⚠ Overdue ' + (-dueIn) + ' days' })
      : dueIn <= 7 ? el('span', { class: 'flag soon', text: 'Due in ' + dueIn + ' days' })
      : el('span', { class: 'flag ok', text: '✓ Next due in ' + dueIn + ' days' });
    box.appendChild(kpi(i++, 'Last inspection', last ? I.dayMon(last.submittedAt) : '—', last ? ['by ', el('b', { text: last.inspector })] : 'No record yet', [flag1], [months, labs], !last || dueIn < 0));

    // 2. Latest score + sparkline
    var scores = data.insp.filter(hasScore);
    var prev = scores.length > 1 ? scores[scores.length - 2] : null;
    var delta = hasScore(last) && prev ? Math.round((last.score - prev.score) * 10) / 10 : null;
    var kv2 = el('div', { class: 'kv' });
    var t2 = kpi(i++, 'Latest score', kv2, delta === null ? (last ? 'First inspection' : '—') : [el('b', { text: (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta) + ' pts' }), ' vs previous'], null, [spark(scores.map(function (x) { return Number(x.score); }), 0, 100)]);
    box.appendChild(t2);
    if (hasScore(last)) I.countUp(kv2, Number(last.score), { suffix: '%', dp: Number(last.score) % 1 ? 1 : 0 }); else kv2.textContent = '—';

    // 3. Open defects by age
    var open = data.defects.filter(function (d) { return d.status !== 'Closed'; });
    var high = open.filter(function (d) { return d.priority === 'High'; }).length;
    var buckets = [0, 0, 0, 0];
    open.forEach(function (d) { var a = ageDays(d.foundAt); buckets[a <= 7 ? 0 : a <= 30 ? 1 : a <= 90 ? 2 : 3]++; });
    var maxB = Math.max.apply(null, buckets.concat([1]));
    var bars = el('div', { class: 'minibars', 'aria-label': 'Open defects by age' }, buckets.map(function (b, j) { return el('span', { style: 'height:' + Math.max(4, Math.round(100 * b / maxB)) + '%;--i:' + j, title: b + ' open' }); }));
    var bl = el('div', { class: 'minibars-l' }, ['≤7d', '8–30d', '31–90d', '90d+'].map(function (t, j) { return el('span', { text: t + ' (' + buckets[j] + ')' }); }));
    var kv3 = el('div', { class: 'kv' });
    box.appendChild(kpi(i++, 'Open defects', kv3, high ? [el('b', { text: high + ' high priority' })] : 'None high priority', null, [bars, bl], high > 0));
    I.countUp(kv3, open.length, { dur: 700 });

    // 4. Close-out rate
    var raised = data.defects.length;
    var closed = data.defects.filter(function (d) { return d.status === 'Closed'; });
    var rate = raised ? Math.round(100 * closed.length / raised) : null;
    var days = closed.map(function (d) { return (new Date(d.closedAt) - new Date(d.foundAt)) / 86400000; }).filter(isFinite);
    var avg = days.length ? Math.round(days.reduce(function (a, b) { return a + b; }, 0) / days.length) : null;
    var kv4 = el('div', { class: 'kv' });
    box.appendChild(kpi(i++, 'Defects closed', kv4, avg === null ? closed.length + ' of ' + raised : ['avg ', el('b', { text: avg + ' day' + (avg === 1 ? '' : 's') }), ' to close'], null,
      [el('div', { class: 'meter', title: (rate || 0) + '% closed' }, [el('span', { style: 'width:' + (rate || 0) + '%' })]), el('div', { class: 'months-l' }, [el('span', { text: closed.length + ' closed' }), el('span', { text: raised + ' raised' })])]));
    if (rate === null) kv4.textContent = '—'; else I.countUp(kv4, rate, { suffix: '%' });

    // 5. Expiring / due
    var ex = expiryList(last);
    var over = ex.filter(function (x) { return x.n < 0; }).length;
    var soon = ex.filter(function (x) { return x.n >= 0 && x.n <= 30; }).length;
    var next = ex.filter(function (x) { return x.n !== null; })[0];
    var kv5 = el('div', { class: 'kv' });
    box.appendChild(kpi(i++, 'Expired or due ≤ 30 days', kv5, over ? [el('b', { text: over + ' overdue / expired' })] : 'Nothing overdue', null,
      next ? [el('div', { class: 'ks', style: 'margin:0' }, ['Next: ', el('b', { text: next.what }), ' · ' + next.state.text])] : [el('div', { class: 'ks', text: 'All dates more than 30 days out' })], over > 0));
    I.countUp(kv5, over + soon, { dur: 700 });

    // 6. N/A rate + sparkline
    var naRates = data.insp.map(function (x) { return x.total ? 100 * x.na / x.total : 0; });
    var lastNA = naRates.length ? naRates[naRates.length - 1] : null;
    var kv6 = el('div', { class: 'kv' });
    box.appendChild(kpi(i++, 'N/A used', kv6, last ? [el('b', { text: last.na }), ' of ' + last.total + ' lines'] : '—', null, [spark(naRates, 0, Math.max(20, Math.max.apply(null, naRates.concat([0])) * 1.2))]));
    if (lastNA === null) kv6.textContent = '—'; else I.countUp(kv6, lastNA, { suffix: '%', dp: 0 });
  }

  function kpi(i, label, value, sub, flags, chart, alert) {
    var kv = typeof value === 'string' ? el('div', { class: 'kv', text: value }) : value;
    return el('div', { class: 'kpi' + (alert ? ' alert' : ''), style: '--i:' + i }, [
      el('div', { class: 'kl', text: label }), kv,
      el('div', { class: 'ks' }, Array.isArray(sub) ? sub : [sub]),
      flags ? el('div', {}, flags) : null,
      el('div', { class: 'kc' }, chart || [])
    ]);
  }

  function hasScore(x) { return !!x && x.score !== '' && x.score !== null && x.score !== undefined && isFinite(Number(x.score)); }
  function ageDays(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso)) / 86400000)); }

  function spark(vals, lo, hi) {
    var w = 160, h = 34;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'mini-spark');
    if (!vals.length) return svg;
    var x = function (j) { return vals.length === 1 ? w / 2 : 3 + j * (w - 6) / (vals.length - 1); };
    var y = function (v) { return h - 3 - (Math.max(lo, Math.min(hi, v)) - lo) / ((hi - lo) || 1) * (h - 6); };
    var dpath = vals.map(function (v, j) { return (j ? 'L' : 'M') + x(j).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', dpath); p.setAttribute('class', 'draw'); p.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(p);
    var c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x(vals.length - 1)); c.setAttribute('cy', y(vals[vals.length - 1])); c.setAttribute('r', 3);
    svg.appendChild(c);
    requestAnimationFrame(function () { try { var L = p.getTotalLength(); p.style.setProperty('--len', L); } catch (e) {} });
    return svg;
  }

  /* ----- score trend line chart with crosshair tooltip */
  function renderTrend() {
    var box = $('trend');
    box.innerHTML = '';
    var pts = data.insp.filter(hasScore);
    if (!pts.length) { box.appendChild(el('div', { class: 'empty-s', text: 'The trend appears after the first inspection.' })); return; }
    var W = Math.max(300, Math.round(box.clientWidth || 640)), H = W < 480 ? 200 : 240, L = 40, R = 16, T = 16, B = 30;
    var minS = Math.min.apply(null, pts.map(function (p) { return Number(p.score); }));
    var lo = Math.max(0, Math.floor((minS - 5) / 10) * 10), hi = 100;
    var t0 = new Date(pts[0].submittedAt).getTime(), t1 = new Date(pts[pts.length - 1].submittedAt).getTime();
    var span = Math.max(t1 - t0, 1);
    var x = function (p) { return pts.length === 1 ? (L + W - R) / 2 : L + (new Date(p.submittedAt).getTime() - t0) / span * (W - L - R); };
    var y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Inspection score over time"><defs><linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2D6A50" stop-opacity=".18"/><stop offset="1" stop-color="#2D6A50" stop-opacity="0"/></linearGradient></defs><g class="grid">';
    for (var v = lo; v <= hi; v += (hi - lo) / 4) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
    s += '</g><g class="axis">';
    for (v = lo; v <= hi; v += (hi - lo) / 4) s += '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + Math.round(v) + '%</text>';
    var lastM = '';
    pts.forEach(function (p) {
      var d = new Date(p.submittedAt), lab = I.MON[d.getMonth()] + (d.getMonth() === 0 || !lastM ? ' ' + String(d.getFullYear()).slice(2) : '');
      if (lab === lastM) return; lastM = lab;
      s += '<text x="' + x(p) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lab) + '</text>';
    });
    s += '</g>';
    var line = pts.map(function (p, j) { return (j ? 'L' : 'M') + x(p).toFixed(1) + ' ' + y(Number(p.score)).toFixed(1); }).join(' ');
    if (pts.length > 1) s += '<path class="area" d="' + line + ' L' + x(pts[pts.length - 1]).toFixed(1) + ' ' + y(lo) + ' L' + x(pts[0]).toFixed(1) + ' ' + y(lo) + ' Z"/>';
    s += '<path class="line draw" id="trendLine" d="' + line + '"/>';
    pts.forEach(function (p, j) { s += '<circle class="dot" style="--i:' + j + '" cx="' + x(p) + '" cy="' + y(Number(p.score)) + '" r="4.5"/>'; });
    var lp = pts[pts.length - 1];
    s += '<text class="lbl" x="' + Math.min(x(lp), W - R - 4) + '" y="' + (y(Number(lp.score)) - 10) + '" text-anchor="' + (pts.length > 1 ? 'end' : 'middle') + '">' + Number(lp.score) + '%</text>';
    s += '<line class="xhair" id="xh" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" visibility="hidden"/>';
    s += '<rect class="hit" id="hit" x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '"/></svg>';
    box.innerHTML = s;
    var path = box.querySelector('#trendLine');
    try { path.style.setProperty('--len', path.getTotalLength()); } catch (e) {}
    var tip = el('div', { class: 'tip', hidden: true });
    box.appendChild(tip);
    var svg = box.querySelector('svg'), xh = box.querySelector('#xh');
    function move(ev) {
      var r = svg.getBoundingClientRect();
      var px = (ev.clientX - r.left) / r.width * W;
      var best = null, bd = 1e9;
      pts.forEach(function (p) { var d = Math.abs(x(p) - px); if (d < bd) { bd = d; best = p; } });
      if (!best) return;
      xh.setAttribute('x1', x(best)); xh.setAttribute('x2', x(best)); xh.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.innerHTML = '<b>' + Number(best.score) + '%</b> · ' + esc(I.dayMon(best.submittedAt) + ' ' + new Date(best.submittedAt).getFullYear()) + '<br>' + esc(best.inspector) + ' · ' + best.no + ' defect' + (best.no == 1 ? '' : 's') + ' · ' + best.na + ' N/A';
      tip.style.left = (x(best) / W * r.width) + 'px';
      tip.style.top = (y(Number(best.score)) / H * r.height) + 'px';
    }
    var hit = box.querySelector('#hit');
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', function () { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); });
    hit.addEventListener('click', function (ev) {
      var r = svg.getBoundingClientRect(); var px = (ev.clientX - r.left) / r.width * W;
      var best = pts.reduce(function (a, p) { return Math.abs(x(p) - px) < Math.abs(x(a) - px) ? p : a; }, pts[0]);
      openRecord(best.id);
    });
  }

  /* ----- pass rate by section */
  function renderSections() {
    var box = $('secBars');
    box.innerHTML = '';
    if (!data.insp.length) { box.appendChild(el('div', { class: 'empty-s', text: 'Appears after the first inspection.' })); return; }
    var totals = {};
    var scoredQs = data.qs.filter(function (q) { return !q.unscored; });
    data.insp.forEach(function (insp) {
      var rows = data.byInsp[insp.id] || [];
      var res = {};
      rows.forEach(function (a) { res[a.key] = a.result; });
      scoredQs.forEach(function (q) {
        var r = res[q.key] || 'yes';   // only No / N/A lines and dates are sent; anything else passed
        var t = totals[q.sec] = totals[q.sec] || { yes: 0, no: 0 };
        if (r === 'yes') t.yes++; else if (r === 'no') t.no++;
      });
    });
    var list = Object.keys(data.titles).map(function (id) {
      var t = totals[id] || { yes: 0, no: 0 };
      return { id: id, title: data.titles[id], short: data.shorts[id], rate: t.yes + t.no ? 100 * t.yes / (t.yes + t.no) : null, no: t.no };
    }).filter(function (x) { return x.rate !== null; }).sort(function (a, b) { return a.rate - b.rate; });
    list.forEach(function (x, j) {
      box.appendChild(el('div', { class: 'hbar', title: x.title + ': ' + x.rate.toFixed(1) + '% passed, ' + x.no + ' defect' + (x.no === 1 ? '' : 's') + ' in the period' }, [
        el('div', { class: 'hl' }, [el('b', { text: x.id }), x.short]),
        el('div', { class: 'tr' }, [el('div', { class: 'fl' + (j === 0 && x.rate < 100 ? ' low' : ''), style: 'width:' + x.rate.toFixed(1) + '%;--i:' + j })]),
        el('div', { class: 'hv', text: (x.rate >= 99.95 ? '100' : x.rate.toFixed(x.rate % 1 ? 1 : 0)) + '%' })
      ]));
    });
  }

  /* ----- repeat failures */
  function renderRepeats() {
    var box = $('repeats');
    box.innerHTML = '';
    var fails = {};
    data.ans.forEach(function (a) {
      if (a.result !== 'no') return;
      var f = fails[a.key] = fails[a.key] || { key: a.key, label: a.label, asset: a.asset, sec: a.sec, n: 0, last: null };
      f.n++;
    });
    var list = Object.keys(fails).map(function (k) { return fails[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 10);
    if (!list.length) { box.appendChild(el('div', { class: 'empty-s', text: data.insp.length ? 'No defects recorded in this period.' : 'Appears after the first inspection.' })); return; }
    list.forEach(function (f, j) {
      var strip = el('div', { class: 'strip' });
      data.insp.forEach(function (insp) {
        var a = (data.byInsp[insp.id] || []).find(function (x) { return x.key === f.key; });
        var r = a ? a.result : 'yes';
        strip.appendChild(el('i', { class: r === 'no' ? 'n' : r === 'na' ? 'x' : '', title: I.dayMon(insp.submittedAt) + ': ' + (r === 'no' ? 'defect' : r === 'na' ? 'N/A' : 'passed') }));
      });
      var q = data.qs.find(function (x) { return x.key === f.key; });
      box.appendChild(el('div', { class: 'rep', style: '--i:' + j }, [
        el('div', { class: 'rt' }, [el('b', { text: (q && q.id) || f.sec }), (f.asset ? f.asset + ': ' : '') + f.label]),
        el('div', { class: 'rc', text: f.n + ' of ' + data.insp.length }),
        strip
      ]));
    });
  }

  /* ----- expiries & service dates */
  function expiryList(last) {
    if (!last) return [];
    var out = [];
    (data.byInsp[last.id] || []).forEach(function (a) {
      if ((a.kind !== 'date' && a.kind !== 'service') || a.result === 'na' || !a.value) return;
      var st = I.dueState(String(a.value).slice(0, 10));
      out.push({ what: (a.asset ? a.asset + ' ' + a.label.toLowerCase() : a.label), date: String(a.value).slice(0, 10), last: a.last, n: st.n, state: st, kind: a.kind });
    });
    return out.sort(function (a, b) { return a.n - b.n; });
  }
  function renderExpiries(last) {
    var t = $('expiries');
    t.innerHTML = '';
    var list = expiryList(last);
    if (!list.length) { t.appendChild(el('tbody', {}, [el('tr', {}, [el('td', {}, [el('div', { class: 'empty-s', text: last ? 'No dates recorded in the latest inspection.' : 'Appears after the first inspection.' })])])])); return; }
    t.appendChild(el('thead', {}, [el('tr', {}, [el('th', { text: 'Item' }), el('th', { text: 'Date' }), el('th', { text: 'Status' })])]));
    var tb = el('tbody');
    list.forEach(function (x, j) {
      var cls = x.state.cls === 'bad' ? 'bad' : x.state.cls === 'soon' ? 'soon' : 'ok';
      tb.appendChild(el('tr', { style: '--i:' + j }, [
        el('td', {}, [x.what, x.kind === 'service' && x.last ? el('div', { class: 'muted', text: 'Last done ' + I.dmy(x.last) }) : null]),
        el('td', { class: 'nowrap', text: (x.kind === 'service' ? 'Due ' : 'Expires ') + I.dmy(x.date) }),
        el('td', {}, [el('span', { class: 'flag ' + cls, text: (cls === 'bad' ? '⚠ ' : cls === 'soon' ? '◔ ' : '✓ ') + x.state.text })])
      ]));
    });
    t.appendChild(tb);
  }

  /* ----- defect register */
  function renderDefects() {
    var t = $('defects');
    t.innerHTML = '';
    var list = data.defects.filter(function (d) { return defFilter === 'all' || (defFilter === 'open' ? d.status !== 'Closed' : d.status === 'Closed'); });
    var rank = { High: 0, Medium: 1, Low: 2 };
    list.sort(function (a, b) {
      if (defFilter !== 'closed' && (a.status === 'Closed') !== (b.status === 'Closed')) return a.status === 'Closed' ? 1 : -1;
      if (defFilter !== 'closed' && rank[a.priority] !== rank[b.priority]) return (rank[a.priority] || 1) - (rank[b.priority] || 1);
      return new Date(b.foundAt) - new Date(a.foundAt);
    });
    if (!list.length) {
      t.appendChild(el('tbody', {}, [el('tr', {}, [el('td', {}, [el('div', { class: 'empty-s', text: defFilter === 'open' ? 'No open defects. ✓' : 'Nothing to show.' })])])]));
      return;
    }
    t.appendChild(el('thead', {}, [el('tr', {}, ['Priority', 'Defect', 'Found', 'Age', 'Status', ''].map(function (h) { return el('th', { text: h }); }))]));
    var tb = el('tbody');
    var last = latest();
    var lastRes = {};
    if (last) (data.byInsp[last.id] || []).forEach(function (a) { lastRes[a.key] = a.result; });
    list.forEach(function (d, j) {
      var closedRow = d.status === 'Closed';
      var passedSince = !closedRow && last && new Date(d.foundAt) < new Date(last.submittedAt) && new Date(d.lastSeen || d.foundAt) < new Date(last.submittedAt) && lastRes[d.key] !== 'no' && lastRes[d.key] !== 'na';
      var thumbs = (d.photos || []).length ? el('div', { class: 'thumbs' }, d.photos.map(function (p) {
        return el('a', { href: p.url, target: '_blank', rel: 'noopener' }, [el('img', { src: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(p.id) + '&sz=w120', alt: 'Defect photo', loading: 'lazy' })]);
      })) : null;
      tb.appendChild(el('tr', { style: '--i:' + Math.min(j, 20) }, [
        el('td', {}, [el('span', { class: 'pchip ' + (closedRow ? 'Closed' : d.priority) + (!closedRow && d.priority === 'High' ? ' pulse' : ''), text: closedRow ? '✓ Closed' : (d.priority === 'High' ? '▲ ' : d.priority === 'Low' ? '▽ ' : '◆ ') + d.priority })]),
        el('td', {}, [
          el('div', { style: 'font-weight:600' }, [(d.ref ? d.ref + ' · ' : d.sec + ' · ') + (d.asset ? d.asset + ': ' : '') + d.label]),
          el('div', { text: d.description }),
          d.timesSeen > 1 ? el('div', { style: 'margin-top:4px' }, [el('span', { class: 'flag bad', text: '\u21bb Seen ' + d.timesSeen + ' times' }), ' ', el('span', { class: 'muted', text: 'last ' + I.dayMon(d.lastSeen) + (d.latestNote ? ' \u00b7 ' + d.latestNote.replace(/^\d+ \w+ /, '') : '') })]) : null,
          passedSince ? el('div', { style: 'margin-top:4px' }, [el('span', { class: 'flag ok', text: '\u2713 Passed on ' + I.dayMon(last.submittedAt) + ' \u00b7 close it out?' })]) : null,
          d.fixedOnSpot ? el('div', { class: 'muted', text: 'Fixed on the spot: ' + (d.fixNote || '') }) : null,
          closedRow && !d.fixedOnSpot ? el('div', { class: 'muted', text: 'Closed ' + I.dayMon(d.closedAt) + ' by ' + d.closedBy + ': ' + (d.closeNote || '') }) : null,
          thumbs
        ]),
        el('td', { class: 'nowrap' }, [I.dayMon(d.foundAt), el('div', { class: 'muted', text: d.foundBy })]),
        el('td', { class: 'num', text: closedRow ? '' : ageDays(d.foundAt) + 'd' }),
        el('td', { class: 'nowrap', text: closedRow ? 'Closed' : 'Open' }),
        el('td', {}, [closedRow ? null : el('button', { type: 'button', class: 'btn primary tiny', text: 'Close out', onclick: function () { closeOut(d); } })])
      ]));
    });
    t.appendChild(tb);
  }

  /* ----- history */
  function renderHistory() {
    var t = $('history');
    t.innerHTML = '';
    if (!data.insp.length) { t.appendChild(el('tbody', {}, [el('tr', {}, [el('td', {}, [el('div', { class: 'empty-s', text: 'No inspections yet.' })])])])); return; }
    t.appendChild(el('thead', {}, [el('tr', {}, ['Date', 'Inspector', 'Score', 'Defects', 'N/A', 'Time', 'Reviewed'].map(function (h, j) { return el('th', { class: j >= 2 && j <= 5 ? 'num' : '', text: h }); }))]));
    var tb = el('tbody');
    data.insp.slice().reverse().forEach(function (x, j) {
      var mins = x.activeMin !== '' && x.activeMin !== undefined && x.activeMin !== null ? Number(x.activeMin) : Number(x.durationMin);
      var quick = mins > 0 && mins < 15;
      tb.appendChild(el('tr', { class: 'click', style: '--i:' + Math.min(j, 20), tabindex: '0', onclick: function () { openRecord(x.id); }, onkeydown: function (e) { if (e.key === 'Enter') openRecord(x.id); } }, [
        el('td', { class: 'nowrap', text: I.dayMon(x.submittedAt) + ' ' + String(new Date(x.submittedAt).getFullYear()).slice(2) }),
        el('td', { text: x.inspector }),
        el('td', { class: 'num', text: hasScore(x) ? x.score + '%' : '—' }),
        el('td', { class: 'num', text: String(x.no) }),
        el('td', { class: 'num', text: String(x.na) }),
        el('td', { class: 'num' }, [mins + ' min', quick ? el('div', {}, [el('span', { class: 'flag soon', title: 'Under 15 minutes for the whole walk-around', text: '⚠ quick' })]) : null]),
        el('td', {}, [x.reviewedBy ? el('span', { class: 'flag ok', text: '✓ ' + x.reviewedBy.split(' ')[0] }) : el('span', { class: 'flag na', text: 'To review' })])
      ]));
    });
    t.appendChild(tb);
  }

  /* ----- N/A register */
  function renderNA(last) {
    var t = $('nas');
    t.innerHTML = '';
    var rows = last ? (data.byInsp[last.id] || []).filter(function (a) { return a.result === 'na'; }) : [];
    if (!rows.length) { t.appendChild(el('tbody', {}, [el('tr', {}, [el('td', {}, [el('div', { class: 'empty-s', text: last ? 'No N/A in the latest inspection.' : 'Appears after the first inspection.' })])])])); return; }
    // Group asset-level N/A (every line of one piece of equipment) into one row.
    var grouped = [], seen = {};
    rows.forEach(function (a) {
      var q = data.qs.find(function (x) { return x.key === a.key; });
      var g = q && q.assetKey ? q.assetKey + '|' + a.naReason : a.key;
      if (seen[g]) { seen[g].n++; return; }
      var times = data.insp.filter(function (x) { return (data.byInsp[x.id] || []).some(function (b) { return b.key === a.key && b.result === 'na'; }); }).length;
      seen[g] = { label: q && q.assetKey ? a.asset : ((q && q.id ? q.id + ' · ' : '') + a.label), sub: q && q.assetKey ? null : null, reason: a.naReason, n: 1, times: times, asset: !!(q && q.assetKey) };
      grouped.push(seen[g]);
    });
    t.appendChild(el('thead', {}, [el('tr', {}, [el('th', { text: 'Line' }), el('th', { text: 'Reason' }), el('th', { class: 'num', text: 'Times N/A' })])]));
    var tb = el('tbody');
    grouped.forEach(function (g, j) {
      tb.appendChild(el('tr', { style: '--i:' + j }, [
        el('td', {}, [g.label, g.asset ? el('div', { class: 'muted', text: 'Whole item (' + g.n + ' line' + (g.n === 1 ? '' : 's') + ')' }) : null]),
        el('td', { text: g.reason || '—' }),
        el('td', { class: 'num', text: g.times + ' of ' + data.insp.length })
      ]));
    });
    t.appendChild(tb);
  }

  /* ========================================================= modals */

  function modal(title, body, opts) {
    var m = $('modal');
    m.innerHTML = '';
    m.hidden = false;
    var x = el('button', { type: 'button', class: 'x', 'aria-label': 'Close', text: '×', onclick: closeModal });
    var box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      el('div', { class: 'modal-head' }, [el('h2', { text: title }), opts && opts.tools ? opts.tools : null, x])
    ].concat(body));
    var bg = el('div', { class: 'modal-bg', onclick: function (e) { if (e.target === bg) closeModal(); } }, [box]);
    m.appendChild(bg);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', escClose);
    return box;
  }
  function escClose(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() {
    var m = $('modal'); m.innerHTML = ''; m.hidden = true;
    document.body.style.overflow = ''; document.body.classList.remove('printing');
    document.removeEventListener('keydown', escClose);
  }

  function namePicker() {
    var sel = el('select', {}, [el('option', { value: '', text: 'Choose…' })].concat(data.staff.map(function (n) { return el('option', { value: n, text: n }); })));
    var lastName = I.local.get('rs_name');
    if (lastName && data.staff.indexOf(lastName) >= 0) sel.value = lastName;
    return sel;
  }

  function signForm(opts) {
    var sel = namePicker();
    var note = el('textarea', { rows: '3', placeholder: opts.placeholder || '' });
    var canvas = el('canvas', { 'aria-label': 'Signature pad' });
    var hint = el('span', { class: 'sig-hint', text: 'Sign here' });
    var err = el('p', { class: 'err', role: 'alert' });
    var go = el('button', { type: 'button', class: 'btn primary wide', text: opts.button, disabled: true });
    var pad;
    function ready() { go.disabled = !(sel.value && (!opts.noteRequired || note.value.trim().length >= 3) && pad && pad.has()); }
    var nodes = [
      el('div', { class: 'field' }, [el('label', { text: 'Your name' }), sel]),
      el('div', { class: 'field' }, [el('label', { text: opts.noteLabel }), note]),
      el('div', { class: 'field' }, [el('label', { text: 'Signature' }), el('div', { class: 'sig-wrap' }, [canvas, hint, el('button', { type: 'button', class: 'link-btn sig-clear', text: 'Clear', onclick: function () { pad.clear(); } })])]),
      err, go,
      el('p', { class: 'muted', style: 'font-size:13px;text-align:center;margin:8px 0 0', text: 'Your name, the time and your signature are recorded in the register.' })
    ];
    sel.addEventListener('change', ready); note.addEventListener('input', ready);
    setTimeout(function () { pad = I.SigPad(canvas, hint, ready); pad.size(); }, 60);
    go.addEventListener('click', function () {
      go.disabled = true; go.textContent = 'Saving…'; err.textContent = '';
      I.local.set('rs_name', sel.value);
      opts.submit({ name: sel.value, note: note.value.trim(), signature: pad.png() }).then(function () {
        closeModal(); I.toast(opts.done); load(true);
      }).catch(function (x) { err.textContent = x.message; go.textContent = opts.button; ready(); });
    });
    return nodes;
  }

  function closeOut(d) {
    modal('Close out defect', [
      el('div', { class: 'defect', style: 'margin-top:0' }, [
        el('div', { class: 'dh', text: (d.ref || d.sec) + ' · found ' + I.dayMon(d.foundAt) + ' by ' + d.foundBy }),
        el('div', { class: 'dt', text: (d.asset ? d.asset + ': ' : '') + d.label }),
        el('div', { class: 'dd', text: d.description })
      ])
    ].concat(signForm({
      noteLabel: 'What was done to fix it? (required)', placeholder: 'e.g. Racking moved, exit path clear and marked', noteRequired: true,
      button: 'Close out defect', done: 'Defect closed out',
      submit: function (v) { return I.post({ action: 'inspClose', defectId: d.id, name: v.name, note: v.note, signature: v.signature, ua: navigator.userAgent }); }
    })));
  }

  function openRecord(id) {
    var box = modal('Inspection record', [el('div', { class: 'empty-s', text: 'Loading…' })], {
      tools: el('button', { type: 'button', class: 'btn ghost tiny no-print', text: 'Print', onclick: function () { document.body.classList.add('printing'); window.print(); setTimeout(function () { document.body.classList.remove('printing'); }, 500); } })
    });
    I.get({ action: 'inspRecord', id: id }).then(function (res) {
      var r = res.inspection;
      var body = box.querySelector('.empty-s');
      if (body) body.remove();
      var titles = data.titles;
      box.appendChild(el('div', { class: 'meta-grid' }, [
        meta('Area', r.siteName || (data.cl.name || r.site)), meta('Receipt', r.id),
        meta('Inspector', r.inspector), meta('Score', hasScore(r) ? r.score + '%' : '—'),
        meta('Started', I.when(r.startedAt)), meta('Submitted', I.when(r.submittedAt)),
        meta('Time taken', r.activeMin !== '' && r.activeMin !== undefined ? r.activeMin + ' min walking (' + r.durationMin + ' min start to finish)' : r.durationMin + ' min'), meta('Yes / No / N/A', r.yes + ' / ' + r.no + ' / ' + r.na),
        meta('Checklist version', r.version), meta('Device', String(r.device || '').replace(/\).*/, ')').slice(0, 60))
      ]));
      box.appendChild(el('div', { class: 'rec-sec' }, [el('h3', { text: 'Declaration & signature' }), el('div', { style: 'font-size:14px', text: r.declaration || '' }),
        r.signatureUrl ? el('a', { href: r.signatureUrl, target: '_blank', rel: 'noopener', class: 'link-btn', text: 'View signature (register only)' }) : null]));
      var otherPh = (res.answers || []).filter(function (a) { return a.key === 'other' && a.photos; })[0];
      if (r.other || otherPh) box.appendChild(el('div', { class: 'rec-sec' }, [el('h3', { text: 'Other hazards / comments' }), el('div', { text: r.other || '' }),
        otherPh ? el('div', { class: 'thumbs' }, String(otherPh.photos).split(',').filter(Boolean).map(function (id) {
          return el('a', { href: 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view', target: '_blank', rel: 'noopener' }, [el('img', { src: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w120', alt: 'Photo', loading: 'lazy' })]);
        })) : null]));
      if (r.added) box.appendChild(el('div', { class: 'rec-sec' }, [el('h3', { text: 'Equipment added on the day (not on the checklist yet)' }), el('div', { style: 'white-space:pre-line;font-size:14px', text: r.added })]));
      // review
      var rev = el('div', { class: 'rec-sec' }, [el('h3', { text: 'Superintendent review' })]);
      if (r.reviewedBy) {
        rev.appendChild(el('div', {}, ['Reviewed by ', el('b', { text: r.reviewedBy }), ' · ' + I.when(r.reviewedAt)]));
        if (r.reviewComment) rev.appendChild(el('div', { class: 'muted', text: r.reviewComment }));
      } else {
        rev.appendChild(el('button', { type: 'button', class: 'btn primary no-print', text: 'Review & sign', onclick: function () { review(r); } }));
      }
      box.appendChild(rev);
      // answers by section
      var bySec = {};
      (res.answers || []).forEach(function (a) { (bySec[a.sec] = bySec[a.sec] || []).push(a); });
      Object.keys(titles).forEach(function (sid) {
        var list = bySec[sid];
        if (!list || !list.length) return;
        var sec = el('div', { class: 'rec-sec' }, [el('h3', { text: sid + '. ' + titles[sid] })]);
        list.forEach(function (a) {
          if (a.kind === 'photo') {
            if (a.photos) sec.appendChild(el('div', { class: 'rec-row' }, [el('span', { text: (a.asset ? a.asset + ': ' : '') + a.label }), el('span', { class: 'res val', text: 'Photo' }),
              el('div', { class: 'thumbs rn' }, String(a.photos).split(',').filter(Boolean).map(function (id) {
                return el('a', { href: 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view', target: '_blank', rel: 'noopener' }, [el('img', { src: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w120', alt: 'Photo', loading: 'lazy' })]);
              }))]));
            else if (a.noPhoto) sec.appendChild(el('div', { class: 'rec-row' }, [el('span', { text: (a.asset ? a.asset + ': ' : '') + a.label }), el('span', { class: 'res na', text: 'No photo' }), el('span', { class: 'rn', text: a.noPhoto })]));
            return;
          }
          if (a.kind === 'text') { if (a.value) sec.appendChild(el('div', { class: 'rec-row' }, [el('span', { text: (a.asset ? a.asset + ': ' : '') + a.label }), el('span', { class: 'res val', text: a.value })])); return; }
          var val = (a.kind === 'date' || a.kind === 'service') && a.value && a.result !== 'na' ? I.dmy(String(a.value).slice(0, 10)) : '';
          sec.appendChild(el('div', { class: 'rec-row' }, [
            el('span', { text: (a.asset ? a.asset + ': ' : '') + a.label + (val ? ' · ' + val : '') }),
            el('span', { class: 'res ' + (a.result || 'val'), text: a.result === 'na' ? 'N/A' : a.result === 'no' ? 'No' : a.result === 'yes' ? 'Yes' : '—' }),
            a.result === 'no' && a.comment ? el('span', { class: 'rn no', text: a.comment }) : null,
            a.result === 'na' && a.naReason ? el('span', { class: 'rn', text: 'N/A: ' + a.naReason }) : null,
            a.kind === 'service' && a.result !== 'no' && a.comment ? el('span', { class: 'rn', text: 'Note: ' + a.comment }) : null,
            a.noPhoto ? el('span', { class: 'rn', text: 'No photo: ' + a.noPhoto }) : null,
            a.photos ? el('div', { class: 'thumbs rn' }, String(a.photos).split(',').filter(Boolean).map(function (id) {
              return el('a', { href: 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view', target: '_blank', rel: 'noopener' }, [el('img', { src: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w120', alt: 'Photo', loading: 'lazy' })]);
            })) : null,
            a.at ? el('span', { class: 'rn', text: 'Answered ' + I.clock(new Date(a.at)) }) : null
          ]));
        });
        box.appendChild(sec);
      });
    }).catch(function (x) {
      var body = box.querySelector('.empty-s'); if (body) body.textContent = 'Could not load: ' + x.message;
    });
  }
  function meta(k, v) { return el('div', {}, [el('span', { text: k }), String(v === undefined || v === null ? '' : v)]); }

  function review(r) {
    modal('Review & sign inspection', [
      el('p', { class: 'muted', style: 'margin:0', text: I.dayMon(r.submittedAt) + ' · ' + r.inspector + ' · ' + r.no + ' defect' + (r.no == 1 ? '' : 's') + ' · ' + r.na + ' N/A' })
    ].concat(signForm({
      noteLabel: 'Comment (optional)', placeholder: 'e.g. Defects assigned, eyewash plumbing booked',
      button: 'Sign as reviewed', done: 'Inspection reviewed',
      submit: function (v) { return I.post({ action: 'inspReview', id: r.id, name: v.name, comment: v.note, signature: v.signature, ua: navigator.userAgent }); }
    })));
  }

  /* ============================================================ csv */

  function csv(rows) {
    return rows.map(function (r) { return r.map(function (v) { var s = String(v === undefined || v === null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','); }).join('\r\n');
  }
  function download(name, text) {
    var a = el('a', { href: URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportDefects() {
    var rows = [['Defect ID', 'Receipt', 'Found', 'Found by', 'Section', 'Ref', 'Item', 'Equipment', 'Description', 'Priority', 'Status', 'Fixed on the spot', 'Closed', 'Closed by', 'Close-out note']];
    data.defects.forEach(function (d) { rows.push([d.id, d.receipt, d.foundAt, d.foundBy, d.sec, d.ref, d.label, d.asset, d.description, d.priority, d.status, d.fixedOnSpot ? 'Yes' : '', d.closedAt || '', d.closedBy || '', d.closeNote || '']); });
    download('inspection-defects-' + site + '-' + I.todayKey() + '.csv', csv(rows));
  }
  function exportInspections() {
    var rows = [['Receipt', 'Area', 'Inspector', 'Started', 'Submitted', 'Minutes', 'Yes', 'No', 'N/A', 'Total', 'Score %', 'Version', 'Reviewed by', 'Reviewed at']];
    data.insp.forEach(function (x) { rows.push([x.id, x.site, x.inspector, x.startedAt, x.submittedAt, x.durationMin, x.yes, x.no, x.na, x.total, x.score, x.version, x.reviewedBy || '', x.reviewedAt || '']); });
    download('inspections-' + site + '-' + I.todayKey() + '.csv', csv(rows));
  }

  init();
})();
