/* =====================================================================
   Backend from Zero — Teacher mode (styled like the Networking site)
   - voice: recorded narration (Kokoro · Emma) from assets/audio/manifest.js,
     falling back to the browser's speech when a recording is missing/out of date
   - big yellow captions with the current word underlined
   - "?" term chips (glossary) under the captions
   - scenes: an animation, a practice stop (the real exercise moves in and the
     teacher waits), or a pointer at the page
   Lessons: teacher-lessons.js · glossary: teacher-glossary.js · icons: teacher-icons.js
   ===================================================================== */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) {
      if (k === null || k === undefined || k === false) continue;
      e.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
    return e;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bfz:tm:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bfz:tm:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const icon = (emoji, name) => (name && window.BFZ_ICONS && window.BFZ_ICONS[name]) || (window.BFZ_ICON_FOR && window.BFZ_ICON_FOR(emoji)) || null;
  const iconEl = (emoji, name, cls) => {
    const svg = icon(emoji, name);
    return svg ? h('span', { class: 'tm-ico ' + (cls || ''), html: svg }) : (emoji ? h('span', { class: 'tm-ico tm-ico-emoji ' + (cls || '') }, emoji) : null);
  };
  // the teacher's face: assets/teacher-avatar.png (falls back to a drawn person)
  const AVATAR = 'assets/teacher-avatar.webp';
  const avatarImg = (cls) => {
    const wrap = h('span', { class: 'tm-face ' + (cls || '') });
    const img = h('img', { src: AVATAR, alt: '', draggable: 'false' });
    img.onerror = () => { wrap.innerHTML = (window.BFZ_ICONS || {}).person || '🧑‍🏫'; wrap.classList.add('drawn'); };
    wrap.append(img);
    return wrap;
  };
  // same hash as tts/record.py: recordings are only used when the text still matches
  const textHash = t => { let x = 5381; for (let i = 0; i < t.length; i++) x = (Math.imul(x, 33) ^ t.charCodeAt(i)) >>> 0; return x.toString(16); };
  const ACCENT = {
    'index.html': '#F08B3E', '00-setup.html': '#F08B3E', '01-javascript.html': '#3FBC7B', '02-how-the-web-works.html': '#6A9BF2',
    '03-first-server.html': '#A88BF5', '04-routes-controllers.html': '#F07AA8', '05-async-mysql.html': '#F2B33D', '06-sql.html': '#3DC6D2',
    '07-security.html': '#A6C94A', '08-joins-cookies.html': '#F08B3E', 'course-project.html': '#6A9BF2', '09-build-it.html': '#3FBC7B', '10-cheatsheet.html': '#A88BF5',
  };

  // ---------------------------------------------------------------- browser speech (fallback only)
  const synth = window.speechSynthesis || null;
  let voices = [];
  function loadVoices() { if (synth) voices = synth.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang)); }
  if (synth) { loadVoices(); if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices); else synth.onvoiceschanged = loadVoices; }
  function pickVoice() {
    if (!voices.length) return null;
    const prefs = [/sonia|libby|emma|hazel/i, /natural/i, /google uk english female/i, /aria|jenny/i, /google us english/i];
    for (const p of prefs) { const v = voices.find(x => p.test(x.name)); if (v) return v; }
    return voices.find(x => /en-GB/i.test(x.lang)) || voices[0];
  }
  function sentences(text) {
    const out = [];
    const re = /[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (!m[0]) { re.lastIndex++; continue; }
      if (m[0].trim()) out.push({ text: m[0], start: m.index });
    }
    return out.length ? out : [{ text, start: 0 }];
  }
  const estimateMs = (text, rate) => Math.max(1600, (text.split(/\s+/).length / 2.3) * 1000 / rate + 500);

  // ---------------------------------------------------------------- code helpers
  function splitHtmlLines(html) {
    const lines = [];
    let cur = '', stack = [];
    const re = /<span[^>]*>|<\/span>|\n|[^<\n]+|</g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const t = m[0];
      if (t === '\n') { cur += '</span>'.repeat(stack.length); lines.push(cur); cur = stack.join(''); }
      else if (t.startsWith('<span')) { stack.push(t); cur += t; }
      else if (t === '</span>') { stack.pop(); cur += t; }
      else cur += t;
    }
    lines.push(cur);
    return lines;
  }
  function highlight(code, lang) {
    if (window.hljs && lang !== 'plain') {
      try { return window.hljs.highlight(code, { language: lang || 'javascript', ignoreIllegals: true }).value; } catch (e) { /* fall through */ }
    }
    return esc(code);
  }
  function codeBlock(code, lang) {
    const el = h('code', { class: 'tm-codebody' });
    splitHtmlLines(highlight(code.replace(/\s+$/, ''), lang)).forEach((ln, i) => el.append(h('div', { class: 'tm-line', 'data-n': i + 1, html: ln || ' ' })));
    return h('pre', { class: 'tm-pre' }, el);
  }
  function typeLines(lines, totalMs, startDelay = 0) {
    const lens = lines.map(l => Math.max(1, l.textContent.length));
    const total = lens.reduce((a, b) => a + b, 0);
    const per = Math.min(38, Math.max(6, totalMs / total));
    let t = startDelay;
    if (REDUCE) return 0;
    lines.forEach((l, i) => {
      const d = Math.max(60, lens[i] * per);
      l.classList.add('tm-typing');
      l.style.setProperty('--n', lens[i]); l.style.setProperty('--d', d + 'ms'); l.style.setProperty('--delay', t + 'ms');
      t += d + 40;
    });
    return t;
  }

  // ---------------------------------------------------------------- renderers
  const R = {};

  R.title = (st, s) => {
    st.append(h('div', { class: 'tm-title-card' },
      iconEl(s.emoji, s.icon, 'tm-hero tm-pop'),
      s.kicker ? h('div', { class: 'tm-kicker tm-rise' }, s.kicker) : null,
      h('h2', { class: 'tm-rise d1' }, s.title),
      s.sub ? h('p', { class: 'tm-rise d2' }, s.sub) : null));
  };

  R.bullets = (st, s, ctx) => {
    const ul = h('ul', { class: 'tm-bullets' + (s.big ? ' big' : '') });
    st.append(ul);
    const items = s.items || [];
    const gap = Math.min(1700, (ctx.dur * 0.8) / Math.max(1, items.length));
    items.forEach((it, i) => ctx.after(250 + i * gap, () => {
      const [emo, text] = Array.isArray(it) ? it : [null, it];
      ul.append(h('li', { class: 'tm-pop-in' }, iconEl(emo, null, 'tm-li-ico'), h('span', { html: md(text) })));
    }));
  };

  R.code = (st, s, ctx) => {
    const box = h('div', { class: 'tm-code tm-rise' });
    if (s.file) box.append(h('div', { class: 'tm-file' }, s.file));
    const pre = codeBlock(s.code, s.lang);
    box.append(pre);
    const note = h('div', { class: 'tm-note', hidden: true });
    st.append(box, note);
    const lines = $$('.tm-line', pre);
    const typed = s.type === false ? 0 : typeLines(lines, Math.min(ctx.dur * 0.45, 5000), 200);
    const steps = s.hl || [];
    if (!steps.length) return;
    const start = typed + 300;
    const gap = Math.max(900, (ctx.dur * 0.92 - start) / steps.length);
    steps.forEach((stp, i) => ctx.after(start + i * gap, () => {
      const o = typeof stp === 'object' && !Array.isArray(stp) ? stp : { lines: stp };
      const ls = typeof o.lines === 'number' ? [o.lines] : (o.lines || []);
      lines.forEach(l => l.classList.remove('hl'));
      ls.forEach(n => { const l = lines[n - 1]; if (l) l.classList.add('hl'); });
      const first = lines[ls[0] - 1];
      if (first) first.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' });
      if (o.note) { note.hidden = false; note.classList.remove('tm-pop-in'); void note.offsetWidth; note.classList.add('tm-pop-in'); note.innerHTML = md(o.note); }
    }));
  };

  R.terminal = (st, s, ctx) => {
    const body = h('div', { class: 'tm-term-body' });
    st.append(h('div', { class: 'tm-term tm-rise' }, h('div', { class: 'tm-term-bar' }, h('i'), h('i'), h('i'), h('span', null, s.label || 'Terminal')), body));
    const prompt = s.prompt || 'PS C:\\Users\\you\\my-backend>';
    let t = 300;
    const cps = 28;
    (s.lines || []).forEach(line => {
      if (line.cmd !== undefined) {
        const typed = h('span', { class: 'tm-cmd' });
        const row = h('div', { class: 'tm-term-line' }, h('span', { class: 'tm-prompt' }, prompt + ' '), typed, h('span', { class: 'tm-caret' }));
        ctx.after(t, () => body.append(row));
        const text = line.cmd;
        for (let i = 1; i <= text.length; i++) ctx.after(t + 150 + i * cps, () => { typed.textContent = text.slice(0, i); });
        t += 150 + text.length * cps + 350;
        ctx.after(t - 50, () => { const c = $('.tm-caret', row); if (c) c.remove(); });
      } else {
        const row = h('div', { class: 'tm-term-out ' + (line.tone || '') }, line.out);
        ctx.after(t, () => body.append(row));
        t += line.wait || 260;
      }
    });
  };

  const TONE = { a: '#6A9BF2', g: '#3FBC7B', w: '#F2B33D', p: '#A88BF5', b: '#F07AA8', n: '#9BAAB4' };
  R.flow = (st, s, ctx) => {
    const wrap = h('div', { class: 'tm-flow' });
    const svgNS = 'http://www.w3.org/2000/svg';
    const lines = document.createElementNS(svgNS, 'svg');
    lines.setAttribute('class', 'tm-flow-lines');
    wrap.append(lines);
    const nodes = s.nodes.map((n, i) => h('div', { class: 'tm-node tm-pop', style: { animationDelay: (i * 140) + 'ms', '--tone': TONE[n.tone || 'n'] } },
      h('div', { class: 'tm-node-art' }, iconEl(n.emoji, n.icon) || h('span', { class: 'tm-ico tm-ico-emoji' }, '•')),
      h('div', { class: 'tm-node-label', html: md(n.label) }),
      n.sub ? h('div', { class: 'tm-node-sub', html: md(n.sub) }) : null));
    nodes.forEach(n => wrap.append(n));
    const packet = h('div', { class: 'tm-packet' }, h('i', { class: 'tm-dot' }), h('span', { class: 'tm-packet-label' }));
    wrap.append(packet);
    const caption = h('div', { class: 'tm-flow-cap' });
    st.append(wrap, caption);
    const center = (el) => {
      const art = $('.tm-node-art', el) || el;
      const r = art.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      return { x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2 };
    };
    const drawLines = () => {
      lines.setAttribute('width', wrap.offsetWidth); lines.setAttribute('height', wrap.offsetHeight);
      lines.innerHTML = '';
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = center(nodes[i]), b = center(nodes[i + 1]);
        const l = document.createElementNS(svgNS, 'line');
        l.setAttribute('x1', a.x); l.setAttribute('y1', a.y); l.setAttribute('x2', b.x); l.setAttribute('y2', b.y);
        lines.append(l);
      }
    };
    ctx.after(60, drawLines);
    ctx.after(700, drawLines);
    const moves = s.moves || [];
    const start = 300 + s.nodes.length * 140 + 300;
    const gap = Math.max(1200, (ctx.dur * 0.9 - start) / Math.max(1, moves.length));
    moves.forEach((mv, i) => ctx.after(start + i * gap, () => {
      const a = nodes[mv.from], b = nodes[mv.to === undefined ? mv.from : mv.to];
      if (!a || !b) return;
      nodes.forEach(n => n.classList.remove('active'));
      packet.className = 'tm-packet show';
      packet.style.setProperty('--tone', TONE[mv.tone || 'a'] === TONE.n ? '#F08B3E' : (mv.tone ? TONE[mv.tone] : 'var(--tm-accent)'));
      $('.tm-packet-label', packet).innerHTML = md(mv.label || '');
      const p1 = center(a), p2 = center(b);
      packet.style.transition = 'none';
      packet.style.left = p1.x + 'px'; packet.style.top = p1.y + 'px';
      void packet.offsetWidth;
      const travel = Math.min(gap * 0.7, 1600);
      packet.style.transition = REDUCE ? 'none' : `left ${travel}ms cubic-bezier(.5,0,.3,1), top ${travel}ms cubic-bezier(.5,0,.3,1)`;
      packet.style.left = p2.x + 'px'; packet.style.top = p2.y + 'px';
      a.classList.add('active');
      ctx.after(REDUCE ? 0 : travel, () => { a.classList.remove('active'); b.classList.add('active', 'bump'); ctx.after(500, () => b.classList.remove('bump')); });
      if (mv.cap) { caption.innerHTML = md(mv.cap); caption.classList.remove('tm-pop-in'); void caption.offsetWidth; caption.classList.add('tm-pop-in'); }
    }));
  };

  const METHOD_TONE = { GET: 'g', POST: 'w', PUT: 'a', PATCH: 'p', DELETE: 'b' };
  // Postman: one request, or several in a row (s.seq), with a pointer pressing Send
  R.postman = (st, s, ctx) => {
    const reqs = s.seq || [s];
    const method = h('span', { class: 'tm-pm-method' });
    const url = h('span', { class: 'tm-pm-url-text' });
    const caret = h('span', { class: 'tm-caret' });
    const send = h('span', { class: 'tm-pm-send' }, 'Send');
    const bodyCode = h('code', { class: 'tm-pm-body' });
    const bodyWrap = h('div', { hidden: true }, h('div', { class: 'tm-pm-tabs' }, h('span', null, 'Params'), h('span', { class: 'on' }, 'Body'), h('span', null, 'Headers'), h('span', { class: 'tm-pm-raw' }, 'raw'), h('span', { class: 'tm-pm-json' }, 'JSON ▾')), h('pre', { class: 'tm-pm-bodybox' }, bodyCode));
    const resp = h('div', { class: 'tm-pm-resp', hidden: true });
    const counter = h('span', { class: 'tm-pm-tab' }, s.tab || 'Travel API');
    const app = h('div', { class: 'tm-pm tm-rise' },
      h('div', { class: 'tm-pm-top' }, h('span', { class: 'tm-pm-logo', html: (window.BFZ_ICONS || {}).postman || '' }), 'Postman', counter),
      h('div', { class: 'tm-pm-bar' }, method, h('span', { class: 'tm-pm-url' }, url, caret), send),
      bodyWrap, resp);
    const box = h('div', { class: 'tm-screen-host' }, app);
    st.append(box);
    const ptr = pointer(box);
    const span = (ctx.dur * 0.94 - 200) / reqs.length;
    reqs.forEach((r, k) => {
      const t0 = 200 + k * span;
      ctx.after(t0, () => {
        method.textContent = r.method; method.className = 'tm-pm-method m-' + (METHOD_TONE[r.method] || 'g');
        url.textContent = ''; caret.hidden = false; resp.hidden = true; send.classList.remove('pressed');
        bodyWrap.hidden = !r.body; bodyCode.innerHTML = '';
        if (reqs.length > 1) counter.textContent = `Request ${k + 1} of ${reqs.length}`;
      });
      const typeMs = Math.min(span * 0.3, r.url.length * 26);
      for (let i = 1; i <= r.url.length; i++) ctx.after(t0 + 100 + (i * typeMs) / r.url.length, () => { url.textContent = r.url.slice(0, i); });
      let t = t0 + 150 + typeMs;
      ctx.after(t, () => { caret.hidden = true; });
      if (r.body) {
        const n = r.body.split('\n').length;
        const bMs = Math.min(span * 0.25, n * 450);
        ctx.after(t, () => { bodyCode.innerHTML = splitHtmlLines(highlight(r.body, 'json')).map(l => `<div class="tm-line">${l || ' '}</div>`).join(''); typeLines($$('.tm-line', bodyCode), bMs, 0); });
        t += bMs + 200;
      }
      const sendAt = Math.max(t + 250, t0 + span * 0.45);
      ctx.after(sendAt - 700, () => ptr.move(send));
      ctx.after(sendAt, () => { ptr.click(); send.classList.remove('pressed'); void send.offsetWidth; send.classList.add('pressed'); });
      ctx.after(sendAt + 550, () => {
        const code = parseInt(r.status, 10);
        const tone = code >= 500 ? 'b' : code >= 400 ? 'w' : 'g';
        resp.hidden = false; resp.innerHTML = '';
        resp.append(h('div', { class: 'tm-pm-resp-head' }, 'Response', h('span', { class: 'tm-pill tone-' + tone + ' tm-pop' }, r.status), r.time ? h('span', { class: 'tm-pm-time' }, r.time) : null));
        if (r.response) resp.append(h('pre', { class: 'tm-pm-resp-body tm-rise' }, h('code', { html: highlight(r.response, /^\s*[[{]/.test(r.response) ? 'json' : 'plain') })));
        if (r.note) resp.append(h('div', { class: 'tm-pm-note tm-rise d2', html: md(r.note) }));
        ptr.move(resp, 0.15, 0.2);
      });
    });
  };

  // ---------------------------------------------------------------- the pointer (mouse cursor)
  function pointer(host) {
    host.classList.add('tm-screen-host');
    const p = h('div', { class: 'tm-ptr', html: '<svg viewBox="0 0 24 24"><path d="M4 2l16 11-7 1.5L16.5 22l-3 1.2-3.3-7.4L4 20z" fill="#fff" stroke="#0A0F13" stroke-width="1.5" stroke-linejoin="round"/></svg>' });
    host.append(p);
    let shown = false;
    return {
      move(el, fx = 0.5, fy = 0.55) {
        if (!el) return;
        const r = el.getBoundingClientRect(), b = host.getBoundingClientRect();
        const x = r.left - b.left + r.width * fx, y = r.top - b.top + r.height * fy;
        if (!shown) { p.style.transition = 'none'; p.style.left = (x + 60) + 'px'; p.style.top = (y + 50) + 'px'; void p.offsetWidth; shown = true; p.classList.add('on'); }
        p.style.transition = REDUCE ? 'none' : 'left .65s cubic-bezier(.4,0,.2,1), top .65s cubic-bezier(.4,0,.2,1)';
        p.style.left = x + 'px'; p.style.top = y + 'px';
      },
      click() { p.classList.remove('click'); void p.offsetWidth; p.classList.add('click'); },
      hide() { p.classList.remove('on'); shown = false; },
    };
  }

  // ---------------------------------------------------------------- app screens (VS Code, browser, installer, desktop, lesson)
  const APPICON = {
    vscode: '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1F2933"/><path d="M44 10l10 5v34l-10 5-22-20-9 7-5-3V26l5-3 9 7z" fill="#2F8DDB"/><path d="M44 22L30 32l14 10z" fill="#1F2933"/></svg>',
    terminal: '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0E151A" stroke="#3B4A55" stroke-width="2"/><path d="M16 24l9 8-9 8" fill="none" stroke="#3FBC7B" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="30" y="38" width="16" height="4" rx="2" fill="#C7D2D8"/></svg>',
    node: '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1F2933"/><path d="M32 10l19 11v22L32 54 13 43V21z" fill="#3FA34D"/><text x="32" y="38" font-family="Arial" font-weight="700" font-size="13" fill="#fff" text-anchor="middle">JS</text></svg>',
    npm: '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#CB3837"/><text x="32" y="39" font-family="Arial" font-weight="800" font-size="17" fill="#fff" text-anchor="middle">npm</text></svg>',
    mysql: '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1F2933"/><ellipse cx="32" cy="20" rx="16" ry="6" fill="#3E8BC4"/><path d="M16 20v24c0 3.3 7.2 6 16 6s16-2.7 16-6V20" fill="#00618A"/><ellipse cx="32" cy="20" rx="16" ry="6" fill="#4FA3DB"/><path d="M16 32c0 3.3 7.2 6 16 6s16-2.7 16-6" fill="none" stroke="#4FA3DB" stroke-width="2"/></svg>',
    workbench: '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#00618A"/><rect x="12" y="16" width="40" height="30" rx="3" fill="#E4ECEF"/><rect x="12" y="16" width="40" height="7" fill="#F29111"/><rect x="17" y="28" width="20" height="3" rx="1.5" fill="#5A6B76"/><rect x="17" y="35" width="28" height="3" rx="1.5" fill="#5A6B76"/></svg>',
    postman: '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#FF6C37"/><path d="M18 24h28v18H18z" fill="#fff"/><path d="M18 24l14 11 14-11" fill="none" stroke="#FF6C37" stroke-width="2.4"/></svg>',
    folder: '<svg viewBox="0 0 64 64"><path d="M6 16a4 4 0 0 1 4-4h14l5 5h25a4 4 0 0 1 4 4v29a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="#F2B33D"/></svg>',
  };
  const SCREEN = {
    vscode(o) {
      const files = (o.files || []).map(f => h('li', { 'data-t': 'f-' + f.replace(/[^\w]/g, '_'), class: f.endsWith('/') ? 'dir' : '' }, f.endsWith('/') ? '▸ ' + f.slice(0, -1) : f));
      return h('div', { class: 'tmv tmv-vscode' },
        h('div', { class: 'tmv-titlebar' }, h('span', { class: 'tmv-appico', html: APPICON.vscode }),
          ...['File', 'Edit', 'Selection', 'View', 'Go', 'Terminal', 'Help'].map(m => h('span', { class: 'tmv-menu', 'data-t': 'menu-' + m.toLowerCase() }, m)),
          h('span', { class: 'tmv-wintitle', 'data-t': 'wintitle' }, o.title || 'Visual Studio Code')),
        h('div', { class: 'tmv-dd', 'data-t': 'dd-file', hidden: true },
          h('div', { 'data-t': 'dd-newfile' }, 'New Text File', h('i', null, 'Ctrl+N')), h('div', { 'data-t': 'dd-openfolder' }, 'Open Folder…', h('i', null, 'Ctrl+K Ctrl+O')),
          h('hr'), h('div', { 'data-t': 'dd-save' }, 'Save', h('i', null, 'Ctrl+S')), h('div', { 'data-t': 'dd-autosave' }, 'Auto Save')),
        h('div', { class: 'tmv-body' },
          h('div', { class: 'tmv-actbar' }, h('i', { class: 'on', 'data-t': 'act-explorer' }, '❐'), h('i', null, '⌕'), h('i', null, '⑂'), h('i', { 'data-t': 'act-ext' }, '⊞')),
          h('div', { class: 'tmv-side' },
            h('div', { class: 'tmv-side-h' }, 'EXPLORER'),
            h('div', { class: 'tmv-folder' }, h('span', { 'data-t': 'folder' }, o.folder || 'NO FOLDER OPENED'),
              h('span', { class: 'tmv-tools' }, h('i', { 'data-t': 'btn-newfile', title: 'New File' }, '📄+'), h('i', { 'data-t': 'btn-newfolder', title: 'New Folder' }, '📁+'))),
            h('ul', { class: 'tmv-files', 'data-t': 'files' }, files)),
          h('div', { class: 'tmv-main' },
            h('div', { class: 'tmv-tabs', 'data-t': 'tabs' }, h('span', { class: 'tmv-tab', 'data-t': 'tab', hidden: !o.tab }, h('span', { 'data-t': 'tabname' }, o.tab || ''), h('i', { class: 'tmv-dot', 'data-t': 'dot', hidden: true }, '●'))),
            h('div', { class: 'tmv-editor', 'data-t': 'editor' }, o.code ? codeBlock(o.code, o.lang) : h('div', { class: 'tmv-welcome', 'data-t': 'welcome' }, h('span', { html: APPICON.vscode }), 'Open a folder to start')),
            h('div', { class: 'tmv-panel', 'data-t': 'panel', hidden: !o.terminal }, h('div', { class: 'tmv-panel-h' }, h('b', null, 'TERMINAL'), h('span', null, 'powershell')), h('div', { class: 'tmv-term', 'data-t': 'term' })))),
        h('div', { class: 'tmv-status' }, h('span', null, '⊗ 0  ⚠ 0'), h('span', { 'data-t': 'statusmsg' }, ''), h('span', null, 'JavaScript')));
    },
    browser(o) {
      return h('div', { class: 'tmv tmv-browser' },
        h('div', { class: 'tmv-chrome' }, h('i'), h('i'), h('i'), h('span', { class: 'tmv-url', 'data-t': 'url' }, '🔒 ' + (o.url || ''))),
        h('div', { class: 'tmv-page', 'data-t': 'page', html: o.html || '' }));
    },
    installer(o) {
      return h('div', { class: 'tmv tmv-installer' },
        h('div', { class: 'tmv-inst-title' }, h('span', { html: APPICON[o.icon || 'node'] }), o.title || 'Setup'),
        h('div', { class: 'tmv-inst-body' }, h('h4', { 'data-t': 'heading' }, o.heading || ''), h('p', { 'data-t': 'text' }, o.text || ''),
          h('div', { class: 'tmv-progress', 'data-t': 'progress', hidden: true }, h('i', { 'data-t': 'bar' }))),
        h('div', { class: 'tmv-inst-btns' }, h('span', { 'data-t': 'back' }, 'Back'), h('span', { class: 'primary', 'data-t': 'next' }, 'Next'), h('span', { 'data-t': 'cancel' }, 'Cancel')));
    },
    desktop(o) {
      return h('div', { class: 'tmv tmv-desktop' },
        h('div', { class: 'tmv-icons', 'data-t': 'icons' }, (o.apps || []).map(a => h('div', { class: 'tmv-app', 'data-t': 'app-' + a.id, hidden: true }, h('span', { html: APPICON[a.icon] }), h('b', null, a.name), h('small', null, a.what)))),
        h('div', { class: 'tmv-taskbar' }, h('span', { class: 'tmv-start' }, '⊞'), h('span', { class: 'tmv-search' }, '🔍 Search'), h('span', { 'data-t': 'tray', class: 'tmv-tray' })));
    },
    lesson(o) {
      return h('div', { class: 'tmv tmv-lesson' },
        h('div', { class: 'tmv-l-stage', 'data-t': 'stage' },
          h('div', { class: 'tmv-l-flow', 'data-t': 'flow' }, h('span', null, '🧑‍💻'), h('i'), h('span', null, '🧭'), h('i'), h('span', null, '⚙️'), h('b', { class: 'tmv-l-dot' })),
          h('div', { class: 'tmv-l-ex', 'data-t': 'ex', hidden: true },
            h('div', { class: 'tmv-l-wait', 'data-t': 'wait' }, '⏳ Your turn! I\'ll continue when it is correct.'),
            h('pre', { class: 'tmv-l-code', 'data-t': 'code' }, ''),
            h('div', { class: 'tmv-l-row' }, h('span', { class: 'tmv-l-run', 'data-t': 'run' }, '▶ Run'), h('span', { class: 'tmv-l-checks', 'data-t': 'checks' }, '0 / 3 checks pass')))),
        h('div', { class: 'tmv-l-cap' }, h('span', { class: 'tmv-l-face' }, h('img', { src: AVATAR, alt: '' })), h('span', { 'data-t': 'cap' }, o.cap || '')));
    },
  };

  // run a little script of actions on a fake app window, spread over the narration
  R.screen = (st, s, ctx) => {
    const host = h('div', { class: 'tm-screen-host tm-rise' });
    st.append(host);
    let win = null;
    const T = (name) => win && win.querySelector(`[data-t="${name}"]`);
    const ptr = pointer(host);
    const keycap = h('div', { class: 'tm-keycap', hidden: true });
    const tip = h('div', { class: 'tm-tip', hidden: true });
    host.append(keycap, tip);
    const showWin = (o) => {
      const next = SCREEN[o.app](o);
      if (win) { win.classList.add('tmv-out'); const old = win; ctx.after(300, () => old.remove()); }
      host.prepend(next); win = next; next.classList.add('tmv-in');
    };
    const tipAt = (el, text) => {
      if (!el || !text) { tip.hidden = true; return; }
      const r = el.getBoundingClientRect(), b = host.getBoundingClientRect();
      tip.innerHTML = md(text); tip.hidden = false;
      tip.style.left = Math.min(b.width - 200, Math.max(8, r.left - b.left)) + 'px';
      tip.style.top = (r.bottom - b.top + 10) + 'px';
      tip.classList.remove('tm-pop'); void tip.offsetWidth; tip.classList.add('tm-pop');
      const mine = ++tipN;
      ctx.after(2600, () => { if (mine === tipN) tip.hidden = true; });
    };
    let tipN = 0;
    const BASE = { win: 500, point: 900, click: 1000, type: 0, key: 1300, show: 350, hide: 200, set: 300, append: 450, code: 900, hl: 1400, term: 0, cls: 300, wait: 600, tip: 1200 };
    const cost = a => {
      const k = Object.keys(a).find(x => BASE[x] !== undefined);
      if (a.type) return 300 + String(a.text || '').length * 60;
      if (a.term) return 500 + String(a.term).length * 40 + (a.out ? 450 : 0);
      if (a.ms) return a.ms;
      return BASE[k] || 500;
    };
    const steps = s.steps || [];
    const total = steps.reduce((x, a) => x + cost(a), 0);
    const scale = Math.max(0.55, Math.min(1.7, (ctx.dur * 0.92) / Math.max(1, total)));
    let t = 0;
    steps.forEach(a => {
      const c = cost(a) * scale;
      ctx.after(t, () => {
        if (a.win) { showWin(a.win); ptr.hide(); tip.hidden = true; return; }
        if (a.point) { ptr.move(T(a.point), a.fx, a.fy); if (a.say) ctx.after(600 * scale, () => tipAt(T(a.point), a.say)); }
        if (a.click) {
          const el = T(a.click);
          ptr.move(el, a.fx, a.fy);
          ctx.after(650 * scale, () => { ptr.click(); if (el) { el.classList.remove('tmv-pressed'); void el.offsetWidth; el.classList.add('tmv-pressed'); } if (a.say) tipAt(el, a.say); (a.then || []).forEach(run); });
          return;
        }
        if (a.type) {
          const el = T(a.type); if (!el) return;
          const text = String(a.text); el.classList.add('tmv-typing');
          for (let i = 1; i <= text.length; i++) ctx.after(i * 60 * scale, () => { el.textContent = text.slice(0, i); });
          ctx.after((text.length * 60 + 200) * scale, () => el.classList.remove('tmv-typing'));
        }
        if (a.term) {
          const el = T('term'); if (!el) return;
          const row = h('div', null, h('span', { class: 'tm-prompt' }, (s.prompt || 'PS C:\\Users\\you\\my-backend>') + ' '), h('span'));
          el.append(row);
          const out = row.lastChild, text = a.term;
          for (let i = 1; i <= text.length; i++) ctx.after(i * 40 * scale, () => { out.textContent = text.slice(0, i); });
          if (a.out) ctx.after((text.length * 40 + 350) * scale, () => [].concat(a.out).forEach(o => el.append(h('div', { class: 'tm-term-out ' + (a.tone || '') }, o))));
        }
        if (a.key) {
          keycap.innerHTML = a.key.split('+').map(k => `<kbd>${esc(k.trim())}</kbd>`).join('<span>+</span>');
          keycap.hidden = false; keycap.classList.remove('tm-pop'); void keycap.offsetWidth; keycap.classList.add('tm-pop');
          ctx.after(1000 * scale, () => { keycap.hidden = true; (a.then || []).forEach(run); });
          return;
        }
        if (a.tip !== undefined) tipAt(T(a.tip), a.text);
        run(a);
      });
      t += c;
    });
    function run(a) {
      if (a.show) [].concat(a.show).forEach(n => { const el = T(n); if (el) { el.hidden = false; el.classList.remove('tm-pop'); void el.offsetWidth; el.classList.add('tm-pop'); } });
      if (a.hide) [].concat(a.hide).forEach(n => { const el = T(n); if (el) el.hidden = true; });
      if (a.set) { const el = T(a.set); if (el) { el.textContent = a.text; el.classList.remove('tmv-flash'); void el.offsetWidth; el.classList.add('tmv-flash'); } }
      if (a.append) { const el = T(a.append); if (el) { const n = h('div', { html: a.html }).firstElementChild; n.classList.add('tm-pop'); el.append(n); } }
      if (a.cls) { const el = T(a.cls); if (el) el.classList.add(a.add); }
      if (a.uncls) { const el = T(a.uncls); if (el) el.classList.remove(a.remove); }
      if (a.code !== undefined) {
        const ed = T('editor'); if (ed) { ed.innerHTML = ''; const pre = codeBlock(a.code, a.lang); ed.append(pre); if (a.typed !== false) typeLines($$('.tm-line', pre), Math.min(2600, a.code.length * 22), 0); }
      }
      if (a.hl) {
        const ed = T('editor'); if (!ed) return;
        $$('.tm-line', ed).forEach(l => l.classList.toggle('hl', [].concat(a.hl).includes(+l.dataset.n)));
        const first = $(`.tm-line[data-n="${[].concat(a.hl)[0]}"]`, ed);
        if (first && a.say) tipAt(first, a.say);
      }
    }
  };

  function miniTable(t) {
    const table = h('table', { class: 'tm-table' });
    table.append(h('thead', null, t.name ? h('tr', null, h('th', { class: 'tm-tname', colspan: t.columns.length }, t.name)) : null, h('tr', null, t.columns.map(c => h('th', null, c)))));
    const tb = h('tbody');
    t.rows.forEach((r, i) => tb.append(rowEl(r, i)));
    table.append(tb);
    return table;
  }
  function rowEl(r, i) { return h('tr', { 'data-i': i }, r.map(v => v === null ? h('td', { class: 'null' }, 'NULL') : h('td', null, String(v)))); }

  R.table = (st, s, ctx) => {
    let t0 = 200;
    if (s.sql) {
      const q = h('div', { class: 'tm-sql tm-rise' }, codeBlock(s.sql, 'sql'));
      st.append(q);
      t0 = typeLines($$('.tm-line', q), Math.min(2600, ctx.dur * 0.3), 300) + 400;
    }
    const table = miniTable(s);
    st.append(h('div', { class: 'tm-table-wrap tm-rise d1' }, table));
    const msg = h('div', { class: 'tm-table-msg' });
    st.append(msg);
    const tb = $('tbody', table);
    const row = i => $(`tr[data-i="${i}"]`, tb);
    const ops = s.ops || [];
    const gap = Math.max(800, (ctx.dur * 0.88 - t0) / Math.max(1, ops.length));
    const say = (m) => { if (!m) return; msg.innerHTML = md(m); msg.classList.remove('tm-pop-in'); void msg.offsetWidth; msg.classList.add('tm-pop-in'); };
    ops.forEach((op, k) => ctx.after(t0 + k * gap, () => {
      if (op.walk) {
        const idx = op.walk === true ? s.rows.map((_, i) => i) : op.walk;
        const g = Math.min(700, gap / (idx.length + 1));
        idx.forEach((i, j) => ctx.after(j * g, () => {
          $$('tr', tb).forEach(r => r.classList.remove('walk'));
          const r = row(i); if (r) r.classList.add('walk');
          if (op.stopAt === i && r) { r.classList.remove('walk'); r.classList.add('hl'); }
        }));
        ctx.after(idx.length * g, () => { if (op.stopAt === undefined) $$('tr', tb).forEach(r => r.classList.remove('walk')); });
      }
      if (op.hl) op.hl.forEach(i => { const r = row(i); if (r) r.classList.add('hl'); });
      if (op.only) $$('tr', tb).forEach(r => { const keep = op.only.includes(+r.dataset.i); r.classList.toggle('fade', !keep); r.classList.toggle('hl', keep); });
      if (op.add) { const r = rowEl(op.add, tb.children.length + 100); r.classList.add('tm-row-new'); tb.append(r); r.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' }); }
      if (op.set) {
        const [ri, ci, v] = op.set; const r = row(ri);
        if (r && r.children[ci]) { const td = r.children[ci]; td.textContent = String(v); td.classList.remove('flash', 'flash-bad'); void td.offsetWidth; td.classList.add(op.bad ? 'flash-bad' : 'flash'); }
      }
      if (op.setAll) {
        const [ci, v] = op.setAll;
        $$('tr', tb).forEach((r, j) => ctx.after(j * 90, () => { const td = r.children[ci]; if (td) { td.textContent = String(v); td.classList.add(op.bad ? 'flash-bad' : 'flash'); } }));
      }
      if (op.del !== undefined) { const r = row(op.del); if (r) { r.classList.add('tm-row-del'); ctx.after(700, () => r.remove()); } }
      if (op.order) {
        const before = new Map($$('tr', tb).map(r => [r, r.getBoundingClientRect().top]));
        op.order.forEach(i => { const r = row(i); if (r) tb.append(r); });
        if (!REDUCE) $$('tr', tb).forEach(r => {
          const dy = before.get(r) - r.getBoundingClientRect().top;
          r.style.transition = 'none'; r.style.transform = `translateY(${dy}px)`;
          void r.offsetWidth;
          r.style.transition = 'transform 900ms cubic-bezier(.5,0,.3,1)'; r.style.transform = '';
        });
      }
      say(op.msg);
    }));
  };

  R.join = (st, s, ctx) => {
    let t0 = 200;
    if (s.sql) {
      const q = h('div', { class: 'tm-sql tm-rise' }, codeBlock(s.sql, 'sql'));
      st.append(q);
      t0 = typeLines($$('.tm-line', q), Math.min(2600, ctx.dur * 0.25), 200) + 300;
    }
    const L = miniTable(s.left), Rt = miniTable(s.right);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tm-join-svg');
    const grid = h('div', { class: 'tm-join tm-rise d1' }, h('div', { class: 'tm-join-l' }, L), h('div', { class: 'tm-join-gap' }), h('div', { class: 'tm-join-r' }, Rt));
    grid.append(svg);
    st.append(grid);
    const resWrap = h('div', { class: 'tm-join-res' });
    st.append(resWrap);
    const pairs = s.pairs || [];
    const unmatched = s.unmatched || [];
    const gap = Math.max(450, (ctx.dur * 0.55 - t0) / Math.max(1, pairs.length + unmatched.length));
    const pt = (tr, side) => {
      const g = grid.getBoundingClientRect(), r = tr.getBoundingClientRect();
      return { x: side === 'l' ? r.right - g.left : r.left - g.left, y: r.top - g.top + r.height / 2 };
    };
    pairs.forEach(([li, ri], k) => ctx.after(t0 + k * gap, () => {
      const a = $(`tbody tr[data-i="${li}"]`, L), b = $(`tbody tr[data-i="${ri}"]`, Rt);
      if (!a || !b) return;
      svg.setAttribute('width', grid.offsetWidth); svg.setAttribute('height', grid.offsetHeight);
      const p1 = pt(a, 'l'), p2 = pt(b, 'r');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const mx = (p1.x + p2.x) / 2;
      path.setAttribute('d', `M${p1.x},${p1.y} C${mx},${p1.y} ${mx},${p2.y} ${p2.x},${p2.y}`);
      path.setAttribute('class', 'tm-join-line');
      svg.append(path);
      a.classList.add('hl'); b.classList.add('hl');
    }));
    unmatched.forEach((li, k) => ctx.after(t0 + (pairs.length + k) * gap, () => {
      const a = $(`tbody tr[data-i="${li}"]`, L);
      if (a) { a.classList.add('nomatch'); a.lastChild.append(h('span', { class: 'tm-null-tag tm-pop' }, '  → no match: NULL')); }
    }));
    if (s.result) {
      const tR = t0 + (pairs.length + unmatched.length) * gap + 300;
      ctx.after(tR, () => {
        const res = miniTable(Object.assign({}, s.result, { rows: [] }));
        resWrap.append(h('div', { class: 'tm-join-arrow tm-pop' }, '↓ result'), h('div', { class: 'tm-table-wrap' }, res));
        const tb = $('tbody', res);
        const g2 = Math.min(380, (ctx.dur * 0.95 - tR) / Math.max(1, s.result.rows.length));
        s.result.rows.forEach((r, i) => ctx.after(200 + i * g2, () => {
          const tr = rowEl(r, i); tr.classList.add('tm-row-new'); tb.append(tr);
          tr.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' });
        }));
      });
    }
  };

  R.compare = (st, s, ctx) => {
    const panel = (p, cls) => h('div', { class: 'tm-cmp-panel ' + cls },
      h('div', { class: 'tm-cmp-head' }, h('span', { class: 'tm-stamp' }, cls === 'bad' ? '✗' : '✓'), h('span', { html: md(p.title || (cls === 'bad' ? 'Wrong' : 'Right')) })),
      codeBlock(p.code, p.lang),
      p.result ? h('div', { class: 'tm-cmp-res', html: md(p.result) }) : null);
    const a = panel(s.bad, 'bad'), b = panel(s.good, 'good');
    const grid = h('div', { class: 'tm-cmp' });
    st.append(grid);
    ctx.after(200, () => { grid.append(a); a.classList.add('tm-rise'); typeLines($$('.tm-line', a), Math.min(1800, ctx.dur * 0.22), 0); });
    ctx.after(Math.max(1600, ctx.dur * 0.45), () => { grid.append(b); b.classList.add('tm-rise'); typeLines($$('.tm-line', b), Math.min(1800, ctx.dur * 0.22), 0); });
  };

  R.memory = (st, s, ctx) => {
    const row = h('div', { class: 'tm-mem' });
    const msg = h('div', { class: 'tm-table-msg' });
    st.append(row, msg);
    const boxes = {};
    const ops = s.ops || [];
    const gap = Math.max(900, (ctx.dur * 0.88) / Math.max(1, ops.length));
    const valEl = v => h('div', { class: 'tm-mem-val tm-drop' }, typeof v === 'string' ? `"${v}"` : String(v));
    ops.forEach((op, k) => ctx.after(250 + k * gap, () => {
      if (op.make) {
        const b = h('div', { class: 'tm-mem-box tm-pop kind-' + (op.kind || 'let') },
          h('div', { class: 'tm-mem-kind' }, op.kind || 'let', op.kind === 'const' ? ' 🔒' : ''),
          h('div', { class: 'tm-mem-slot' }),
          h('div', { class: 'tm-mem-name' }, op.make));
        row.append(b);
        boxes[op.make] = b;
        ctx.after(350, () => $('.tm-mem-slot', b).append(valEl(op.value)));
      }
      if (op.set && boxes[op.set]) {
        const slot = $('.tm-mem-slot', boxes[op.set]);
        const old = slot.firstChild;
        if (old) { old.classList.add('tm-fly'); ctx.after(450, () => old.remove()); }
        ctx.after(300, () => slot.append(valEl(op.value)));
      }
      if (op.deny && boxes[op.deny]) {
        const b = boxes[op.deny];
        b.classList.remove('tm-shake'); void b.offsetWidth; b.classList.add('tm-shake', 'denied');
        ctx.after(900, () => b.classList.remove('denied'));
      }
      if (op.msg) { msg.innerHTML = md(op.msg); msg.className = 'tm-table-msg tm-pop-in ' + (op.tone || ''); }
    }));
  };

  // a heading for scenes that don't have one: the first sentence (or its first part)
  function sceneTitle(sc) {
    const show = sc.show || {};
    if (show.type === 'title') return null;
    if (show.title) return show.title;
    const first = (sc.say.match(/^[^.!?]+[.!?]?/) || [''])[0].trim().replace(/[.!]$/, '');
    if (first.length <= 64) return first;
    const part = first.split(/[,:;] /)[0];
    return part.length <= 64 && part.split(' ').length >= 3 ? part : first.slice(0, 60).replace(/\s+\S*$/, '') + '…';
  }

  // glossary chips: terms the teacher mentions in this step
  const GLOSS = (window.BFZ_GLOSSARY || []).map(g => ({ ...g, re: new RegExp('\\b(' + g.key.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'i') }));
  function termsFor(text) {
    const found = [];
    GLOSS.forEach(g => { const m = text.match(g.re); if (m) found.push({ g, at: m.index }); });
    return found.sort((a, b) => a.at - b.at).slice(0, 3).map(f => f.g);
  }

  // ---------------------------------------------------------------- player
  class Player {
    constructor(page) {
      this.page = page;
      this.scenes = (window.BFZ_LESSONS || {})[page] || [];
      this.audioMap = ((window.BFZ_AUDIO || {}).lessons || {})[page] || [];
      this.idx = 0;
      this.playing = true;
      this.muted = store.get('muted', false);
      this.rate = store.get('rate', 1);
      this.timers = [];
      this.token = 0;
      this.keep = [];
      this.audio = new Audio();
      this.audio.preload = 'auto';
    }
    // ---- recorded audio for a text, if it still matches
    rec(i) { const e = this.audioMap[i]; return e && e.h === textHash(this.scenes[i].say) ? e : null; }
    lineRec(kind, i) {
      const L = (window.BFZ_AUDIO || {}).lines || {};
      const e = kind === 'praise' ? (L.praise || [])[i] : L.finish;
      const text = kind === 'praise' ? (window.BFZ_LINES || {}).praise[i] : (window.BFZ_LINES || {}).finish;
      return e && text && e.h === textHash(text) ? e : null;
    }
    open(opts = {}) {
      if (!this.scenes.length) { alert('There is no teacher lesson for this page yet.'); return; }
      this.build();
      document.body.classList.add('tm-open', 'tm-lock');
      this.keyHandler = e => this.onKey(e);
      document.addEventListener('keydown', this.keyHandler);
      if (opts.autostart) this.go(opts.from || 0); else this.showStart();
      const any = this.audioMap.some((e, i) => this.scenes[i] && e && e.h === textHash(this.scenes[i].say));
      if (!any && synth) setTimeout(() => { loadVoices(); if (!voices.length) this.flashNotice('No recordings here yet and no browser voice found — showing subtitles only.'); }, 1200);
    }
    build() {
      const title = (document.title || '').split('·')[0].trim();
      const kicker = (($('main .kicker') || {}).textContent || 'Backend from Zero').trim();
      this.stage = h('div', { class: 'tm-stage', 'aria-live': 'off' });
      this.capText = h('p', { class: 'tm-cap-text' });
      this.avatar = h('div', { class: 'tm-avatar', 'aria-hidden': 'true' }, avatarImg(), h('span', { class: 'tm-eq' }, h('i'), h('i'), h('i'), h('i')));
      this.terms = h('div', { class: 'tm-terms' });
      this.playBtn = h('button', { class: 'tm-btn tm-play', title: 'Play / pause (Space)', 'aria-label': 'Play or pause', onclick: () => this.toggle() }, '⏸');
      this.prog = h('div', { class: 'tm-prog', title: 'Progress through this lesson' }, h('i'));
      this.prog.addEventListener('click', e => {
        const r = this.prog.getBoundingClientRect();
        this.go(Math.min(this.scenes.length - 1, Math.floor(((e.clientX - r.left) / r.width) * this.scenes.length)));
      });
      this.counter = h('span', { class: 'tm-meta' });
      this.muteBtn = h('button', { class: 'tm-btn', title: 'Sound on / off', 'aria-label': 'Sound on or off', onclick: () => this.toggleMute() });
      this.rateSel = h('select', { class: 'tm-sel', 'aria-label': 'Speed' }, [0.8, 1, 1.15, 1.3, 1.5].map(r => h('option', { value: r }, r + '×')));
      this.rateSel.value = String(this.rate);
      this.rateSel.addEventListener('change', () => { this.rate = parseFloat(this.rateSel.value); store.set('rate', this.rate); this.audio.playbackRate = this.rate; if (!this.usingAudio) this.restart(); });
      this.notice = h('div', { class: 'tm-notice', hidden: true });
      this.modal = h('div', { class: 'tm-modal', hidden: true });
      this.panel = h('div', { class: 'tm-panel', role: 'dialog', 'aria-label': 'Teacher mode' },
        h('div', { class: 'tm-head' },
          h('div', { class: 'tm-head-title' }, h('span', { class: 'tm-wk' }, kicker), h('span', { class: 'tm-ls' }, title)),
          h('button', { class: 'tm-readbtn', title: 'Switch to reading mode', onclick: () => this.toReading() }, '📖 Read mode'),
          h('button', { class: 'tm-x', title: 'Close (Esc)', 'aria-label': 'Close teacher mode', onclick: () => this.close() }, '×')),
        this.stage, this.notice,
        h('div', { class: 'tm-caption' }, this.avatar, this.capText),
        this.terms,
        h('div', { class: 'tm-controls' },
          h('button', { class: 'tm-btn', title: 'Previous step (←)', 'aria-label': 'Previous step', onclick: () => this.go(this.idx - 1) }, '⏮'),
          this.playBtn,
          h('button', { class: 'tm-btn', title: 'Next step (→)', 'aria-label': 'Next step', onclick: () => this.go(this.idx + 1) }, '⏭'),
          this.prog, this.counter, this.muteBtn,
          h('label', { class: 'tm-speed' }, 'Speed', this.rateSel)),
        this.modal);
      this.overlay = h('div', { class: 'tm-overlay', style: { '--tm-accent': ACCENT[this.page] || '#F08B3E' } }, this.panel);
      document.body.append(this.overlay);
      this.paintMute();
    }
    flashNotice(t) { this.notice.textContent = t; this.notice.hidden = false; }
    paintMute() { this.muteBtn.textContent = this.muted ? '🔇' : '🔊'; this.muteBtn.classList.toggle('off', this.muted); }
    toggleMute() { this.muted = !this.muted; store.set('muted', this.muted); this.paintMute(); this.audio.muted = this.muted; if (!this.usingAudio) this.restart(); }
    onKey(e) {
      if (!this.modal.hidden) { if (e.key === 'Escape') this.closeTerm(); return; }
      if (e.target && (/SELECT|INPUT|TEXTAREA|BUTTON/.test(e.target.tagName) || e.target.closest('.CodeMirror, .tm-in-stage'))) return;
      if (this.overlay.classList.contains('idle')) { if (e.key === 'Escape') this.close(); return; }
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === ' ' || e.key === 'k') { e.preventDefault(); this.toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.go(this.idx + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.idx - 1); }
    }

    // ---- pausable timers (so pause/resume keeps the animation where it was)
    after(ms, fn) {
      const t = { fn, due: performance.now() + Math.max(0, ms), id: 0 };
      t.id = setTimeout(() => { this.timers = this.timers.filter(x => x !== t); fn(); }, Math.max(0, ms));
      this.timers.push(t);
      return t;
    }
    clearTimers() { this.timers.forEach(t => clearTimeout(t.id)); this.timers = []; }
    freezeTimers() { const now = performance.now(); this.timers.forEach(t => { clearTimeout(t.id); t.left = Math.max(0, t.due - now); }); }
    thawTimers() {
      const now = performance.now();
      this.timers.forEach(t => { t.due = now + (t.left || 0); t.id = setTimeout(() => { this.timers = this.timers.filter(x => x !== t); t.fn(); }, t.left || 0); });
    }

    stopVoice() {
      this.token++;
      if (synth) synth.cancel();
      try { this.audio.pause(); } catch (e) { /* ignore */ }
      cancelAnimationFrame(this.raf);
      this.usingAudio = false;
      if (this.avatar) this.avatar.classList.remove('speaking');
    }
    unspot() {
      $$('.tm-spot').forEach(e => e.classList.remove('tm-spot'));
      if (this.practiceEx && this.solvedHandler) this.practiceEx.removeEventListener('bfz:solved', this.solvedHandler);
      this.practiceEx = null; this.waiting = false;
      this.restoreMoved();
    }
    toggle() {
      if (this.idx >= this.scenes.length) { this.go(0); return; }
      this.playing = !this.playing;
      this.playBtn.textContent = this.playing ? '⏸' : '▶';
      this.overlay.classList.toggle('paused', !this.playing);
      this.avatar.classList.toggle('speaking', this.playing && this.usingAudio);
      if (!this.playing) {
        this.freezeTimers();
        if (this.usingAudio) this.audio.pause(); else { this.token++; if (synth) synth.cancel(); }
        cancelAnimationFrame(this.raf);
      } else {
        this.thawTimers();
        if (this.usingAudio && !this.audio.ended) { this.audio.play().then(() => { this.notice.hidden = true; this.avatar.classList.add('speaking'); this.tick(); }).catch(() => {}); }
        else if (this.waiting) { /* in a practice stop: nothing to resume */ }
        else this.restart();
      }
    }
    restart() { if (this.idx < this.scenes.length) this.go(this.idx); }

    // ---- start screen
    showStart() {
      this.clearTimers(); this.stopVoice(); this.restoreMoved();
      this.overlay.classList.add('idle');
      this.overlay.classList.remove('mini');
      this.playing = false;
      const title = (document.title || '').split('·')[0].trim();
      const total = this.scenes.reduce((a, s, i) => { const r = this.rec(i); return a + (r ? r.d * 1000 : estimateMs(s.say, 1)) + 700; }, 0);
      const mins = Math.max(1, Math.round(total / 60000));
      const practices = this.scenes.filter(s => s.practice).length;
      const saved = store.get('pos:' + this.page, 0);
      this.stage.innerHTML = '';
      this.stage.className = 'tm-stage';
      this.stage.append(h('div', { class: 'tm-title-card tm-start' },
        avatarImg('tm-hero-face tm-pop'),
        h('h2', { class: 'tm-rise d1' }, title),
        h('p', { class: 'tm-rise d2' }, `${this.scenes.length} steps · about ${mins} min${practices ? ` · ${practices} practice stop${practices > 1 ? 's' : ''} where I wait for you` : ''}`),
        h('div', { class: 'tm-end-btns tm-rise d2' },
          h('button', { class: 'tm-cta', onclick: () => this.begin(0) }, '▶ Start lesson'),
          saved > 0 && saved < this.scenes.length ? h('button', { class: 'tm-cta ghost', onclick: () => this.begin(saved) }, `Resume from step ${saved + 1}`) : null,
          h('button', { class: 'tm-cta ghost', onclick: () => this.toReading() }, '📖 Read instead')),
        h('p', { class: 'tm-hint tm-rise d2' }, 'Turn your sound on. Space = pause · ← → = steps · Esc = close')));
      this.capText.textContent = 'Press Start when you are ready.';
      this.terms.innerHTML = '';
      this.counter.textContent = '';
    }
    begin(i) { this.overlay.classList.remove('idle'); this.go(i); }
    toReading() {
      try { localStorage.setItem('bfz-mode', 'read'); } catch (e) { /* ignore */ }
      document.dispatchEvent(new CustomEvent('bfz:mode', { detail: 'read' }));
      this.close();
    }

    // ---- practice stops: the real exercise moves into the lesson
    moveIn(ex) {
      this.restoreMoved();
      const ph = document.createComment('teacher-mode-placeholder');
      ex.before(ph);
      this.moved = { ex, ph };
      this.stage.append(ex);
      ex.classList.add('tm-in-stage');
      requestAnimationFrame(() => $$('.CodeMirror', ex).forEach(c => c.CodeMirror && c.CodeMirror.refresh()));
    }
    restoreMoved() {
      if (!this.moved) return;
      const { ex, ph } = this.moved;
      ex.classList.remove('tm-in-stage');
      if (ph.parentNode) ph.replaceWith(ex);
      this.moved = null;
      requestAnimationFrame(() => $$('.CodeMirror', ex).forEach(c => c.CodeMirror && c.CodeMirror.refresh()));
    }
    practice(sc) {
      const el = $(sc.practice);
      const ex = el ? (el.closest('.exercise') || el) : null;
      this.stage.classList.add('practice');
      const text = h('span', { class: 'tm-wait-text' });
      const bar = h('div', { class: 'tm-wait' }, h('span', { class: 'tm-wait-dot' }), text,
        h('button', { class: 'tm-cta small ghost', onclick: () => this.go(this.idx + 1) }, 'Continue →'));
      this.stage.append(bar);
      if (!ex) { text.textContent = 'When you are done, press Continue.'; return; }
      this.moveIn(ex);
      const items = $$('.quiz, .blanks, .runner[data-checks], .sqlbox[data-checks]', ex);
      const left = new Set(items);
      const paint = () => {
        text.textContent = left.size
          ? `Your turn! ${items.length > 1 ? `${items.length - left.size} of ${items.length} done — ` : ''}I'll continue when ${items.length > 1 ? 'all parts are' : 'it is'} correct.`
          : 'When you are done, press Continue.';
      };
      paint();
      this.solvedHandler = (e) => {
        const root = items.find(it => it === e.target || it.contains(e.target));
        if (!root || !left.has(root)) return;
        left.delete(root); paint();
        if (!left.size && items.length) this.celebrate();
      };
      ex.addEventListener('bfz:solved', this.solvedHandler);
      this.practiceEx = ex;
      this.waiting = items.length > 0;
    }
    celebrate() {
      this.waiting = false;
      this.clearTimers(); this.stopVoice();
      const bar = $('.tm-wait', this.stage);
      if (bar) { bar.classList.add('done'); $('.tm-wait-text', bar).textContent = '🎉 Correct! Moving on…'; }
      this.confetti(); this.chime();
      const lines = (window.BFZ_LINES || {}).praise || ['Great job!'];
      const k = Math.floor(Math.random() * lines.length);
      this.caption(lines[k]);
      this.terms.innerHTML = '';
      this.speak(lines[k], this.lineRec('praise', k), 2200, () => { if (this.playing) this.after(500, () => this.go(this.idx + 1)); });
    }
    confetti() {
      if (REDUCE) return;
      const box = h('div', { class: 'tm-confetti', 'aria-hidden': 'true' });
      const colors = ['#F08B3E', '#3FBC7B', '#6A9BF2', '#A88BF5', '#F07AA8', '#F2B33D'];
      for (let i = 0; i < 70; i++) box.append(h('i', { style: { left: (Math.random() * 100) + '%', background: colors[i % colors.length], animationDelay: (Math.random() * 300) + 'ms', animationDuration: (1100 + Math.random() * 900) + 'ms', transform: `rotate(${Math.random() * 360}deg)` } }));
      this.panel.append(box);
      setTimeout(() => box.remove(), 2600);
    }
    chime() {
      if (this.muted) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ac = this.ac || new AC();
        const now = this.ac.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          const o = this.ac.createOscillator(), g = this.ac.createGain();
          o.type = 'triangle'; o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, now + i * 0.09);
          g.gain.exponentialRampToValueAtTime(0.16, now + i * 0.09 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.35);
          o.connect(g).connect(this.ac.destination);
          o.start(now + i * 0.09); o.stop(now + i * 0.09 + 0.4);
        });
      } catch (e) { /* no audio */ }
    }

    // ---- glossary chips
    showTerms(text) {
      this.terms.innerHTML = '';
      termsFor(text).forEach((g, i) => this.terms.append(h('button', { class: 'tm-chip', style: { animationDelay: (i * 120) + 'ms' }, onclick: () => this.openTerm(g) }, h('span', null, g.term), h('i', null, '?'))));
    }
    openTerm(g) {
      this.termWasPlaying = this.playing;
      if (this.playing) this.toggle();
      this.modal.hidden = false;
      this.modal.innerHTML = '';
      const close = h('button', { class: 'tm-cta', onclick: () => this.closeTerm() }, 'Got it');
      this.modal.append(h('div', { class: 'tm-modal-card tm-pop' }, h('div', { class: 'tm-wk' }, 'Word'), h('h3', null, g.term), h('p', null, g.def), close));
      close.focus();
      const e = ((window.BFZ_AUDIO || {}).glossary || {})[g.term];
      if (!this.muted && e && e.h === textHash(g.term + '. ' + g.def)) {
        this.termAudio = this.termAudio || new Audio();
        this.termAudio.src = e.f; this.termAudio.playbackRate = this.rate; this.termAudio.play().catch(() => {});
      } else if (!this.muted && synth) {
        const u = new SpeechSynthesisUtterance(g.term + '. ' + g.def); const v = pickVoice(); if (v) u.voice = v; u.rate = this.rate; synth.speak(u);
      }
    }
    closeTerm() {
      this.modal.hidden = true;
      if (this.termAudio) this.termAudio.pause();
      if (synth && !this.usingAudio) synth.cancel();
      if (this.termWasPlaying && !this.playing) this.toggle();
    }

    // ---- go to a step
    go(i) {
      if (i < 0) i = 0;
      this.clearTimers(); this.stopVoice(); this.unspot();
      if (!this.modal.hidden) { this.modal.hidden = true; if (this.termAudio) this.termAudio.pause(); }
      if (i >= this.scenes.length) return this.finish();
      this.idx = i;
      this.overlay.classList.remove('idle', 'paused');
      store.set('pos:' + this.page, i);
      this.playing = true; this.playBtn.textContent = '⏸';
      const sc = this.scenes[i];
      const rec = this.rec(i);
      this.counter.textContent = `${i + 1} / ${this.scenes.length}`;
      this.setProgress(0);
      const dur = rec ? (rec.d * 1000) / this.rate : estimateMs(sc.say, this.rate);
      this.stage.innerHTML = '';
      this.stage.scrollTop = 0;
      this.stage.className = 'tm-stage';
      const mini = !!sc.point;
      this.overlay.classList.toggle('mini', mini);
      document.body.classList.toggle('tm-lock', !mini);
      if (mini) {
        const el = $(sc.point);
        const target = el ? (el.closest('.exercise') || el) : null;
        if (target) { target.scrollIntoView({ block: 'center', behavior: REDUCE ? 'auto' : 'smooth' }); this.after(400, () => target.classList.add('tm-spot')); }
      } else {
        const ttl = sceneTitle(sc);
        if (ttl && !sc.practice) this.stage.append(h('h2', { class: 'tm-scene-title tm-rise' }, ttl));
        if (sc.practice) this.practice(sc);
        else {
          const show = sc.show || { type: 'title', title: '' };
          const holder = h('div', { class: 'tm-visual' });
          this.stage.append(holder);
          const fn = R[show.type];
          try { if (fn) fn(holder, show, { dur, after: (ms, f) => this.after(ms, f) }); } catch (e) { console.error('teacher scene error', e); }
        }
      }
      this.caption(sc.say);
      this.showTerms(sc.say);
      this.speak(sc.say, rec, dur, () => {
        if (!this.playing) return;
        if (sc.practice) return; // practice: wait for the student (or Continue)
        this.after(sc.pause || 650, () => this.go(this.idx + 1));
      });
    }
    setProgress(frac) {
      const n = this.scenes.length || 1;
      $('i', this.prog).style.width = (Math.min(1, (Math.min(this.idx, n) + frac) / n) * 100) + '%';
    }
    caption(text) {
      this.capText.innerHTML = '';
      this.words = [];
      const re = /\S+/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const sp = h('span', { class: 'tm-w' }, m[0]);
        this.words.push({ el: sp, start: m.index, end: m.index + m[0].length });
        this.capText.append(sp, ' ');
      }
      this.capText.classList.remove('tm-rise'); void this.capText.offsetWidth; this.capText.classList.add('tm-rise');
    }
    markWord(abs) {
      for (const w of this.words) { w.el.classList.toggle('said', w.end <= abs); w.el.classList.toggle('now', abs >= w.start && abs < w.end); }
    }
    timeWords(fromChar, toChar, ms, token) {
      const ws = this.words.filter(w => w.start >= fromChar && w.start < toChar);
      if (!ws.length) return;
      const step = ms / ws.length;
      ws.forEach((w, i) => this.after(i * step, () => { if (token === this.token && !this.boundaryWorks) this.markWord(w.start); }));
    }
    // follow the recording: words light up using the saved sentence timings
    tick() {
      const a = this.audio, rec = this.curRec;
      if (!rec || !this.usingAudio) return;
      const once = arguments[0] === 'once';
      const t = a.currentTime;
      let pos = 0;
      for (const [cs, ce, t0, t1] of rec.s) {
        if (t >= t1) { pos = ce; continue; }
        if (t >= t0) pos = cs + (ce - cs) * ((t - t0) / Math.max(0.01, t1 - t0));
        break;
      }
      this.markWord(pos);
      if (rec.d) this.setProgress(Math.min(1, t / rec.d));
      if (!once && !a.paused && !a.ended) { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.tick()); }
    }
    speak(text, rec, dur, done) {
      const token = ++this.token;
      let finished = false;
      const finish = () => {
        if (finished || token !== this.token) return;
        finished = true;
        this.usingAudio = false;
        this.avatar.classList.remove('speaking');
        this.markWord(text.length + 1);
        this.setProgress(1);
        done();
      };
      // 1) recorded voice
      if (rec) {
        const a = this.audio;
        this.curRec = rec;
        this.usingAudio = true;
        a.muted = this.muted;
        a.src = rec.f;
        a.playbackRate = this.rate;
        a.onended = () => { if (token === this.token) finish(); };
        // also follow the audio's own clock (keeps working when animation frames are paused, e.g. a background tab)
        a.ontimeupdate = () => { if (token === this.token) this.tick('once'); };
        a.onerror = () => { if (token !== this.token) return; this.usingAudio = false; this.timeWords(0, text.length, dur * 0.95, token); this.after(dur, finish); };
        a.play().then(() => { this.notice.hidden = true; this.avatar.classList.add('speaking'); this.tick(); }).catch(() => {
          if (token !== this.token) return;
          // autoplay blocked: wait for the student to press play
          this.playing = false; this.playBtn.textContent = '▶'; this.overlay.classList.add('paused'); this.freezeTimers();
          this.flashNotice('Press ▶ to start the voice.');
        });
        return;
      }
      // 2) no recording: silent (muted) or the browser's voice
      if (this.muted || !synth) {
        this.avatar.classList.add('speaking');
        this.timeWords(0, text.length, dur * 0.95, token);
        this.after(dur, finish);
        return;
      }
      const voice = pickVoice();
      const parts = sentences(text);
      let k = 0;
      this.boundaryWorks = false;
      this.after(dur * 2.2 + 6000, finish);
      const next = () => {
        if (token !== this.token) return;
        if (k >= parts.length) return finish();
        const p = parts[k];
        const u = new SpeechSynthesisUtterance(p.text.trim());
        u.rate = this.rate * 0.95;
        if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-GB';
        u.onstart = () => { if (token === this.token) this.avatar.classList.add('speaking'); if (token === this.token && !this.boundaryWorks) this.timeWords(p.start, p.start + p.text.length, estimateMs(p.text, this.rate) - 500, token); };
        u.onboundary = e => { if (token !== this.token || e.name === 'sentence') return; this.boundaryWorks = true; this.markWord(p.start + (p.text.length - p.text.trimStart().length) + e.charIndex); };
        u.onend = () => { k++; next(); };
        u.onerror = e => { if (e.error === 'interrupted' || e.error === 'canceled') return; k++; next(); };
        this.keep.push(u); if (this.keep.length > 40) this.keep.splice(0, 20);
        synth.speak(u);
      };
      next();
    }
    finish() {
      this.idx = this.scenes.length;
      store.set('pos:' + this.page, 0);
      try { localStorage.setItem('bfz:done:' + this.page, 'true'); } catch (e) { /* ignore */ }
      const li = $(`.sidebar li[data-file="${this.page}"]`);
      if (li) li.classList.add('done');
      this.overlay.classList.remove('mini');
      document.body.classList.add('tm-lock');
      this.counter.textContent = 'done';
      this.setProgress(1);
      this.stage.innerHTML = '';
      this.terms.innerHTML = '';
      const next = $('.pager a.next');
      const firstEx = $('main .exercise');
      this.stage.append(h('div', { class: 'tm-title-card' },
        avatarImg('tm-hero-face tm-pop'),
        h('h2', { class: 'tm-rise d1' }, 'That\'s this lesson!'),
        h('p', { class: 'tm-rise d2' }, 'Now it\'s your turn. Close teacher mode and do the practice on the page — that\'s where the learning sticks.'),
        h('div', { class: 'tm-end-btns tm-rise d2' },
          firstEx ? h('button', { class: 'tm-cta', onclick: () => { this.close(); firstEx.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }, '✏️ Start the practice') : null,
          h('button', { class: 'tm-cta ghost', onclick: () => this.go(0) }, '↺ Watch again'),
          next ? h('a', { class: 'tm-cta ghost', href: next.getAttribute('href') }, 'Next chapter →') : null)));
      const line = (window.BFZ_LINES || {}).finish || 'Well done!';
      this.caption(line);
      this.playing = false; this.playBtn.textContent = '▶';
      this.speak(line, this.lineRec('finish'), 3500, () => {});
    }
    close() {
      this.clearTimers(); this.stopVoice(); this.unspot();
      if (this.termAudio) this.termAudio.pause();
      document.removeEventListener('keydown', this.keyHandler);
      document.body.classList.remove('tm-open', 'tm-lock');
      if (this.overlay) this.overlay.remove();
      if (window.BFZTeacher.current === this) window.BFZTeacher.current = null;
    }
  }

  window.BFZTeacher = {
    current: null,
    open(page, opts) {
      if (this.current) this.current.close();
      this.current = new Player(page);
      this.current.open(opts);
      return this.current;
    },
    close() { if (this.current) this.current.close(); },
    has(page) { return !!((window.BFZ_LESSONS || {})[page] || []).length; },
    renderers: R,
  };
})();
