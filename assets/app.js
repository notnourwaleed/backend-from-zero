/* =====================================================================
   Backend from Zero — interactive parts
   - layout (sidebar, theme, progress)
   - quizzes, fill-in-the-blanks, checklists
   - code runner: a small Node.js + Express + MySQL simulator in the browser
   - SQL playground (real SQL engine: sql.js / SQLite, made to act like MySQL)
   ===================================================================== */
(function () {
  'use strict';

  const CHAPTERS = [
    { file: 'index.html', num: '', title: 'Start here', desc: '' },
    { file: '00-setup.html', num: '0', title: 'Set up your computer', desc: 'VS Code, the terminal, Node.js, npm, MySQL and Postman — from zero.' },
    { file: '01-javascript.html', num: '1', title: 'JavaScript you need', desc: 'Variables, if, objects, arrays, functions, destructuring. Only what backend uses.' },
    { file: '02-how-the-web-works.html', num: '2', title: 'How the web works', desc: 'Requests, responses, URLs, methods, status codes and JSON.' },
    { file: '03-first-server.html', num: '3', title: 'Your first Express server', desc: 'Build a full users API in one file (course week 4).' },
    { file: '04-routes-controllers.html', num: '4', title: 'Routes & controllers', desc: 'Split code into files with require, module.exports and Router (week 5).' },
    { file: '05-async-mysql.html', num: '5', title: 'Async & MySQL', desc: 'async/await, connecting to MySQL, db.query (weeks 5–6).' },
    { file: '06-sql.html', num: '6', title: 'SQL basics', desc: 'CREATE, SELECT, INSERT, UPDATE, DELETE in a live SQL playground.' },
    { file: '07-security.html', num: '7', title: 'Security & login', desc: '.env, validation, SQL injection, bcrypt, register and login (weeks 6–8).' },
    { file: '08-joins-cookies.html', num: '8', title: 'JOINs & cookies', desc: 'Tables that point at each other, JOIN queries and cookies (weeks 7–8).' },
    { file: 'course-project.html', num: 'P', title: 'The lecture project', desc: 'The exact project from the lectures, built file by file in its final form — no going back and forth.' },
    { file: '09-build-it.html', num: '9', title: 'Build it from zero', desc: 'Step-by-step plan to build the whole project yourself, plus a planner for your own topic.' },
    { file: '10-cheatsheet.html', num: '★', title: 'Cheat sheet & errors', desc: 'Copy-ready patterns and what every common error message means.' },
  ];

  const SQLJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/';
  const ACORN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/acorn/8.11.3/acorn.min.js';

  // ---------- small helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) {
      if (k === null || k === undefined || k === false) continue;
      e.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
    return e;
  }
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem('bfz:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bfz:' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
    del(k) { try { localStorage.removeItem('bfz:' + k); } catch (e) { /* ignore */ } },
  };
  const PAGE = document.body.dataset.page || 'index.html';
  const SELFTEST = /[?&]selftest/.test(location.search);

  function dedent(s) {
    s = s.replace(/\r\n/g, '\n').replace(/^\s*\n/, '').replace(/\s+$/, '');
    const lines = s.split('\n');
    const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
    return lines.map(l => l.slice(isFinite(ind) ? ind : 0)).join('\n') + '\n';
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src + ' (are you offline?)'));
      document.head.append(s);
    });
  }
  // put the solution after the hints of the same exercise (hints first!)
  function placeSolution(box, el) {
    const ex = box.closest('.exercise');
    const hints = ex ? $$(':scope > details.hint', ex) : [];
    if (hints.length) hints[hints.length - 1].after(el); else box.after(el);
  }
  function highlightBlock(code, lang) {
    const c = h('code', { class: 'language-' + lang }, code);
    if (window.hljs) { try { window.hljs.highlightElement(c); } catch (e) { /* ignore */ } }
    return h('pre', null, c);
  }

  // ---------- layout ----------
  function toggleTheme() {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('bfz-theme', next); } catch (e) { /* ignore */ }
    $$('.CodeMirror').forEach(cm => cm.CodeMirror && cm.CodeMirror.refresh());
  }

  function buildLayout() {
    const main = $('main');
    if (!main) return;
    const top = h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Open chapter menu', onclick: () => document.body.classList.toggle('nav-open') }, '☰'),
      h('a', { class: 'brand', href: 'index.html' }, h('span', { class: 'brand-mark' }, '{ }'), 'Backend from Zero'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'icon-btn', title: 'Light / dark', 'aria-label': 'Switch light or dark theme', onclick: toggleTheme }, '◐'));
    const nav = h('nav', { class: 'sidebar', 'aria-label': 'Chapters' },
      h('ol', null, CHAPTERS.map(c => h('li', {
        class: (c.file === PAGE ? 'current ' : '') + (store.get('done:' + c.file) ? 'done' : ''), 'data-file': c.file,
      }, h('a', { href: c.file }, h('span', { class: 'num' }, h('span', null, c.num || '→')), h('span', null, c.title))))),
      h('p', { class: 'side-note' }, 'Your progress and code are saved in this browser only.'));
    const layout = h('div', { class: 'layout' });
    main.replaceWith(layout);
    layout.append(nav, main);
    document.body.prepend(top);
    document.body.append(h('div', { class: 'scrim', onclick: () => document.body.classList.remove('nav-open') }));
    if (PAGE !== 'index.html') chapterFooter(main);
    const list = $('#chapter-cards');
    if (list) {
      CHAPTERS.slice(1).forEach(c => list.append(h('a', { class: 'card' + (store.get('done:' + c.file) ? ' done' : ''), href: c.file },
        h('div', { class: 'c-num' }, c.num === '★' ? 'Reference' : c.num === 'P' ? 'Lecture project' : 'Chapter ' + c.num), h('div', { class: 'c-title' }, c.title), h('div', { class: 'c-desc' }, c.desc))));
    }
  }

  function chapterFooter(main) {
    const i = CHAPTERS.findIndex(c => c.file === PAGE);
    if (i < 0) return;
    const prev = CHAPTERS[i - 1], next = CHAPTERS[i + 1];
    const btn = h('button', { class: 'done-btn' });
    const paint = () => {
      const d = !!store.get('done:' + PAGE);
      btn.classList.toggle('is-done', d);
      btn.textContent = d ? '✓ Chapter done' : 'Mark this chapter as done';
      const li = $(`.sidebar li[data-file="${PAGE}"]`);
      if (li) li.classList.toggle('done', d);
    };
    btn.onclick = () => { store.set('done:' + PAGE, !store.get('done:' + PAGE)); paint(); };
    paint();
    main.append(h('div', { class: 'chapter-end' }, btn,
      h('div', { class: 'pager' },
        prev ? h('a', { href: prev.file }, h('small', null, '← Previous'), prev.title) : h('span'),
        next ? h('a', { class: 'next', href: next.file }, h('small', null, 'Next →'), next.title) : h('span'))));
  }

  // ---------- quizzes ----------
  function initQuizzes() {
    $$('.quiz').forEach(q => {
      const opts = $$('.options > button', q);
      const fb = h('div', { class: 'feedback', 'aria-live': 'polite' });
      const explain = $('.explain', q);
      if (explain) { explain.hidden = true; explain.before(fb); } else q.append(fb);
      opts.forEach(b => b.addEventListener('click', () => {
        if ('correct' in b.dataset) {
          opts.forEach(o => { o.disabled = true; });
          b.classList.add('right');
          fb.className = 'feedback good';
          fb.textContent = '✓ Correct!';
          if (explain) explain.hidden = false;
        } else {
          b.classList.add('wrong');
          b.disabled = true;
          fb.className = 'feedback bad';
          fb.textContent = b.dataset.why ? '✗ ' + b.dataset.why : '✗ Not quite — try another one.';
        }
      }));
    });
  }

  // ---------- fill in the blanks ----------
  function norm(s) {
    return String(s).trim().replace(/[“”"`]/g, "'").replace(/\s+/g, ' ')
      .replace(/\s*([(){}\[\],.:;=<>!+\-*/&|?])\s*/g, '$1').replace(/;$/, '');
  }
  function initBlanks() {
    $$('.blanks').forEach(box => {
      const inputs = $$('input[data-a]', box);
      inputs.forEach(inp => {
        const first = inp.dataset.a.split('|||')[0];
        inp.size = Math.max(3, first.length + 1);
        inp.spellcheck = false; inp.autocomplete = 'off'; inp.setAttribute('autocapitalize', 'off');
        inp.setAttribute('aria-label', 'blank');
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
      });
      const out = h('span', { class: 'blank-result', 'aria-live': 'polite' });
      function check() {
        let ok = 0;
        inputs.forEach(inp => {
          const good = inp.dataset.a.split('|||').some(a => norm(a) === norm(inp.value));
          inp.classList.toggle('right', good); inp.classList.toggle('wrong', !good);
          if (good) ok++;
        });
        const all = ok === inputs.length;
        out.className = 'blank-result ' + (all ? 'good' : 'bad');
        out.textContent = all ? '✓ All correct!' : `${ok} of ${inputs.length} correct — keep going`;
      }
      box.append(h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: check }, 'Check'),
        h('button', { class: 'btn ghost', onclick: () => inputs.forEach(inp => { if (!inp.classList.contains('right')) { inp.value = inp.dataset.a.split('|||')[0]; inp.classList.remove('wrong'); inp.classList.add('revealed'); } }) }, 'Show answers'),
        out));
    });
  }

  // ---------- checklists ----------
  function initChecklists() {
    $$('.checklist').forEach(ul => {
      const id = ul.dataset.id || 'list';
      const items = $$(':scope > li', ul);
      const saved = store.get(`check:${PAGE}:${id}`, {});
      const prog = h('div', { class: 'check-progress' });
      const paint = () => { const n = items.filter((_, i) => saved[i]).length; prog.textContent = `${n} of ${items.length} done`; };
      items.forEach((li, i) => {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = !!saved[i];
        cb.addEventListener('change', () => { saved[i] = cb.checked; store.set(`check:${PAGE}:${id}`, saved); paint(); });
        const span = h('span', { html: li.innerHTML });
        li.innerHTML = '';
        li.append(h('label', null, cb, span));
      });
      ul.before(prog);
      paint();
    });
  }

  // =====================================================================
  //  SQL engine (sql.js) made to look like MySQL
  // =====================================================================
  let SQL = null, sqlLoading = null;
  function loadSql() {
    if (SQL) return Promise.resolve(SQL);
    if (!sqlLoading) {
      sqlLoading = loadScript(SQLJS_BASE + 'sql-wasm.js')
        .then(() => window.initSqlJs({ locateFile: f => SQLJS_BASE + f }))
        .then(s => { SQL = s; return s; })
        .catch(e => { sqlLoading = null; throw e; });
    }
    return sqlLoading;
  }

  const SCHEMA = [
    `CREATE TABLE IF NOT EXISTS USERS (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      USERNAME VARCHAR(255) NOT NULL,
      EMAIL VARCHAR(255) UNIQUE NOT NULL,
      PASSWORD VARCHAR(255) NOT NULL,
      ROLE ENUM('admin', 'user') NOT NULL DEFAULT 'user',
      MANAGER_ID INT NULL,
      FOREIGN KEY (MANAGER_ID) REFERENCES USERS(ID)
    )`,
    `CREATE TABLE IF NOT EXISTS TRIPS (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      DESTINATION VARCHAR(150) NOT NULL,
      COUNTRY VARCHAR(150) NOT NULL,
      COST DECIMAL(10,2) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS REVIEWS (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      USER_ID INT NOT NULL,
      TRIP_ID INT NOT NULL,
      RATING INT NOT NULL CHECK (RATING BETWEEN 1 AND 5),
      FOREIGN KEY (USER_ID) REFERENCES USERS(ID),
      FOREIGN KEY (TRIP_ID) REFERENCES TRIPS(ID),
      UNIQUE (USER_ID, TRIP_ID)
    )`,
  ];
  const SEED_USERS = [
    ['sara', 'sara@mail.com', 'admin', null],
    ['omar', 'omar@mail.com', 'user', 1],
    ['lina', 'lina@mail.com', 'user', 1],
    ['youssef', 'youssef@mail.com', 'user', 2],
  ];
  const SEED_TRIPS = [
    ['Paris', 'France', 1200], ['Rome', 'Italy', 950.5], ['Tokyo', 'Japan', 2100], ['Cairo', 'Egypt', 400],
    ['Venice', 'Italy', 1100], ['Kyoto', 'Japan', 1800], ['Barcelona', 'Spain', 870],
  ];
  const SEED_REVIEWS = [[2, 1, 5], [3, 1, 4], [2, 2, 3], [4, 3, 5], [3, 4, 4]];

  function translateMysql(sql) {
    return String(sql)
      .replace(/\bINT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
      .replace(/\bINT\s+PRIMARY\s+KEY\s+AUTO_INCREMENT\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
      .replace(/\bAUTO_INCREMENT\b/gi, '')
      .replace(/(\w+)\s+ENUM\s*\(([^)]*)\)/gi, '$1 TEXT CHECK ($1 IN ($2))')
      .replace(/\bSHOW\s+TABLES\b/gi, "SELECT name AS Tables_in_travel_db FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .replace(/(^|;)\s*(?:DESCRIBE|DESC)\s+(\w+)\s*(?=;|$)/gi, `$1 SELECT name AS Field, type AS Type, CASE "notnull" WHEN 1 THEN 'NO' ELSE 'YES' END AS "Null", dflt_value AS "Default" FROM pragma_table_info('$2')`)
      .replace(/(^|;)\s*(?:CREATE\s+DATABASE|CREATE\s+SCHEMA|DROP\s+DATABASE|USE)\b[^;]*/gi, '$1');
  }

  function mysqlError(e, sql) {
    const m = String(e && e.message || e);
    let code = 'ER_UNKNOWN', msg = m, x;
    if (/UNIQUE constraint failed: (\S+)/.test(m)) { code = 'ER_DUP_ENTRY'; msg = `Duplicate entry for key '${RegExp.$1}'`; }
    else if ((x = m.match(/no such table: (\S+)/))) { code = 'ER_NO_SUCH_TABLE'; msg = `Table 'travel_db.${x[1]}' doesn't exist`; }
    else if ((x = m.match(/no such column: (\S+)/))) { code = 'ER_BAD_FIELD_ERROR'; msg = `Unknown column '${x[1]}' in 'field list'`; }
    else if ((x = m.match(/NOT NULL constraint failed: \w+\.(\S+)/))) { code = 'ER_BAD_NULL_ERROR'; msg = `Column '${x[1]}' cannot be null`; }
    else if (/FOREIGN KEY constraint failed/.test(m)) {
      if (/^\s*DELETE/i.test(sql)) { code = 'ER_ROW_IS_REFERENCED_2'; msg = 'Cannot delete or update a parent row: a foreign key constraint fails'; }
      else { code = 'ER_NO_REFERENCED_ROW_2'; msg = 'Cannot add or update a child row: a foreign key constraint fails'; }
    }
    else if (/CHECK constraint failed/.test(m)) { code = 'ER_CHECK_CONSTRAINT_VIOLATED'; msg = 'Check constraint is violated.'; }
    else if ((x = m.match(/near "([^"]*)": syntax error/))) { code = 'ER_PARSE_ERROR'; msg = `You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${x[1]}'`; }
    else if (/incomplete input/.test(m)) { code = 'ER_PARSE_ERROR'; msg = 'You have an error in your SQL syntax (the query ended too early — missing a quote or bracket?)'; }
    const err = new Error(msg);
    err.code = code; err.sqlMessage = msg; err.sql = sql;
    return err;
  }

  function freshDb() {
    const db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON;');
    db.create_function('NOW', () => new Date().toISOString().slice(0, 19).replace('T', ' '));
    SCHEMA.forEach(s => db.run(translateMysql(s)));
    const pw = fakeBcrypt.hashSync('Password1!', 12);
    SEED_USERS.forEach(u => db.run('INSERT INTO USERS (USERNAME, EMAIL, PASSWORD, ROLE, MANAGER_ID) VALUES (?,?,?,?,?)', [u[0], u[1], pw, u[2], u[3]]));
    SEED_TRIPS.forEach(t => db.run('INSERT INTO TRIPS (DESTINATION, COUNTRY, COST) VALUES (?,?,?)', t));
    SEED_REVIEWS.forEach(r => db.run('INSERT INTO REVIEWS (USER_ID, TRIP_ID, RATING) VALUES (?,?,?)', r));
    return db;
  }

  // run ONE statement like mysql2's db.query → [rows, fields] or [resultObject]
  function execOne(db, sql, params) {
    if (typeof sql !== 'string') throw new TypeError('db.query() needs the SQL as a string as its first argument');
    if (params !== undefined && !Array.isArray(params)) params = [params];
    params = (params || []).map(p => p === undefined ? null : typeof p === 'boolean' ? +p : (p !== null && typeof p === 'object' && !(p instanceof Date)) ? JSON.stringify(p) : p);
    const t = translateMysql(sql).trim();
    if (!t.replace(/;/g, '').trim()) return [{ affectedRows: 0, insertId: 0, warningStatus: 0 }, undefined];
    let stmt;
    try { stmt = db.prepare(t); } catch (e) { throw mysqlError(e, sql); }
    try {
      stmt.bind(params);
      const cols = stmt.getColumnNames();
      if (cols.length) {
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return [rows, cols.map(n => ({ name: n }))];
      }
      stmt.step();
      const affectedRows = db.getRowsModified();
      const insertId = /^\s*INSERT/i.test(t) ? db.exec('SELECT last_insert_rowid()')[0].values[0][0] : 0;
      return [{ fieldCount: 0, affectedRows, insertId, info: '', serverStatus: 2, warningStatus: 0, changedRows: /^\s*UPDATE/i.test(t) ? affectedRows : 0 }, undefined];
    } catch (e) {
      if (e && e.code && e.sqlMessage) throw e;
      throw mysqlError(e, sql);
    } finally { stmt.free(); }
  }

  // ---------- fake bcrypt (same API, not real security) ----------
  const B64 = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  function digest(str, len) {
    let h1 = 0x811c9dc5, h2 = 0x9e3779b9, out = '';
    for (let round = 0; out.length < len; round++) {
      for (let i = 0; i < str.length; i++) {
        h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619);
        h2 = Math.imul(h2 ^ (h1 >>> 7), 2246822507) ^ round;
      }
      h1 ^= h2 >>> 13; h2 = Math.imul(h2 ^ round, 3266489909);
      for (let k = 0; k < 4 && out.length < len; k++) out += B64[((h1 >>> (k * 6)) ^ (h2 >>> (k * 5))) & 63];
    }
    return out;
  }
  function randSalt() { let s = ''; for (let i = 0; i < 22; i++) s += B64[Math.floor(Math.random() * 64)]; return s; }
  const fakeBcrypt = {
    hashSync(data, saltOrRounds) {
      if (typeof data !== 'string' || saltOrRounds === undefined) throw new Error('data and salt arguments required');
      let rounds = 10, salt;
      if (typeof saltOrRounds === 'number') { rounds = saltOrRounds; salt = randSalt(); }
      else { const m = String(saltOrRounds).match(/^\$2[aby]\$(\d\d)\$(.{22})/); if (!m) throw new Error('Invalid salt. Salt: ' + saltOrRounds); rounds = +m[1]; salt = m[2]; }
      const r = String(rounds).padStart(2, '0');
      return `$2b$${r}$${salt}${digest(salt + '|' + data + '|' + r, 31)}`;
    },
    compareSync(data, hash) {
      if (typeof data !== 'string' || typeof hash !== 'string') throw new Error('data and hash arguments required');
      const m = hash.match(/^\$2[aby]\$(\d\d)\$(.{22})(.{31})$/);
      if (!m) return false;
      return digest(m[2] + '|' + data + '|' + m[1], 31) === m[3];
    },
    genSaltSync(r = 10) { return `$2b$${String(r).padStart(2, '0')}$${randSalt()}`; },
    hash(d, s) { return new Promise((res, rej) => setTimeout(() => { try { res(fakeBcrypt.hashSync(d, s)); } catch (e) { rej(e); } }, 5)); },
    compare(d, hs) { return new Promise((res, rej) => setTimeout(() => { try { res(fakeBcrypt.compareSync(d, hs)); } catch (e) { rej(e); } }, 5)); },
    genSalt(r) { return Promise.resolve(fakeBcrypt.genSaltSync(r)); },
  };

  // =====================================================================
  //  Value printing (like Node's console.log)
  // =====================================================================
  function inspect(v, d = 0, seen = new Set()) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    const t = typeof v;
    if (t === 'string') return d === 0 ? v : `'${v.replace(/'/g, "\\'")}'`;
    if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
    if (t === 'function') return v.__isRouter ? '[Function: router]' : `[Function: ${v.name || '(anonymous)'}]`;
    if (t === 'symbol') return v.toString();
    if (v instanceof Promise) return 'Promise { <pending> }';
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    if (v instanceof Date) return v.toISOString();
    if (seen.has(v)) return '[Circular]';
    if (d > 4) return Array.isArray(v) ? '[Array]' : '[Object]';
    seen.add(v);
    const ind = s => s.split('\n').map(l => '  ' + l).join('\n');
    let out;
    if (Array.isArray(v)) {
      const items = v.map(x => inspect(x, d + 1, seen));
      const one = `[ ${items.join(', ')} ]`;
      out = !v.length ? '[]' : (one.length <= 72 && !one.includes('\n')) ? one : '[\n' + items.map(ind).join(',\n') + '\n]';
    } else {
      const keys = Object.keys(v);
      const items = keys.map(k => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`}: ${inspect(v[k], d + 1, seen)}`);
      const one = `{ ${items.join(', ')} }`;
      out = !keys.length ? '{}' : (one.length <= 72 && !one.includes('\n')) ? one : '{\n' + items.map(ind).join(',\n') + '\n}';
    }
    seen.delete(v);
    return out;
  }

  const STATUS_TEXT = { 200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 422: 'Unprocessable Entity', 500: 'Internal Server Error', 503: 'Service Unavailable' };
  const DEFAULT_ENV = { HOSTNAME: 'localhost', PORT: '5000', DB_USER: 'student', DB_PASSWORD: 'secret', DB_NAME: 'travel_db' };
  const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor;
  const TIMEOUT = Symbol('timeout');

  function where(err) {
    const m = String(err && err.stack || '').match(/bfz\/([^\s:)]+):(\d+):(\d+)/);
    if (!m) return '';
    return ` (${m[1]}, line ${Math.max(1, +m[2] - 2)})`;
  }
  class ExitSignal { constructor(code) { this.code = code; } }

  // =====================================================================
  //  Express simulator
  // =====================================================================
  function splitPath(p) { return String(p || '/').split('?')[0].split('/').filter(Boolean); }
  function matchPath(pattern, path) {
    const a = splitPath(pattern), b = splitPath(path);
    if (a.length !== b.length) return null;
    const params = {};
    for (let i = 0; i < a.length; i++) {
      if (a[i].startsWith(':')) {
        const name = a[i].slice(1).replace(/\?$/, '');
        try { params[name] = decodeURIComponent(b[i]); } catch (e) { params[name] = b[i]; }
      } else if (a[i].toLowerCase() !== b[i].toLowerCase()) return null;
    }
    return params;
  }
  function prefixRest(prefix, path) {
    const a = splitPath(prefix), b = splitPath(path);
    if (a.length > b.length) return null;
    for (let i = 0; i < a.length; i++) if (a[i].toLowerCase() !== b[i].toLowerCase()) return null;
    return '/' + b.slice(a.length).join('/');
  }

  function makeExpress(sim) {
    function createRouter(isApp) {
      const layers = [];
      const r = function router(req, res, next) { return next(); };
      r.__layers = layers;
      r.__isRouter = true;
      r.use = (...args) => {
        let path = '/';
        if (typeof args[0] === 'string') path = args.shift();
        const fns = args.flat();
        if (!fns.length) throw new TypeError('app.use() requires a middleware function');
        fns.forEach(fn => {
          if (typeof fn !== 'function') throw new TypeError(`app.use() requires a middleware function but got a ${fn === undefined ? 'undefined' : typeof fn}. Check the thing you passed to app.use() — is it exported correctly?`);
          layers.push({ type: 'use', path, fn });
        });
        return r;
      };
      const addRoute = (method, path, handlers) => {
        if (typeof path !== 'string') throw new TypeError(`The first argument of .${method.toLowerCase()}() must be a path string like '/users'`);
        handlers = handlers.flat();
        if (!handlers.length) throw new TypeError(`Route.${method.toLowerCase()}() requires a callback function`);
        handlers.forEach(fn => {
          if (typeof fn !== 'function') {
            const kind = fn === undefined ? 'Undefined' : fn === null ? 'Null' : Object.prototype.toString.call(fn).slice(8, -1);
            throw new TypeError(`Route.${method.toLowerCase()}() requires a callback function but got a [object ${kind}]`);
          }
        });
        layers.push({ type: 'route', method, path, handlers });
      };
      ['get', 'post', 'put', 'patch', 'delete', 'all'].forEach(m => {
        r[m] = (path, ...handlers) => {
          if (isApp && m === 'get' && handlers.length === 0 && typeof path === 'string') return undefined; // app.get('setting')
          addRoute(m === 'all' ? 'ALL' : m.toUpperCase(), path, handlers); return r;
        };
      });
      r.route = (path) => {
        const o = {};
        ['get', 'post', 'put', 'patch', 'delete', 'all'].forEach(m => { o[m] = (...hs) => { addRoute(m === 'all' ? 'ALL' : m.toUpperCase(), path, hs); return o; }; });
        return o;
      };
      if (isApp) {
        r.locals = {};
        r.set = () => r;
        r.disable = () => r;
        r.enable = () => r;
        r.listen = (port, host, cb) => {
          if (typeof port === 'function') { cb = port; port = undefined; host = undefined; }
          if (typeof host === 'function') { cb = host; host = undefined; }
          sim.listening = { port, host };
          if (port === undefined || port === null || port === '') sim.note('(simulator) app.listen() got no port, so Node would pick a random one. Is PORT in your .env, and did you call dotenv.config()?');
          setTimeout(() => { try { if (cb) cb(); } catch (e) { sim.logError(e); } }, 0);
          return { close(c) { if (c) c(); }, on() { return this; }, address() { return { port, address: host }; } };
        };
        sim.apps.push(r);
      }
      return r;
    }
    const express = function express() { return createRouter(true); };
    express.Router = () => createRouter(false);
    express.json = () => function jsonParser(req, res, next) {
      if (req._raw === undefined || req._raw === null || req._raw === '') return next();
      if (typeof req._raw === 'string') {
        try { req.body = JSON.parse(req._raw); } catch (e) {
          const err = new SyntaxError('Unexpected token in JSON body: ' + e.message);
          err.status = 400; err.type = 'entity.parse.failed';
          return next(err);
        }
      } else req.body = JSON.parse(JSON.stringify(req._raw));
      next();
    };
    express.urlencoded = () => function urlencodedParser(req, res, next) { next(); };
    express.static = () => function serveStatic(req, res, next) { next(); };
    return express;
  }

  async function runLayers(layers, req, res, path) {
    for (const layer of layers) {
      if (res.finished) return true;
      if (layer.type === 'use') {
        const rest = prefixRest(layer.path, path);
        if (rest === null) continue;
        if (layer.fn.__layers) {
          const saved = req.baseUrl;
          req.baseUrl = (saved || '') + (layer.path === '/' ? '' : layer.path);
          const handled = await runLayers(layer.fn.__layers, req, res, rest);
          req.baseUrl = saved;
          if (handled) return true;
          continue;
        }
        if (!(await callWithNext(layer.fn, req, res))) return true;
      } else {
        if (layer.method !== 'ALL' && layer.method !== req.method) continue;
        const params = matchPath(layer.path, path);
        if (!params) continue;
        req.params = params;
        req.route = { path: layer.path };
        let goOn = true;
        for (const fn of layer.handlers) {
          if (!(await callWithNext(fn, req, res))) { goOn = false; break; }
        }
        if (!goOn) return true;
      }
    }
    return false;
  }
  async function callWithNext(fn, req, res) {
    let called = false, error = null;
    const next = (err) => { called = true; if (err && err !== 'route' && err !== 'router') error = err; };
    const result = fn(req, res, next);
    if (result && typeof result.then === 'function') await result;
    if (error) throw error;
    return called;
  }

  function makeRes(sim) {
    const res = { statusCode: 200, body: undefined, isText: false, finished: false, cookiesSet: [], headers: {} };
    const sent = () => { const e = new Error('Cannot set headers after they are sent to the client'); e.code = 'ERR_HTTP_HEADERS_SENT'; return e; };
    res.status = (c) => {
      if (typeof c !== 'number' || !Number.isInteger(c) || c < 100 || c > 999) throw new RangeError(`Invalid status code: ${inspect(c, 1)}. res.status() needs a number like 200 or 404.`);
      res.statusCode = c; return res;
    };
    res.json = (obj) => {
      if (res.finished) throw sent();
      res.body = obj === undefined ? null : JSON.parse(JSON.stringify(obj));
      res.isText = false; res.finished = true; return res;
    };
    res.send = (x) => {
      if (res.finished) throw sent();
      if (x !== null && typeof x === 'object') return res.json(x);
      res.body = x === undefined ? '' : String(x); res.isText = true; res.finished = true; return res;
    };
    res.sendStatus = (c) => { res.status(c); return res.send(STATUS_TEXT[c] || String(c)); };
    res.end = (x) => { if (res.finished) return res; res.body = x === undefined ? '' : String(x); res.isText = true; res.finished = true; return res; };
    res.cookie = (name, value, opts) => {
      if (res.finished) throw sent();
      res.cookiesSet.push({ name, value: typeof value === 'object' ? 'j:' + JSON.stringify(value) : String(value), opts: opts || {} });
      return res;
    };
    res.clearCookie = (name, opts) => { res.cookiesSet.push({ name, value: '', opts: Object.assign({}, opts, { maxAge: 0 }), clear: true }); return res; };
    res.set = res.header = res.setHeader = (k, v) => { if (typeof k === 'string') res.headers[k.toLowerCase()] = v; return res; };
    res.type = () => res;
    res.redirect = (a, b) => { const url = b === undefined ? a : b; res.statusCode = b === undefined ? 302 : a; res.headers.location = url; res.body = 'Redirecting to ' + url; res.isText = true; res.finished = true; return res; };
    res.locals = {};
    return res;
  }

  // =====================================================================
  //  Node simulator: files, require, console, process, tests
  // =====================================================================
  class Sim {
    constructor({ files, entry, db, tests }) {
      this.files = files; this.entry = entry; this.sqlDb = db; this.testsCode = tests || '';
      this.logs = []; this.tests = []; this.apps = []; this.jar = {}; this.cache = {};
      this.envFile = files['.env'] !== undefined ? parseEnv(files['.env']) : Object.assign({}, DEFAULT_ENV);
      const sim = this;
      this.process = {
        env: {}, exitCode: undefined, argv: ['node', entry], platform: 'win32', version: 'v22.11.0',
        exit(c) { throw new ExitSignal(c); }, on() { return this; }, cwd: () => 'C:\\Users\\you\\my-backend', nextTick: (fn, ...a) => Promise.resolve().then(() => fn(...a)),
      };
      const out = (type) => (...a) => sim.logs.push({ type, text: a.map(x => inspect(x)).join(' ') });
      this.console = { log: out('log'), info: out('log'), debug: out('log'), warn: out('warn'), error: out('error'), table: out('log'), dir: out('log') };
    }
    note(t) { this.logs.push({ type: 'note', text: t }); }
    logError(err, context) {
      if (err instanceof ExitSignal) { this.note(`(process.exit(${err.code ?? ''}) was called — the program stopped)`); return; }
      const name = err && err.name ? err.name : 'Error';
      let text = `${context ? context + '\n' : ''}${name}: ${err && err.message !== undefined ? err.message : String(err)}${where(err)}`;
      if (err && err.code && !/^\w*Error$/.test(err.code)) text += `\n    code: '${err.code}'`;
      this.logs.push({ type: 'error', text });
    }
    builtin(name) {
      const sim = this;
      switch (name) {
        case 'express': return this._express || (this._express = makeExpress(this));
        case 'mysql2/promise': case 'mysql2': return {
          createPool: (cfg) => sim.makePool(cfg),
          createConnection: (cfg) => Promise.resolve(sim.makePool(cfg)),
        };
        case 'dotenv': return {
          config() {
            for (const [k, v] of Object.entries(sim.envFile)) if (!(k in sim.process.env)) sim.process.env[k] = v;
            sim.envLoaded = true;
            return { parsed: Object.assign({}, sim.envFile) };
          },
        };
        case 'bcrypt': case 'bcryptjs': return fakeBcrypt;
        case 'cookie-parser': return function cookieParser() {
          return function cookieParserMw(req, res, next) {
            req.cookies = {};
            String(req.headers.cookie || '').split(';').map(s => s.trim()).filter(Boolean).forEach(p => {
              const i = p.indexOf('=');
              let v = decodeURIComponent(p.slice(i + 1));
              if (v.startsWith('j:')) { try { v = JSON.parse(v.slice(2)); } catch (e) { /* keep */ } }
              req.cookies[p.slice(0, i)] = v;
            });
            req.signedCookies = {};
            next();
          };
        };
        case 'path': return {
          join: (...p) => p.join('/').replace(/\/+/g, '/'),
          resolve: (...p) => p.join('/').replace(/\/+/g, '/'),
          basename: p => String(p).split(/[\\/]/).pop(),
        };
        default: return null;
      }
    }
    makePool(cfg) {
      const sim = this;
      cfg = cfg || {};
      const fail = (code, msg) => { const e = new Error(msg); e.code = code; e.sqlMessage = msg; return e; };
      const check = () => {
        if (!sim.sqlDb) throw fail('ECONNREFUSED', '(simulator) This exercise has no database.');
        if (!cfg.user) throw fail('ER_ACCESS_DENIED_ERROR', `Access denied for user ''@'localhost' (using password: ${cfg.password ? 'YES' : 'NO'}). Hint: the user is ${inspect(cfg.user)} — was .env loaded before createPool?`);
        if (sim.files['.env'] !== undefined) {
          if (cfg.user !== sim.envFile.DB_USER || cfg.password !== sim.envFile.DB_PASSWORD) throw fail('ER_ACCESS_DENIED_ERROR', `Access denied for user '${cfg.user}'@'localhost' (using password: ${cfg.password ? 'YES' : 'NO'})`);
        }
        if (!cfg.database) throw fail('ER_NO_DB_ERROR', 'No database selected');
        if (sim.files['.env'] !== undefined && cfg.database !== sim.envFile.DB_NAME) throw fail('ER_BAD_DB_ERROR', `Unknown database '${cfg.database}'`);
      };
      const query = (sql, params) => new Promise((resolve, reject) => {
        setTimeout(() => {
          try { check(); resolve(execOne(sim.sqlDb, sql, params)); } catch (e) { reject(e); }
        }, 1);
      });
      const pool = { query, execute: query, end: () => Promise.resolve(), release() { /* */ } };
      pool.getConnection = () => Promise.resolve(pool);
      pool.promise = () => pool;
      return pool;
    }
    resolve(spec, from) {
      const parts = from.includes('/') ? from.slice(0, from.lastIndexOf('/')).split('/') : [];
      for (const seg of spec.split('/')) {
        if (seg === '.' || seg === '') continue;
        if (seg === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(seg);
      }
      const p = parts.join('/');
      return [p, p + '.js', p + '/index.js'].find(c => Object.prototype.hasOwnProperty.call(this.files, c)) || null;
    }
    require(spec, from) {
      if (typeof spec !== 'string') throw new TypeError('require() needs a string, like require(\'express\')');
      if (!spec.startsWith('.') && !spec.startsWith('/')) {
        const b = this.builtin(spec);
        if (b) return b;
        const e = new Error(`Cannot find module '${spec}'. Is it installed? (npm install ${spec.split('/')[0]})`);
        e.code = 'MODULE_NOT_FOUND'; throw e;
      }
      const file = this.resolve(spec, from);
      if (!file) {
        const e = new Error(`Cannot find module '${spec}' (required from ${from}). Check the path: './' means "same folder", '../' means "one folder up".`);
        e.code = 'MODULE_NOT_FOUND'; throw e;
      }
      return this.load(file).exports;
    }
    compile(file, code, isEntry) {
      const params = ['require', 'module', 'exports', 'console', 'process', '__filename', '__dirname', '_test', '_eq', '_req', '_db', '_logs', '_sim'];
      let body = code;
      if (isEntry && this.testsCode) body += '\n;\n/* ---- tests ---- */\n' + this.testsCode;
      body += `\n//# sourceURL=bfz/${file}`;
      return isEntry ? new AsyncFunction(...params, body) : new Function(...params, body);
    }
    load(file, isEntry = false) {
      if (this.cache[file]) return this.cache[file];
      const module = { exports: {}, filename: file, loaded: false };
      this.cache[file] = module;
      const code = this.files[file];
      let fn;
      try { fn = this.compile(file, code, isEntry); } catch (e) {
        delete this.cache[file];
        if (e instanceof SyntaxError) { e.file = file; e.code = e.code || 'SYNTAX'; }
        throw e;
      }
      const sim = this;
      const req = spec => sim.require(spec, file);
      const ret = fn.call(module.exports, req, module, module.exports, this.console, this.process, file, '.', this.testApi.test, this.testApi.eq, this.testApi.req, this.testApi.db, this.logs, this);
      module.loaded = true;
      return isEntry ? ret.then(() => module) : module;
    }
    get testApi() {
      if (this._testApi) return this._testApi;
      const sim = this;
      this._testApi = {
        test: (name, fn) => sim.tests.push({ name, fn }),
        eq: (actual, expected, label) => {
          const a = JSON.stringify(actual), b = JSON.stringify(expected);
          if (a !== b) throw new Error(`${label ? label + ': ' : ''}expected ${inspect(expected, 1)} but got ${inspect(actual, 1)}`);
          return true;
        },
        req: (method, url, body, headers) => sim.request(method, url, body, headers),
        db: (sql, params) => execOne(sim.sqlDb, sql, params)[0],
      };
      return this._testApi;
    }
    async request(method, url, body, headers = {}) {
      const app = this.apps[this.apps.length - 1];
      if (!app) throw new Error('No Express app found — did you call express()? (and is the file that creates it required by the entry file?)');
      method = String(method || 'GET').toUpperCase();
      const [path, qs] = String(url).split('?');
      const query = {};
      if (qs) qs.split('&').forEach(p => { const [k, v = ''] = p.split('='); if (k) query[decodeURIComponent(k)] = decodeURIComponent(v); });
      const hdrs = {};
      Object.entries(headers).forEach(([k, v]) => { hdrs[k.toLowerCase()] = v; });
      const hasBody = body !== undefined && body !== null && body !== '';
      if (hasBody) hdrs['content-type'] = 'application/json';
      const cookieStr = Object.entries(this.jar).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
      if (cookieStr) hdrs.cookie = cookieStr;
      const req = {
        method, url, originalUrl: url, path, baseUrl: '', query, params: {}, headers: hdrs, body: undefined, cookies: undefined,
        ip: '127.0.0.1', hostname: 'localhost', protocol: 'http', _raw: hasBody ? body : undefined,
        get(name) { return hdrs[String(name).toLowerCase()]; },
      };
      req.header = req.get;
      const res = makeRes(this);
      let crashed = false, hung = false;
      try {
        const handled = await Promise.race([runLayers(app.__layers, req, res, path), new Promise(r => setTimeout(() => r(TIMEOUT), 2500))]);
        if (handled === TIMEOUT) hung = !res.finished;
        else if (!res.finished) {
          if (!handled) { res.statusCode = 404; res.body = `Cannot ${method} ${path}`; res.isText = true; res.finished = true; res.defaultNotFound = true; }
          else hung = true;
        }
      } catch (err) {
        if (res.finished) this.logError(err, `Error after the response was already sent (${method} ${url}):`);
        else {
          if (err && err.type === 'entity.parse.failed') { res.statusCode = 400; res.body = 'Bad Request (the JSON body could not be parsed)'; }
          else { this.logError(err, `Error while handling ${method} ${url}:`); res.statusCode = (err && err.status) || 500; res.body = 'Internal Server Error'; crashed = true; }
          res.isText = true; res.finished = true;
        }
      }
      res.cookiesSet.forEach(c => {
        if (c.clear || c.opts.maxAge === 0 || (c.opts.expires && new Date(c.opts.expires) < new Date())) delete this.jar[c.name];
        else this.jar[c.name] = c.value;
      });
      return { status: res.statusCode, body: res.body, isText: res.isText, cookies: res.cookiesSet, hung, crashed, notFound: !!res.defaultNotFound, jar: Object.assign({}, this.jar) };
    }
    async start() {
      Sim.current = this;
      let entryOk = true;
      try {
        if (!(this.entry in this.files)) throw new Error(`Entry file ${this.entry} not found`);
        await this.load(this.entry, true);
        await new Promise(r => setTimeout(r, 40)); // let un-awaited startup code (like startServer()) finish
      } catch (err) {
        entryOk = false;
        if (err instanceof SyntaxError) await this.reportSyntax(err);
        else this.logError(err);
      }
      const results = [];
      if (entryOk) {
        for (const t of this.tests) {
          try {
            const r = await t.fn();
            if (r === false) results.push({ name: t.name, pass: false, why: '' });
            else if (typeof r === 'string') results.push({ name: t.name, pass: false, why: r });
            else results.push({ name: t.name, pass: true });
          } catch (e) {
            results.push({ name: t.name, pass: false, why: e && e.message ? e.message : String(e) });
          }
        }
      }
      setTimeout(() => { if (Sim.current === this) Sim.current = null; }, 200);
      return { entryOk, results, hadTests: /_test\s*\(/.test(this.testsCode) };
    }
    async reportSyntax(err) {
      // find the file + line with acorn (loaded only when needed)
      let file = err.file, line = '';
      try {
        if (!window.acorn) await loadScript(ACORN_URL);
        const names = file ? [file] : Object.keys(this.files).filter(f => f.endsWith('.js'));
        for (const f of names) {
          try {
            window.acorn.parse(this.files[f], { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
          } catch (e) {
            if (e.loc) { file = f; line = `, line ${e.loc.line}`; break; }
          }
        }
      } catch (e) { /* acorn unavailable */ }
      this.logs.push({ type: 'error', text: `SyntaxError: ${err.message}${file ? ` (${file}${line})` : ''}\nThe code could not even start. Look for a missing bracket ) } ], quote, or comma near that line.` });
    }
  }
  Sim.current = null;
  window.addEventListener('unhandledrejection', ev => {
    if (Sim.current) { Sim.current.logError(ev.reason, 'Unhandled promise rejection (an async function failed and nobody caught it):'); ev.preventDefault(); }
  });
  function parseEnv(text) {
    const env = {};
    String(text).split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (!m || line.trim().startsWith('#')) return;
      let v = (m[2] || '').trim();
      if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
      env[m[1]] = v;
    });
    return env;
  }

  // =====================================================================
  //  Editors (CodeMirror if available, textarea otherwise)
  // =====================================================================
  function makeEditor(parent, value, mode, readOnly) {
    if (window.CodeMirror) {
      const cm = window.CodeMirror(parent, {
        value, mode, lineNumbers: true, tabSize: 2, indentUnit: 2, readOnly: !!readOnly, matchBrackets: true, autoCloseBrackets: true,
        viewportMargin: Infinity, lineWrapping: false,
        extraKeys: { Tab: c => c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection('  '), 'Shift-Tab': c => c.indentSelection('subtract'), 'Ctrl-Enter': () => parent.dispatchEvent(new CustomEvent('run-shortcut', { bubbles: true })), 'Cmd-Enter': () => parent.dispatchEvent(new CustomEvent('run-shortcut', { bubbles: true })) },
      });
      if (readOnly) parent.classList.add('cm-readonly');
      return { get: () => cm.getValue(), set: v => cm.setValue(v), onChange: fn => cm.on('change', fn), refresh: () => cm.refresh() };
    }
    const ta = h('textarea', { class: 'plain-editor', spellcheck: 'false' });
    ta.value = value; ta.readOnly = !!readOnly;
    ta.rows = Math.min(28, value.split('\n').length + 1);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); parent.dispatchEvent(new CustomEvent('run-shortcut', { bubbles: true })); }
    });
    parent.append(ta);
    return { get: () => ta.value, set: v => { ta.value = v; }, onChange: fn => ta.addEventListener('input', fn), refresh() { /* */ } };
  }

  // =====================================================================
  //  Code runner component
  // =====================================================================
  const runners = [];
  class Runner {
    constructor(box, idx) {
      this.box = box;
      this.id = box.id || 'runner' + idx;
      this.entry = box.dataset.entry;
      this.isExpress = 'express' in box.dataset;
      this.needsDb = 'db' in box.dataset;
      this.files = $$(':scope > textarea[data-file]', box).map(ta => ({
        name: ta.dataset.file, starter: dedent(ta.value), readOnly: 'readonly' in ta.dataset, todo: 'todo' in ta.dataset,
      }));
      if (!this.entry) this.entry = this.files[0].name;
      const t = $(':scope > script.tests', box);
      this.tests = t ? t.textContent : '';
      this.solutions = {};
      $$(':scope > script.solution', box).forEach(s => { this.solutions[s.dataset.file || this.files[0].name] = dedent(s.textContent); });
      const tr = $(':scope > script.tries', box);
      this.tries = tr ? tr.textContent.split('\n').map(s => s.trim()).filter(Boolean) : [];
      this.ex = box.closest('.exercise');
      this.solvedKey = `solved:${PAGE}#${this.id}`;
      box.innerHTML = '';
      this.build();
      if (store.get(this.solvedKey)) this.markSolved();
    }
    key(f) { return `code:${PAGE}#${this.id}/${f}`; }
    build() {
      const box = this.box;
      let tabs = null;
      if (this.files.length > 1) {
        tabs = h('div', { class: 'tabs', role: 'tablist' });
        box.append(tabs);
      } else {
        box.append(h('div', { class: 'single-label' }, this.files[0].name));
      }
      const wrap = h('div', { class: 'editor-wrap' });
      box.append(wrap);
      this.files.forEach((f, i) => {
        const pane = h('div', { class: 'pane' });
        if (i > 0) pane.hidden = true;
        wrap.append(pane);
        const saved = f.readOnly ? null : store.get(this.key(f.name));
        f.ed = makeEditor(pane, saved ?? f.starter, f.name === '.env' ? 'properties' : 'javascript', f.readOnly);
        let timer;
        f.ed.onChange(() => { clearTimeout(timer); timer = setTimeout(() => store.set(this.key(f.name), f.ed.get()), 300); });
        f.pane = pane;
        if (tabs) {
          f.tab = h('button', { class: 'tab' + (i === 0 ? ' active' : ''), role: 'tab', onclick: () => this.show(i) },
            f.name, f.todo ? h('span', { class: 'todo-dot', title: 'You need to write code here' }) : null, f.readOnly ? h('span', { class: 'lock', title: 'Read only' }, '🔒') : null);
          tabs.append(f.tab);
        }
      });
      box.addEventListener('run-shortcut', () => this.run());
      this.status = h('span', { class: 'status' });
      this.runBtn = h('button', { class: 'btn', onclick: () => this.run() }, '▶ Run');
      box.append(h('div', { class: 'toolbar' }, this.runBtn,
        h('button', { class: 'btn ghost small', onclick: () => this.reset() }, 'Reset code'),
        this.status));
      this.output = h('div', { class: 'output' });
      box.append(this.output);
      if (this.isExpress) this.buildReqBar();
      if (Object.keys(this.solutions).length) {
        const det = h('details', { class: 'solution' }, h('summary', null, 'Show solution (try it yourself first!)'));
        const body = h('div');
        Object.entries(this.solutions).forEach(([name, code]) => {
          if (Object.keys(this.solutions).length > 1 || this.files.length > 1) body.append(h('div', { class: 'file-label' }, name));
          body.append(highlightBlock(code, 'javascript'));
        });
        det.append(body);
        placeSolution(box, det);
      }
    }
    show(i) {
      this.files.forEach((f, j) => { f.pane.hidden = i !== j; f.tab.classList.toggle('active', i === j); });
      this.files[i].ed.refresh();
    }
    reset() {
      if (!confirm('Reset this exercise to the starting code? Your changes here will be lost.')) return;
      this.files.forEach(f => { f.ed.set(f.starter); store.del(this.key(f.name)); });
      this.output.innerHTML = ''; this.status.textContent = '';
    }
    markSolved() {
      if (this.ex) { this.ex.classList.add('is-solved'); const tag = $('.ex-tag', this.ex); if (tag) tag.classList.add('solved'); }
      updateExProgress();
    }
    async run(useSolution) {
      this.runBtn.disabled = true;
      this.status.className = 'status'; this.status.textContent = 'Running…';
      const files = {};
      this.files.forEach(f => { files[f.name] = useSolution && this.solutions[f.name] !== undefined ? this.solutions[f.name] : f.ed.get(); });
      let db = null;
      try {
        if (this.needsDb) { await loadSql(); db = freshDb(); }
      } catch (e) {
        this.status.className = 'status bad'; this.status.textContent = e.message; this.runBtn.disabled = false; return { ok: false };
      }
      const sim = new Sim({ files, entry: this.entry, db, tests: this.tests });
      const r = await sim.start();
      this.sim = r.entryOk ? sim : null;
      this.render(sim, r);
      this.runBtn.disabled = false;
      const allPass = r.entryOk && r.results.length > 0 && r.results.every(x => x.pass);
      if (allPass && !useSolution) { store.set(this.solvedKey, true); this.markSolved(); }
      if (this.reqbar) this.reqbar.enable(!!this.sim);
      return { ok: r.hadTests ? allPass : r.entryOk, results: r.results, logs: sim.logs };
    }
    render(sim, r) {
      this.output.innerHTML = '';
      const con = h('div', { class: 'console' }, h('div', { class: 'l-cmd' }, `> node ${this.entry}`));
      if (!sim.logs.length) con.append(h('div', { class: 'l-note' }, '(nothing was printed)'));
      sim.logs.forEach(l => con.append(h('div', { class: 'l-' + l.type }, l.text)));
      this.output.append(h('div', { class: 'out-section' }, h('div', { class: 'out-title' }, 'Terminal output'), con));
      if (r.results.length) {
        const ul = h('ul', { class: 'test-list' });
        r.results.forEach(t => ul.append(h('li', { class: t.pass ? 'pass' : 'fail' }, h('span', { class: 'mark' }, t.pass ? '✓' : '✗'),
          h('span', null, t.name, t.why ? h('span', { class: 'why' }, t.why) : null))));
        const sec = h('div', { class: 'out-section' }, h('div', { class: 'out-title' }, 'Checks'), ul);
        const passed = r.results.filter(t => t.pass).length;
        if (passed === r.results.length) sec.append(h('div', { class: 'all-pass' }, '🎉 All checks pass — well done!'));
        this.output.append(sec);
        this.status.className = 'status ' + (passed === r.results.length ? 'good' : 'bad');
        this.status.textContent = `${passed} / ${r.results.length} checks pass`;
      } else if (r.hadTests && !r.entryOk) {
        this.status.className = 'status bad'; this.status.textContent = 'Your code crashed before the checks could run — read the red error.';
      } else {
        this.status.className = 'status ' + (r.entryOk ? 'good' : 'bad');
        this.status.textContent = r.entryOk ? (this.isExpress ? 'Server is running ✓ — send requests below' : 'Done') : 'Error — read the red message';
      }
    }
    buildReqBar() {
      const method = h('select', { 'aria-label': 'HTTP method' }, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => h('option', null, m)));
      const path = h('input', { class: 'path', value: '/', 'aria-label': 'URL path', spellcheck: 'false' });
      const body = h('textarea', { placeholder: '{ "key": "value" }  ← JSON body', spellcheck: 'false', 'aria-label': 'JSON body' });
      const send = h('button', { class: 'btn small' }, 'Send');
      const resp = h('div', { class: 'resp' });
      const note = h('div', { class: 'disabled-note' }, 'Press ▶ Run first — that starts your server. Then send requests here, like Postman.');
      const showBody = () => { body.hidden = !['POST', 'PUT', 'PATCH'].includes(method.value); };
      method.addEventListener('change', showBody); showBody();
      const doSend = async () => {
        if (!this.sim) return;
        let b;
        if (!body.hidden && body.value.trim()) {
          try { JSON.parse(body.value); b = body.value; } catch (e) { resp.innerHTML = ''; resp.append(h('div', { class: 'status bad' }, 'Your JSON body is not valid JSON: ' + e.message + '. Remember: double quotes around keys and text.')); return; }
        }
        const before = this.sim.logs.length;
        const r = await this.sim.request(method.value, path.value.trim() || '/', b);
        this.showResponse(resp, r, this.sim.logs.slice(before));
      };
      send.onclick = doSend;
      path.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
      const presets = h('div', { class: 'presets' });
      this.tries.forEach(line => {
        const m = line.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s*(.*)$/i);
        if (!m) return;
        presets.append(h('button', { class: 'chip', title: 'Fill the request', onclick: () => { method.value = m[1].toUpperCase(); path.value = m[2]; body.value = m[3] || ''; showBody(); if (this.sim) doSend(); } },
          h('b', null, m[1].toUpperCase()), ' ' + m[2] + (m[3] ? ' {…}' : '')));
      });
      const bar = h('div', { class: 'reqbar' }, h('div', { class: 'out-title' }, 'Send a request to your server'), note,
        h('div', { class: 'line' }, method, path, send), body, this.tries.length ? presets : null, resp);
      this.box.append(bar);
      const all = [method, path, body, send];
      this.reqbar = { enable: on => { all.forEach(x => { x.disabled = !on; }); note.hidden = on; if (!on) resp.innerHTML = ''; } };
      this.reqbar.enable(false);
    }
    showResponse(el, r, newLogs) {
      el.innerHTML = '';
      const cls = r.status >= 500 ? 's5' : r.status >= 400 ? 's4' : 's2';
      if (r.hung) {
        el.append(h('div', { class: 'status bad' }, '⏳ No response! The route ran but never called res.json() / res.send(). In a real browser the page would keep loading forever. (Forgot to send a response? Forgot to call next()?)'));
      } else {
        el.append(h('span', { class: 'status-pill ' + cls }, `${r.status} ${STATUS_TEXT[r.status] || ''}`));
        el.append(r.isText ? h('pre', { class: 'code' }, String(r.body)) : highlightBlock(JSON.stringify(r.body, null, 2), 'json'));
        if (r.notFound) el.append(h('div', { class: 'meta' }, 'This is Express\'s default answer when NO route matches the method + path.'));
        if (r.crashed) el.append(h('div', { class: 'meta' }, 'Your code threw an error that was not caught, so Express answered 500 for you. See the error below.'));
      }
      if (r.cookies.length) el.append(h('div', { class: 'meta' }, '🍪 Server set cookie: ' + r.cookies.map(c => `${c.name}=${c.value}`).join(', ')));
      const jar = Object.entries(r.jar);
      if (jar.length) el.append(h('div', { class: 'meta' }, 'Cookies the client now has (sent automatically next time): ' + jar.map(([k, v]) => `${k}=${v}`).join('; ')));
      if (newLogs.length) {
        const con = h('div', { class: 'console' });
        newLogs.forEach(l => con.append(h('div', { class: 'l-' + l.type }, l.text)));
        el.append(h('div', { class: 'meta' }, 'Server terminal printed:'), con);
      }
    }
  }

  // =====================================================================
  //  SQL playground component
  // =====================================================================
  const sqlBoxes = [];
  function rowsTable(res) {
    if (!res) return h('div', { class: 'sql-msg' }, '(no rows)');
    if (!res.values.length) return h('div', { class: 'sql-msg' }, `Empty result — 0 rows. (Columns: ${res.columns.join(', ')})`);
    const shown = res.values.slice(0, 60);
    return h('div', null, h('table', { class: 'sql-table' },
      h('thead', null, h('tr', null, res.columns.map(c => h('th', null, c)))),
      h('tbody', null, shown.map(r => h('tr', null, r.map(v => v === null ? h('td', { class: 'null' }, 'NULL') : h('td', null, String(v))))))),
    h('div', { class: 'sql-msg' }, `${res.values.length} row${res.values.length === 1 ? '' : 's'}${res.values.length > 60 ? ' (showing 60)' : ''}`));
  }
  function runSqlText(db, text) {
    const t = translateMysql(text);
    if (!t.replace(/;/g, '').trim()) return { results: [], changes: 0 };
    const before = db.exec('SELECT total_changes()')[0].values[0][0];
    try {
      const results = db.exec(t);
      const after = db.exec('SELECT total_changes()')[0].values[0][0];
      return { results, changes: after - before };
    } catch (e) { return { error: mysqlError(e, text) }; }
  }
  function sameRows(a, b, ordered) {
    if (!a || !b) return 'missing';
    if (a.columns.length !== b.columns.length) return 'cols';
    const norm = v => v.map(x => typeof x === 'number' ? Math.round(x * 100) / 100 : x);
    const A = a.values.map(r => JSON.stringify(norm(r))), B = b.values.map(r => JSON.stringify(norm(r)));
    if (A.length !== B.length) return 'count';
    if (JSON.stringify(A) === JSON.stringify(B)) return 'ok';
    if (JSON.stringify([...A].sort()) === JSON.stringify([...B].sort())) return ordered ? 'order' : 'ok';
    return 'diff';
  }
  class SqlBox {
    constructor(box, idx) {
      this.box = box; this.id = box.id || 'sql' + idx;
      const ta = $('textarea', box);
      this.starter = dedent(ta ? ta.value : '');
      this.solution = box.dataset.solution || '';
      this.check = box.dataset.check || '';
      this.ex = box.closest('.exercise');
      this.solvedKey = `solved:${PAGE}#${this.id}`;
      box.innerHTML = '';
      box.classList.add('runner');
      box.append(h('div', { class: 'single-label' }, 'SQL — the practice database resets every time you press Run'));
      const pane = h('div');
      box.append(pane);
      this.ed = makeEditor(pane, store.get('sql:' + PAGE + '#' + this.id) ?? this.starter, 'text/x-mysql', false);
      let timer;
      this.ed.onChange(() => { clearTimeout(timer); timer = setTimeout(() => store.set('sql:' + PAGE + '#' + this.id, this.ed.get()), 300); });
      box.addEventListener('run-shortcut', () => this.run());
      this.status = h('span', { class: 'status' });
      this.runBtn = h('button', { class: 'btn', onclick: () => this.run() }, '▶ Run SQL');
      box.append(h('div', { class: 'toolbar' }, this.runBtn, h('button', { class: 'btn ghost small', onclick: () => { this.ed.set(this.starter); store.del('sql:' + PAGE + '#' + this.id); this.out.innerHTML = ''; this.status.textContent = ''; } }, 'Reset'), this.status));
      this.out = h('div', { class: 'output' });
      box.append(this.out);
      if (this.solution) {
        placeSolution(box, h('details', { class: 'solution' }, h('summary', null, 'Show solution (try it yourself first!)'), highlightBlock(this.solution.replace(/;\s*/g, ';\n').trim(), 'sql')));
      }
      if (store.get(this.solvedKey)) this.markSolved();
    }
    markSolved() { if (this.ex) { this.ex.classList.add('is-solved'); const tag = $('.ex-tag', this.ex); if (tag) tag.classList.add('solved'); } updateExProgress(); }
    async run(useSolution) {
      this.runBtn.disabled = true; this.status.className = 'status'; this.status.textContent = 'Running…';
      try { await loadSql(); } catch (e) { this.status.className = 'status bad'; this.status.textContent = e.message; this.runBtn.disabled = false; return { ok: false }; }
      const code = useSolution ? this.solution : this.ed.get();
      const db = freshDb();
      const r = runSqlText(db, code);
      this.out.innerHTML = '';
      const sec = h('div', { class: 'out-section' });
      this.out.append(sec);
      let mine = null;
      if (r.error) {
        sec.append(h('div', { class: 'console' }, h('div', { class: 'l-error' }, `ERROR (${r.error.code}): ${r.error.message}`)));
      } else {
        const last = r.results[r.results.length - 1];
        if (last) { sec.append(h('div', { class: 'out-title' }, 'Result'), rowsTable(last)); mine = last; }
        else sec.append(h('div', { class: 'sql-msg' }, `✓ Query OK — ${r.changes} row${r.changes === 1 ? '' : 's'} affected.`));
        if (this.check) {
          const c = db.exec(translateMysql(this.check))[0];
          sec.append(h('div', { class: 'out-title', style: 'margin-top:10px' }, 'The table after your query:'), rowsTable(c));
          mine = c;
        }
      }
      let ok = !r.error;
      if (this.solution && !r.error) {
        const sdb = freshDb();
        const sr = runSqlText(sdb, this.solution);
        const want = this.check ? sdb.exec(translateMysql(this.check))[0] : sr.results[sr.results.length - 1];
        const verdict = sameRows(mine, want, /ORDER\s+BY/i.test(this.solution));
        ok = verdict === 'ok';
        const msg = {
          ok: '🎉 Correct — your result matches!',
          cols: `Not yet: you returned ${mine ? mine.columns.length : 0} column(s), but ${want.columns.length} are expected (${want.columns.join(', ')}).`,
          count: `Not yet: you got ${mine ? mine.values.length : 0} row(s), but ${want.values.length} are expected.`,
          order: 'So close: the rows are right but in the wrong order. Check ORDER BY.',
          diff: 'Not yet: same number of rows, but the values are different. Check your WHERE / columns.',
          missing: 'Not yet: your SQL did not return a result table.',
        }[verdict];
        sec.append(h('div', { class: ok ? 'all-pass' : 'status bad', style: 'margin-top:8px' }, msg));
        if (ok && !useSolution) { store.set(this.solvedKey, true); this.markSolved(); }
      }
      this.status.className = 'status ' + (r.error ? 'bad' : '');
      this.status.textContent = r.error ? 'SQL error' : '';
      this.runBtn.disabled = false;
      return { ok, error: r.error };
    }
  }

  function updateExProgress() {
    const el = $('#ex-progress');
    const all = $$('.exercise');
    if (!el || !all.length) return;
    const done = all.filter(e => e.classList.contains('is-solved')).length;
    const auto = all.filter(e => $('.runner, .sqlbox', e)).length;
    el.textContent = auto ? `Code exercises solved on this page: ${done} of ${auto}` : '';
  }

  // =====================================================================
  //  Project planner (chapter 9)
  // =====================================================================
  function initPlanner() {
    const box = $('#planner');
    if (!box) return;
    const fields = ['p-thing', 'p-things', 'p-cols', 'p-rel', 'p-rel-cols'];
    const saved = store.get('planner', {});
    fields.forEach(id => { const el = $('#' + id); if (saved[id] !== undefined) el.value = saved[id]; el.addEventListener('input', gen); });
    const out = $('#planner-out');
    function up(s) { return s.trim().toUpperCase().replace(/\s+/g, '_'); }
    function gen() {
      const v = {}; fields.forEach(id => { v[id] = $('#' + id).value; }); store.set('planner', v);
      const one = v['p-thing'].trim().toLowerCase() || 'item';
      const many = v['p-things'].trim().toLowerCase() || one + 's';
      const T = up(many);
      const cols = v['p-cols'].split('\n').map(s => s.trim()).filter(Boolean);
      const rel = v['p-rel'].trim().toLowerCase();
      const relCols = v['p-rel-cols'].split('\n').map(s => s.trim()).filter(Boolean);
      const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
      let sql = `CREATE TABLE IF NOT EXISTS ${T} (\n  ID INT AUTO_INCREMENT PRIMARY KEY${cols.map(c => ',\n  ' + c).join('')}\n);`;
      if (rel) {
        const R = up(rel.endsWith('s') ? rel : rel + 's');
        const fk = up(one) + '_ID';
        sql += `\n\nCREATE TABLE IF NOT EXISTS ${R} (\n  ID INT AUTO_INCREMENT PRIMARY KEY,\n  USER_ID INT NOT NULL,\n  ${fk} INT NOT NULL${relCols.map(c => ',\n  ' + c).join('')},\n  FOREIGN KEY (USER_ID) REFERENCES USERS(ID),\n  FOREIGN KEY (${fk}) REFERENCES ${T}(ID)\n);`;
      }
      const eps = [
        ['GET', `/${many}`, `List all ${many}`, `retrieveAll${cap(many)}`],
        ['GET', `/${many}/:id`, `Get one ${one} (400 bad id, 404 not found)`, `retrieve${cap(one)}ById`],
        ['POST', `/${many}`, `Create a ${one} (400 missing fields, 201 created)`, `create${cap(one)}`],
        ['PUT', `/${many}/:id`, `Update a ${one} (404 / 200)`, `update${cap(one)}ById`],
        ['DELETE', `/${many}/:id`, `Delete a ${one} (404 / 200)`, `delete${cap(one)}ById`],
      ];
      if (rel) eps.push(['GET', `/${many}/${rel.endsWith('s') ? rel : rel + 's'}`, `JOIN: ${many} with their ${rel}s (put ABOVE /:id!)`, `get${cap(one)}${cap(rel)}s`],
        ['POST', `/${many}/:id/${rel.endsWith('s') ? rel : rel + 's'}`, `Add a ${rel} (409 if duplicate)`, `add${cap(rel)}`]);
      out.innerHTML = '';
      out.append(h('h4', null, 'Your tables (put these in db.js)'), highlightBlock(sql, 'sql'),
        h('h4', null, 'Your endpoints'),
        h('table', null, h('thead', null, h('tr', null, h('th', null, 'Method'), h('th', null, 'URL'), h('th', null, 'What it does'), h('th', null, 'Controller function'))),
          h('tbody', null, eps.map(e => h('tr', null, h('td', null, h('code', null, e[0])), h('td', null, h('code', null, e[1])), h('td', null, e[2]), h('td', null, h('code', null, e[3])))))),
        h('h4', null, 'Your files'),
        h('div', { class: 'tree' }, `routes/${one}Routes.js\ncontrollers/${one}Controller.js\n` + (rel ? `(the ${rel} endpoints can live in ${one}Controller.js too)\n` : '') + `index.js  →  app.use('/${many}', ${one}Router);`));
    }
    gen();
  }

  // =====================================================================
  //  Self test (open any page with ?selftest to run all solutions)
  // =====================================================================
  async function selfTest() {
    const banner = h('div', { class: 'selftest-banner' }, 'Self-test running…');
    $('main').prepend(banner);
    const lines = [];
    for (const r of runners) {
      const hasSol = Object.keys(r.solutions).length > 0;
      const res = await r.run(hasSol);
      const failed = (res.results || []).filter(t => !t.pass);
      const errs = (res.logs || []).filter(l => l.type === 'error');
      lines.push(`${res.ok ? 'PASS' : 'FAIL'}  runner ${r.id}${hasSol ? ' (solution)' : ' (starter)'}${failed.length ? '  → ' + failed.map(f => f.name + ': ' + f.why).join(' | ') : ''}${!res.ok && errs.length ? '  → ' + errs.map(e => e.text).join(' | ') : ''}`);
    }
    for (const s of sqlBoxes) {
      if (!s.solution) continue;
      const res = await s.run(true);
      lines.push(`${res.ok ? 'PASS' : 'FAIL'}  sql ${s.id}${res.error ? ' → ' + res.error.message : ''}`);
    }
    const fails = lines.filter(l => l.startsWith('FAIL')).length;
    banner.textContent = `SELFTEST ${fails ? 'FAILED' : 'OK'}: ${lines.length - fails}/${lines.length} pass\n` + lines.join('\n');
    window.__selftest = { fails, lines };
  }

  // =====================================================================
  //  init
  // =====================================================================
  function init() {
    buildLayout();
    if (window.hljs) $$('pre code:not(.nohl)').forEach(c => { if (!c.closest('.blanks')) { try { window.hljs.highlightElement(c); } catch (e) { /* */ } } });
    initQuizzes();
    initBlanks();
    initChecklists();
    $$('.runner').forEach((b, i) => runners.push(new Runner(b, i)));
    $$('.sqlbox').forEach((b, i) => sqlBoxes.push(new SqlBox(b, i)));
    initPlanner();
    const anchor = $('main .lead') || $('main h1');
    if (anchor && $$('.exercise .runner, .exercise .sqlbox').length) anchor.after(h('p', { class: 'ex-progress', id: 'ex-progress' }));
    updateExProgress();
    if (SELFTEST) selfTest();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
