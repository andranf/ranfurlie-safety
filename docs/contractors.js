/* Contractor & visitor sign-in, sign-out, induction and register. */
(function () {
  'use strict';

  var I = window.INSP;
  var el = I.el;
  function $(id) { return document.getElementById(id); }

  /* Induction content. Version and answers must match CON_INDUCTION_VERSION / CON_QUIZ_ANSWERS in backend/Code.gs. */
  var CON_INDUCTION = {
    version: 'CI-2026.11-1',
    minSeconds: 75,
    sections: [
      { t: 'Before you start', pts: [
        'Sign in on this page **every time you arrive** and sign out **every time you leave**. In an emergency the sign-in list is how we account for everyone.',
        'Report to your **host** first – the staff member you are working for. They tell you where you can work, what is happening on site today and anything that has changed.',
        'Stay in the area you are working in. The maintenance compound, workshop, chemical shed and fuel bay are staff only unless your job is there.',
        'This induction lasts 12 months. Your host may also brief you on your job and its hazards before you start.'
      ] },
      { t: 'Emergencies', pts: [
        'Call **000** for anything serious, then call or find your host.',
        'Ranfurlie Golf Club: **825 Cranbourne–Frankston Rd, Cranbourne**. The Amstel Club: **1000 Cranbourne–Frankston Rd, Cranbourne**.',
        'Evacuation: stop work, go to the assembly point and **stay until you are accounted for**. Course maintenance area: **Assembly point B, south of the maintenance shed near the dam**. Clubhouse, range and Amstel: your host will show you on arrival.',
        'First aid kits and AEDs (defibrillators) are in the maintenance shed, at both lightning shelters on the course, and in the clubhouse. Ask your host where the nearest ones are.',
        'Spills: stop the source if it is safe to, contain it with a spill kit, keep it out of drains and dams, and tell your host. Spill kits are at the chemical shed, mixing area and fuel bay.'
      ] },
      { t: 'Golfers, the range and vehicles', pts: [
        'The course stays open while you work. **A golf ball can kill or seriously injure.** Watch for golfers, get out of the line of play and wait until they have played.',
        'Never stand in front of a tee or in the line of a shot. If unsure, make eye contact and wait to be waved through.',
        'Driving range: **never go past the yellow safety line or onto the range while it is open.** Range work only when your host says the range is closed.',
        'Drive on paths and tracks where there are some, at walking pace near golfers and people, and give way to golfers and pedestrians. Follow the speed limits in the car park and compound.'
      ] },
      { t: 'Weather, heat and fire', pts: [
        '**Lightning:** if a lightning alert is called, or you hear thunder or see lightning, stop work and go to a building or a fully enclosed hard-top vehicle straight away. Not under trees or in an open cart. Wait for your host’s all clear (at least 30 minutes after the last thunder).',
        'Heat and UV: hat, sunscreen, long sleeves where you can, plenty of water and shade breaks. Tell your host if you feel unwell.',
        '**Hot work** (welding, cutting, grinding) needs your host’s permission every time, with a fire extinguisher at hand and someone watching for fire. **No hot work outdoors on a Total Fire Ban day.**',
        'On high fire danger days keep vehicles and machines off long dry grass.'
      ] },
      { t: 'Hazards on site', pts: [
        '**Underground services:** high-pressure irrigation mains, drainage, power and communications cables run under the course. **No digging, trenching, boring, coring or driving stakes** until a Before You Dig Australia (BYDA) enquiry is done and your host has located and marked irrigation and drainage.',
        '**Dams and water:** keep back from the edges and never go in the water, including to get back a ball or tool.',
        'Slopes and batters: plant and vehicles can roll over. Keep off steep or wet slopes unless your host has cleared it.',
        'Chemicals: keep out of areas being sprayed or signed as recently treated. Don’t touch chemical containers or the spray rigs.',
        'Snakes are active in warm months. Leave them alone. For a bite: call 000, keep the person still and apply a pressure bandage.',
        'Club machines, tools and keys are not for contractor use unless your host has approved it and you are trained on them.'
      ] },
      { t: 'Environment and trees', pts: [
        'Ranfurlie is in the Green Wedge and has protected native vegetation, including old River Red Gums. **Don’t remove, prune or lop any tree or native vegetation, or store or park under trees, without the superintendent’s written approval.**',
        'Nothing goes into drains, dams or waterways: no washing out concrete, paint, fuel or chemicals.',
        'Take your rubbish and offcuts with you unless your host agrees otherwise.'
      ] },
      { t: 'Your work and your duties', pts: [
        '**High-risk construction work needs a SWMS** (Safe Work Method Statement) before it starts – for example where someone could fall more than 2 m, trenches deeper than 1.5 m, work near powerlines, near traffic or moving plant, or in a confined space. Give it to your host and work to it. If the job changes, stop and review it.',
        'Have your licences and tickets current and with you (e.g. electrical licence, high-risk work licence, chemical, chainsaw or plant tickets).',
        'PPE: hi-vis and enclosed shoes (safety boots for trade work) as a minimum, plus whatever your SWMS needs. Orange hi-vis on roads and in the car park.',
        'Bring equipment that is safe and guarded, with electrical leads and tools tested and tagged. Isolate and lock out before working on machines or electrics, using your own lock and tag.',
        'Come to work fit: not affected by alcohol or drugs. No smoking or vaping in buildings, the compound, or near fuel or chemicals.',
        'Report every incident, injury, near miss or hazard to your host straight away.',
        'Treat everyone with respect – no bullying, harassment or discrimination. Children are on site for junior clinics: keep your behaviour and language appropriate.',
        'Anyone can stop a job that isn’t safe. If you are unsure, stop and ask your host.'
      ] }
    ],
    quiz: [
      { q: 'When do you sign in and out on this page?', o: ['Only on your first visit', 'Every time you arrive and every time you leave', 'Only when your host asks', 'Only for high-risk work'],
        why: 'Every visit. In an emergency the sign-in list is how we know who is on site.' },
      { q: 'A golfer is about to hit towards where you are working. What do you do?', o: ['Keep working – they will wait', 'Wave them on to hit', 'Stop, get out of the line of play and wait until they have played', 'Move closer so they can see you'],
        why: 'A golf ball can kill or seriously injure. Get out of the line and wait.' },
      { q: 'Before any digging, trenching, boring or driving stakes you must:', o: ['Do a Before You Dig Australia enquiry and have your host locate and mark irrigation and drainage', 'Dig carefully by hand first', 'Check a map on your phone', 'Nothing if it is less than 300 mm deep'],
        why: 'High-pressure irrigation, drainage and cables run under the course. They are located and marked first.' },
      { q: 'The site is being evacuated. What do you do?', o: ['Drive off site straight away', 'Finish what you are doing first', 'Go to the assembly point and stay until you are accounted for', 'Go home and ring your host'],
        why: 'If you leave without telling anyone, people may go looking for you.' },
      { q: 'It is a Total Fire Ban day and your job needs welding outdoors.', o: ['Go ahead with an extinguisher nearby', 'No hot work outdoors that day – talk to your host', 'Do it early before it gets hot', 'Wet the ground first and carry on'],
        why: 'No hot work outdoors on a Total Fire Ban day.' },
      { q: 'You spill fuel near a drain. What do you do?', o: ['Hose it into the drain to dilute it', 'Leave it to evaporate', 'Cover it with grass clippings', 'Stop the source if safe, contain it with a spill kit, keep it out of drains and tell your host'],
        why: 'Contain it, keep it out of drains and dams, and report it.' },
      { q: 'A lightning alert is called. What do you do?', o: ['Stop work and go to a building or enclosed hard-top vehicle until your host gives the all clear', 'Finish the job quickly, then shelter', 'Shelter under a big tree', 'Keep working if it isn’t raining'],
        why: 'Stop straight away. Lightning strikes well ahead of the rain.' },
      { q: 'When does your work need a SWMS?', o: ['Only if the Club asks for one', 'Before starting any high-risk construction work, e.g. a fall over 2 m or a trench over 1.5 m', 'Only for jobs longer than a day', 'Never for contractors'],
        why: 'High-risk construction work needs a SWMS before it starts.' }
    ]
  };

  var SITE_INFO = {
    course: { addr: 'Ranfurlie Golf Club, 825 Cranbourne–Frankston Rd, Cranbourne',
      rules: ['Assembly point: **Assembly point B, south of the maintenance shed near the dam**', 'First aid & AEDs: maintenance shed and both lightning shelters on the course', 'Spill kits: chemical shed, mixing area and fuel bay', 'Golfers have right of way – stop and wait while they play', 'No digging until services are located and marked'] },
    clubhouse: { addr: 'Ranfurlie Golf Club, 825 Cranbourne–Frankston Rd, Cranbourne',
      rules: ['Your host will show you the nearest exits, assembly point, first aid kit and AED', 'Driving range: **never past the yellow line while the range is open**', 'Keep exits, corridors and fire equipment clear', 'Kitchen, cellar and cool rooms only with your host'] },
    amstel: { addr: 'The Amstel Club, 1000 Cranbourne–Frankston Rd, Cranbourne',
      rules: ['Your host will show you the nearest exits, assembly area, first aid kit and AED', 'Keep exits, corridors and fire equipment clear', 'Kitchen, cellar and cool rooms only with your host'] }
  };

  var D = null;            // data from the API
  var view = 'home';
  var qs = new URLSearchParams(location.search);
  var siteHint = qs.get('site') && SITE_INFO[qs.get('site')] ? qs.get('site') : '';
  var LS = { name: 'con_name', visit: 'con_visit', company: 'con_company', phone: 'con_phone', site: 'con_site' };

  /* ------------------------------------------------------------ helpers */

  function md(text) {   // **bold** only
    var out = [], parts = String(text).split('**');
    parts.forEach(function (p, i) { if (p) out.push(i % 2 ? el('strong', { text: p }) : document.createTextNode(p)); });
    return out;
  }
  function notice(msg) { var n = $('notice'); n.textContent = msg; n.hidden = !msg; }
  function req() { return el('span', { class: 'req', title: 'Required', 'aria-label': 'required', text: '*' }); }
  function reqNote() { return el('p', { class: 'req-note' }, [req(), ' Required']); }
  function rl(text) { return el('label', {}, [text, req()]); }
  function field(label, input, sub, required) {
    var kids = [el('label', {}, [label, required ? req() : null])];
    if (sub) kids.push(el('div', { class: 'f-sub', text: sub }));
    kids.push(input);
    return el('div', { class: 'field' }, kids);
  }
  function input(attrs) { return el('input', Object.assign({ type: 'text', autocomplete: 'off' }, attrs || {})); }
  function render(kids) {
    var v = $('view');
    v.innerHTML = '';
    (kids || []).forEach(function (k) { if (k) v.appendChild(k); });
    window.scrollTo(0, 0);
  }
  function back() { return el('button', { type: 'button', class: 'link-btn back-link', text: '‹ Back', onclick: function () { go('home'); } }); }
  function personOf(name) {
    var n = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    return (D && D.people || []).find(function (p) { return p.name.toLowerCase() === n; }) || null;
  }
  function fmtDate(k) { if (!k) return ''; var d = I.parseKey(k); return d ? d.getDate() + ' ' + I.MON[d.getMonth()] + ' ' + d.getFullYear() : k; }
  function hm(iso) { var d = new Date(iso); return isNaN(d) ? '' : I.clock(d); }
  function siteShort(t) { return String(t || '').replace(/^Ranfurlie: /, '').replace(/^./, function (c) { return c.toUpperCase(); }); }
  function setAddr(site) { var a = $('emAddr'); if (a) a.textContent = (SITE_INFO[site] || SITE_INFO.course).addr; }

  function load() {
    return I.get({ action: 'contractors' }).then(function (res) { D = res; return res; });
  }

  function go(v) {
    view = v;
    notice('');
    if (v === 'in') return signIn();
    if (v === 'out') return signOut();
    if (v === 'induct') return induct();
    if (v === 'register') return register();
    return home();
  }

  /* --------------------------------------------------------------- home */

  function home() {
    $('brandSub').textContent = 'Contractors & visitors';
    var mine = I.local.get(LS.visit);
    var onMine = mine && D && D.onSite.some(function (x) { return x.id === mine; });
    var n = D ? D.onSite.length : 0;
    render([
      el('div', { class: 'card hero anim-in' }, [
        el('div', { class: 'hero-hat', 'aria-hidden': 'true', html: '<svg viewBox="0 0 96 96"><path d="M14 62a34 34 0 0 1 68 0" fill="#F2B705" stroke="#1F4D3A" stroke-width="4"/><path d="M40 30v-6a8 8 0 0 1 16 0v6" fill="none" stroke="#1F4D3A" stroke-width="4"/><rect x="8" y="60" width="80" height="12" rx="6" fill="#F2B705" stroke="#1F4D3A" stroke-width="4"/></svg>' }),
        el('h1', { text: 'Contractors & visitors' }),
        el('p', { class: 'muted', text: 'Sign in when you arrive and out when you leave – every visit. Doing work on site? Do the induction once a year first.' })
      ]),
      el('div', { class: 'big-actions' }, [
        bigBtn('Sign in', onMine ? 'You’re signed in already' : 'I’ve just arrived', 'in', 'primary', 0),
        bigBtn('Sign out', onMine ? 'Tap to sign out' : 'I’m leaving now', 'out', onMine ? 'primary' : '', 1),
        bigBtn('Contractor induction', 'First time, or once a year · about 10 min', 'induct', '', 2)
      ]),
      el('p', { class: 'foot muted center', text: D ? (n ? n + ' signed in on site right now' : 'Nobody signed in on site right now') : '' })
    ]);
  }
  function bigBtn(t, s, v, cls, i) {
    return el('button', { type: 'button', class: 'big ' + (cls || '') + ' anim-in', style: '--i:' + (i + 1), onclick: function () { history.replaceState(null, '', '?' + v + (siteHint ? '&site=' + siteHint : '')); go(v); } }, [
      el('span', { class: 'big-t', text: t }), el('span', { class: 'big-s', text: s })
    ]);
  }

  /* ------------------------------------------------------------- sign in */

  function signIn() {
    $('brandSub').textContent = 'Sign in';
    var mine = I.local.get(LS.visit);
    var me = mine && D && D.onSite.find(function (x) { return x.id === mine; });
    if (me) {
      return render([back(), el('div', { class: 'card anim-in' }, [
        el('h2', { text: 'You’re signed in' }),
        el('p', { text: me.name + ' · ' + me.site + ' · since ' + hm(me.since) }),
        el('button', { type: 'button', class: 'btn primary wide', text: 'Sign out now', onclick: function () { go('out'); } }),
        el('button', { type: 'button', class: 'btn ghost wide mt8', text: 'Sign in someone else', onclick: function () { I.local.del(LS.visit); signIn(); } })
      ])]);
    }
    var st = { type: '', site: siteHint || I.local.get(LS.site) || '', high: [] };
    var name = input({ id: 'ciName', list: 'peopleList', autocomplete: 'name', placeholder: 'First and last name', value: I.local.get(LS.name) || '' });
    var dl = el('datalist', { id: 'peopleList' }, (D.people || []).filter(function (p) { return p.status === 'Current'; }).map(function (p) { return el('option', { value: p.name }); }));
    var status = el('div', { class: 'who-status', 'aria-live': 'polite' });
    var typeBox = el('div', { class: 'sites two' });
    var siteBox = el('div', { class: 'sites three' });
    var more = el('div');
    var err = el('p', { class: 'err', role: 'alert' });
    var need = el('div', { class: 'need', 'aria-live': 'polite' });
    var btn = el('button', { type: 'button', class: 'btn primary wide', text: 'Sign in' });

    function types() {
      typeBox.innerHTML = '';
      [['work', 'Doing work', 'Trade, service, repairs, installs'], ['visit', 'Delivery or visit', 'Dropping off, quoting, meeting – no tools']].forEach(function (t, i) {
        typeBox.appendChild(el('button', { type: 'button', class: 'site anim-in', style: '--i:' + i, 'aria-pressed': String(st.type === t[0]), onclick: function () { st.type = t[0]; types(); fill(); } }, [
          el('div', { class: 's-name', text: t[1] }), el('div', { class: 's-sub', text: t[2] })
        ]));
      });
    }
    function sites() {
      siteBox.innerHTML = '';
      Object.keys(D.sites).forEach(function (k, i) {
        var nm = D.sites[k].split(': ');
        siteBox.appendChild(el('button', { type: 'button', class: 'site anim-in', style: '--i:' + i, 'aria-pressed': String(st.site === k), onclick: function () { st.site = k; setAddr(k); sites(); fill(); } }, [
          el('div', { class: 's-name', text: nm[nm.length - 1].replace(/^./, function (c) { return c.toUpperCase(); }) }), el('div', { class: 's-sub', text: nm.length > 1 ? nm[0] : '' })
        ]));
      });
    }
    function who() {
      var p = personOf(name.value);
      status.className = 'who-status';
      status.innerHTML = '';
      if (!name.value.trim() || name.value.trim().split(/\s+/).length < 2) return p;
      if (p && p.status === 'Current') { status.classList.add('ok'); status.textContent = '✓ Inducted · ' + p.company + ' · valid to ' + fmtDate(p.validUntil); }
      else if (p && p.status === 'Expired') { status.classList.add('bad'); status.textContent = 'Induction expired ' + fmtDate(p.validUntil) + ' – needed again before doing work.'; }
      else if (st.type === 'work') { status.classList.add('bad'); status.append('No induction on file. ', el('button', { type: 'button', class: 'link-btn', text: 'Do the induction', onclick: function () { I.local.set(LS.name, name.value.trim()); go('induct'); } }), ' first – it takes about 10 minutes.'); }
      return p;
    }
    var f = {};
    function snap() {
      var s = { high: st.high.slice() };
      ['company', 'phone', 'work', 'where', 'hostOther'].forEach(function (k) { if (f[k]) s[k] = f[k].value; });
      if (f.host) s.host = f.host.value;
      if (f.rules) s.rules = f.rules.checked;
      var sw = more.querySelector('input[name=swms]:checked'); if (sw) s.swms = sw.value;
      return s;
    }
    function restore(s) {
      ['company', 'phone', 'work', 'where', 'hostOther'].forEach(function (k) { if (f[k] && s[k] !== undefined) f[k].value = s[k]; });
      if (f.host && s.host !== undefined) { f.host.value = s.host; f.hostOther.hidden = s.host !== '__other'; }
      if (f.rules && s.rules) f.rules.checked = true;
      if (st.type === 'work' && s.high.length) {
        more.querySelectorAll('.checks input[type=checkbox]').forEach(function (cb) { if (s.high.indexOf(cb.value) >= 0) cb.checked = true; });
        st.high = s.high.filter(function (h) { return D.highRisk.indexOf(h) >= 0; });
        var box = more.querySelector('.swms'); if (box) box.hidden = !st.high.length;
        if (s.swms) { var r = more.querySelector('input[name=swms][value=' + s.swms + ']'); if (r) r.checked = true; }
      }
    }
    var pKey = '';
    function personKey() { var p = personOf(name.value); return p ? p.name + '|' + p.status : ''; }
    function fill() {
      var kept = snap();
      more.innerHTML = '';
      pKey = personKey();
      var p = who();
      if (!st.type || !st.site) { ready(); return; }
      if (st.type === 'visit' || !p) {
        f.company = input({ placeholder: 'Company', value: (p && p.company) || I.local.get(LS.company) || '' });
        more.appendChild(field('Company', f.company, null, st.type === 'visit'));
      } else f.company = null;
      f.phone = input({ type: 'tel', inputmode: 'tel', placeholder: 'Mobile', value: I.local.get(LS.phone) || '' });
      more.appendChild(field('Mobile number', f.phone, 'So we can reach you in an emergency', !(st.type === 'work' && p)));
      if (st.type === 'work') {
        f.work = el('textarea', { rows: 2, placeholder: 'e.g. Service the pump station switchboard' });
        more.appendChild(field('What are you doing today?', f.work, null, true));
        f.where = input({ placeholder: st.site === 'course' ? 'e.g. Pump shed, 7th hole, workshop' : 'e.g. Kitchen, range, function room' });
        more.appendChild(field('Where on site?', f.where));
      } else { f.work = input({ placeholder: 'e.g. Parts delivery, quote, meeting' }); more.appendChild(field('Reason for visit', f.work, null, true)); f.where = null; }
      // host
      f.host = el('select', {}, [el('option', { value: '', text: 'Choose…' })].concat((D.staff || []).map(function (n) { return el('option', { value: n, text: n }); })).concat([el('option', { value: '__other', text: 'Someone else…' })]));
      f.hostOther = input({ placeholder: 'Their name', hidden: true });
      f.host.onchange = function () { f.hostOther.hidden = f.host.value !== '__other'; ready(); };
      more.appendChild(field('Who are you here to see?', el('div', {}, [f.host, f.hostOther]), null, true));
      // high risk
      if (st.type === 'work') {
        var hr = el('div', { class: 'checks' });
        st.high = [];
        D.highRisk.forEach(function (h) {
          var cb = el('input', { type: 'checkbox', value: h, onchange: function () { st.high = Array.prototype.slice.call(hr.querySelectorAll('input:checked')).map(function (x) { return x.value; }); swmsBox.hidden = !st.high.length; ready(); } });
          hr.appendChild(el('label', { class: 'check' }, [cb, el('span', { text: h })]));
        });
        more.appendChild(field('Any high-risk work today?', hr, 'Tick all that apply. None? Leave them all blank.'));
        var swmsBox = el('div', { class: 'field swms', hidden: true }, [
          rl('SWMS for today’s high-risk work'),
          radio('swms', 'given', 'I’ve given it to my host'),
          radio('swms', 'onsite', 'It’s on site with my crew and my host has seen it'),
          el('div', { class: 'f-sub warnline', text: 'No SWMS? Don’t start the high-risk work – talk to your host.' })
        ]);
        more.appendChild(swmsBox);
      }
      // site rules
      var info = SITE_INFO[st.site];
      f.rules = el('input', { type: 'checkbox', onchange: ready });
      more.appendChild(el('div', { class: 'rules anim-in' }, [
        el('div', { class: 'rules-h', text: 'Site rules – ' + D.sites[st.site] }),
        el('ul', {}, ['Call **000** in an emergency, then your host'].concat(info.rules).concat(['Sign out before you leave']).map(function (r) { return el('li', {}, md(r)); })),
        el('label', { class: 'check strong' }, [f.rules, el('span', {}, ['I have read the site rules and will follow them', req()])])
      ]));
      more.querySelectorAll('input,textarea,select').forEach(function (x) { x.addEventListener('input', ready); x.addEventListener('change', ready); });
      restore(kept);
      ready();
    }
    function radio(group, val, text) {
      return el('label', { class: 'check' }, [el('input', { type: 'radio', name: group, value: val, onchange: ready }), el('span', { text: text })]);
    }
    function hostVal() { return f.host ? (f.host.value === '__other' ? f.hostOther.value.trim() : f.host.value) : ''; }
    function missing() {
      var p = personOf(name.value);
      if (name.value.trim().split(/\s+/).length < 2) return { msg: 'Enter your first and last name.', at: name };
      if (!st.type) return { msg: 'Choose why you’re here: doing work, or a delivery or visit.', at: typeBox };
      if (!st.site) return { msg: 'Choose which site you’re at.', at: siteBox };
      if (st.type === 'work' && !(p && p.status === 'Current')) return { induct: true, msg: p && p.status === 'Expired'
        ? 'Your induction expired ' + fmtDate(p.validUntil) + '. Do it again before signing in to work.'
        : 'Doing work on site needs the contractor induction first. It’s once a year and takes about 10 minutes.' };
      if (st.type === 'visit' && !(f.company && f.company.value.trim().length > 1)) return { msg: 'Enter your company.', at: f.company };
      if (!(f.phone && (f.phone.value.replace(/\D/g, '').length >= 8 || (st.type === 'work' && p)))) return { msg: 'Enter your mobile number.', at: f.phone };
      if (!(f.work && f.work.value.trim().length > 2)) return { msg: st.type === 'work' ? 'Say what you’re doing today.' : 'Enter the reason for your visit.', at: f.work };
      if (hostVal().length < 2) return { msg: 'Choose who you’re here to see.', at: f.host.value === '__other' ? f.hostOther : f.host };
      if (st.type === 'work' && st.high.length && !more.querySelector('input[name=swms]:checked')) return { msg: 'Tell us where the SWMS is for today’s high-risk work.', at: more.querySelector('.swms') };
      if (!(f.rules && f.rules.checked)) return { msg: 'Tick that you’ve read the site rules.', at: f.rules };
      return null;
    }
    function goInduct() {
      I.local.set(LS.name, name.value.trim());
      if (f.phone && f.phone.value.trim()) I.local.set(LS.phone, f.phone.value.trim());
      if (f.company && f.company.value.trim()) I.local.set(LS.company, f.company.value.trim());
      history.replaceState(null, '', '?induct' + (siteHint ? '&site=' + siteHint : ''));
      go('induct');
    }
    function ready() {
      var m = missing();
      btn.classList.toggle('not-ready', !!m);
      if (!m || (err.textContent && err.textContent !== m.msg)) err.textContent = '';
      need.innerHTML = '';
      need.className = 'need';
      if (m && m.induct) {
        need.classList.add('induct');
        need.append(el('p', { text: m.msg }), el('button', { type: 'button', class: 'btn primary wide', text: 'Do the induction now', onclick: goInduct }));
      }
      return m;
    }
    function showMissing(m) {
      if (m.induct) { need.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      err.textContent = m.msg;
      if (m.at) {
        m.at.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(m.at.tagName) && m.at.type !== 'checkbox') setTimeout(function () { m.at.focus({ preventScroll: true }); }, 350);
        var box = m.at.closest ? (m.at.closest('.field, .rules, .sites') || m.at) : m.at;
        box.classList.remove('flag'); void box.offsetWidth; box.classList.add('flag');
      }
    }
    name.addEventListener('input', function () { if (personKey() !== pKey) fill(); else { who(); ready(); } });
    btn.onclick = function () {
      err.textContent = '';
      var m = ready();
      if (m) return showMissing(m);
      btn.disabled = true; btn.textContent = 'Signing in…';
      var sw = document.querySelector('input[name=swms]:checked');
      body = { action: 'conIn', type: st.type, site: st.site, name: name.value.trim(), company: f.company ? f.company.value.trim() : '', phone: f.phone.value.trim(),
        work: f.work.value.trim(), where: f.where ? f.where.value.trim() : '', host: hostVal(), highRisk: st.high, swms: sw ? sw.value : '', rules: true, ua: navigator.userAgent };
      I.post(body).then(function (r) {
        I.local.set(LS.name, body.name); I.local.set(LS.visit, r.id); I.local.set(LS.site, st.site);
        if (body.phone) I.local.set(LS.phone, body.phone);
        if (body.company) I.local.set(LS.company, body.company);
        done(r);
      }).catch(function (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = 'Sign in'; });
    };
    function done(r) {
      load().catch(function () {});
      var info = SITE_INFO[st.site];
      render([el('div', { class: 'card hero anim-in' }, [
        el('div', { class: 'big-tick', html: '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="#2E7D5B"/><path d="M15 27l7 7 15-16" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
        el('h1', { text: r.already ? 'Already signed in' : 'Signed in' }),
        el('p', { class: 'muted', text: (r.name || body.name) + ' · ' + (r.site || D.sites[st.site]) + ' · ' + hm(r.since) }),
        r.alerts && r.alerts.length ? el('div', { class: 'alertbox' }, r.alerts.map(function (a) { return el('div', { text: '⚠ ' + a }); })) : null,
        el('div', { class: 'rules left' }, [el('div', { class: 'rules-h', text: 'Remember' }), el('ul', {}, ['Report to your host now', 'Emergency: **000**, then your host'].concat(info.rules.slice(0, 2)).concat(['**Sign out on this page before you leave**']).map(function (x) { return el('li', {}, md(x)); }))]),
        el('button', { type: 'button', class: 'btn ghost wide', text: 'Done', onclick: function () { history.replaceState(null, '', 'contractors.html' + (siteHint ? '?site=' + siteHint : '')); go('home'); } })
      ])]);
      I.confetti && !r.already && I.confetti();
    }
    var body;
    render([back(), el('div', { class: 'card anim-in' }, [
      el('h2', { text: 'Sign in' }), reqNote(),
      field('Your name', el('div', {}, [name, dl, status]), null, true),
      rl('Why are you here?'), typeBox,
      rl('Which site?'), siteBox,
      more, need, err, btn
    ])]);
    if (st.site) setAddr(st.site);
    types(); sites(); fill();
  }

  /* ------------------------------------------------------------ sign out */

  function signOut() {
    $('brandSub').textContent = 'Sign out';
    var mine = I.local.get(LS.visit);
    var list = (D.onSite || []).slice().sort(function (a, b) { return (b.id === mine) - (a.id === mine); });
    var err = el('p', { class: 'err', role: 'alert' });
    var rows = list.map(function (x, i) {
      var b = el('button', { type: 'button', class: 'btn ' + (x.id === mine ? 'primary' : 'ghost') + ' small', text: 'Sign out' });
      b.onclick = function () {
        b.disabled = true; b.textContent = '…'; err.textContent = '';
        var by = x.id === mine ? '' : (I.local.get('rs_name') || I.local.get(LS.name) || '');
        I.post({ action: 'conOut', id: x.id, by: by }).then(function () {
          if (x.id === mine) I.local.del(LS.visit);
          row.classList.add('gone');
          b.textContent = 'Signed out ✓';
          I.toast((x.name.split(' ')[0]) + ' signed out. Safe travels.');
          load().catch(function () {});
        }).catch(function (e) { err.textContent = e.message; b.disabled = false; b.textContent = 'Sign out'; });
      };
      var row = el('div', { class: 'out-row anim-in' + (x.id === mine ? ' mine' : ''), style: '--i:' + i }, [
        el('div', {}, [el('div', { class: 'o-name', text: x.name + (x.id === mine ? ' (you)' : '') }),
          el('div', { class: 'o-sub', text: x.company + ' · ' + siteShort(x.site) + ' · in ' + I.dayMon(x.since) + ' ' + hm(x.since) + (x.host ? ' · host ' + x.host : '') })]),
        b
      ]);
      return row;
    });
    render([back(), el('div', { class: 'card anim-in' }, [
      el('h2', { text: 'Sign out' }),
      list.length ? el('p', { class: 'muted', text: 'Tap your name. Signing someone out for them? Only do it once you know they have left.' }) : el('p', { class: 'muted', text: 'Nobody is signed in on site right now.' }),
      el('div', { class: 'out-list' }, rows), err
    ])]);
  }

  /* ----------------------------------------------------------- induction */

  function induct() {
    $('brandSub').textContent = 'Contractor induction';
    var S = { step: 0, d: {}, high: [], sites: siteHint ? [siteHint] : [], pl: [], lic: [], readStart: 0, qi: 0, order: [], firstWrong: {}, answers: [] };
    var steps = ['Your details', 'Insurance & licences', 'Induction', 'Knowledge check', 'Sign'];
    var bar = el('div', { class: 'steps' });
    var box = el('div');
    var err = el('p', { class: 'err', role: 'alert' });
    var nav = el('div', { class: 'row-btns' });
    var pad = null;

    function head() {
      bar.innerHTML = '';
      steps.forEach(function (s, i) { bar.appendChild(el('span', { class: 'stp' + (i < S.step ? ' done' : i === S.step ? ' on' : ''), text: (i + 1) + '. ' + s })); });
    }
    function inp(key, attrs) {
      var x = input(Object.assign({ value: S.d[key] || '' }, attrs || {}));
      x.addEventListener('input', function () { S.d[key] = x.value; });
      return x;
    }
    function photoPicker(list, label) {
      var wrap = el('div', { class: 'photos' });
      function draw() {
        wrap.innerHTML = '';
        list.forEach(function (src, i) {
          wrap.appendChild(el('div', { class: 'ph' }, [el('img', { src: src, alt: label }), el('button', { type: 'button', class: 'ph-x', 'aria-label': 'Remove photo', text: '×', onclick: function () { list.splice(i, 1); draw(); } })]));
        });
        if (list.length < 3) wrap.appendChild(el('button', { type: 'button', class: 'ph-add', text: '+ Photo', onclick: function () {
          var pin = $('photoIn');
          pin.value = '';
          pin.onchange = function () {
            var file = pin.files && pin.files[0];
            if (!file) return;
            I.shrinkPhoto(file, 1600, 0.72).then(function (src) { list.push(src); draw(); }).catch(function (e) { err.textContent = e.message; });
          };
          pin.click();
        } }));
      }
      draw();
      return wrap;
    }

    function step0() {
      var d = S.d;
      if (!d.name && I.local.get(LS.name)) d.name = I.local.get(LS.name);
      if (!d.company && I.local.get(LS.company)) d.company = I.local.get(LS.company);
      if (!d.phone && I.local.get(LS.phone)) d.phone = I.local.get(LS.phone);
      var hr = el('div', { class: 'checks' });
      D.highRisk.forEach(function (h) {
        var cb = el('input', { type: 'checkbox', value: h, checked: S.high.indexOf(h) >= 0, onchange: function () { S.high = Array.prototype.slice.call(hr.querySelectorAll('input:checked')).map(function (x) { return x.value; }); } });
        hr.appendChild(el('label', { class: 'check' }, [cb, el('span', { text: h })]));
      });
      var sb = el('div', { class: 'checks' });
      Object.keys(D.sites).forEach(function (k) {
        sb.appendChild(el('label', { class: 'check' }, [el('input', { type: 'checkbox', value: k, checked: S.sites.indexOf(k) >= 0, onchange: function () { S.sites = Array.prototype.slice.call(sb.querySelectorAll('input:checked')).map(function (x) { return x.value; }); } }), el('span', { text: D.sites[k] })]));
      });
      return [
        reqNote(),
        field('Your name', inp('name', { autocomplete: 'name', placeholder: 'First and last name' }), null, true),
        field('Company', inp('company', { autocomplete: 'organization', placeholder: 'Or “Self-employed”' }), null, true),
        field('Mobile', inp('phone', { type: 'tel', inputmode: 'tel', autocomplete: 'tel' }), null, true),
        field('Email', inp('email', { type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'Optional' })),
        field('What work do you do?', inp('trade', { placeholder: 'e.g. Electrician, irrigation tech, arborist, fencing' }), null, true),
        field('Which sites do you work at?', sb, null, true),
        field('Does your work include any of these?', hr, 'Tick any that you do at our sites. These are high-risk and need a licence or ticket and a SWMS.'),
        el('div', { class: 'grid2' }, [field('Emergency contact', inp('ecName', { placeholder: 'Name' }), null, true), field('Their phone', inp('ecPhone', { type: 'tel', inputmode: 'tel' }), null, true)])
      ];
    }
    function check0() {
      var d = S.d;
      if (String(d.name || '').trim().split(/\s+/).length < 2) return 'Enter your first and last name.';
      if (String(d.company || '').trim().length < 2) return 'Enter your company (or “Self-employed”).';
      if (String(d.phone || '').replace(/\D/g, '').length < 8) return 'Enter your mobile number.';
      if (String(d.trade || '').trim().length < 3) return 'Tell us what work you do.';
      if (!S.sites.length) return 'Pick at least one site.';
      if (String(d.ecName || '').trim().length < 2 || String(d.ecPhone || '').replace(/\D/g, '').length < 8) return 'Add an emergency contact name and phone.';
      return '';
    }
    function step1() {
      var high = S.high.length > 0;
      var wc = el('div', { class: 'checks' }, [['Yes', 'Yes – I have / my employer has WorkCover'], ['No employees', 'I don’t employ anyone (sole trader)'], ['No', 'No']].map(function (o) {
        return el('label', { class: 'check' }, [el('input', { type: 'radio', name: 'wc', value: o[0], checked: S.d.wc === o[0], onchange: function () { S.d.wc = o[0]; } }), el('span', { text: o[1] })]);
      }));
      var emailed = el('label', { class: 'check' }, [el('input', { type: 'checkbox', checked: !!S.d.plEmailed, onchange: function (e) { S.d.plEmailed = e.target.checked; } }), el('span', { text: 'I’ve emailed it to the Club instead' })]);
      var kids = [
        el('p', { class: 'muted', text: 'Public liability insurance is needed for any work on site. A photo of the certificate of currency is fine.' }),
        reqNote(),
        field('Public liability insurer', inp('plInsurer', { placeholder: 'e.g. QBE, Allianz, CGU' }), null, true),
        field('Policy expiry date', inp('plExpiry', { type: 'date' }), null, true),
        field('Certificate of currency', el('div', {}, [photoPicker(S.pl, 'Certificate of currency'), emailed]), 'A photo, or tick that you’ve emailed it', true),
        field('WorkCover', wc, 'If you employ workers you need WorkCover insurance in Victoria.', true)
      ];
      if (high) {
        kids.push(field('Licences and tickets', el('textarea', { rows: 3, placeholder: 'e.g. A-grade electrical licence REC 12345; HRWL forklift; ACUP; chainsaw', oninput: function (e) { S.d.lic = e.target.value; } }, [S.d.lic || '']), 'Needed for the high-risk work you ticked', true));
        kids.push(field('Photo of licences / tickets', photoPicker(S.lic, 'Licence')));
        kids.push(field('SWMS', el('div', { class: 'checks' }, [['each', 'I’ll give my host a SWMS for each high-risk job before I start'], ['given', 'I’ve already given my SWMS to the Club']].map(function (o) {
          return el('label', { class: 'check' }, [el('input', { type: 'radio', name: 'swmsI', value: o[0], checked: S.d.swms === o[0], onchange: function () { S.d.swms = o[0]; } }), el('span', { text: o[1] })]);
        })), 'High-risk work needs a Safe Work Method Statement before it starts', true));
      } else {
        kids.push(field('Licences and tickets', el('textarea', { rows: 2, placeholder: 'Optional – any that apply to your work', oninput: function (e) { S.d.lic = e.target.value; } }, [S.d.lic || ''])));
      }
      return kids;
    }
    function check1() {
      var d = S.d;
      if (String(d.plInsurer || '').trim().length < 2) return 'Enter your public liability insurer.';
      if (!d.plExpiry) return 'Enter the policy expiry date.';
      if (d.plExpiry < I.todayKey()) return 'That policy has expired. Talk to your host before starting work.';
      if (!S.pl.length && !d.plEmailed) return 'Add a photo of the certificate of currency, or tick that you’ve emailed it.';
      if (!d.wc) return 'Answer the WorkCover question.';
      if (S.high.length && String(d.lic || '').trim().length < 3) return 'List the licences or tickets you hold for the high-risk work.';
      if (S.high.length && !d.swms) return 'Tell us how you’ll provide your SWMS.';
      return '';
    }
    function step2() {
      if (!S.readStart) S.readStart = Date.now();
      return [el('p', { class: 'muted', text: 'Read each section. It takes a few minutes – the knowledge check is next.' })].concat(CON_INDUCTION.sections.map(function (sec, i) {
        return el('div', { class: 'ind-sec anim-in', style: '--i:' + i }, [
          el('div', { class: 'ind-n', text: String(i + 1) }),
          el('div', {}, [el('h3', { text: sec.t }), el('ul', {}, sec.pts.map(function (p) { return el('li', {}, md(p)); }))])
        ]);
      }));
    }
    function check2() {
      var left = CON_INDUCTION.minSeconds - Math.round((Date.now() - S.readStart) / 1000);
      return left > 0 ? 'Take a little longer to read it through (' + left + ' s).' : '';
    }
    function step3() {
      if (!S.order.length) S.order = CON_INDUCTION.quiz.map(function (q, i) { return i; });
      var qi = S.order[0];
      if (qi === undefined) return [el('div', { class: 'quiz-done', text: '✓ All questions answered correctly' })];
      var q = CON_INDUCTION.quiz[qi];
      var answered = CON_INDUCTION.quiz.length - S.order.length;
      var fb = el('div', { class: 'quiz-fb', hidden: true });
      var opts = el('div', { class: 'quiz-opts' }, q.o.map(function (o, j) {
        return el('button', { type: 'button', class: 'qopt', text: o, onclick: function () {
          if (opts.dataset.locked) return;
          S.answers[qi] = j;
          opts.dataset.locked = '1';
          checkAnswer(qi, j, this, fb, opts);
        } });
      }));
      return [el('div', { class: 'quiz-n', text: 'Question ' + (answered + 1) + ' of ' + CON_INDUCTION.quiz.length }), el('h3', { class: 'quiz-q', text: q.q }), opts, fb];
    }
    var KEY = [1, 2, 0, 2, 1, 3, 0, 1];   // same as the server; the server re-checks
    function checkAnswer(qi, j, btnEl, fb, opts) {
      var ok = KEY[qi] === j;
      btnEl.classList.add(ok ? 'right' : 'wrong');
      if (!ok) { S.firstWrong[qi] = true; opts.children[KEY[qi]] && opts.children[KEY[qi]].classList.add('right'); }
      fb.hidden = false;
      fb.className = 'quiz-fb ' + (ok ? 'ok' : 'no');
      fb.textContent = (ok ? 'Correct. ' : 'Not quite. ') + CON_INDUCTION.quiz[qi].why + (ok ? '' : ' This one will come back round.');
      S.order.shift();
      if (!ok) S.order.push(qi);
      nav.querySelector('.primary').disabled = false;
      nav.querySelector('.primary').textContent = S.order.length ? 'Next question' : 'Continue';
    }
    function step4() {
      var canvas = el('canvas', { id: 'sig', 'aria-label': 'Signature pad' });
      var hint = el('span', { class: 'sig-hint', text: 'Sign here with your finger' });
      var dec = el('input', { type: 'checkbox', checked: !!S.d.declare, onchange: function (e) { S.d.declare = e.target.checked; } });
      var out = [
        el('div', { class: 'summary' }, [
          el('div', { html: '<strong>' + I.esc(S.d.name) + '</strong> · ' + I.esc(S.d.company) }),
          el('div', { class: 'muted', text: S.d.trade + ' · ' + (S.high.length ? 'High risk' : 'Medium risk') + ' · valid ' + (D.validMonths || 12) + ' months' })
        ]),
        el('label', { class: 'check strong' }, [dec, el('span', {}, [D.declaration, req()])]),
        rl('Signature'),
        el('div', { class: 'sig-wrap' }, [canvas, hint, el('button', { type: 'button', class: 'link-btn sig-clear', text: 'Clear', onclick: function () { pad.clear(); } })])
      ];
      setTimeout(function () { pad = I.SigPad(canvas, hint, function () {}); }, 30);
      return out;
    }

    function draw() {
      head();
      err.textContent = '';
      box.innerHTML = '';
      var kids = [step0, step1, step2, step3, step4][S.step]();
      kids.forEach(function (k) { if (k) box.appendChild(k); });
      nav.innerHTML = '';
      if (S.step > 0 && S.step !== 3) nav.appendChild(el('button', { type: 'button', class: 'btn ghost', text: 'Back', onclick: function () { S.step--; draw(); window.scrollTo(0, 0); } }));
      var next = el('button', { type: 'button', class: 'btn primary', text: S.step === 4 ? 'Finish induction' : 'Next' });
      if (S.step === 3 && S.order.length && S.order.length <= CON_INDUCTION.quiz.length) {
        next.disabled = true; next.textContent = 'Pick an answer';
        if (S.order[0] === undefined) { next.disabled = false; next.textContent = 'Continue'; }
      }
      next.onclick = function () {
        if (S.step === 3 && S.order.length) { draw(); return; }
        var e = [check0, check1, check2, function () { return ''; }, function () { return ''; }][S.step]();
        if (e) { err.textContent = e; return; }
        if (S.step === 4) return submit(next);
        S.step++; draw(); window.scrollTo(0, 0);
      };
      nav.appendChild(next);
    }
    function submit(btn) {
      if (!S.d.declare) { err.textContent = 'Tick the declaration.'; return; }
      if (!pad || !pad.has()) { err.textContent = 'Sign with your finger.'; return; }
      btn.disabled = true; btn.textContent = 'Saving…';
      var wrong = Object.keys(S.firstWrong).length;
      var body = { action: 'conInduct', version: CON_INDUCTION.version, name: S.d.name.trim(), company: S.d.company.trim(), phone: S.d.phone.trim(), email: String(S.d.email || '').trim(),
        trade: S.d.trade.trim(), sites: S.sites, highRisk: S.high, ecName: S.d.ecName.trim(), ecPhone: S.d.ecPhone.trim(),
        plInsurer: S.d.plInsurer.trim(), plExpiry: S.d.plExpiry, plPhotos: S.pl, plEmailed: !!S.d.plEmailed, workCover: S.d.wc,
        licences: String(S.d.lic || '').trim(), licPhotos: S.lic, swms: S.d.swms || '', answers: KEY.slice(), quizFirstTry: CON_INDUCTION.quiz.length - wrong,
        declare: true, signature: pad.png(), ua: navigator.userAgent };
      I.post(body).then(function (r) {
        I.local.set(LS.name, r.name); I.local.set(LS.phone, body.phone); I.local.set(LS.company, body.company);
        return load().then(function () { return r; }, function () { return r; });
      }).then(function (r) {
        render([el('div', { class: 'card hero anim-in' }, [
          el('div', { class: 'big-tick', html: '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="#2E7D5B"/><path d="M15 27l7 7 15-16" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
          el('h1', { text: 'Induction done' }),
          el('p', { class: 'muted', text: r.name + ' · valid to ' + fmtDate(r.validUntil) + ' · ref ' + r.receipt }),
          el('button', { type: 'button', class: 'btn primary wide', text: 'Sign in now', onclick: function () { history.replaceState(null, '', '?in' + (siteHint ? '&site=' + siteHint : '')); go('in'); } })
        ])]);
        I.confetti && I.confetti();
      }).catch(function (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = 'Finish induction'; });
    }

    render([back(), el('div', { class: 'card anim-in' }, [el('h2', { text: 'Contractor induction' }), bar, box, err, nav])]);
    draw();
  }

  /* ------------------------------------------------------------ register */

  function register() {
    $('brandSub').textContent = 'Contractor register';
    document.querySelectorAll('.top .wrap, .emergency .wrap, main.wrap').forEach(function (w) { w.classList.add('wide-main'); });
    var today = I.todayKey();
    var people = D.people || [];
    var cur = people.filter(function (p) { return p.status === 'Current'; });
    var soon = cur.filter(function (p) { var n = I.daysUntil(p.validUntil); return n !== null && n <= 30; });
    var plBad = cur.filter(function (p) { return !p.plExpiry || p.plExpiry < today; });
    var plSoon = cur.filter(function (p) { var n = I.daysUntil(p.plExpiry); return n !== null && n >= 0 && n <= 30; });
    var d30 = new Date(); d30.setDate(d30.getDate() - 30);
    var rec30 = (D.recent || []).filter(function (v) { return new Date(v.at) >= d30; });
    var high30 = rec30.filter(function (v) { return v.high; });
    var noOut = (D.recent || []).filter(function (v) { return !v.out && I.keyOf(new Date(v.at)) < today; });

    function tile(n, l, cls, i) { return el('div', { class: 'tile anim-in ' + (cls || ''), style: '--i:' + i }, [el('div', { class: 'n', text: String(n) }), el('div', { class: 'l', text: l })]); }
    function tbl(headers, rows, empty) {
      if (!rows.length) return el('p', { class: 'muted', text: empty });
      return el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl' }, [
        el('thead', {}, [el('tr', {}, headers.map(function (h) { return el('th', { text: h }); }))]),
        el('tbody', {}, rows.map(function (r, i) { return el('tr', { style: '--i:' + i }, r.map(function (c) { return typeof c === 'object' && c ? el('td', {}, [c]) : el('td', { text: c === undefined ? '' : String(c) }); })); }))
      ])]);
    }
    function flag(text, cls) { return el('span', { class: 'flag ' + cls, text: text }); }
    function due(k) {
      if (!k) return flag('Not on file', 'bad');
      var n = I.daysUntil(k);
      if (n < 0) return flag('Expired ' + fmtDate(k), 'bad');
      if (n <= 30) return flag(fmtDate(k) + ' · ' + n + ' d', 'soon');
      return el('span', { text: fmtDate(k) });
    }
    render([
      el('div', { class: 'reg-head' }, [el('h1', { text: 'Contractor register' }), el('p', { class: 'muted', text: 'Inductions, insurance and every sign-in across Ranfurlie and Amstel. Phone numbers and documents are in the register sheet.' })]),
      el('div', { class: 'tiles five' }, [
        tile(D.onSite.length, 'On site now', D.onSite.length ? 'yes' : '', 0),
        tile(cur.length, 'Inducted (current)', '', 1),
        tile(soon.length + plSoon.length, 'Expiring in 30 days', soon.length + plSoon.length ? 'na' : '', 2),
        tile(plBad.length, 'Insurance missing/expired', plBad.length ? 'no' : '', 3),
        tile(rec30.length, 'Visits, last 30 days', '', 4)
      ]),
      el('div', { class: 'panel anim-in' }, [el('div', { class: 'panel-head' }, [el('h2', { text: 'On site now' })]),
        tbl(['Name', 'Company', 'Site', 'Where', 'Host', 'In since', ''], D.onSite.map(function (x) { return [x.name, x.company, siteShort(x.site), x.where, x.host, I.dayMon(x.since) + ' ' + hm(x.since), x.high ? flag('High-risk', 'bad') : '']; }), 'Nobody signed in.')]),
      noOut.length ? el('div', { class: 'panel anim-in' }, [el('div', { class: 'panel-head' }, [el('h2', { text: 'Never signed out' })]),
        el('p', { class: 'muted', text: 'Earlier visits still open. Check with the host and sign them out so the roll call stays accurate.' }),
        tbl(['Date', 'Name', 'Company', 'Site', 'Host'], noOut.map(function (v) { return [I.dayMon(v.at) + ' ' + hm(v.at), v.name, v.company, siteShort(v.site), v.host]; }), '')]) : null,
      el('div', { class: 'panel anim-in' }, [el('div', { class: 'panel-head' }, [el('h2', { text: 'Inducted contractors' })]),
        tbl(['Name', 'Company', 'Work', 'Risk', 'Induction valid to', 'Public liability to'], people.map(function (p) {
          return [p.name, p.company, p.trade, flag(p.risk, p.risk === 'High' ? 'bad' : 'soon'), p.status === 'Current' ? due(p.validUntil) : flag(p.status, 'bad'), due(p.plExpiry)];
        }), 'No contractors inducted yet. Send them the link or the QR poster.')]),
      el('div', { class: 'panel anim-in' }, [el('div', { class: 'panel-head' }, [el('h2', { text: 'Visits (last 90 days)' }), el('span', { class: 'muted', text: high30.length ? high30.length + ' high-risk in the last 30 days' : '' })]),
        tbl(['In', 'Out', 'Name', 'Company', 'Type', 'Site', 'Work', 'Host', 'High-risk'], (D.recent || []).map(function (v) {
          return [I.dayMon(v.at) + ' ' + hm(v.at), v.out ? hm(v.out) : flag('Open', 'soon'), v.name, v.company, v.type, siteShort(v.site), v.work, v.host, v.high];
        }), 'No visits yet.')]),
      el('p', { class: 'foot muted', text: 'Updated ' + I.when(D.generated) })
    ]);
  }

  /* --------------------------------------------------------------- start */

  function init() {
    if (!I.API) { notice('This page is being set up. Check back soon.'); return; }
    if (siteHint) setAddr(siteHint);
    render([el('p', { class: 'muted center', text: 'Loading…' })]);
    load().then(function () {
      var v = qs.get('view') === 'register' ? 'register' : qs.has('out') ? 'out' : qs.has('in') ? 'in' : qs.has('induct') ? 'induct' : 'home';
      go(v);
    }).catch(function (x) { render([]); notice('Could not load: ' + x.message + ' Check your signal and reload.'); });
  }
  init();
})();
