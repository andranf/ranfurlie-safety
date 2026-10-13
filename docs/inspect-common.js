/* Shared helpers for the inspection form and dashboard. */
(function () {
  'use strict';

  var CFG = window.SAFETY_CONFIG || {};
  var API = String(CFG.API_URL || '').trim();

  function store(kind) {
    return {
      get: function (k) { try { return window[kind].getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { window[kind].setItem(k, v); return true; } catch (e) { return false; } },
      del: function (k) { try { window[kind].removeItem(k); } catch (e) {} }
    };
  }

  function check(res) {
    if (!res || res.ok !== true) throw new Error((res && res.error) || 'Something went wrong. Try again.');
    return res;
  }
  function get(params) {
    var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(API + '?' + q, { redirect: 'follow' }).then(function (r) { return r.json(); }).then(check);
  }
  function post(body) {
    return fetch(API, { method: 'POST', redirect: 'follow', body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).then(check);
  }

  /* ---------------------------------------------------------- dates */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function pad(n) { return ('0' + n).slice(-2); }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayKey() { return keyOf(new Date()); }
  function parseKey(k) { var p = String(k || '').split('-').map(Number); return p.length === 3 && p[0] ? new Date(p[0], p[1] - 1, p[2]) : null; }
  function daysUntil(k) { var d = parseKey(k); if (!d) return null; var t = parseKey(todayKey()); return Math.round((d - t) / 86400000); }
  function dmy(k) { var d = parseKey(k); return d ? d.getDate() + ' ' + MON[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2) : ''; }
  function clock(d) { var h = d.getHours(), m = d.getMinutes(); return ((h + 11) % 12 + 1) + ':' + pad(m) + (h < 12 ? ' am' : ' pm'); }
  function when(iso) { if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return ''; return DAY[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2) + ', ' + clock(d); }
  function dayMon(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getDate() + ' ' + MON[d.getMonth()]; }
  function ago(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    var days = Math.floor((Date.now() - d) / 86400000);
    if (days <= 0) return 'today'; if (days === 1) return 'yesterday';
    if (days < 45) return days + ' days ago';
    return Math.round(days / 30.4) + ' months ago';
  }
  // Expiry / due state for a date key: bad = passed, soon = within 30 days.
  function dueState(k) {
    var n = daysUntil(k);
    if (n === null) return { cls: '', text: '' };
    if (n < 0) return { cls: 'bad', text: 'Passed ' + (-n) + ' day' + (n === -1 ? '' : 's') + ' ago', n: n };
    if (n === 0) return { cls: 'bad', text: 'Due today', n: n };
    if (n <= 30) return { cls: 'soon', text: 'Due in ' + n + ' day' + (n === 1 ? '' : 's'), n: n };
    var m = Math.round(n / 30.4);
    return { cls: 'ok', text: m >= 2 ? 'OK, ' + m + ' months left' : 'OK, ' + n + ' days left', n: n };
  }

  /* ------------------------------------------------ checklist model */
  // Flatten a checklist into the list of things that get an answer.
  function questions(cl) {
    var out = [];
    (cl.sections || []).forEach(function (s) {
      (s.blocks || []).forEach(function (b) {
        if (b.type === 'items') {
          b.items.forEach(function (it) {
            out.push({ key: s.id + '.' + it.id, sec: s.id, kind: 'check', id: it.id, label: it.text, sub: it.sub || '', months: it.months || null });
          });
        } else if (b.type === 'assets') {
          b.assets.forEach(function (a) {
            var aname = a.name + (a.where && a.where !== a.name ? ' (' + a.where + ')' : '');
            var akey = s.id + '.' + b.id + '.' + a.id;
            if (b.typeField) out.push({ key: akey + '.type', sec: s.id, kind: 'text', label: b.typeField, asset: aname, assetKey: akey, def: a.type || '', unscored: true });
            (b.checks || []).forEach(function (c) {
              out.push({ key: akey + '.' + c.id, sec: s.id, kind: 'check', label: c.text, sub: c.sub || '', asset: aname, assetKey: akey });
            });
            (b.dates || []).forEach(function (d) {
              out.push({ key: akey + '.' + d.id, sec: s.id, kind: 'date', label: d.label, asset: aname, assetKey: akey });
            });
          });
        } else if (b.type === 'service') {
          b.items.forEach(function (it) {
            out.push({ key: s.id + '.' + it.id, sec: s.id, kind: 'service', id: it.id, label: it.text, sub: it.freq + ' · ' + it.by });
          });
        }
      });
    });
    return out;
  }

  function sectionTitles(cl) {
    var m = {};
    (cl.sections || []).forEach(function (s) { m[s.id] = s.title; });
    return m;
  }

  /* ---------------------------------------------------------- dom */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style') e.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(node, to, opts) {
    opts = opts || {};
    var dur = opts.dur || 900, from = opts.from || 0, suffix = opts.suffix || '', dp = opts.dp || 0;
    if (reduced || !isFinite(to)) { node.textContent = (isFinite(to) ? to.toFixed(dp) : '—') + suffix; return; }
    var t0 = null;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      node.textContent = (from + (to - from) * e).toFixed(dp) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function toast(msg, ms) {
    var t = el('div', { class: 'toast', role: 'status', text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 320); }, ms || 2600);
  }

  function confetti() {
    if (reduced) return;
    var box = el('div', { class: 'confetti', 'aria-hidden': 'true' });
    var cols = ['#1F4D3A', '#2D6A50', '#E3B04B', '#7FB69A', '#F4F1E8', '#B8382B'];
    for (var i = 0; i < 36; i++) {
      var a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 170;
      var p = el('i', { style: '--dx:' + Math.round(Math.cos(a) * r) + 'px;--dy:' + Math.round(Math.sin(a) * r - 40) + 'px;background:' + cols[i % cols.length] + ';animation-delay:' + Math.round(Math.random() * 120) + 'ms;transform:rotate(' + Math.round(Math.random() * 90) + 'deg)' });
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 1600);
  }

  /* -------------------------------------------------- signature pad */
  function SigPad(canvas, hint, onChange) {
    var g = null, drawing = false, last = null, ink = 0, minX = 1e9, maxX = -1e9;
    function size() {
      var r = canvas.getBoundingClientRect();
      if (!r.width) return;
      var dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#14231C';
      clear();
    }
    function clear() { if (g) g.clearRect(0, 0, canvas.width, canvas.height); ink = 0; minX = 1e9; maxX = -1e9; if (hint) hint.hidden = false; if (onChange) onChange(); }
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    canvas.addEventListener('pointerdown', function (e) { if (!g) size(); drawing = true; last = pos(e); try { canvas.setPointerCapture(e.pointerId); } catch (x) {} if (hint) hint.hidden = true; e.preventDefault(); });
    canvas.addEventListener('pointermove', function (e) {
      if (!drawing) return; var p = pos(e);
      g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke();
      last = p; ink++; minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); e.preventDefault();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { canvas.addEventListener(ev, function () { if (drawing) { drawing = false; if (onChange) onChange(); } }); });
    return {
      size: size, clear: clear,
      has: function () { return ink > 12 && (maxX - minX) > 40; },
      png: function () {
        var w = 600, h = Math.max(120, Math.round(600 * canvas.height / Math.max(1, canvas.width)));
        var off = document.createElement('canvas'); off.width = w; off.height = h;
        var o = off.getContext('2d'); o.fillStyle = '#FFFFFF'; o.fillRect(0, 0, w, h); o.drawImage(canvas, 0, 0, w, h);
        return off.toDataURL('image/png');
      }
    };
  }

  /* ------------------------------------------------------- photos */
  function shrinkPhoto(file, max, q) {
    max = max || 1280; q = q || 0.72;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that photo.')); };
      img.src = url;
    });
  }

  function uid() {
    var a = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  window.INSP = {
    API: API, get: get, post: post, local: store('localStorage'),
    keyOf: keyOf, todayKey: todayKey, parseKey: parseKey, daysUntil: daysUntil, dmy: dmy, when: when, dayMon: dayMon, ago: ago, clock: clock, dueState: dueState, MON: MON,
    questions: questions, sectionTitles: sectionTitles,
    el: el, esc: esc, countUp: countUp, toast: toast, confetti: confetti, reduced: reduced,
    SigPad: SigPad, shrinkPhoto: shrinkPhoto, uid: uid
  };
})();
