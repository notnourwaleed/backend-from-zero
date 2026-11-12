/* =====================================================================
   Backend from Zero — Teacher mode
   A narrated, animated walkthrough of each page.
   - voice: the browser's built-in speech (Web Speech API), split per sentence
   - captions with word highlighting
   - "scenes": each scene = what the teacher says + an animation (or a pointer
     to a section of the page)
   Lessons live in teacher-lessons.js (window.BFZ_LESSONS).
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
  // tiny markdown: `code` and **bold**
  const md = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bfz:tm:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bfz:tm:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- speech
  const synth = window.speechSynthesis || null;
  let voices = [];
  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang));
  }
  if (synth) {
    loadVoices();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices); else synth.onvoiceschanged = loadVoices;
  }
  function pickVoice(name) {
    if (!voices.length) return null;
    if (name) { const v = voices.find(x => x.name === name); if (v) return v; }
    const prefs = [/natural/i, /aria|jenny|guy|libby|sonia|ava|andrew|emma/i, /google us english/i, /google uk english female/i, /samantha|daniel|karen|moira/i, /zira|david|mark|hazel/i];
    for (const p of prefs) { const v = voices.find(x => p.test(x.name)); if (v) return v; }
    return voices.find(x => /en-US/i.test(x.lang)) || voices[0];
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
  const estimateMs = (text, rate) => Math.max(1600, (text.split(/\s+/).length / 2.55) * 1000 / rate + 500);

  // ---------------------------------------------------------------- code helpers
  // split highlighted HTML into lines, closing/reopening spans that cross line breaks
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
    splitHtmlLines(highlight(code.replace(/\s+$/, ''), lang)).forEach((ln, i) => {
      el.append(h('div', { class: 'tm-line', 'data-n': i + 1, html: ln || ' ' }));
    });
    return h('pre', { class: 'tm-pre' }, el);
  }
  function typeLines(lines, totalMs, startDelay = 0) {
    // CSS "typing" reveal, line by line, with syntax colours kept
    const lens = lines.map(l => Math.max(1, l.textContent.length));
    const total = lens.reduce((a, b) => a + b, 0);
    const per = Math.min(38, Math.max(6, totalMs / total));
    let t = startDelay;
    lines.forEach((l, i) => {
      const d = Math.max(60, lens[i] * per);
      if (REDUCE) return;
      l.classList.add('tm-typing');
      l.style.setProperty('--n', lens[i]);
      l.style.setProperty('--d', d + 'ms');
      l.style.setProperty('--delay', t + 'ms');
      t += d + 40;
    });
    return REDUCE ? 0 : t;
  }

  // ---------------------------------------------------------------- renderers
  const R = {};

  R.title = (st, s) => {
    st.append(h('div', { class: 'tm-title-card' },
      s.emoji ? h('div', { class: 'tm-big-emoji tm-pop' }, s.emoji) : null,
      s.kicker ? h('div', { class: 'tm-kicker tm-rise' }, s.kicker) : null,
      h('h2', { class: 'tm-rise d1' }, s.title),
      s.sub ? h('p', { class: 'tm-rise d2' }, s.sub) : null));
  };

  R.bullets = (st, s, ctx) => {
    const ul = h('ul', { class: 'tm-bullets' + (s.big ? ' big' : '') });
    st.append(s.title ? h('h3', { class: 'tm-h tm-rise' }, s.title) : null, ul);
    const items = s.items || [];
    const gap = Math.min(1600, (ctx.dur * 0.78) / Math.max(1, items.length));
    items.forEach((it, i) => ctx.after(250 + i * gap, () => {
      const [emo, text] = Array.isArray(it) ? it : [null, it];
      ul.append(h('li', { class: 'tm-pop-in' }, emo ? h('span', { class: 'tm-emo' }, emo) : null, h('span', { html: md(text) })));
    }));
  };

  R.code = (st, s, ctx) => {
    const box = h('div', { class: 'tm-code' });
    if (s.title) st.append(h('h3', { class: 'tm-h tm-rise' }, s.title));
    if (s.file) box.append(h('div', { class: 'tm-file' }, '📄 ' + s.file));
    const pre = codeBlock(s.code, s.lang);
    box.append(pre);
    const note = h('div', { class: 'tm-note', hidden: true });
    box.append(note);
    st.append(box);
    const lines = $$('.tm-line', pre);
    const typed = s.type === false ? 0 : typeLines(lines, Math.min(ctx.dur * 0.5, 5200), 200);
    const steps = s.hl || [];
    if (!steps.length) return;
    const start = typed + 300;
    const gap = Math.max(900, (ctx.dur * 0.92 - start) / steps.length);
    steps.forEach((stp, i) => ctx.after(start + i * gap, () => {
      const o = typeof stp === 'object' && !Array.isArray(stp) ? stp : { lines: stp };
      let ls = o.lines;
      if (typeof ls === 'number') ls = [ls];
      if (Array.isArray(ls) && ls.length === 2 && typeof ls[0] === 'number' && o.range !== false && !Array.isArray(o.lines) === false && ls[1] - ls[0] > 0 && o.span) ls = Array.from({ length: ls[1] - ls[0] + 1 }, (_, k) => ls[0] + k);
      lines.forEach(l => l.classList.remove('hl'));
      (ls || []).forEach(n => { const l = lines[n - 1]; if (l) { l.classList.add('hl'); } });
      const first = lines[(ls || [])[0] - 1];
      if (first) first.scrollIntoView({ block: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' });
      if (o.note) { note.hidden = false; note.classList.remove('tm-pop-in'); void note.offsetWidth; note.classList.add('tm-pop-in'); note.innerHTML = md(o.note); }
    }));
  };

  R.terminal = (st, s, ctx) => {
    const body = h('div', { class: 'tm-term-body' });
    st.append(s.title ? h('h3', { class: 'tm-h tm-rise' }, s.title) : null,
      h('div', { class: 'tm-term tm-rise' }, h('div', { class: 'tm-term-bar' }, h('i'), h('i'), h('i'), h('span', null, s.label || 'Terminal')), body));
    const prompt = s.prompt || 'PS C:\\Users\\you\\my-backend>';
    let t = 300;
    const cps = 28;
    (s.lines || []).forEach(line => {
      if (line.cmd !== undefined) {
        const typed = h('span', { class: 'tm-cmd' });
        const row = h('div', { class: 'tm-term-line' }, h('span', { class: 'tm-prompt' }, prompt + ' '), typed, h('span', { class: 'tm-caret' }));
        ctx.after(t, () => { body.append(row); });
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

  R.flow = (st, s, ctx) => {
    if (s.title) st.append(h('h3', { class: 'tm-h tm-rise' }, s.title));
    const wrap = h('div', { class: 'tm-flow' + (s.vertical ? ' vertical' : '') });
    const nodes = s.nodes.map((n, i) => h('div', { class: 'tm-node tone-' + (n.tone || 'n') + ' tm-pop', style: { animationDelay: (i * 120) + 'ms' } },
      n.emoji ? h('div', { class: 'tm-node-emoji' }, n.emoji) : null,
      h('div', { class: 'tm-node-label', html: md(n.label) }),
      n.sub ? h('div', { class: 'tm-node-sub', html: md(n.sub) }) : null));
    nodes.forEach(n => wrap.append(n));
    const packet = h('div', { class: 'tm-packet' });
    wrap.append(packet);
    const caption = h('div', { class: 'tm-flow-cap' });
    st.append(wrap, caption);
    const moves = s.moves || [];
    const start = 200 + s.nodes.length * 120 + 300;
    const gap = Math.max(1100, (ctx.dur * 0.9 - start) / Math.max(1, moves.length));
    const center = (el) => {
      const r = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      return { x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2 };
    };
    moves.forEach((mv, i) => ctx.after(start + i * gap, () => {
      const a = nodes[mv.from], b = nodes[mv.to === undefined ? mv.from : mv.to];
      if (!a || !b) return;
      nodes.forEach(n => n.classList.remove('active'));
      packet.className = 'tm-packet show tone-' + (mv.tone || 'a');
      packet.innerHTML = md(mv.label || '');
      const p1 = center(a), p2 = center(b);
      packet.style.transition = 'none';
      packet.style.left = p1.x + 'px'; packet.style.top = p1.y + 'px';
      void packet.offsetWidth;
      const travel = Math.min(gap * 0.7, 1500);
      packet.style.transition = REDUCE ? 'none' : `left ${travel}ms cubic-bezier(.5,0,.3,1), top ${travel}ms cubic-bezier(.5,0,.3,1)`;
      packet.style.left = p2.x + 'px'; packet.style.top = p2.y + 'px';
      a.classList.add('active');
      ctx.after(REDUCE ? 0 : travel, () => { a.classList.remove('active'); b.classList.add('active', 'bump'); ctx.after(500, () => b.classList.remove('bump')); });
      if (mv.cap) { caption.innerHTML = md(mv.cap); caption.classList.remove('tm-pop-in'); void caption.offsetWidth; caption.classList.add('tm-pop-in'); }
    }));
  };

  const METHOD_TONE = { GET: 'g', POST: 'w', PUT: 'a', PATCH: 'p', DELETE: 'b' };
  R.postman = (st, s, ctx) => {
    if (s.title) st.append(h('h3', { class: 'tm-h tm-rise' }, s.title));
    const url = h('span', { class: 'tm-pm-url-text' });
    const send = h('span', { class: 'tm-pm-send' }, 'Send');
    const app = h('div', { class: 'tm-pm tm-rise' },
      h('div', { class: 'tm-pm-top' }, h('span', { class: 'tm-pm-logo' }, '✉'), 'Postman', h('span', { class: 'tm-pm-tab' }, s.tab || 'Travel API')),
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
      const lines = s.body.split('\n');
      ctx.after(t, () => { bodyCode.innerHTML = splitHtmlLines(highlight(s.body, 'json')).map(l => `<div class="tm-line">${l || ' '}</div>`).join(''); typeLines($$('.tm-line', bodyCode), Math.min(2400, lines.length * 500), 0); });
      t += Math.min(2400, lines.length * 500) + 500;
    }
    const sendAt = Math.max(t, ctx.dur * 0.45);
    ctx.after(sendAt, () => send.classList.add('pressed'));
    ctx.after(sendAt + 700, () => {
      const code = parseInt(s.status, 10);
      const tone = code >= 500 ? 'b' : code >= 400 ? 'w' : 'g';
      resp.hidden = false;
      resp.innerHTML = '';
      resp.append(h('div', { class: 'tm-pm-resp-head' }, 'Response', h('span', { class: 'tm-pill tone-' + tone + ' tm-pop' }, s.status), s.time ? h('span', { class: 'tm-pm-time' }, s.time) : null));
      if (s.response) resp.append(h('pre', { class: 'tm-pm-resp-body tm-rise' }, h('code', { html: highlight(s.response, s.response.trim().startsWith('{') || s.response.trim().startsWith('[') ? 'json' : 'plain') })));
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
  function rowEl(r, i) {
    return h('tr', { 'data-i': i }, r.map(v => v === null ? h('td', { class: 'null' }, 'NULL') : h('td', null, String(v))));
  }

  R.table = (st, s, ctx) => {
    if (s.title) st.append(h('h3', { class: 'tm-h tm-rise' }, s.title));
    let t0 = 200;
    if (s.sql) {
      const q = h('div', { class: 'tm-sql tm-rise' });
      q.append(codeBlock(s.sql, 'sql'));
      st.append(q);
      t0 = typeLines($$('.tm-line', q), Math.min(2600, ctx.dur * 0.3), 300) + 400;
    }
    const table = miniTable(s);
    const wrap = h('div', { class: 'tm-table-wrap tm-rise d1' }, table);
    st.append(wrap);
    const msg = h('div', { class: 'tm-table-msg' });
    st.append(msg);
    const tb = $('tbody', table);
    const row = i => $(`tr[data-i="${i}"]`, tb);
    const ops = s.ops || [];
    const gap = Math.max(700, (ctx.dur * 0.88 - t0) / Math.max(1, ops.length));
    const say = (m) => { if (!m) return; msg.innerHTML = md(m); msg.classList.remove('tm-pop-in'); void msg.offsetWidth; msg.classList.add('tm-pop-in'); };
    ops.forEach((op, k) => ctx.after(t0 + k * gap, () => {
      if (op.walk) {
        const idx = op.walk === true ? s.rows.map((_, i) => i) : op.walk;
        const g = Math.min(700, gap / (idx.length + 1));
        idx.forEach((i, j) => ctx.after(j * g, () => {
          $$('tr', tb).forEach(r => r.classList.remove('walk'));
          const r = row(i); if (r) r.classList.add('walk');
          if (op.stopAt === i) { r.classList.remove('walk'); r.classList.add('hl'); }
        }));
        ctx.after(idx.length * g, () => { if (op.stopAt === undefined) $$('tr', tb).forEach(r => r.classList.remove('walk')); });
      }
      if (op.hl) op.hl.forEach(i => { const r = row(i); if (r) r.classList.add('hl'); });
      if (op.only) $$('tr', tb).forEach(r => { const keep = op.only.includes(+r.dataset.i); r.classList.toggle('fade', !keep); r.classList.toggle('hl', keep); });
      if (op.unfade) $$('tr', tb).forEach(r => r.classList.remove('fade', 'hl'));
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
    if (s.title) st.append(h('h3', { class: 'tm-h tm-rise' }, s.title));
    let t0 = 200;
    if (s.sql) {
      const q = h('div', { class: 'tm-sql tm-rise' });
      q.append(codeBlock(s.sql, 'sql'));
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
    const gap = Math.max(450, (ctx.dur * 0.55 - t0) / Math.max(1, pairs.length + (s.unmatched || []).length));
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
    (s.unmatched || []).forEach((li, k) => ctx.after(t0 + (pairs.length + k) * gap, () => {
      const a = $(`tbody tr[data-i="${li}"]`, L);
      if (a) { a.classList.add('nomatch'); a.lastChild.append(h('span', { class: 'tm-null-tag tm-pop' }, '  → no match: NULL')); }
    }));
    if (s.result) {
      const tR = t0 + (pairs.length + (s.unmatched || []).length) * gap + 300;
      ctx.after(tR, () => {
        const res = miniTable(Object.assign({}, s.result, { rows: [] }));
        resWrap.append(h('div', { class: 'tm-join-arrow tm-pop' }, '⬇ result'), h('div', { class: 'tm-table-wrap' }, res));
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
    if (s.title) st.append(h('h3', { class: 'tm-h tm-rise' }, s.title));
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
    if (s.title) st.append(h('h3', { class: 'tm-h tm-rise' }, s.title));
    const row = h('div', { class: 'tm-mem' });
    const msg = h('div', { class: 'tm-table-msg' });
    st.append(row, msg);
    const boxes = {};
    const ops = s.ops || [];
    const gap = Math.max(800, (ctx.dur * 0.88) / Math.max(1, ops.length));
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

  // ---------------------------------------------------------------- player
  class Player {
    constructor(page) {
      this.page = page;
      this.scenes = (window.BFZ_LESSONS || {})[page] || [];
      this.idx = 0;
      this.playing = true;
      this.muted = store.get('muted', false) || !synth;
      this.rate = store.get('rate', 1);
      this.voiceName = store.get('voice', '');
      this.timers = [];
      this.token = 0;
      this.keep = [];
    }
    open(opts = {}) {
      if (!this.scenes.length) { alert('There is no teacher lesson for this page yet.'); return; }
      this.build();
      document.body.classList.add('tm-open', 'tm-lock');
      this.keyHandler = e => this.onKey(e);
      document.addEventListener('keydown', this.keyHandler);
      if (opts.autostart) this.go(opts.from || 0); else this.showStart();
      if (synth && !voices.length) setTimeout(() => { loadVoices(); this.fillVoices(); if (!voices.length) this.flashNotice('No voice found in this browser — showing subtitles only. For sound, try Chrome or Edge.'); }, 1200);
    }
    showStart() {
      this.clearTimers(); this.stopSpeech(); this.restoreMoved();
      this.overlay.classList.add('idle');
      this.overlay.classList.remove('mini');
      this.playing = false;
      const title = (document.title || '').split('·')[0].trim();
      const kicker = ($('main .kicker') || {}).textContent || '';
      const mins = Math.max(1, Math.round(this.scenes.reduce((a, s) => a + estimateMs(s.say, 1) + 700, 0) / 60000));
      const practices = this.scenes.filter(s => s.practice).length;
      const saved = store.get('pos:' + this.page, 0);
      this.stage.innerHTML = '';
      this.stage.className = 'tm-stage';
      this.stage.append(h('div', { class: 'tm-title-card tm-start' },
        h('div', { class: 'tm-big-emoji tm-pop' }, '🧑‍🏫'),
        kicker ? h('div', { class: 'tm-kicker tm-rise' }, kicker) : null,
        h('h2', { class: 'tm-rise d1' }, title),
        h('p', { class: 'tm-rise d2' }, `${this.scenes.length} steps · about ${mins} min of explaining${practices ? ` · ${practices} practice stop${practices > 1 ? 's' : ''} where I wait for you` : ''}`),
        h('div', { class: 'tm-end-btns tm-rise d2' },
          h('button', { class: 'tm-cta', onclick: () => this.begin(0) }, '▶ Start lesson'),
          saved > 0 && saved < this.scenes.length ? h('button', { class: 'tm-cta ghost', onclick: () => this.begin(saved) }, `⏩ Resume from step ${saved + 1}`) : null,
          h('button', { class: 'tm-cta ghost', onclick: () => this.toReading() }, '📖 Read instead')),
        h('p', { class: 'tm-hint tm-rise d2' }, 'A voice explains each step with animations. Turn your sound on. Keys: Space = pause, ← → = steps, Esc = close.')));
      this.capText.textContent = 'Press Start when you are ready.';
      this.counter.textContent = '';
    }
    begin(i) {
      this.overlay.classList.remove('idle');
      if (synth) { try { synth.cancel(); synth.resume(); } catch (e) { /* ignore */ } }
      this.go(i);
    }
    toReading() {
      try { localStorage.setItem('bfz-mode', 'read'); } catch (e) { /* ignore */ }
      document.dispatchEvent(new CustomEvent('bfz:mode', { detail: 'read' }));
      this.close();
    }
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
    practice(sc, dur) {
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
      const token = this.token;
      this.solvedHandler = (e) => {
        const root = items.find(it => it === e.target || it.contains(e.target));
        if (!root || !left.has(root)) return;
        left.delete(root);
        paint();
        if (!left.size && items.length) this.celebrate(token);
      };
      ex.addEventListener('bfz:solved', this.solvedHandler);
      this.practiceEx = ex;
      this.waiting = items.length > 0;
    }
    celebrate() {
      this.waiting = false;
      this.clearTimers(); this.stopSpeech();
      const bar = $('.tm-wait', this.stage);
      if (bar) { bar.classList.add('done'); $('.tm-wait-text', bar).textContent = '🎉 Correct! Moving on…'; }
      this.confetti();
      this.chime();
      const praise = ['Great job! That is exactly right.', 'Yes! All correct. Well done.', 'Perfect — you got it!', 'Excellent work. On to the next step.'];
      const say = praise[Math.floor(Math.random() * praise.length)];
      this.caption(say);
      this.speak(say, 2200, () => { if (this.playing) this.after(500, () => this.go(this.idx + 1)); });
    }
    confetti() {
      if (REDUCE) return;
      const box = h('div', { class: 'tm-confetti', 'aria-hidden': 'true' });
      const colors = ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#7c3aed', '#06b6d4'];
      for (let i = 0; i < 70; i++) {
        box.append(h('i', { style: { left: (Math.random() * 100) + '%', background: colors[i % colors.length], animationDelay: (Math.random() * 300) + 'ms', animationDuration: (1100 + Math.random() * 900) + 'ms', transform: `rotate(${Math.random() * 360}deg)` } }));
      }
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
          g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.09 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.35);
          o.connect(g).connect(this.ac.destination);
          o.start(now + i * 0.09); o.stop(now + i * 0.09 + 0.4);
        });
      } catch (e) { /* no audio */ }
    }
    build() {
      const title = (document.title || '').split('·')[0].trim();
      this.stage = h('div', { class: 'tm-stage', 'aria-live': 'off' });
      this.capText = h('p', { class: 'tm-cap-text' });
      this.avatar = h('div', { class: 'tm-avatar', 'aria-hidden': 'true' }, h('span', { class: 'tm-face' }, '🧑‍🏫'), h('span', { class: 'tm-eq' }, h('i'), h('i'), h('i'), h('i')));
      this.playBtn = h('button', { class: 'tm-btn tm-play', title: 'Play / pause (Space)', 'aria-label': 'Play or pause', onclick: () => this.toggle() }, '⏸');
      this.dots = h('div', { class: 'tm-dots' });
      this.scenes.forEach((_, i) => this.dots.append(h('button', { class: 'tm-dot', title: 'Step ' + (i + 1), 'aria-label': 'Go to step ' + (i + 1), onclick: () => this.go(i) })));
      this.counter = h('span', { class: 'tm-counter' });
      this.muteBtn = h('button', { class: 'tm-btn', title: 'Sound on / off', 'aria-label': 'Sound on or off', onclick: () => this.toggleMute() });
      this.rateSel = h('select', { class: 'tm-sel', 'aria-label': 'Speaking speed' }, [0.8, 1, 1.15, 1.3, 1.5].map(r => h('option', { value: r }, r + '×')));
      this.rateSel.value = String(this.rate);
      this.rateSel.addEventListener('change', () => { this.rate = parseFloat(this.rateSel.value); store.set('rate', this.rate); this.restart(); });
      this.voiceSel = h('select', { class: 'tm-sel tm-voice', 'aria-label': 'Voice' });
      this.voiceSel.addEventListener('change', () => { this.voiceName = this.voiceSel.value; store.set('voice', this.voiceName); this.restart(); });
      this.notice = h('div', { class: 'tm-notice', hidden: true });
      this.panel = h('div', { class: 'tm-panel', role: 'dialog', 'aria-label': 'Teacher mode' },
        h('div', { class: 'tm-head' },
          h('span', { class: 'tm-badge' }, '🎓 Teacher mode'),
          h('span', { class: 'tm-head-title' }, title),
          h('button', { class: 'tm-close', title: 'Switch to reading mode', onclick: () => this.toReading() }, '📖 Read mode')),
        this.stage,
        this.notice,
        h('div', { class: 'tm-caption' }, this.avatar, this.capText),
        h('div', { class: 'tm-controls' },
          h('button', { class: 'tm-btn', title: 'Previous step (←)', 'aria-label': 'Previous step', onclick: () => this.go(this.idx - 1) }, '⏮'),
          this.playBtn,
          h('button', { class: 'tm-btn', title: 'Next step (→)', 'aria-label': 'Next step', onclick: () => this.go(this.idx + 1) }, '⏭'),
          this.dots, this.counter,
          h('span', { class: 'tm-ctl-right' }, this.muteBtn, this.rateSel, this.voiceSel)));
      this.overlay = h('div', { class: 'tm-overlay' }, this.panel);
      document.body.append(this.overlay);
      this.fillVoices();
      this.paintMute();
    }
    fillVoices() {
      if (!this.voiceSel) return;
      this.voiceSel.innerHTML = '';
      if (!voices.length) { this.voiceSel.hidden = true; return; }
      this.voiceSel.hidden = false;
      const chosen = pickVoice(this.voiceName);
      voices.forEach(v => this.voiceSel.append(h('option', { value: v.name }, v.name.replace(/^Microsoft /, '').replace(/ Online \(Natural\)/, ' (natural)') + ' · ' + v.lang)));
      if (chosen) this.voiceSel.value = chosen.name;
    }
    flashNotice(t) { this.notice.textContent = t; this.notice.hidden = false; }
    paintMute() { this.muteBtn.textContent = this.muted ? '🔇' : '🔊'; this.muteBtn.classList.toggle('off', this.muted); }
    toggleMute() {
      if (!synth) { this.flashNotice('This browser has no speech — subtitles only.'); return; }
      this.muted = !this.muted; store.set('muted', this.muted); this.paintMute(); this.restart();
    }
    onKey(e) {
      if (e.target && (/SELECT|INPUT|TEXTAREA|BUTTON/.test(e.target.tagName) || e.target.closest('.CodeMirror, .tm-in-stage'))) return;
      if (this.overlay.classList.contains('idle')) { if (e.key === 'Escape') this.toReading(); return; }
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === ' ' || e.key === 'k') { e.preventDefault(); this.toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.go(this.idx + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.idx - 1); }
    }
    after(ms, fn) { const id = setTimeout(fn, Math.max(0, ms)); this.timers.push(id); return id; }
    clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
    stopSpeech() { this.token++; if (synth) synth.cancel(); this.avatar.classList.remove('speaking'); }
    unspot() {
      $$('.tm-spot').forEach(e => e.classList.remove('tm-spot'));
      if (this.practiceEx && this.solvedHandler) this.practiceEx.removeEventListener('bfz:solved', this.solvedHandler);
      this.practiceEx = null; this.waiting = false;
      this.restoreMoved();
    }
    toggle() {
      this.playing = !this.playing;
      this.playBtn.textContent = this.playing ? '⏸' : '▶';
      this.overlay.classList.toggle('paused', !this.playing);
      if (this.playing) {
        if (this.idx >= this.scenes.length) this.go(0);
        else if (this.waiting) { /* stay in the practice; just re-read the instructions */ this.speak(this.scenes[this.idx].say, estimateMs(this.scenes[this.idx].say, this.rate), () => {}); }
        else this.restart();
      } else { this.stopSpeech(); if (!this.waiting) this.clearTimers(); }
    }
    restart() { if (this.idx < this.scenes.length) this.go(this.idx); }
    go(i) {
      if (i < 0) i = 0;
      this.clearTimers(); this.stopSpeech(); this.unspot();
      if (i >= this.scenes.length) return this.finish();
      this.idx = i;
      this.overlay.classList.remove('idle');
      store.set('pos:' + this.page, i);
      if (!this.playing) { this.playing = true; this.playBtn.textContent = '⏸'; this.overlay.classList.remove('paused'); }
      const sc = this.scenes[i];
      $$('.tm-dot', this.dots).forEach((d, j) => { d.classList.toggle('on', j === i); d.classList.toggle('done', j < i); });
      this.counter.textContent = `${i + 1} / ${this.scenes.length}`;
      this.notice.hidden = !this.notice.textContent || this.notice.dataset.sticky !== '1';
      const dur = estimateMs(sc.say, this.rate);
      this.stage.innerHTML = '';
      this.stage.scrollTop = 0;
      this.stage.className = 'tm-stage';
      const mini = !!sc.point;
      this.overlay.classList.toggle('mini', mini);
      document.body.classList.toggle('tm-lock', !mini);
      if (mini) {
        const el = $(sc.point);
        const target = el ? (el.closest('.exercise') || el) : null;
        if (target) {
          target.scrollIntoView({ block: 'center', behavior: REDUCE ? 'auto' : 'smooth' });
          this.after(400, () => target.classList.add('tm-spot'));
        }
      } else if (sc.practice) {
        this.practice(sc, dur);
      } else {
        const show = sc.show || { type: 'title', title: '' };
        const fn = R[show.type];
        try { if (fn) fn(this.stage, show, { dur, after: (ms, f) => this.after(ms, f) }); } catch (e) { console.error('teacher scene error', e); }
      }
      this.caption(sc.say);
      this.speak(sc.say, dur, () => {
        if (!this.playing) return;
        if (sc.practice && this.waiting) return; // wait for the student (or the Continue button)
        if (sc.practice) return;                  // no automatic checks: wait for Continue
        this.after(sc.pause || 650, () => this.go(this.idx + 1));
      });
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
      // fallback word highlighting by time
      const ws = this.words.filter(w => w.start >= fromChar && w.start < toChar);
      if (!ws.length) return;
      const step = ms / ws.length;
      ws.forEach((w, i) => this.after(i * step, () => { if (token === this.token && !this.boundaryWorks) this.markWord(w.start); }));
    }
    speak(text, dur, done) {
      const token = ++this.token;
      let finished = false;
      const finish = () => {
        if (finished || token !== this.token) return;
        finished = true;
        this.avatar.classList.remove('speaking');
        this.markWord(text.length + 1);
        done();
      };
      if (this.muted || !synth) {
        this.avatar.classList.add('speaking');
        this.timeWords(0, text.length, dur * 0.95, token);
        this.after(dur, finish);
        return;
      }
      const voice = pickVoice(this.voiceName);
      const parts = sentences(text);
      let k = 0;
      this.boundaryWorks = false;
      this.after(dur * 2.2 + 6000, finish); // safety net if the browser never says "end"
      const next = () => {
        if (token !== this.token) return;
        if (k >= parts.length) return finish();
        const p = parts[k];
        const u = new SpeechSynthesisUtterance(p.text.trim());
        u.rate = this.rate;
        if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
        u.onstart = () => { if (token !== this.token) return; this.avatar.classList.add('speaking'); if (!this.boundaryWorks) this.timeWords(p.start, p.start + p.text.length, estimateMs(p.text, this.rate) - 500, token); };
        u.onboundary = e => { if (token !== this.token || e.name === 'sentence') return; this.boundaryWorks = true; this.markWord(p.start + (p.text.length - p.text.trimStart().length) + e.charIndex); };
        u.onend = () => { k++; next(); };
        u.onerror = e => { if (e.error === 'interrupted' || e.error === 'canceled') return; k++; next(); };
        this.keep.push(u);
        if (this.keep.length > 40) this.keep.splice(0, 20);
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
      $$('.tm-dot', this.dots).forEach(d => { d.classList.remove('on'); d.classList.add('done'); });
      this.counter.textContent = 'done';
      this.stage.innerHTML = '';
      const next = $('.pager a.next');
      const firstEx = $('main .exercise');
      this.stage.append(h('div', { class: 'tm-title-card' },
        h('div', { class: 'tm-big-emoji tm-pop' }, '🎉'),
        h('h2', { class: 'tm-rise d1' }, 'That\'s this lesson!'),
        h('p', { class: 'tm-rise d2' }, 'Now it\'s your turn. Close teacher mode and do the practice on the page — that\'s where the learning sticks.'),
        h('div', { class: 'tm-end-btns tm-rise d2' },
          firstEx ? h('button', { class: 'tm-cta', onclick: () => { this.close(); firstEx.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }, '✏️ Start the practice') : null,
          h('button', { class: 'tm-cta ghost', onclick: () => this.go(0) }, '↺ Watch again'),
          next ? h('a', { class: 'tm-cta ghost', href: next.getAttribute('href') }, 'Next chapter →') : null)));
      this.caption('Well done! Close teacher mode and try the practice yourself.');
      this.playing = false; this.playBtn.textContent = '▶';
      if (!this.muted && synth) this.speak('Well done! Now close teacher mode and try the practice yourself.', 3000, () => {});
    }
    close() {
      this.clearTimers(); this.stopSpeech(); this.unspot();
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
