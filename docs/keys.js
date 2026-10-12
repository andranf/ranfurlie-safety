(function () {
  'use strict';

  var CFG = window.SAFETY_CONFIG || {};
  var API = String(CFG.API_URL || '').trim();
  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  var data = null;     // response from action 'keys'
  var me = '';         // signed-in name
  var mode = /[?&](in|back|return)(?=[&=]|$)/i.test(location.search) ? 'in' : (/[?&]lost(?=[&=]|$)/i.test(location.search) ? 'lost' : 'out');
  var selOut = '';     // key picked to take
  var selIn = '';      // key picked to return
  var busy = false;

  function post(body) {
    return fetch(API, { method: 'POST', redirect: 'follow', body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || res.ok !== true) throw new Error((res && res.error) || 'Something went wrong. Try again.');
        return res;
      });
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function show(id, on) { $(id).hidden = !on; }

  /* ---------------------------------------------------------- load */

  function load(body) {
    return post(Object.assign({ action: 'keys' }, body || {})).then(function (r) {
      data = r;
      if (r.me) { me = r.me; store.set('rs_name', r.me); }
      return r;
    });
  }

  function init() {
    if (!API) { notice('This page is being set up. Check back soon.'); show('loading', false); return; }
    var m = /[?&]u=([0-9a-f]{6,20})/i.exec(location.search);
    var last = store.get('rs_name');
    load(m ? { u: m[1].toLowerCase() } : (last ? { name: last } : {})).then(function (r) {
      if (m) setUrl();
      if (!r.me && r.whoError) { store.del('rs_name'); $('nameErr').textContent = m ? r.whoError : ''; }
      fillNames();
      show('loading', false);
      render();
    }).catch(function (e) {
      show('loading', false);
      notice('Could not load the key register (' + e.message + '). Check your signal and refresh.');
    });
  }

  function refresh() {
    if (!data || busy) return;
    load(me ? { name: me } : {}).then(render).catch(function () {});
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) refresh(); });

  function notice(t) { var n = $('notice'); n.textContent = t; n.hidden = !t; }

  function setUrl() {
    try { history.replaceState({}, '', location.pathname + '?' + (mode === 'in' ? 'in' : mode === 'lost' ? 'lost' : 'out')); } catch (e) {}
  }

  /* ------------------------------------------------------- name */

  function fillNames() {
    var sel = $('nameSel');
    while (sel.options.length > 1) sel.remove(1);
    data.staff.forEach(function (n) { var o = el('option', '', n); o.value = n; sel.appendChild(o); });
  }

  $('nameForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('nameSel').value;
    $('nameErr').textContent = '';
    if (!name) { $('nameErr').textContent = 'Choose your name.'; return; }
    busy = true;
    load({ name: name }).then(function (r) {
      if (!r.me) throw new Error(r.whoError || 'Name not found - see your supervisor.');
      render();
    }).catch(function (x) { $('nameErr').textContent = x.message; }).then(function () { busy = false; });
  });

  $('notMe').addEventListener('click', function () {
    store.del('rs_name');
    me = ''; selOut = ''; selIn = '';
    $('nameSel').value = '';
    render();
  });

  /* ------------------------------------------------------- render */

  $('modeOut').addEventListener('click', function () { setMode('out'); });
  $('modeIn').addEventListener('click', function () { setMode('in'); });
  $('lostOpen').addEventListener('click', function () { setMode('lost'); });
  $('lostCancel').addEventListener('click', function () { setMode('in'); });
  $('doneBack').addEventListener('click', function () { show('doneView', false); render(); });

  function setMode(m) {
    mode = m;
    setUrl();
    show('doneView', false);
    notice('');
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    if (!data) return;
    $('modeOut').setAttribute('aria-selected', String(mode === 'out'));
    $('modeIn').setAttribute('aria-selected', String(mode !== 'out'));
    show('who', !!me);
    $('whoName').textContent = me;
    var done = !$('doneView').hidden;
    show('pickName', !me && !done);
    show('outView', !!me && mode === 'out' && !done);
    show('inView', !!me && mode === 'in' && !done);
    show('lostView', !!me && mode === 'lost' && !done);
    renderBoard();
    if (!me || done) return;
    if (mode === 'out') renderOut();
    else if (mode === 'in') renderIn();
    else renderLost();
  }

  function mine(k) { return k.with && me && k.with.toLowerCase() === me.toLowerCase(); }

  function renderBoard() {
    var list = $('boardList');
    list.innerHTML = '';
    show('board', !!(data && data.keys.length));
    data.keys.forEach(function (k) {
      var r = el('div', 'brow');
      r.appendChild(el('span', 'k', k.key));
      var w;
      if (k.status === 'In') w = el('span', 'w in', 'In');
      else if (k.status === 'Lost') w = el('span', 'w over', 'MISSING' + (k.with && k.with.charAt(0) !== '(' ? ' · ' + k.with : ''));
      else w = el('span', 'w' + (k.overdue ? ' over' : ''), (mine(k) ? 'You' : k.with) + ' · ' + (k.overdue ? 'OVERDUE, was due ' + k.due : 'due ' + k.due));
      r.appendChild(w);
      list.appendChild(r);
    });
  }

  /* ----------------------------------------------------- take a key */

  function sopBlocks() { var s = data.sop; return !!(s && s.required && !s.ok); }

  function renderOut() {
    var s = data.sop;
    var card = $('sopCard');
    card.innerHTML = '';
    card.className = 'sop';
    if (s) {
      var ic = el('span', 'ic'), body = el('div');
      if (s.ok) {
        card.classList.add('ok');
        ic.textContent = '✓';
        body.appendChild(el('strong', '', s.code + ' ' + s.title + ' - signed'));
        body.appendChild(document.createTextNode('Current until ' + nice(s.validUntil) + '.'));
      } else {
        card.classList.add('need');
        ic.textContent = '!';
        body.appendChild(el('strong', '', (s.outdated ? 'The key SOP has been updated - sign it again.' : 'Read and sign the key SOP first.')));
        body.appendChild(document.createTextNode(s.code + ' ' + s.title + ' takes about 2 minutes. ' + (s.required ? 'You can take a key once it is signed.' : '')));
        var a = el('a', 'btn primary', 'Read & sign ' + s.code);
        a.href = (data.siteUrl || './') + '?doc=' + encodeURIComponent(s.code) + '&then=keys';
        a.style.display = 'inline-block';
        a.style.textDecoration = 'none';
        body.appendChild(el('br'));
        body.appendChild(a);
      }
      card.appendChild(ic); card.appendChild(body);
      card.hidden = false;
    } else {
      card.hidden = true;
    }

    var block = sopBlocks();
    ['keyStep', 'termsStep', 'signStep'].forEach(function (id) { $(id).classList.toggle('dim', block); });

    // keys
    var grid = $('keyGrid');
    grid.innerHTML = '';
    var free = data.keys.filter(function (k) { return k.status === 'In'; });
    if (selOut && !free.some(function (k) { return k.key === selOut; })) selOut = '';
    if (!selOut && free.length === 1) selOut = free[0].key;
    data.keys.forEach(function (k) {
      var b = el('button', 'key-btn' + (k.status === 'Out' ? ' out' : k.status === 'Lost' ? ' lost' : ''));
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(k.key === selOut));
      b.appendChild(el('span', 'k', k.key));
      var sub;
      if (k.status === 'In') sub = k.desc || 'Available';
      else if (k.status === 'Lost') sub = 'Missing';
      else sub = (mine(k) ? 'You have it' : k.with) + ' · since ' + k.since;
      b.appendChild(el('span', 's', sub));
      b.disabled = k.status !== 'In';
      b.addEventListener('click', function () { selOut = k.key; renderOut(); });
      grid.appendChild(b);
    });
    if (!free.length) grid.appendChild(el('div', 'empty', 'All keys are out. Check "Where the keys are" below, or ask your supervisor.'));
    $('dueLine').innerHTML = '';
    $('dueLine').appendChild(document.createTextNode('Due back by '));
    $('dueLine').appendChild(el('strong', '', data.dueBack));
    $('dueLine').appendChild(document.createTextNode(' - bring it back and scan the KEY BACK code.'));

    // terms (keep ticks across refreshes)
    var box = $('terms');
    var ticked = {};
    Array.prototype.forEach.call(box.querySelectorAll('input'), function (i) { ticked[i.dataset.id] = i.checked; });
    box.innerHTML = '';
    data.terms.forEach(function (t) {
      var l = el('label', 'check');
      var i = el('input'); i.type = 'checkbox'; i.dataset.id = t.id; i.checked = !!ticked[t.id];
      i.addEventListener('change', updateOut);
      l.appendChild(i);
      l.appendChild(el('span', '', ' ' + pretty(t.text)));
      box.appendChild(l);
    });
    $('liabTitle').textContent = pretty(data.liability.title);
    $('liabText').textContent = pretty(data.liability.text);
    $('liabTickText').textContent = data.liability.tick;
    $('outHint').textContent = 'Your name, the time and your signature go in the key register.';
    updateOut();
  }

  $('liabTick').addEventListener('change', updateOut);

  function allTicked() {
    var boxes = $('terms').querySelectorAll('input');
    for (var i = 0; i < boxes.length; i++) if (!boxes[i].checked) return false;
    return boxes.length > 0 && $('liabTick').checked;
  }

  function updateOut() {
    var ok = !busy && !!selOut && allTicked() && hasInk() && !sopBlocks();
    $('outBtn').disabled = !ok;
    $('outBtn').textContent = selOut ? 'Take ' + selOut : 'Take key';
  }

  $('outBtn').addEventListener('click', function () {
    if ($('outBtn').disabled) return;
    busy = true;
    var key = selOut;
    $('outErr').textContent = '';
    $('outBtn').disabled = true; $('outBtn').textContent = 'Signing out…';
    post({ action: 'keyOut', name: me, key: key, ack: true, signature: exportSig(), ua: navigator.userAgent }).then(function (r) {
      done({
        title: r.key + ' is signed out to you',
        text: 'Signed out ' + r.outAt + '. Due back by ' + r.dueBack + ' - scan the KEY BACK code when you return it.',
        receipt: r.receipt,
        note: 'Lock the shed every time you leave.'
      });
      resetOut();
      return load({ name: me });
    }).catch(function (x) {
      $('outErr').textContent = x.message;
      return load({ name: me }).then(renderOut).catch(function () {});
    }).then(function () { busy = false; updateOut(); renderBoard(); });
  });

  function resetOut() {
    selOut = '';
    Array.prototype.forEach.call($('terms').querySelectorAll('input'), function (i) { i.checked = false; });
    $('liabTick').checked = false;
    clearSig();
  }

  /* --------------------------------------------------- return a key */

  function renderIn() {
    var out = data.keys.filter(function (k) { return k.status !== 'In'; });
    if (selIn && !out.some(function (k) { return k.key === selIn; })) selIn = '';
    var mineList = out.filter(mine);
    var others = out.filter(function (k) { return !mine(k); });
    if (!selIn && mineList.length === 1) selIn = mineList[0].key;
    var list = $('inList');
    list.innerHTML = '';
    if (!out.length) {
      list.appendChild(el('div', 'empty', 'All keys are signed in.'));
    } else {
      if (!mineList.length) list.appendChild(el('p', 'muted', "You don't have a key signed out."));
      mineList.forEach(function (k) { list.appendChild(retRow(k)); });
      if (others.length) {
        var d = el('details', 'others');
        d.open = !mineList.length || others.some(function (k) { return k.key === selIn; });
        d.appendChild(el('summary', '', "Returning someone else's key?"));
        others.forEach(function (k) { d.appendChild(retRow(k)); });
        list.appendChild(d);
      }
    }
    show('inConfirm', !!selIn);
    updateIn();
  }

  function retRow(k) {
    var b = el('button', 'ret');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(k.key === selIn));
    b.appendChild(el('span', 'k', k.key));
    var tag = k.status === 'Lost' ? el('span', 'tag lost', 'Missing') : k.overdue ? el('span', 'tag over', 'Overdue') : mine(k) ? el('span', 'tag mine', 'Yours') : el('span', 'tag', 'Out');
    b.appendChild(tag);
    var who = mine(k) ? 'You' : (k.with && k.with.charAt(0) !== '(' ? k.with : 'Not signed out');
    b.appendChild(el('span', 's', who + (k.since ? ' · since ' + k.since : '') + (k.due ? ' · due ' + k.due : '')));
    b.addEventListener('click', function () { selIn = k.key; renderIn(); });
    return b;
  }

  $('storedTick').addEventListener('change', updateIn);
  function updateIn() {
    $('inBtn').disabled = busy || !selIn || !$('storedTick').checked;
    $('inBtn').textContent = selIn ? 'Return ' + selIn : 'Return key';
  }

  $('inBtn').addEventListener('click', function () {
    if ($('inBtn').disabled) return;
    busy = true;
    $('inErr').textContent = '';
    $('inBtn').disabled = true; $('inBtn').textContent = 'Returning…';
    post({ action: 'keyIn', name: me, key: selIn, stored: true, ua: navigator.userAgent }).then(function (r) {
      done({
        title: r.key + ' is back in',
        text: 'Returned ' + r.returnedAt + '.' + (r.late ? ' It was due back by ' + r.dueBack + ' - logged as returned late.' : ' Thanks.'),
        note: 'Make sure the shed is locked.'
      });
      selIn = '';
      $('storedTick').checked = false;
      return load({ name: me });
    }).catch(function (x) {
      $('inErr').textContent = x.message;
      return load({ name: me }).then(renderIn).catch(function () {});
    }).then(function () { busy = false; updateIn(); renderBoard(); });
  });

  /* ------------------------------------------------------ lost key */

  function renderLost() {
    var sel = $('lostKey');
    var cur = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    data.keys.forEach(function (k) {
      var o = el('option', '', k.key + (mine(k) ? ' (signed out to you)' : k.status === 'Out' ? ' (with ' + k.with + ')' : k.status === 'Lost' ? ' (already reported)' : ''));
      o.value = k.key;
      sel.appendChild(o);
    });
    var my = data.keys.filter(mine)[0];
    sel.value = cur || (my ? my.key : '');
  }

  $('lostBtn').addEventListener('click', function () {
    var key = $('lostKey').value, where = $('lostWhere').value.trim(), when = $('lostWhen').value.trim();
    $('lostErr').textContent = '';
    if (!key) { $('lostErr').textContent = 'Pick the key that is missing.'; return; }
    if (!where) { $('lostErr').textContent = 'Say where it was last seen.'; return; }
    busy = true;
    $('lostBtn').disabled = true; $('lostBtn').textContent = 'Reporting…';
    post({ action: 'keyLost', name: me, key: key, where: where, when: when, ua: navigator.userAgent }).then(function (r) {
      done({
        warn: true,
        title: 'Missing key reported',
        text: r.posted
          ? r.key + ' is marked missing and Andrew, Ben and Neil have been alerted on Slack. Keep looking only if it is safe. If it turns up, return it here as normal.'
          : r.key + ' is marked missing, but the Slack alert did not go through. Call your supervisor or Andrew now.'
      });
      $('lostWhere').value = ''; $('lostWhen').value = ''; $('lostKey').value = '';
      mode = 'in'; setUrl();
      return load({ name: me });
    }).catch(function (x) {
      $('lostErr').textContent = x.message;
    }).then(function () {
      busy = false;
      $('lostBtn').disabled = false; $('lostBtn').textContent = 'Report missing key';
      renderBoard();
    });
  });

  /* ---------------------------------------------------------- done */

  function done(o) {
    ['outView', 'inView', 'lostView', 'pickName'].forEach(function (id) { show(id, false); });
    $('doneTick').className = 'tick' + (o.warn ? ' warn' : '');
    $('doneTick').textContent = o.warn ? '!' : '✓';
    $('doneTitle').textContent = o.title;
    $('doneText').textContent = pretty(o.text);
    var rc = $('doneRc');
    rc.innerHTML = '';
    if (o.receipt) { rc.appendChild(document.createTextNode('Receipt ')); rc.appendChild(el('span', '', o.receipt)); }
    rc.hidden = !o.receipt;
    $('doneNote').textContent = o.note || '';
    $('doneNote').hidden = !o.note;
    show('doneView', true);
    window.scrollTo(0, 0);
  }

  /* --------------------------------------------------------- helpers */

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function nice(key) {
    if (!key) return '';
    var p = String(key).split('-');
    return Number(p[2]) + ' ' + MON[Number(p[1]) - 1] + ' ' + p[0];
  }
  function pretty(t) { return String(t).replace(/ - /g, ' – '); }

  /* ------------------------------------------------- signature pad */

  var canvas = $('sig');
  var g = null, drawing = false, last = null, ink = 0, minX = 1e9, maxX = -1e9;

  function sizeSig() {
    var r = canvas.getBoundingClientRect();
    if (!r.width) return;
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#14231C';
    clearSig();
  }
  function clearSig() {
    if (g) g.clearRect(0, 0, canvas.width, canvas.height);
    ink = 0; minX = 1e9; maxX = -1e9;
    $('sigHint').hidden = false;
    updateOut();
  }
  function hasInk() { return ink > 12 && (maxX - minX) > 40; }
  function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  canvas.addEventListener('pointerdown', function (e) {
    if (!g || canvas.width === 0) sizeSig();
    drawing = true; last = pos(e);
    try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
    $('sigHint').hidden = true;
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drawing || !g) return;
    var p = pos(e);
    g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke();
    last = p; ink++; minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    e.preventDefault();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    canvas.addEventListener(ev, function () { if (drawing) { drawing = false; updateOut(); } });
  });
  $('sigClear').addEventListener('click', clearSig);
  window.addEventListener('resize', function () { if (!$('outView').hidden && !hasInk()) sizeSig(); });

  function exportSig() {
    var w = 600, h = Math.max(120, Math.round(600 * canvas.height / Math.max(1, canvas.width)));
    var off = document.createElement('canvas');
    off.width = w; off.height = h;
    var o = off.getContext('2d');
    o.fillStyle = '#FFFFFF'; o.fillRect(0, 0, w, h);
    o.drawImage(canvas, 0, 0, w, h);
    return off.toDataURL('image/png');
  }

  // The pad needs a size once the take-a-key view is visible.
  var obs = new MutationObserver(function () { if (!$('outView').hidden && (!g || canvas.width === 0)) sizeSig(); });
  obs.observe($('outView'), { attributes: true, attributeFilter: ['hidden'] });

  init();
})();
