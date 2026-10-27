/* Monthly H&S inspection - staff form. */
(function () {
  'use strict';

  var I = window.INSP, el = I.el;
  var LISTS = window.INSPECT_CHECKLISTS || {};
  var $ = function (id) { return document.getElementById(id); };

  var DECLARATION = 'I physically inspected every area on this checklist today. My answers are true and accurate, and every defect I found has been recorded and reported.';
  var NA_QUICK = ['Not fitted at this site', 'Not in use / out of service', 'Not applicable to this area'];
  var NOPHOTO_QUICK = ['Phone camera not working', 'Not safe to photograph', 'Nothing to see in a photo'];
  var HIGH_SECTIONS = { A: 1, B: 1, C: 1 };   // life-safety equipment defaults to High priority
  var IDLE_GAP = 10 * 60000;                   // gaps longer than this don't count as inspection time

  var staff = [];
  var status = {};           // inspStatus per site
  var cl = null;             // active checklist
  var Q = [];                // flattened questions
  var QBY = {};              // key -> question
  var S = null;              // inspection state (saved as the draft)
  var rows = {};             // key -> refresh fn for the visible section
  var pad = null;
  var photoTarget = null;
  var site = null;

  /* ============================================================ init */

  function init() {
    var qs = new URLSearchParams(location.search);
    site = qs.get('site') && LISTS[qs.get('site')] && !LISTS[qs.get('site')].comingSoon ? qs.get('site') : 'compound';
    if (!I.API) { notice('This page is being set up. Check back soon.'); return; }
    show('start');
    renderSites();
    $('foot').textContent = 'Loading…';
    I.get({ action: 'library' }).then(function (res) {
      staff = res.staff || [];
      fillNames();
      $('foot').textContent = '';
    }).catch(function (x) {
      $('foot').textContent = '';
      notice('Could not load the staff list: ' + x.message + ' Check your signal and reload.');
    });
    I.get({ action: 'inspStatus' }).then(function (res) { status = res.sites || {}; renderSites(); }).catch(function () {});
    sendPending();
    window.addEventListener('online', sendPending);
  }

  function notice(msg) { var n = $('notice'); n.textContent = msg; n.hidden = false; }

  function show(which) {
    ['start', 'stage', 'finish'].forEach(function (id) { $(id).hidden = id !== which; });
    $('runbar').hidden = which !== 'stage';
    $('stepnav').hidden = which !== 'stage';
    window.scrollTo(0, 0);
  }

  /* =========================================================== start */

  function renderSites() {
    var em = document.querySelector('.emergency .wrap span');   // emergency banner shows the address of the site being inspected
    if (em) { if (!em.getAttribute('data-def')) em.setAttribute('data-def', em.textContent); em.textContent = (LISTS[site] && LISTS[site].address) || em.getAttribute('data-def'); }
    var box = $('sites');
    box.innerHTML = '';
    Object.keys(LISTS).forEach(function (id, i) {
      var c = LISTS[id];
      var st = status[id];
      var line = null;
      if (!c.comingSoon) {
        if (st && st.last) {
          var due = I.daysUntil(st.nextDue);
          line = el('div', { class: 's-stat ' + (due !== null && due <= 0 ? 'due' : 'ok'),
            text: 'Last done ' + I.dayMon(st.last.submittedAt) + ' by ' + st.last.inspector.split(' ')[0] + (due !== null ? (due <= 0 ? ' \u00b7 due now' : ' \u00b7 due in ' + due + ' days') : '') });
        } else if (st) {
          line = el('div', { class: 's-stat due', text: 'Not done yet' });
        }
      }
      var b = el('button', { type: 'button', class: 'site anim-in', style: '--i:' + i, 'aria-pressed': String(id === site), disabled: !!c.comingSoon,
        onclick: function () { site = id; renderSites(); refreshStart(); } }, [
        c.comingSoon ? el('span', { class: 'soon', text: 'Coming soon' }) : null,
        !c.comingSoon && c.badge ? el('span', { class: 'soon badge', text: c.badge }) : null,
        el('div', { class: 's-name', text: c.name }),
        el('div', { class: 's-sub', text: c.comingSoon ? 'Checklist is on the way' : c.sub }),
        line
      ]);
      box.appendChild(b);
    });
    refreshStart();
  }

  function fillNames() {
    var sel = $('nameSel');
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '', text: 'Choose…' }));
    staff.forEach(function (n) { sel.appendChild(el('option', { value: n, text: n })); });
    var last = I.local.get('rs_name');
    if (last && staff.indexOf(last) >= 0) sel.value = last;
    sel.onchange = refreshStart;
    refreshStart();
  }

  function draftKey(id) { return 'insp_draft_' + id; }
  function photoKey(id) { return 'insp_photos_' + id; }
  function readDraft(id) { try { return JSON.parse(I.local.get(draftKey(id)) || 'null'); } catch (e) { return null; } }
  function dropDraft(id) { I.local.del(draftKey(id)); I.idb.del(photoKey(id)); }

  function refreshStart() {
    var name = $('nameSel').value;
    $('startBtn').disabled = !name || !LISTS[site] || LISTS[site].comingSoon;
    var d = readDraft(site);
    var box = $('resume');
    box.innerHTML = '';
    if (d && d.site === site) {
      var cnt = countDraft(d);
      box.appendChild(el('div', {}, [
        el('strong', { text: 'Inspection in progress' }),
        el('div', { text: d.inspector + ' started ' + I.when(d.startedAt) + ' \u00b7 ' + cnt.done + ' of ' + cnt.total + ' answered' })
      ]));
      box.appendChild(el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn primary', text: 'Carry on', onclick: function () { begin(d); } }),
        el('button', { type: 'button', class: 'btn ghost', text: 'Start again', onclick: function () {
          if (!confirmBox('Throw away the inspection in progress and start again?')) return;
          dropDraft(site); refreshStart();
        } })
      ]));
      box.hidden = false;
      $('startBtn').hidden = true;
    } else {
      box.hidden = true;
      $('startBtn').hidden = false;
    }
  }

  function confirmBox(msg) { try { return window.confirm(msg); } catch (e) { return true; } }

  function countDraft(d) {
    var list = I.questions(LISTS[d.site], d.extra).filter(function (q) { return !q.unscored; });
    var saveS = S, saveQ = QBY;
    S = d; QBY = {}; list.forEach(function (q) { QBY[q.key] = q; });
    var done = list.filter(function (q) { return result(q) !== null; }).length;
    S = saveS; QBY = saveQ;
    return { done: done, total: list.length };
  }

  $('startBtn').addEventListener('click', function () {
    var name = $('nameSel').value;
    if (!name) return;
    I.local.set('rs_name', name);
    var c = LISTS[site];
    dropDraft(site);
    begin({ v: 2, site: site, version: c.version, clientId: I.uid(), inspector: name, startedAt: new Date().toISOString(),
      step: 0, ans: {}, assetNA: {}, pri: {}, fixed: {}, photos: {}, extra: {}, other: '', active: 0, lastAct: Date.now() });
  });

  /* ======================================================= run state */

  function begin(state) {
    S = state;
    S.photos = S.photos || {};
    S.extra = S.extra || {};
    S.active = S.active || 0;
    S.lastAct = Date.now();
    cl = LISTS[S.site];
    rebuildQ();
    // Quarterly items default to N/A outside their months.
    Q.forEach(function (q) {
      if (q.months && !dueNow(q) && !S.ans[q.key]) S.ans[q.key] = { r: 'na', n: 'Not due this month (quarterly)', at: new Date().toISOString(), auto: true };
      if (q.kind === 'text' && !S.ans[q.key]) S.ans[q.key] = { v: q.def || '' };
    });
    $('whoName').textContent = S.inspector;
    $('who').hidden = false;
    document.body.classList.add('running');
    $('runTitle').textContent = cl.name;
    var go2 = function () { show('stage'); renderChips(); go(S.step || 0, 0); save(); };
    if (Object.keys(S.photos).length) { go2(); return; }
    // Photos live in IndexedDB (too big for localStorage) - bring them back when carrying on.
    I.idb.get(photoKey(S.site)).then(function (ph) {
      if (ph && typeof ph === 'object' && ph.clientId === S.clientId) S.photos = ph.photos || {};
      go2();
    });
  }

  function rebuildQ() {
    Q = I.questions(cl, S.extra);
    QBY = {};
    Q.forEach(function (q) { QBY[q.key] = q; });
  }

  function dueNow(q) { return !q.months || q.months.indexOf(new Date().getMonth() + 1) >= 0; }
  function naAllowed(q) { return !q.noNA && !(q.months && dueNow(q)); }

  $('notYou').addEventListener('click', function () {
    if (S && !confirmBox('Leave this inspection? Your answers stay saved on this phone.')) return;
    S = null;
    $('who').hidden = true;
    document.body.classList.remove('running');
    show('start');
    refreshStart();
  });

  function scored() { return Q.filter(function (q) { return !q.unscored; }); }
  function assetIsNA(q) { return !!(q.assetKey && S.assetNA && S.assetNA[q.assetKey] !== undefined); }

  // Result for a question: 'yes' | 'no' | 'na' | null (not answered yet)
  function result(q) {
    if (assetIsNA(q)) return 'na';
    var a = S.ans[q.key];
    if (!a) return null;
    if (q.kind === 'check') return a.r || null;
    if (q.kind === 'date' || q.kind === 'service') {
      if (a.r === 'na') return 'na';
      if (a.r === 'missing') return 'no';
      if (!a.v) return null;
      return I.dueState(a.v).cls === 'bad' ? 'no' : 'yes';
    }
    return null;
  }
  function naReason(q) {
    if (assetIsNA(q)) return S.assetNA[q.assetKey];
    return (S.ans[q.key] && S.ans[q.key].n) || '';
  }
  function autoText(q) {
    var a = S.ans[q.key] || {};
    if ((q.kind === 'date' || q.kind === 'service') && a.r === 'missing') {
      return q.label + (q.kind === 'service' ? ': no date found on the tag or record' : ': date not shown / couldn\u2019t find it');
    }
    if ((q.kind === 'date' || q.kind === 'service') && a.v && I.dueState(a.v).cls === 'bad') {
      return (q.kind === 'service' ? q.label + ' next due ' : q.label + ' ') + I.dmy(a.v) + (I.daysUntil(a.v) === 0 ? ' (today)' : ' has passed');
    }
    return '';
  }
  function defectText(q) {
    var a = S.ans[q.key] || {};
    var c = String(a.c || '').trim();
    if (q.kind === 'service' && String(a.note || '').trim()) c = 'Note: ' + String(a.note).trim();
    var auto = autoText(q);
    return auto && c ? auto + '. ' + c : (c || auto);
  }

  /* ---------------------------------------------------- photo rules */
  // A photo is required for every No (the defect), for a Yes on lines marked photo, and on
  // equipment cards that ask for one - unless the inspector says why they couldn't take it.
  function photoNeed(q) {
    if (q.kind === 'photo') return assetIsNA(q) ? '' : 'card';
    if (q.kind !== 'check') return '';
    var r = result(q);
    if (r === 'no' && !assetIsNA(q)) return 'defect';
    if (r === 'yes' && q.photo) return 'evidence';
    return '';
  }
  function photoCount(key) { return (S.photos[key] || []).length; }
  function photoOk(q) {
    return photoCount(q.key) > 0 || String((S.ans[q.key] || {}).np || '').trim().length >= 3;
  }

  function tally() {
    var t = { yes: 0, no: 0, na: 0, open: 0, total: 0 };
    scored().forEach(function (q) {
      t.total++;
      var r = result(q);
      if (r) t[r]++; else t.open++;
    });
    t.answered = t.total - t.open;
    t.score = t.yes + t.no ? Math.round(1000 * t.yes / (t.yes + t.no)) / 10 : null;
    return t;
  }

  function secTally(id) {
    var t = { yes: 0, no: 0, na: 0, open: 0, total: 0 };
    scored().forEach(function (q) { if (q.sec !== id) return; t.total++; var r = result(q); if (r) t[r]++; else t.open++; });
    return t;
  }

  // Problems that stop the form being submitted.
  function issues() {
    var list = [];
    Q.forEach(function (q) {
      if (q.kind === 'text') return;
      if (q.kind === 'photo') {
        if (photoNeed(q) && !photoOk(q)) list.push({ q: q, type: 'nophoto', text: 'Photo needed' });
        return;
      }
      var r = result(q);
      if (r === null) list.push({ q: q, type: 'missing', text: 'Not answered' });
      else if (r === 'no' && q.kind === 'check' && String((S.ans[q.key] || {}).c || '').trim().length < 3) list.push({ q: q, type: 'nodesc', text: 'Say what\u2019s wrong' });
      else if (r === 'na' && naReason(q).trim().length < 3) list.push({ q: q, type: 'noreason', text: 'Give a reason for N/A' });
      else if (photoNeed(q) && !photoOk(q)) list.push({ q: q, type: 'nophoto', text: 'Photo needed' });
    });
    // Each asset N/A needs one reason - report it once.
    var seen = {};
    return list.filter(function (x) {
      if (x.type !== 'noreason' || !x.q.assetKey || !assetIsNA(x.q)) return true;
      if (seen[x.q.assetKey]) return false;
      seen[x.q.assetKey] = 1; return true;
    });
  }

  /* =========================================================== save */

  var saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      if (!S) return;
      var sv = $('saved');
      var ok = I.local.set(draftKey(S.site), JSON.stringify(Object.assign({}, S, { photos: {} })));
      I.idb.set(photoKey(S.site), { clientId: S.clientId, photos: S.photos }).then(function (r) {
        if (!S) return;
        if (!ok) sv.textContent = 'Could not save on this phone - keep the page open';
        else if (r === null && Object.keys(S.photos).length) sv.textContent = 'Answers saved on this phone (photos are kept until you close the page)';
        else sv.textContent = 'Saved on this phone \u00b7 ' + I.clock(new Date());
      });
    }, 350);
  }

  function touch() {
    var now = Date.now();
    var gap = now - (S.lastAct || now);
    S.active = (S.active || 0) + (gap > 0 && gap < IDLE_GAP ? gap : 0);
    S.lastAct = now;
  }

  function setAns(key, patch) {
    var a = S.ans[key] || {};
    Object.keys(patch).forEach(function (k) { a[k] = patch[k]; });
    a.at = new Date().toISOString();
    delete a.auto;
    S.ans[key] = a;
    touch();
    save();
    updateProgress();
  }

  /* ======================================================= progress */

  var CIRC = 2 * Math.PI * 19;
  function updateProgress() {
    var t = tally();
    var p = t.total ? t.answered / t.total : 0;
    $('ringVal').style.strokeDashoffset = String(CIRC * (1 - p));
    $('ringVal').style.stroke = p >= 1 ? '#2E7D5B' : '';
    $('ringPct').textContent = Math.round(p * 100) + '%';
    $('runSub').textContent = t.answered + ' of ' + t.total + ' answered' + (t.no ? ' \u00b7 ' + t.no + ' defect' + (t.no === 1 ? '' : 's') : '');
    renderChips(true);
  }

  function renderChips(soft) {
    var box = $('chips');
    var steps = cl.sections.map(function (s) { return { id: s.id, label: s.id + ' ' + s.short }; });
    steps.push({ id: 'review', label: 'Review & sign' });
    if (!soft || box.children.length !== steps.length) {
      box.innerHTML = '';
      steps.forEach(function (st, i) {
        box.appendChild(el('button', { type: 'button', class: 'sec-chip', 'data-i': i, onclick: function () { go(i); } }, [el('span', { class: 'lab', text: st.label }), el('span', { class: 'mini' })]));
      });
    }
    Array.prototype.forEach.call(box.children, function (b, i) {
      var st = steps[i];
      b.setAttribute('aria-current', i === S.step ? 'step' : 'false');
      var mini = b.querySelector('.mini');
      b.classList.remove('allok-sec', 'has-no');
      var old = b.querySelector('svg');
      if (st.id === 'review') { mini.textContent = ''; return; }
      var t = secTally(st.id);
      var complete = t.open === 0;
      if (t.no) b.classList.add('has-no');
      else if (complete) b.classList.add('allok-sec');
      mini.textContent = complete ? (t.no ? t.no + ' \u2717' : '') : (t.total - t.open) + '/' + t.total;
      if (complete && !t.no && !old) {
        b.insertBefore(svgTick(), b.firstChild);
      } else if ((!complete || t.no) && old) old.remove();
    });
    var cur = box.children[S.step];
    if (cur && cur.scrollIntoView && !soft) { try { cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: I.reduced ? 'auto' : 'smooth' }); } catch (e) {} }
  }

  function svgTick() {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 14 14'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path'); p.setAttribute('d', 'M2.5 7.5l3 3 6-7'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2.4'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p); return s;
  }

  /* =========================================================== steps */

  function go(i, dir) {
    var n = cl.sections.length;
    i = Math.max(0, Math.min(n, i));
    if (dir === undefined) dir = i >= S.step ? 1 : -1;
    S.step = i;
    save();
    rows = {};
    assetRefresh = {};
    var stage = $('stage');
    stage.innerHTML = '';
    stage.className = dir === 0 ? '' : (dir > 0 ? 'slide-next' : 'slide-prev');
    if (i < n) renderSection(cl.sections[i], stage); else renderReview(stage);
    $('prevBtn').disabled = i === 0;
    $('prevBtn').textContent = 'Back';
    $('nextBtn').textContent = i < n - 1 ? 'Next: ' + cl.sections[i + 1].short : (i === n - 1 ? 'Review & sign' : 'Submit');
    $('nextBtn').hidden = i === n;
    $('stepnav').classList.toggle('flat', i === n);   // don't cover the signature pad on the last step
    $('prevBtn').hidden = false;
    renderChips();
    updateProgress();
    window.scrollTo({ top: 0, behavior: I.reduced ? 'auto' : 'smooth' });
  }

  $('prevBtn').addEventListener('click', function () { go(S.step - 1, -1); });
  $('nextBtn').addEventListener('click', function () {
    var sec = cl.sections[S.step];
    if (sec) {
      var miss = issues().filter(function (x) { return x.q.sec === sec.id; });
      if (miss.length) {
        flag(miss[0].q.key, miss[0].text);
        I.toast(miss.length + ' still to finish in this section. You can come back to it.');
      }
    }
    go(S.step + 1, 1);
  });

  function flag(key) {
    var node = document.querySelector('[data-key="' + cssEsc(key) + '"]');
    if (!node) return;
    node.classList.remove('attn'); void node.offsetWidth; node.classList.add('attn');
    try { node.scrollIntoView({ block: 'center', behavior: I.reduced ? 'auto' : 'smooth' }); } catch (e) {}
    setTimeout(function () { node.classList.remove('attn'); }, 1800);
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  /* ========================================================= section */

  function renderSection(sec, box) {
    var idx = cl.sections.indexOf(sec);
    box.appendChild(el('div', { class: 'sec-head anim-in' }, [
      el('div', { class: 'k', text: 'Section ' + sec.id + ' of ' + cl.sections[cl.sections.length - 1].id }),
      el('h2', { text: sec.title }),
      sec.where ? el('div', { class: 'p', text: sec.where }) : null
    ]));
    var n = 1;
    sec.blocks.forEach(function (b) {
      if (b.title) box.appendChild(el('div', { class: 'block-title anim-in', style: '--i:' + n++, text: b.title }));
      if (b.note) box.appendChild(el('div', { class: 'block-note anim-in', style: '--i:' + n++, text: b.note }));
      if (b.type === 'items') b.items.forEach(function (it) { box.appendChild(withDelay(checkRow(QBY[sec.id + '.' + it.id], true), n++)); });
      if (b.type === 'assets') {
        var bkey = sec.id + '.' + b.id;
        b.assets.concat((S.extra[bkey] || []).map(function (x) { return Object.assign({ added: true }, x); })).forEach(function (a) { box.appendChild(withDelay(assetCard(sec, b, a), n++)); });
        if (b.addable) box.appendChild(withDelay(addAssetBox(sec, b), n++));
      }
      if (b.type === 'service') b.items.forEach(function (it) { box.appendChild(withDelay(serviceRow(QBY[sec.id + '.' + it.id]), n++)); });
    });
    if (idx === cl.sections.length - 1) box.appendChild(el('p', { class: 'muted', style: 'text-align:center;font-size:14px;margin-top:18px', text: 'Last section. Next you review the defects and sign.' }));
  }
  function secShort(id) { var s = cl.sections.find(function (x) { return x.id === id; }); return s ? s.short : ''; }
  function withDelay(node, i) { node.classList.add('anim-in'); node.style.setProperty('--i', Math.min(i, 12)); return node; }

  /* ----- a Yes / No / N/A line */
  function checkRow(q, standalone) {
    var node = el('div', { class: 'q', 'data-key': q.key });
    var btns = {};
    var group = el('div', { class: 'ans' + (naAllowed(q) ? '' : ' two'), role: 'radiogroup', 'aria-label': q.label });
    [['yes', '\u2713', 'Yes'], ['no', '\u2717', 'No'], ['na', '', 'N/A']].forEach(function (o) {
      if (o[0] === 'na' && !naAllowed(q)) return;
      var b = el('button', { type: 'button', class: 'a ' + o[0], role: 'radio', 'aria-checked': 'false', onclick: function (e) { choose(o[0], e); } },
        [o[1] ? el('span', { class: 'ic', 'aria-hidden': 'true', text: o[1] }) : null, o[2]]);
      btns[o[0]] = b; group.appendChild(b);
    });
    node.appendChild(el('div', { class: 'q-row' }, [
      el('div', { class: 'q-text' }, [
        standalone && q.id ? el('span', { class: 'q-id', text: q.id }) : null, q.label,
        q.sub ? el('span', { class: 'q-sub', text: q.sub }) : null,
        q.photo ? el('span', { class: 'q-cam', text: '\ud83d\udcf7 Photo: ' + q.photo }) : null,
        !naAllowed(q) && q.months ? el('span', { class: 'q-due', text: 'Due this month' }) : null
      ]),
      group
    ]));

    var noBox = noPanel(q);
    var phBox = photoPanel(q);
    var naBox = naPanel(q, function (v) { setAns(q.key, { n: v }); });
    node.appendChild(noBox.node);
    node.appendChild(phBox.node);
    node.appendChild(naBox.node);

    function choose(r, e) {
      var cur = (S.ans[q.key] || {}).r;
      if (cur === r) return;
      ripple(e);
      setAns(q.key, { r: r });
      refresh(true);
      if (r === 'no') setTimeout(function () { noBox.focus(); }, 260);
      if (r === 'na' && !naReason(q)) setTimeout(function () { naBox.focus(); }, 260);
      if (q.assetKey) refreshAsset(q.assetKey);
    }
    function refresh(fromClick) {
      var r = result(q);
      Object.keys(btns).forEach(function (k) { btns[k].setAttribute('aria-checked', String(r === k)); });
      node.classList.toggle('is-yes', r === 'yes');
      node.classList.toggle('is-no', r === 'no');
      node.classList.toggle('is-na', r === 'na');
      noBox.open(r === 'no');
      naBox.open(r === 'na');
      phBox.update(r);
      if (!fromClick) naBox.fill(naReason(q));
    }
    rows[q.key] = refresh;
    refresh();
    return node;
  }

  function ripple(e) {
    if (!e || !e.currentTarget || I.reduced) return;
    var b = e.currentTarget;
    var r = el('span', { class: 'rip' });
    b.appendChild(r);
    setTimeout(function () { r.remove(); }, 520);
  }

  /* ----- "what's wrong" panel */
  function noPanel(q) {
    var ta = el('textarea', { rows: '2', placeholder: 'What\u2019s wrong, and where?' });
    ta.value = (S.ans[q.key] || {}).c || '';
    ta.addEventListener('input', function () { setAns(q.key, { c: ta.value }); });
    var wrap = el('div', { class: 'more no-more' }, [el('div', {}, [el('div', { class: 'more-in' }, [el('label', { text: 'Defect: what\u2019s wrong? (required)' }), ta])])]);
    return {
      node: wrap,
      open: function (on) { wrap.classList.toggle('open', !!on); },
      focus: function () { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } }
    };
  }

  /* ----- photos for a line: required for a No (and for a Yes on photo lines), optional otherwise */
  function photoPanel(q) {
    var label = el('div', { class: 'ph-label' });
    var strip = el('div', { class: 'photos' });
    var np = el('input', { type: 'text', placeholder: 'Why no photo?' });
    np.value = (S.ans[q.key] || {}).np || '';
    np.addEventListener('input', function () { setAns(q.key, { np: np.value }); paint(); });
    var npQuick = el('div', { class: 'quick' }, NOPHOTO_QUICK.map(function (t) {
      return el('button', { type: 'button', text: t, onclick: function () { np.value = t; setAns(q.key, { np: t }); paint(); } });
    }));
    var npBox = el('div', { class: 'more np-more' }, [el('div', {}, [el('div', { class: 'more-in' }, [npQuick, np])])]);
    var npLink = el('button', { type: 'button', class: 'link-btn np-link', text: 'Can\u2019t take a photo?' , onclick: function () {
      npBox.classList.toggle('open'); if (npBox.classList.contains('open')) setTimeout(function () { try { np.focus({ preventScroll: true }); } catch (e) {} }, 200);
    } });
    var inner = el('div', { class: 'more-in' }, [label, strip, npLink, npBox]);
    var wrap = el('div', { class: 'more ph-more' }, [el('div', {}, [inner])]);
    var lastR = null;

    function paint() {
      strip.innerHTML = '';
      var need = photoNeed(q);
      var list = S.photos[q.key] || [];
      list.forEach(function (src, i) {
        strip.appendChild(el('div', { class: 'ph' }, [el('img', { src: src, alt: 'Photo ' + (i + 1) }),
          el('button', { type: 'button', 'aria-label': 'Remove photo', text: '\u00d7', onclick: function () { S.photos[q.key].splice(i, 1); touch(); save(); paint(); updateProgress(); } })]));
      });
      if (list.length < 3) {
        strip.appendChild(el('button', { type: 'button', class: 'ph-add' + (need && !list.length ? ' need' : ''), text: '\ud83d\udcf7 ' + (list.length ? 'Another photo' : need ? 'Take photo' : 'Add a photo (optional)'),
          onclick: function () { photoTarget = { key: q.key, redraw: function () { paint(); updateProgress(); } }; $('photoIn').value = ''; $('photoIn').click(); } }));
      }
      label.textContent = need === 'defect' ? 'Photo of the problem (required)' : need === 'evidence' ? 'Photo: ' + q.photo + ' (required)' : '';
      label.hidden = !need;
      npLink.hidden = !need || list.length > 0;
      if (!need || list.length) npBox.classList.remove('open');
      else if (String(np.value).trim()) npBox.classList.add('open');
      wrap.classList.toggle('done', !need || photoOk(q));
    }
    return {
      node: wrap,
      update: function (r) {
        lastR = r;
        // Optional photos only show once a line is answered Yes (keeps the list tidy).
        wrap.classList.toggle('open', r === 'no' || r === 'yes');
        wrap.classList.toggle('optional', r === 'yes' && !q.photo);
        paint();
      }
    };
  }

  /* ----- N/A reason panel */
  function naPanel(q, onSet) {
    var inp = el('input', { type: 'text', placeholder: 'Why doesn\u2019t this apply?' });
    inp.addEventListener('input', function () { onSet(inp.value); });
    var quick = el('div', { class: 'quick' }, NA_QUICK.map(function (t) {
      return el('button', { type: 'button', text: t, onclick: function () { inp.value = t; onSet(t); } });
    }));
    var wrap = el('div', { class: 'more na-more' }, [el('div', {}, [el('div', { class: 'more-in' }, [el('label', { text: 'Reason for N/A (required)' }), quick, inp])])]);
    return {
      node: wrap,
      open: function (on) { wrap.classList.toggle('open', !!on); },
      fill: function (v) { if (document.activeElement !== inp) inp.value = v || ''; },
      focus: function () { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }
    };
  }

  $('photoIn').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f || !photoTarget) return;
    var t = photoTarget;
    I.shrinkPhoto(f, 1200, 0.7).then(function (src) {
      (S.photos[t.key] = S.photos[t.key] || []).push(src);
      touch(); save(); t.redraw();
    }).catch(function (x) { I.toast(x.message); });
  });

  /* ----- equipment card */
  var assetRefresh = {};
  function assetCard(sec, b, a) {
    var akey = sec.id + '.' + b.id + '.' + a.id;
    var qs = Q.filter(function (q) { return q.assetKey === akey; });
    var card = el('div', { class: 'asset' + (a.added ? ' added' : ''), 'data-key': akey });
    var state = el('span', { class: 'state todo' });
    var naBtn = el('button', { type: 'button', class: 'mini-btn na-all', 'aria-pressed': 'false', text: 'N/A', title: 'This one isn\u2019t here / not in use' });
    var okBtn = el('button', { type: 'button', class: 'mini-btn allok', text: '\u2713 All OK', title: 'Mark every check on this one Yes' });
    var rmBtn = a.added ? el('button', { type: 'button', class: 'mini-btn rm', text: 'Remove', onclick: function () {
      if (!confirmBox('Remove ' + a.name + ' from this inspection?')) return;
      var bkey = sec.id + '.' + b.id;
      S.extra[bkey] = (S.extra[bkey] || []).filter(function (x) { return x.id !== a.id; });
      qs.forEach(function (q) { delete S.ans[q.key]; delete S.photos[q.key]; });
      delete S.assetNA[akey];
      rebuildQ(); save(); go(S.step, 0);
    } }) : null;
    card.appendChild(el('div', { class: 'asset-head' }, [
      el('div', { class: 'nm' }, [el('b', { text: a.name }), a.where ? el('span', { text: a.where }) : null, a.added ? el('span', { class: 'added-tag', text: 'Added today' }) : null]),
      state, okBtn, a.added ? rmBtn : naBtn
    ]));

    var naBox = naPanel({ key: akey }, function (v) { S.assetNA[akey] = v; save(); });
    var naWrap = el('div', { class: 'asset-na' }, [naBox.node]);
    card.appendChild(naWrap);

    var body = el('div', { class: 'asset-body' });
    qs.forEach(function (q) {
      if (q.kind === 'text') {
        var inp = el('input', { type: 'text', value: (S.ans[q.key] || {}).v || q.def || '', 'aria-label': q.label + ' - ' + a.name });
        inp.addEventListener('input', function () { S.ans[q.key] = { v: inp.value, at: new Date().toISOString() }; touch(); save(); });
        body.appendChild(el('div', { class: 'type-row' }, [el('label', { text: q.label }), inp]));
      }
    });
    qs.filter(function (q) { return q.kind === 'check'; }).forEach(function (q) { body.appendChild(checkRow(q, false)); });
    var dq = qs.filter(function (q) { return q.kind === 'date'; });
    if (dq.length) body.appendChild(el('div', { class: 'dates' }, dq.map(function (q) { return dateBox(q, false); })));
    var pq = qs.filter(function (q) { return q.kind === 'photo'; })[0];
    var cardPhoto = pq ? cardPhotoBox(pq) : null;
    if (cardPhoto) body.appendChild(cardPhoto.node);
    card.appendChild(body);

    okBtn.addEventListener('click', function () {
      if (assetIsNA({ assetKey: akey })) return;
      qs.forEach(function (q) { if (q.kind === 'check' && !(S.ans[q.key] || {}).r) { setAns(q.key, { r: 'yes' }); if (rows[q.key]) rows[q.key](); } });
      refreshAsset(akey);
      var firstDate = card.querySelector('.date input');
      var dateMissing = dq.some(function (q) { return result(q) === null; });
      if (firstDate && dateMissing) setTimeout(function () { try { firstDate.focus(); } catch (e) {} }, 200);
    });
    naBtn.addEventListener('click', function () {
      if (S.assetNA[akey] !== undefined) delete S.assetNA[akey];
      else { S.assetNA[akey] = ''; setTimeout(function () { naBox.focus(); }, 260); }
      touch(); save(); updateProgress();
      qs.forEach(function (q) { if (rows[q.key]) rows[q.key](); });
      refreshAsset(akey);
    });

    function refresh() {
      var isNA = S.assetNA[akey] !== undefined;
      naBtn.setAttribute('aria-pressed', String(isNA));
      naBox.open(isNA);
      naBox.fill(S.assetNA[akey] || '');
      body.classList.toggle('dim', isNA);
      okBtn.hidden = isNA;
      var t = { yes: 0, no: 0, na: 0, open: 0 };
      qs.forEach(function (q) { if (q.unscored) return; var r = result(q); if (r) t[r]++; else t.open++; });
      var needPh = pq && !isNA && !photoOk(pq);
      card.classList.toggle('is-na', isNA);
      card.classList.toggle('has-no', !isNA && t.no > 0);
      card.classList.toggle('complete', !isNA && !t.no && !t.open && !needPh);
      state.className = 'state ' + (isNA ? 'na' : t.no ? 'bad' : (t.open || needPh) ? 'todo' : 'ok');
      state.textContent = isNA ? 'N/A' : t.no ? t.no + ' defect' + (t.no > 1 ? 's' : '') : t.open ? t.open + ' to go' : needPh ? 'Photo to go' : 'All good';
      if (cardPhoto) cardPhoto.paint();
    }
    assetRefresh[akey] = refresh;
    refresh();
    return card;
  }
  function refreshAsset(akey) { if (assetRefresh[akey]) assetRefresh[akey](); }

  // One photo for the whole card (e.g. the AED front with the ready light and the pad packet date).
  function cardPhotoBox(q) {
    var strip = el('div', { class: 'photos' });
    var np = el('input', { type: 'text', placeholder: 'Why no photo?' });
    np.value = (S.ans[q.key] || {}).np || '';
    np.addEventListener('input', function () { S.ans[q.key] = Object.assign(S.ans[q.key] || {}, { np: np.value }); touch(); save(); refreshAsset(q.assetKey); });
    var npBox = el('div', { class: 'more np-more' }, [el('div', {}, [el('div', { class: 'more-in' }, [np])])]);
    var npLink = el('button', { type: 'button', class: 'link-btn np-link', text: 'Can\u2019t take a photo?', onclick: function () { npBox.classList.toggle('open'); } });
    var node = el('div', { class: 'card-photo', 'data-key': q.key }, [el('div', { class: 'ph-label', text: '\ud83d\udcf7 ' + q.label + ' (required)' }), strip, npLink, npBox]);
    function paint() {
      strip.innerHTML = '';
      var list = S.photos[q.key] || [];
      list.forEach(function (src, i) {
        strip.appendChild(el('div', { class: 'ph' }, [el('img', { src: src, alt: 'Photo ' + (i + 1) }),
          el('button', { type: 'button', 'aria-label': 'Remove photo', text: '\u00d7', onclick: function () { S.photos[q.key].splice(i, 1); touch(); save(); refreshAsset(q.assetKey); } })]));
      });
      if (list.length < 3) strip.appendChild(el('button', { type: 'button', class: 'ph-add' + (list.length ? '' : ' need'), text: '\ud83d\udcf7 ' + (list.length ? 'Another photo' : 'Take photo'),
        onclick: function () { photoTarget = { key: q.key, redraw: function () { refreshAsset(q.assetKey); updateProgress(); } }; $('photoIn').value = ''; $('photoIn').click(); } }));
      npLink.hidden = list.length > 0;
      if (list.length) npBox.classList.remove('open');
      else if (String(np.value).trim()) npBox.classList.add('open');
      node.classList.toggle('done', photoOk(q));
    }
    return { node: node, paint: paint };
  }

  /* ----- add a piece of equipment that isn't on the list */
  function addAssetBox(sec, b) {
    var bkey = sec.id + '.' + b.id;
    var nm = el('input', { type: 'text', placeholder: b.addName || 'What is it? e.g. Extinguisher' });
    var wh = el('input', { type: 'text', placeholder: 'Where exactly?' });
    var err = el('p', { class: 'err' });
    var form = el('div', { class: 'more' }, [el('div', {}, [el('div', { class: 'more-in add-form' }, [
      el('label', { text: 'Name / description' }), nm, el('label', { text: 'Location' }), wh, err,
      el('button', { type: 'button', class: 'btn primary', text: 'Add to this inspection', onclick: function () {
        if (nm.value.trim().length < 2 || wh.value.trim().length < 2) { err.textContent = 'Give it a name and say where it is.'; return; }
        var list = S.extra[bkey] = S.extra[bkey] || [];
        list.push({ id: 'x' + Date.now().toString(36), name: nm.value.trim().slice(0, 60), where: wh.value.trim().slice(0, 80) });
        touch(); rebuildQ(); save(); go(S.step, 0);
      } })
    ])])]);
    return el('div', { class: 'add-asset' }, [
      el('button', { type: 'button', class: 'ph-add', text: '+ ' + (b.addLabel || 'Add one that\u2019s not on the list'), onclick: function () { form.classList.toggle('open'); if (form.classList.contains('open')) setTimeout(function () { nm.focus(); }, 200); } }),
      form
    ]);
  }

  /* ----- an expiry date */
  function dateBox(q, inService) {
    var a = S.ans[q.key] || {};
    var box = el('div', { class: 'date', 'data-key': q.key });
    var inp = el('input', { type: 'date', value: a.r === 'na' || a.r === 'missing' ? '' : (a.v || ''), 'aria-label': q.label + (q.asset ? ' - ' + q.asset : '') });
    var st = el('div', { class: 'dstate' });
    var warn = el('div', { class: 'dwarn', text: 'That\u2019s today\u2019s date. Read the date off the tag, label or record.' });
    var links = el('div', { class: 'dlinks' });
    var missLink = el('button', { type: 'button', class: 'link-btn miss-link' });
    var naLink = el('button', { type: 'button', class: 'link-btn na-link' });
    links.appendChild(missLink); links.appendChild(naLink);
    var naBox = naPanel(q, function (v) { setAns(q.key, { n: v }); });
    inp.addEventListener('change', function () { setAns(q.key, { v: inp.value, r: inp.value ? 'set' : '' }); refresh(); if (q.assetKey) refreshAsset(q.assetKey); });
    missLink.addEventListener('click', function () {
      var cur = S.ans[q.key] || {};
      setAns(q.key, { r: cur.r === 'missing' ? (cur.v ? 'set' : '') : 'missing' });
      refresh(); if (q.assetKey) refreshAsset(q.assetKey);
    });
    naLink.addEventListener('click', function () {
      var cur = S.ans[q.key] || {};
      if (cur.r === 'na') setAns(q.key, { r: cur.v ? 'set' : '' }); else setAns(q.key, { r: 'na' });
      refresh(); if (q.assetKey) refreshAsset(q.assetKey);
      if ((S.ans[q.key] || {}).r === 'na') setTimeout(function () { naBox.focus(); }, 260);
    });
    box.appendChild(el('label', { text: q.label }));
    var hint = q.hint || (QBY[q.key] && QBY[q.key].hint);
    if (hint) box.appendChild(el('div', { class: 'dhint', text: hint }));
    box.appendChild(inp);
    box.appendChild(st);
    box.appendChild(warn);
    box.appendChild(links);
    box.appendChild(naBox.node);
    function refresh() {
      var cur = S.ans[q.key] || {};
      var isNA = cur.r === 'na', miss = cur.r === 'missing';
      inp.disabled = isNA || miss;
      if (isNA || miss) inp.value = '';
      var r = result(QBY[q.key] || q);
      var ds = cur.v && !isNA && !miss ? I.dueState(cur.v) : { cls: '', text: '' };
      box.className = 'date ' + (isNA ? 'is-na' : miss ? 'bad' : ds.cls);
      st.textContent = isNA ? 'N/A' : miss ? 'Couldn\u2019t find it (logged as a defect)' : (cur.v ? ds.text : 'Enter the date');
      warn.hidden = !(cur.v && !isNA && !miss && cur.v === I.todayKey());
      missLink.textContent = miss ? 'Enter a date instead' : 'Can\u2019t find the date';
      missLink.hidden = isNA;
      naLink.textContent = isNA ? 'Enter a date instead' : 'N/A';
      naLink.hidden = miss;
      naBox.open(isNA);
      naBox.fill(cur.n || '');
      var owner = box.closest('.svc');
      if (owner) owner.className = 'svc ' + (isNA ? 'is-na' : r === 'no' ? 'bad' : ds.cls === 'soon' ? 'soon' : r === 'yes' ? 'ok' : '');
    }
    rows[q.key] = refresh;
    setTimeout(refresh, 0);
    return box;
  }

  /* ----- service & test dates */
  function serviceRow(q) {
    var a = S.ans[q.key] || {};
    var last = el('input', { type: 'date', value: a.last || '', 'aria-label': q.label + ' last done' });
    var lwarn = el('div', { class: 'dwarn', text: 'That\u2019s today\u2019s date. Use the date on the tag or service record.' });
    lwarn.hidden = a.last !== I.todayKey();
    last.addEventListener('change', function () { setAns(q.key, { last: last.value }); lwarn.hidden = last.value !== I.todayKey(); });
    var note = el('input', { type: 'text', placeholder: 'Note (optional), e.g. booked in for 28 Oct', value: a.note || '' });
    note.addEventListener('input', function () { setAns(q.key, { note: note.value }); });
    var node = el('div', { class: 'svc', 'data-key': q.key }, [
      el('div', { class: 'svc-top' }, [el('div', { class: 'nm' }, [el('span', { class: 'q-id', text: q.id }), el('b', { text: q.label }), el('span', { text: q.sub })])]),
      el('div', { class: 'dates' }, [
        el('div', { class: 'date' }, [el('label', { text: 'Last done (from the tag/record)' }), last, lwarn]),
        dateBox({ key: q.key, kind: 'service', label: 'Next due', sec: q.sec, hint: '' }, true)
      ]),
      el('div', { class: 'svc-note' }, [note])
    ]);
    return node;
  }

  /* ========================================================== review */

  function renderReview(box) {
    var t = tally();
    var iss = issues();
    box.appendChild(el('div', { class: 'sec-head anim-in' }, [el('div', { class: 'k', text: 'Last step' }), el('h2', { text: 'Review & sign' })]));

    var tiles = el('div', { class: 'tiles' });
    [['yes', 'Yes', t.yes], ['no', 'Defects', t.no], ['na', 'N/A', t.na], ['', 'Score', t.score]].forEach(function (x, i) {
      var n = el('div', { class: 'n', text: '0' });
      tiles.appendChild(el('div', { class: 'tile anim-in ' + x[0], style: '--i:' + i }, [n, el('div', { class: 'l', text: x[1] })]));
      if (x[1] === 'Score') { if (t.score === null) n.textContent = '\u2014'; else I.countUp(n, t.score, { suffix: '%', dp: t.score % 1 ? 1 : 0 }); }
      else I.countUp(n, x[2], { dur: 700 });
    });
    box.appendChild(tiles);

    if (iss.length) {
      var ul = el('ul', { class: 'todo-list' });
      iss.slice(0, 80).forEach(function (x) {
        var label = (x.q.asset ? x.q.asset + ': ' : '') + x.q.label;
        ul.appendChild(el('li', {}, [
          el('span', { class: 'tag ' + x.type, text: x.text }),
          el('span', { text: x.q.sec + ' \u00b7 ' + label }),
          el('button', { type: 'button', class: 'link-btn go', text: 'Fix', onclick: function () {
            var i = cl.sections.findIndex(function (s) { return s.id === x.q.sec; });
            go(i, -1);
            setTimeout(function () { flag(x.q.assetKey && x.type === 'noreason' && assetIsNA(x.q) ? x.q.assetKey : x.q.key); }, 380);
          } })
        ]));
      });
      box.appendChild(el('div', { class: 'card anim-in', style: '--i:2' }, [
        el('h3', { text: iss.length + ' thing' + (iss.length === 1 ? '' : 's') + ' to finish' }),
        el('p', { class: 'muted', style: 'margin:0', text: 'Every line needs an answer. Every No needs a description and a photo, every N/A needs a reason, and lines marked with a camera need a photo.' }),
        ul
      ]));
    }

    // Defects
    var defs = scored().filter(function (q) { return result(q) === 'no'; });
    var dcard = el('div', { class: 'card anim-in', style: '--i:3' }, [
      el('h3', { text: defs.length ? defs.length + ' defect' + (defs.length === 1 ? '' : 's') + ' to log' : 'No defects' }),
      el('p', { class: 'muted', style: 'margin:0', text: defs.length ? 'Set a priority for each. If you fixed it on the spot, tick it and say what you did.' : 'Nice work. Nothing to log.' })
    ]);
    defs.forEach(function (q, i) {
      if (!S.pri[q.key]) S.pri[q.key] = HIGH_SECTIONS[q.sec] ? 'High' : 'Medium';
      var fx = S.fixed[q.key] || { on: false, note: '' };
      var prio = el('div', { class: 'prio', role: 'group', 'aria-label': 'Priority' });
      ['High', 'Medium', 'Low'].forEach(function (p) {
        prio.appendChild(el('button', { type: 'button', class: p, 'aria-pressed': String(S.pri[q.key] === p), text: p, onclick: function () {
          S.pri[q.key] = p; save();
          Array.prototype.forEach.call(prio.children, function (b) { b.setAttribute('aria-pressed', String(b.textContent === p)); });
        } }));
      });
      var cb = el('input', { type: 'checkbox' }); cb.checked = !!fx.on;
      var note = el('input', { type: 'text', placeholder: 'What did you do?', value: fx.note || '' });
      var noteWrap = el('div', { class: 'more' + (fx.on ? ' open' : '') }, [el('div', {}, [el('div', { class: 'fixnote' }, [note])])]);
      cb.addEventListener('change', function () { S.fixed[q.key] = { on: cb.checked, note: note.value }; noteWrap.classList.toggle('open', cb.checked); save(); });
      note.addEventListener('input', function () { S.fixed[q.key] = { on: cb.checked, note: note.value }; save(); });
      var ph = S.photos[q.key] || [];
      dcard.appendChild(el('div', { class: 'defect', style: '--i:' + i }, [
        el('div', { class: 'dh', text: q.sec + ' \u00b7 ' + secShort(q.sec) + (q.id ? ' \u00b7 ' + q.id : '') }),
        el('div', { class: 'dt', text: (q.asset && q.id === undefined ? q.asset + ': ' : '') + q.label }),
        el('div', { class: 'dd', text: defectText(q) || 'No description yet' }),
        ph.length ? el('div', { class: 'photos' }, ph.map(function (src) { return el('div', { class: 'ph' }, [el('img', { src: src, alt: '' })]); })) : null,
        el('div', { class: 'drow' }, [prio, el('label', { class: 'toggle' }, [cb, 'Fixed on the spot'])]),
        noteWrap
      ]));
    });
    box.appendChild(dcard);

    // Anything else (with photos)
    var other = el('textarea', { rows: '3', placeholder: 'Any other hazard, near miss or comment from the walk-around' });
    other.value = S.other || '';
    other.addEventListener('input', function () { S.other = other.value; touch(); save(); });
    var oStrip = el('div', { class: 'photos' });
    (function paintOther() {
      oStrip.innerHTML = '';
      var list = S.photos.other || [];
      list.forEach(function (src, i) {
        oStrip.appendChild(el('div', { class: 'ph' }, [el('img', { src: src, alt: '' }), el('button', { type: 'button', 'aria-label': 'Remove photo', text: '\u00d7', onclick: function () { list.splice(i, 1); save(); paintOther(); } })]));
      });
      if (list.length < 3) oStrip.appendChild(el('button', { type: 'button', class: 'ph-add', text: '\ud83d\udcf7 Add a photo', onclick: function () { photoTarget = { key: 'other', redraw: paintOther }; $('photoIn').value = ''; $('photoIn').click(); } }));
    })();
    box.appendChild(el('div', { class: 'card anim-in', style: '--i:4' }, [el('h3', { text: 'Anything else?' }), el('div', { class: 'field' }, [other]), oStrip]));

    // Sign
    var decl = el('input', { type: 'checkbox', id: 'decl' });
    var canvas = el('canvas', { id: 'sig', 'aria-label': 'Signature pad' });
    var hint = el('span', { class: 'sig-hint', text: 'Sign here with your finger' });
    var err = el('p', { class: 'err', role: 'alert' });
    var submit = el('button', { type: 'button', class: 'btn primary wide', text: 'Submit inspection', disabled: true });
    var mins = Math.max(1, Math.round((S.active || 0) / 60000));
    box.appendChild(el('div', { class: 'card anim-in', style: '--i:5' }, [
      el('h3', { text: 'Sign off' }),
      el('div', { class: 'stamp' }, [
        el('span', {}, ['Inspector ', el('b', { text: S.inspector })]),
        el('span', {}, ['Started ', el('b', { text: I.when(S.startedAt) })]),
        el('span', {}, ['Time on the walk-around ', el('b', { text: mins + ' min' })])
      ]),
      el('label', { class: 'check' }, [decl, el('span', { text: DECLARATION })]),
      el('div', { class: 'sig-wrap' }, [canvas, hint, el('button', { type: 'button', class: 'link-btn sig-clear', text: 'Clear', onclick: function () { pad.clear(); } })]),
      err,
      submit,
      el('p', { class: 'muted', style: 'font-size:13px;text-align:center;margin:8px 0 0', text: 'The time is recorded when you submit. Photos upload with it, so give it a moment on slow signal.' })
    ]));

    function ready() { submit.disabled = !(decl.checked && pad && pad.has() && !issues().length); }
    pad = I.SigPad(canvas, hint, ready);
    decl.addEventListener('change', ready);
    requestAnimationFrame(function () { pad.size(); ready(); });
    submit.addEventListener('click', function () { doSubmit(submit, err); });
  }

  /* ========================================================== submit */

  function payload() {
    var t = tally();
    var answers = Q.map(function (q) {
      var a = S.ans[q.key] || {};
      var r = q.unscored ? 'text' : result(q);
      // Photos of a defect travel with the defect; evidence photos travel with the answer.
      var ph = r === 'no' ? [] : (S.photos[q.key] || []);
      return {
        key: q.key, sec: q.sec, kind: q.kind, label: q.label, asset: q.asset || '',
        result: r, value: q.kind === 'text' ? (a.v || '') : (q.kind === 'date' || q.kind === 'service') && a.r !== 'na' && a.r !== 'missing' ? (a.v || '') : '',
        last: q.kind === 'service' ? (a.last || '') : '',
        comment: r === 'no' ? defectText(q) : (q.kind === 'service' ? String(a.note || '') : ''),
        naReason: r === 'na' ? naReason(q) : '', noPhoto: photoNeed(q) && !photoCount(q.key) ? String(a.np || '') : '',
        photos: ph, at: a.at || ''
      };
    });
    if ((S.photos.other || []).length) answers.push({ key: 'other', sec: '', kind: 'photo', label: 'Other hazards / comments', asset: '', result: 'text', value: '', last: '', comment: '', naReason: '', noPhoto: '', photos: S.photos.other, at: '' });
    var defects = scored().filter(function (q) { return result(q) === 'no'; }).map(function (q) {
      var fx = S.fixed[q.key] || {};
      var a = S.ans[q.key] || {};
      return { key: q.key, sec: q.sec, label: q.label, asset: q.asset || '', ref: q.id || '', description: defectText(q) + (!photoCount(q.key) && a.np ? ' (no photo: ' + a.np + ')' : ''),
        priority: S.pri[q.key] || 'Medium', fixed: !!fx.on, fixNote: fx.on ? String(fx.note || '') : '', photos: S.photos[q.key] || [] };
    });
    var added = [];
    Object.keys(S.extra || {}).forEach(function (k) { (S.extra[k] || []).forEach(function (x) { added.push(k + ': ' + x.name + ' (' + x.where + ')'); }); });
    return {
      action: 'inspSubmit', clientId: S.clientId, site: S.site, siteName: cl.name, version: cl.version,
      name: S.inspector, startedAt: S.startedAt, finishedAt: new Date().toISOString(), activeMinutes: Math.max(1, Math.round((S.active || 0) / 60000)),
      counts: { yes: t.yes, no: t.no, na: t.na, total: t.total, score: t.score },
      answers: answers, defects: defects, added: added, other: S.other || '', declare: true, declaration: DECLARATION,
      signature: pad.png(), ua: navigator.userAgent
    };
  }

  function doSubmit(btn, err) {
    if (issues().length) { err.textContent = 'Finish the items listed above first.'; return; }
    touch();
    var body = payload();
    btn.disabled = true; btn.textContent = 'Submitting…'; err.textContent = '';
    I.post(body).then(function (r) {
      dropDraft(S.site);
      finished(r, body);
    }).catch(function (x) {
      if (x instanceof TypeError || /fetch|network|load failed/i.test(x.message)) {
        // No signal: keep it on the phone (photos and all) and send it later.
        I.idb.set('insp_pending', body).then(function (ok) {
          if (!ok) I.local.set('insp_pending', JSON.stringify(body)) || I.local.set('insp_pending', JSON.stringify(stripPhotos(body)));
          dropDraft(S.site);
          finished(null, body);
        });
      } else {
        err.textContent = x.message;
        btn.disabled = false; btn.textContent = 'Submit inspection';
      }
    });
  }
  function stripPhotos(b) {
    return Object.assign({}, b, { defects: b.defects.map(function (d) { return Object.assign({}, d, { photos: [] }); }),
      answers: b.answers.map(function (a) { return Object.assign({}, a, { photos: [] }); }) });
  }

  function sendPending() {
    I.idb.get('insp_pending').then(function (fromDb) {
      var body = fromDb, raw = null;
      if (!body) { raw = I.local.get('insp_pending'); if (!raw) return; try { body = JSON.parse(raw); } catch (e) { I.local.del('insp_pending'); return; } }
      I.post(body).then(function (r) {
        I.idb.del('insp_pending'); I.local.del('insp_pending');
        I.toast('Your saved inspection was sent \u00b7 receipt ' + r.receipt, 4500);
      }).catch(function () {});
    });
  }

  function finished(r, body) {
    var box = $('finish');
    box.innerHTML = '';
    var sent = !!r;
    var mins = body.activeMinutes;
    var score = el('div', { class: 'score', text: '0%' });
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('class', 'big-tick'); svg.setAttribute('viewBox', '0 0 96 96');
    svg.innerHTML = '<circle cx="48" cy="48" r="44" fill="none" stroke="' + (sent ? '#2E7D5B' : '#A86A0C') + '" stroke-width="6"/><path d="M30 50l12 12 25-27" fill="none" stroke="' + (sent ? '#2E7D5B' : '#A86A0C') + '" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>';
    box.appendChild(el('div', { class: 'card finish' }, [
      svg,
      el('h2', { text: sent ? 'Inspection submitted' : 'Saved on this phone' }),
      el('p', { class: 'muted', style: 'margin:4px 0 0' }, sent
        ? [r.submittedAt + ' \u00b7 receipt ', el('span', { class: 'rc', text: r.receipt })]
        : ['No signal right now. It sends automatically next time this page is opened with signal.']),
      score,
      el('p', { class: 'muted', style: 'margin:0', text: body.counts.yes + ' yes \u00b7 ' + body.counts.no + ' defect' + (body.counts.no === 1 ? '' : 's') + ' \u00b7 ' + body.counts.na + ' N/A \u00b7 ' + mins + ' min' }),
      sent && r.photoError ? el('p', { class: 'err', text: 'Some photos didn\u2019t save. Let your supervisor know.' }) : null,
      body.defects.length && sent ? el('p', { style: 'margin:12px 0 0;font-size:15px', text: 'Defects are in the register. Tell your supervisor about anything High today.' }) : null,
      el('div', { class: 'btns' }, [
        el('a', { class: 'btn ghost', href: 'inspection-dashboard.html?site=' + encodeURIComponent(body.site), text: 'View dashboard', style: 'text-decoration:none' }),
        el('button', { type: 'button', class: 'btn primary', text: 'Done', onclick: function () { S = null; $('who').hidden = true; document.body.classList.remove('running'); show('start'); renderSites(); } })
      ])
    ]));
    show('finish');
    if (body.counts.score !== null) I.countUp(score, body.counts.score, { suffix: '%', dp: body.counts.score % 1 ? 1 : 0, dur: 1200 }); else score.textContent = '';
    if (sent && !body.counts.no) setTimeout(I.confetti, 500);
    I.get({ action: 'inspStatus' }).then(function (res) { status = res.sites || {}; }).catch(function () {});
  }

  init();
})();
