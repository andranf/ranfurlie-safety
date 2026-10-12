(function () {
  'use strict';

  var CFG = window.SAFETY_CONFIG || {};
  var API = String(CFG.API_URL || '').trim();
  var $ = function (id) { return document.getElementById(id); };

  function safe(storeName) {
    return {
      get: function (k) { try { return window[storeName].getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { window[storeName].setItem(k, v); } catch (e) {} },
      del: function (k) { try { window[storeName].removeItem(k); } catch (e) {} }
    };
  }
  var local = safe('localStorage');

  var lib = null;      // { docs, staff, categories, declaration }
  var me = null;       // { name, items, counts }
  var tab = 'mine';
  var browsing = false;
  var current = null;  // doc open in the viewer
  var timer = null;
  var openedAt = 0;
  var pushed = false;

  /* ------------------------------------------------------------ api */

  function get() {
    return fetch(API + '?action=library', { redirect: 'follow' }).then(function (r) { return r.json(); }).then(check);
  }
  function post(body) {
    return fetch(API, { method: 'POST', redirect: 'follow', body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).then(check);
  }
  function check(res) {
    if (!res || res.ok !== true) throw new Error((res && res.error) || 'Something went wrong. Try again.');
    return res;
  }

  /* ---------------------------------------------------------- dates */

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmt(key) {
    if (!key) return '';
    var p = key.split('-');
    var y = Number(p[0]);
    var s = Number(p[2]) + ' ' + MON[Number(p[1]) - 1];
    return y === new Date().getFullYear() ? s : s + ' ' + String(y).slice(2);
  }

  /* ----------------------------------------------------------- init */

  function init() {
    if (!API) {
      notice('This page is being set up. Check back soon.');
      return;
    }
    $('foot').textContent = 'Loading documents…';
    get().then(function (res) {
      lib = res;
      $('foot').textContent = 'Signed records go to the course maintenance safety register. Questions about a procedure? Ask your supervisor before you start the job.';
      fillNames();
      // Personal link from a Slack reminder (?u=...) signs you straight in and is remembered.
      var m = /[?&]u=([0-9a-f]{6,20})/i.exec(location.search);
      if (m) {
        return signIn({ action: 'me', u: m[1].toLowerCase() }).then(function () {
          try { history.replaceState({}, '', location.pathname); } catch (e) {}
        }).catch(function (x) {
          showSignin();
          $('signinErr').textContent = x.message;
        });
      }
      var last = local.get('rs_name');
      if (last && lib.staff.indexOf(last) >= 0) {
        return signIn({ action: 'me', name: last }).catch(function () { local.del('rs_name'); showSignin(); });
      }
      showSignin();
    }).then(openFromUrl).catch(function (e) {
      $('foot').textContent = '';
      notice('Could not load the documents (' + e.message + '). Check your signal and refresh.');
    });
  }

  function signIn(body) {
    return post(body).then(function (r) {
      local.set('rs_name', r.name);
      browsing = false;
      setMe(r);
      showDash();
    });
  }

  function parseJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  function notice(text) {
    var n = $('notice');
    n.textContent = text;
    n.hidden = false;
  }

  function fillNames() {
    var sel = $('nameSel');
    lib.staff.forEach(function (n) {
      var o = document.createElement('option');
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
    var last = local.get('rs_name');
    if (last && lib.staff.indexOf(last) >= 0) sel.value = last;
  }

  /* -------------------------------------------------------- sign in */

  function showSignin() {
    $('signin').hidden = false;
    $('dash').hidden = true;
    $('who').hidden = true;
    $('signinErr').textContent = '';
    $('signinBtn').textContent = 'Continue';
  }

  $('signinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('nameSel').value;
    var err = $('signinErr');
    err.textContent = '';
    if (!name) { err.textContent = 'Choose your name.'; return; }
    var btn = $('signinBtn');
    btn.disabled = true; btn.textContent = 'Loading…';
    signIn({ action: 'me', name: name }).then(openFromUrl).catch(function (x) {
      err.textContent = x.message;
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Continue';
    });
  });

  $('browseOnly').addEventListener('click', function () {
    browsing = true;
    tab = 'all';
    showDash();
  });

  $('signOut').addEventListener('click', function () {
    local.del('rs_name');
    me = null;
    location.href = location.pathname;
  });

  function setMe(r) {
    me = { name: r.name, items: r.items || {}, counts: r.counts || {} };
  }

  function refreshMe() {
    if (!me) return Promise.resolve();
    return post({ action: 'me', name: me.name }).then(function (r) { setMe(r); render(); }).catch(function () {});
  }

  /* ---------------------------------------------------------- list */

  function showDash() {
    $('signin').hidden = true;
    $('dash').hidden = false;
    if (me) {
      $('who').hidden = false;
      $('whoName').textContent = me.name;
      $('tabMine').hidden = false;
    } else {
      $('tabMine').hidden = true;
      tab = 'all';
    }
    render();
  }

  $('tabMine').addEventListener('click', function () { tab = 'mine'; render(); });
  $('tabAll').addEventListener('click', function () { tab = 'all'; render(); });
  $('search').addEventListener('input', render);

  var ORDER = { 'Overdue': 0, 'Due soon': 1, 'To sign': 2, 'Current': 3 };
  var SECTION = { 'Overdue': 'Overdue', 'Due soon': 'Due soon', 'To sign': 'To sign', 'Current': 'Up to date' };

  function render() {
    $('tabMine').setAttribute('aria-selected', String(tab === 'mine'));
    $('tabAll').setAttribute('aria-selected', String(tab === 'all'));
    renderPills();
    var list = $('list');
    list.innerHTML = '';
    var q = $('search').value.trim().toLowerCase();
    var docs = lib.docs.filter(function (d) {
      return !q || (d.code + ' ' + d.title + ' ' + d.summary + ' ' + d.category).toLowerCase().indexOf(q) >= 0;
    });
    if (!lib.docs.length) { list.appendChild(empty('No documents have been uploaded yet.')); return; }

    if (tab === 'mine' && me) {
      var mine = docs.filter(function (d) { var i = me.items[d.code]; return i && i.required; });
      mine.sort(function (a, b) {
        var ia = me.items[a.code], ib = me.items[b.code];
        return (ORDER[ia.status] - ORDER[ib.status]) || ((ia.due || '') < (ib.due || '') ? -1 : (ia.due || '') > (ib.due || '') ? 1 : 0);
      });
      if (!mine.length) { list.appendChild(empty(q ? 'Nothing on your list matches that.' : 'Nothing on your list right now.')); return; }
      var sec = '';
      mine.forEach(function (d) {
        var s = me.items[d.code].status;
        if (SECTION[s] !== sec) { sec = SECTION[s]; list.appendChild(heading(sec)); }
        list.appendChild(row(d));
      });
      return;
    }

    if (!docs.length) { list.appendChild(empty('No documents match that.')); return; }
    var cat = '';
    docs.forEach(function (d) {
      if (d.category !== cat) { cat = d.category; list.appendChild(heading(cat)); }
      list.appendChild(row(d));
    });
  }

  function renderPills() {
    var box = $('pills');
    box.innerHTML = '';
    if (!me) { box.hidden = true; return; }
    box.hidden = false;
    [['overdue', 'Overdue', 'Overdue'], ['soon', 'Due soon', 'Due soon'], ['tosign', 'To sign', 'To sign'], ['current', 'Current', 'Up to date']].forEach(function (p) {
      var el = document.createElement('div');
      el.className = 'pill ' + p[0];
      var n = document.createElement('div'); n.className = 'n'; n.textContent = String(me.counts[p[1]] || 0);
      var l = document.createElement('div'); l.className = 'l'; l.textContent = p[2];
      el.appendChild(n); el.appendChild(l);
      box.appendChild(el);
    });
  }

  function heading(t) { var h = document.createElement('div'); h.className = 'group'; h.textContent = t; return h; }
  function empty(t) { var e = document.createElement('div'); e.className = 'empty'; e.textContent = t; return e; }

  function chipFor(d) {
    var risk = d.risk + ' risk';
    if (!me) return { cls: 'optional', text: risk };
    var i = me.items[d.code];
    if (!i || !i.required) return { cls: 'optional', text: i && i.signed ? 'Signed ' + fmt(i.signed) : 'Not on your list' };
    if (i.status === 'Overdue') return { cls: 'Overdue', text: 'Overdue' };
    if (i.status === 'Due soon') return { cls: 'soon', text: 'Due ' + fmt(i.due) };
    if (i.status === 'To sign') return { cls: 'tosign', text: (i.outdated ? 'Updated · sign by ' : 'Sign by ') + fmt(i.due) };
    return { cls: 'Current', text: '✓ to ' + fmt(i.validUntil) };
  }

  function row(d) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'doc';
    var bar = document.createElement('span'); bar.className = 'risk ' + d.risk; bar.title = d.risk + ' risk';
    var main = document.createElement('div'); main.className = 'doc-main';
    var t = document.createElement('div'); t.className = 'doc-title';
    var c = document.createElement('span'); c.className = 'doc-code'; c.textContent = d.code;
    t.appendChild(c); t.appendChild(document.createTextNode(d.title));
    main.appendChild(t);
    if (d.summary) { var s = document.createElement('div'); s.className = 'doc-sum'; s.textContent = d.summary; main.appendChild(s); }
    var ch = chipFor(d);
    var chip = document.createElement('span'); chip.className = 'chip ' + ch.cls; chip.textContent = ch.text;
    b.appendChild(bar); b.appendChild(main); b.appendChild(chip);
    b.addEventListener('click', function () { openDoc(d.code, true); });
    return b;
  }

  /* -------------------------------------------------------- viewer */

  function openFromUrl() {
    var m = /[?&]doc=([A-Za-z]{2,4}-\d{1,3})/.exec(location.search);
    if (m && lib && !current) openDoc(m[1].toUpperCase(), false);
  }

  function openDoc(code, push) {
    var d = lib.docs.filter(function (x) { return x.code === code; })[0];
    if (!d) return;
    current = d;
    $('vTitle').textContent = d.title;
    var meta = $('vMeta');
    meta.textContent = d.code + ' · v' + d.version + ' ';
    var rk = document.createElement('span'); rk.className = 'rk ' + d.risk; rk.textContent = d.risk + ' risk';
    meta.appendChild(rk);
    $('vFrame').src = d.preview;
    $('vOpen').href = d.open || d.preview;
    $('viewer').hidden = false;
    document.body.style.overflow = 'hidden';
    if (push) { try { history.pushState({ doc: code }, '', '?doc=' + encodeURIComponent(code)); pushed = true; } catch (e) {} }

    $('vDone').hidden = true;
    $('vErr').textContent = '';
    $('vDeclare').checked = false;
    $('vDeclText').textContent = lib.declaration;
    var signable = !!me;
    $('vNeedSignin').hidden = signable;
    $('vTimer').hidden = !signable;
    $('vForm').hidden = true;
    if (!signable) return;
    startTimer(d.readSeconds);
  }

  function startTimer(need) {
    stopTimer();
    openedAt = Date.now();
    var tick = function () {
      var secs = (Date.now() - openedAt) / 1000;
      var left = Math.max(0, Math.ceil(need - secs));
      $('vBar').style.width = Math.min(100, secs / need * 100) + '%';
      if (left > 0) {
        $('vTimerText').textContent = 'Read it through. Signing opens in ' + Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2);
      } else {
        $('vTimerText').textContent = 'Done reading? Tick the box, sign and submit.';
        if ($('vForm').hidden) { $('vForm').hidden = false; sizeSig(); }
        stopTimer();
      }
      updateSubmit();
    };
    tick();
    timer = setInterval(tick, 500);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  function closeViewer() {
    stopTimer();
    $('viewer').hidden = true;
    $('vFrame').src = 'about:blank';
    document.body.style.overflow = '';
    current = null;
  }

  $('vBack').addEventListener('click', function () {
    if (pushed) { pushed = false; history.back(); } else { closeViewer(); try { history.replaceState({}, '', location.pathname); } catch (e) {} }
  });
  window.addEventListener('popstate', function () { if (current) closeViewer(); pushed = false; });

  $('vDeclare').addEventListener('change', updateSubmit);

  function updateSubmit() {
    var ready = !$('vForm').hidden && $('vDeclare').checked && hasInk();
    $('vSubmit').disabled = !ready;
  }

  $('vSubmit').addEventListener('click', function () {
    if (!current || !me) return;
    var d = current;
    var btn = $('vSubmit');
    btn.disabled = true; btn.textContent = 'Signing…';
    $('vErr').textContent = '';
    post({
      action: 'sign', name: me.name, code: d.code, version: d.version,
      readSeconds: Math.round((Date.now() - openedAt) / 1000), declare: true,
      signature: exportSig(), ua: navigator.userAgent
    }).then(function (r) {
      $('vForm').hidden = true;
      $('vTimer').hidden = true;
      var done = $('vDone');
      done.innerHTML = '';
      var tk = document.createElement('div'); tk.className = 'tick'; tk.textContent = '✓';
      var big = document.createElement('div'); big.className = 'big'; big.textContent = 'Signed — ' + d.title;
      var p = document.createElement('p'); p.className = 'muted';
      p.appendChild(document.createTextNode(r.signedAt + ' · receipt '));
      var rc = document.createElement('span'); rc.className = 'rc'; rc.textContent = r.receipt;
      p.appendChild(rc);
      p.appendChild(document.createTextNode(' · current until ' + fmt(r.validUntil)));
      var back = document.createElement('button'); back.type = 'button'; back.className = 'btn primary'; back.textContent = 'Back to my list';
      back.addEventListener('click', function () { $('vBack').click(); });
      done.appendChild(tk); done.appendChild(big); done.appendChild(p); done.appendChild(back);
      done.hidden = false;
      if (me.items[d.code]) {
        var i = me.items[d.code];
        var now = new Date();
        i.status = 'Current'; i.validUntil = r.validUntil; i.outdated = false;
        i.signed = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
      }
      refreshMe();
    }).catch(function (x) {
      $('vErr').textContent = x.message;
      if (/updated|no longer available/i.test(x.message)) get().then(function (res) { lib = res; render(); }).catch(function () {});
    }).then(function () {
      btn.textContent = 'Sign';
      updateSubmit();
    });
  });

  /* ------------------------------------------------- signature pad */

  var canvas = $('sig');
  var g = null, drawing = false, last = null, ink = 0, minX = 1e9, maxX = -1e9;

  function sizeSig() {
    var r = canvas.getBoundingClientRect();
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
    updateSubmit();
  }
  function hasInk() { return ink > 12 && (maxX - minX) > 40; }
  function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  canvas.addEventListener('pointerdown', function (e) {
    if (!g) sizeSig();
    drawing = true; last = pos(e);
    try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
    $('sigHint').hidden = true;
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    var p = pos(e);
    g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke();
    last = p; ink++; minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    e.preventDefault();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    canvas.addEventListener(ev, function () { if (drawing) { drawing = false; updateSubmit(); } });
  });
  $('sigClear').addEventListener('click', clearSig);
  window.addEventListener('resize', function () { if (!$('vForm').hidden && !hasInk()) sizeSig(); });

  function exportSig() {
    var w = 600, h = Math.max(120, Math.round(600 * canvas.height / Math.max(1, canvas.width)));
    var off = document.createElement('canvas');
    off.width = w; off.height = h;
    var o = off.getContext('2d');
    o.fillStyle = '#FFFFFF'; o.fillRect(0, 0, w, h);
    o.drawImage(canvas, 0, 0, w, h);
    return off.toDataURL('image/png');
  }

  init();
})();
