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
  const AVATAR = 'assets/teacher-avatar.png';
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
      if (first) first.scrollIntoView({ block: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' });
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
  R.postman = (st, s, ctx) => {
    const url = h('span', { class: 'tm-pm-url-text' });
    const send = h('span', { class: 'tm-pm-send' }, 'Send');
    const app = h('div', { class: 'tm-pm tm-rise' },
      h('div', { class: 'tm-pm-top' }, h('span', { class: 'tm-pm-logo', html: (window.BFZ_ICONS || {}).postman || '' }), 'Postman', h('span', { class: 'tm-pm-tab' }, s.tab || 'Travel API')),
      h('div', { class: 'tm-pm-bar' }, h('span', { class: 'tm-pm-method m-' + (METHOD_TONE[s.method] || 'g') }, s.method), h('span', { class: 'tm-pm-url' }, url, h('span', { class: 'tm-caret' })), send));
    let bodyCode = null;
    if (s.body) {
      bodyCode = h('code', { class: 'tm-pm-body' });
      app.append(h('div', { class: 'tm-pm-tabs' }, h('span', null, 'Params'), h('span', { class: 'on' }, 'Body'), h('span', null, 'Headers'), h('span', { class: 'tm-pm-raw' }, 'raw'), h('span', { class: 'tm-pm-json' }, 'JSON ▾')), h('pre', { class: 'tm-pm-bodybox' }, bodyCode));
    }
    const resp = h('div', { class: 'tm-pm-resp', hidden: true });
    app.append(resp);
    st.append(app);
    let t = 300;
    const full = s.url;
    for (let i = 1; i <= full.length; i++) ctx.after(t + i * 26, () => { url.textContent = full.slice(0, i); });
    t += full.length * 26 + 300;
    ctx.after(t, () => { const c = $('.tm-caret', app); if (c) c.remove(); });
    if (s.body) {
      const n = s.body.split('\n').length;
      ctx.after(t, () => { bodyCode.innerHTML = splitHtmlLines(highlight(s.body, 'json')).map(l => `<div class="tm-line">${l || ' '}</div>`).join(''); typeLines($$('.tm-line', bodyCode), Math.min(2400, n * 500), 0); });
      t += Math.min(2400, n * 500) + 500;
    }
    const sendAt = Math.max(t, ctx.dur * 0.45);
    ctx.after(sendAt, () => send.classList.add('pressed'));
    ctx.after(sendAt + 700, () => {
      const code = parseInt(s.status, 10);
      const tone = code >= 500 ? 'b' : code >= 400 ? 'w' : 'g';
      resp.hidden = false; resp.innerHTML = '';
      resp.append(h('div', { class: 'tm-pm-resp-head' }, 'Response', h('span', { class: 'tm-pill tone-' + tone + ' tm-pop' }, s.status), s.time ? h('span', { class: 'tm-pm-time' }, s.time) : null));
      if (s.response) resp.append(h('pre', { class: 'tm-pm-resp-body tm-rise' }, h('code', { html: highlight(s.response, /^\s*[[{]/.test(s.response) ? 'json' : 'plain') })));
      if (s.note) resp.append(h('div', { class: 'tm-pm-note tm-rise d2', html: md(s.note) }));
    });
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
      if (op.add) { const r = rowEl(op.add, tb.children.length + 100); r.classList.add('tm-row-new'); tb.append(r); r.scrollIntoView({ block: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' }); }
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
          tr.scrollIntoView({ block: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' });
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
      const t = a.currentTime;
      let pos = 0;
      for (const [cs, ce, t0, t1] of rec.s) {
        if (t >= t1) { pos = ce; continue; }
        if (t >= t0) pos = cs + (ce - cs) * ((t - t0) / Math.max(0.01, t1 - t0));
        break;
      }
      this.markWord(pos);
      if (rec.d) this.setProgress(Math.min(1, t / rec.d));
      if (!a.paused && !a.ended) this.raf = requestAnimationFrame(() => this.tick());
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
