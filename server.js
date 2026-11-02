// Small web server for the UK Data Checker.
//  - Serves the website in /public
//  - /api/ons/...   → cached pass-through to api.beta.ons.gov.uk and www.ons.gov.uk (ONS rate-limits bursts)
//  - /api/nomis/... → cached pass-through to the Nomis API (ONS / DWP labour market data)
//  - /api/dwp/...   → DWP Stat-Xplore (Universal Credit), only if STATXPLORE_API_KEY is set
// No dependencies: run with `node server.js` (Node 18+).

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = Number(process.env.PORT) || 8000;
const PUBLIC = path.join(__dirname, 'public');
loadDotEnv();
const SX_KEY = process.env.STATXPLORE_API_KEY || '';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

// ---------- tiny in-memory cache ----------
const cache = new Map();
const CACHE_MS = 15 * 60 * 1000;
// Stores the promise, so simultaneous requests for the same thing share one upstream call.
async function cached(key, fn, ms = CACHE_MS) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ms) return hit.v;
  const v = fn();
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  try { return await v; } catch (e) { cache.delete(key); throw e; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function upstream(url, opts = {}) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, opts);
    if (r.status !== 429) return r;
    await sleep((Number(r.headers.get('retry-after')) || 2 * (i + 1)) * 1000);
  }
  return fetch(url, opts);
}

// ---------- pass-through proxies (fixed hosts only) ----------
const PROXIES = {
  '/api/ons/search': 'https://api.beta.ons.gov.uk/v1/search',
  '/api/ons/site': 'https://www.ons.gov.uk',
  '/api/nomis': 'https://www.nomisweb.co.uk/api/v01/dataset',
  '/api/parl/interests': 'https://interests-api.parliament.uk/api/v1',
  '/api/parl/members': 'https://members-api.parliament.uk/api',
  '/api/parl/votes': 'https://commonsvotes-api.parliament.uk/data',
};

async function proxy(req, res, prefix, target) {
  const rest = req.url.slice(prefix.length);
  if (rest.includes('..') || /^[^/?]/.test(rest)) return send(res, 400, { error: 'Bad path' });
  const url = target + rest;
  try {
    const out = await cached(url, async () => {
      const r = await upstream(url);
      const body = Buffer.from(await r.arrayBuffer());
      if (!r.ok) throw Object.assign(new Error(`Upstream ${r.status}`), { status: r.status });
      return { type: r.headers.get('content-type') || 'application/json', body };
    });
    res.writeHead(200, { 'Content-Type': out.type, 'Cache-Control': 'public, max-age=600' });
    res.end(out.body);
  } catch (e) {
    send(res, e.status === 404 ? 404 : 502, { error: `Could not get data from source (${e.message})` });
  }
}

// ---------- DWP Stat-Xplore (Universal Credit) ----------
// Stat-Xplore needs a free API key: https://stat-xplore.dwp.gov.uk → account → Open Data API.
const SX = 'https://stat-xplore.dwp.gov.uk/webapi/rest/v1';
async function sx(p, body) {
  const r = await upstream(SX + p, {
    method: body ? 'POST' : 'GET',
    headers: { APIKey: SX_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Stat-Xplore ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// "People on Universal Credit" by local authority (Great Britain only; Northern
// Ireland runs its own Universal Credit statistics). IDs follow Stat-Xplore's
// fixed pattern; large queries time out on DWP's side, so we ask for one month
// per request, in parallel, and cache the answers.
const UC = {
  db: 'str:database:UC_Monthly',
  measure: 'str:count:UC_Monthly:V_F_UC_CASELOAD_FULL',
  geoField: 'str:field:UC_Monthly:V_F_UC_CASELOAD_FULL:WARD_CODE',
  laValue: 'str:value:UC_Monthly:V_F_UC_CASELOAD_FULL:WARD_CODE:V_C_MASTERGEOG21_LA_TO_REGION:',
  dateField: 'str:field:UC_Monthly:F_UC_DATE:DATE_NAME',
  dateValue: 'str:value:UC_Monthly:F_UC_DATE:DATE_NAME:C_UC_DATE:',
};
const ymKey = d => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const monthsBack = (from, n) => { const d = new Date(Date.UTC(+from.slice(0, 4), +from.slice(4) - 1)); d.setUTCMonth(d.getUTCMonth() - n); return ymKey(d); };

async function ucMonth(code, ym) {
  return cached(`uc:${code}:${ym}`, async () => {
    const t = await sx('/table', {
      database: UC.db,
      measures: [UC.measure],
      recodes: {
        [UC.geoField]: { map: [[UC.laValue + code]], total: false },
        [UC.dateField]: { map: [[UC.dateValue + ym]], total: false },
      },
      dimensions: [[UC.geoField], [UC.dateField]],
    });
    return { label: t.fields[1].items[0].labels[0], value: t.cubes[UC.measure].values[0][0] };
  }, 24 * 3600 * 1000);
}

// Newest month DWP has published: step back from this month until one exists.
function ucLatestMonth(code) {
  return cached('uc:latest', async () => {
    let ym = ymKey(new Date());
    for (let i = 0; i < 12; i++, ym = monthsBack(ym, 1)) {
      try { await ucMonth(code, ym); return ym; } catch (e) {
        if (!/RECODE_FIELD_VALUE_NOT_FOUND|invalid value/.test(e.message)) throw e;
      }
    }
    throw new Error('Could not find a recent month in Stat-Xplore');
  }, 6 * 3600 * 1000);
}

async function ucForArea(code) {
  if (code.startsWith('N')) throw Object.assign(new Error('DWP Universal Credit statistics cover Great Britain only; Northern Ireland publishes its own.'), { status: 404 });
  const latest = await ucLatestMonth(code);
  // Quarterly points over two years, plus the latest month.
  const months = Array.from({ length: 9 }, (_, i) => monthsBack(latest, (8 - i) * 3));
  const series = await Promise.all(months.map(ym => ucMonth(code, ym)));
  return {
    measure: 'People on Universal Credit',
    series,
    source: 'DWP Stat-Xplore, People on Universal Credit',
    sourceUrl: 'https://stat-xplore.dwp.gov.uk',
  };
}

// ---------- every DWP benefit, for all council areas at once (used by the map) ----------
// Each entry: Stat-Xplore database, count measure, LA geography field/valueset and date field.
// `ni: true` → the table also covers Northern Ireland. `scotlandReplaced` → in Scotland this
// benefit is being replaced by Social Security Scotland, so DWP figures there are incomplete.
const sxIds = (db, view, dateField, dateSet, geo = 'WARD_CODE', laSet = 'V_C_MASTERGEOG21_LA_TO_REGION') => ({
  db: `str:database:${db}`,
  measure: `str:count:${db}:${view}`,
  geoField: `str:field:${db}:${view}:${geo}`,
  laValue: `str:value:${db}:${view}:${geo}:${laSet}:`,
  dateField: `str:field:${db}:${dateField}`,
  dateSet: `str:valueset:${db}:${dateField}:${dateSet}`,
});
const BENEFITS = {
  uc: { label: 'People on Universal Credit', ...sxIds('UC_Monthly', 'V_F_UC_CASELOAD_FULL', 'F_UC_DATE:DATE_NAME', 'C_UC_DATE') },
  ucHouseholds: { label: 'Households on Universal Credit', ...sxIds('UC_Households', 'V_F_UC_HOUSEHOLDS', 'F_UC_HH_DATE:DATE_NAME', 'C_UC_HH_DATE') },
  pip: { label: 'Personal Independence Payment (PIP)', scotlandReplaced: 'Adult Disability Payment', ...sxIds('PIP_Monthly_new', 'V_F_PIP_MONTHLY', 'F_PIP_DATE:DATE2', 'C_PIP_DATE') },
  hb: { label: 'Housing Benefit', ...sxIds('hb_new', 'V_F_HB_NEW', 'F_HB_NEW_DATE:NEW_DATE_NAME', 'C_HB_NEW_DATE') },
  sp: { label: 'State Pension', ...sxIds('SP_New', 'V_F_SP_CASELOAD_New', 'F_SP_QTR_New:DATE_NAME', 'C_SP_QTR_New') },
  pc: { label: 'Pension Credit', ...sxIds('PC_New', 'V_F_PC_CASELOAD_New', 'F_PC_QTR_New:DATE_NAME', 'C_PC_QTR_New') },
  aa: { label: 'Attendance Allowance', scotlandReplaced: 'Pension Age Disability Payment', ...sxIds('AA_Entitled_New', 'V_F_AA_Entitled_New', 'F_AA_QTR_New:DATE_NAME', 'C_AA_QTR_New') },
  dla: { label: 'Disability Living Allowance (DLA)', scotlandReplaced: 'Child and Adult Disability Payment', ...sxIds('DLA_Entitled_New', 'V_F_DLA_Entitled_New', 'F_DLA_QTR_New:DATE_NAME', 'C_DLA_QTR_New') },
  ca: { label: "Carer's Allowance", scotlandReplaced: 'Carer Support Payment', ...sxIds('CA_Entitled_New', 'V_F_CA_Entitled_New', 'F_CA_QTR_New:DATE_NAME', 'C_CA_QTR_New') },
  esa: { label: 'Employment and Support Allowance (ESA)', ...sxIds('ESA_Caseload_new', 'V_F_ESA_NEW', 'F_ESA_QTR_NEW:DATE_NAME', 'C_ESA_QTR_NEW') },
  jsa: { label: "Jobseeker's Allowance (JSA)", ...sxIds('JSA_NEW', 'V_F_JSA_NEW', 'F_JSA_QTR_NEW:DATE_NAME', 'C_JSA_QTR_NEW') },
  cilif: { label: 'Children in relative low income families', ni: true, ...sxIds('CILIF_REL', 'V_F_CILIF_REL', 'F_CILIF_DATE:DATE_NAME', 'C_CILIF_DATE', 'UK_COA_CODE', 'V_C_MASTERGEOG21_LA_TO_REGION_NI') },
  nino: { label: 'National Insurance numbers registered to adult overseas nationals', ni: true, ...sxIds('Ninos', 'V_F_NINOS', 'V_F_NINOS:QTR_FINYR', 'C_NINO_FINYR', 'UK_COA_CODE', 'V_C_MASTERGEOG21_LA_TO_REGION_NI') },
};

const LA_CODES = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data', 'local-authorities.json'), 'utf8')).map(a => a.code);
const CACHE_DIR = path.join(__dirname, 'cache');
const DAY = 24 * 3600 * 1000;

// Newest period in a date valueset. Stat-Xplore lists at most 100 values, so for longer
// lists step back month by month from today until DWP accepts the value.
async function latestPeriod(b) {
  const vals = (await sx('/schema/' + encodeURIComponent(b.dateSet))).children || [];
  if (vals.length && vals.length < 100) return vals[vals.length - 1].id;
  const prefix = b.dateSet.replace('str:valueset:', 'str:value:') + ':';
  let ym = ymKey(new Date());
  for (let i = 0; i < 14; i++, ym = monthsBack(ym, 1)) {
    try {
      await sx('/table', { database: b.db, measures: [b.measure], recodes: { [b.dateField]: { map: [[prefix + ym]], total: false } }, dimensions: [[b.dateField]] });
      return prefix + ym;
    } catch (e) { if (!/RECODE_FIELD_VALUE_NOT_FOUND|invalid value/.test(e.message)) throw e; }
  }
  throw new Error('No recent period found');
}

async function fetchBenefit(key) {
  const b = BENEFITS[key];
  const period = await latestPeriod(b);
  let codes = LA_CODES.filter(c => b.ni || !c.startsWith('N'));
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const t = await sx('/table', {
        database: b.db, measures: [b.measure],
        recodes: { [b.geoField]: { map: codes.map(c => [b.laValue + c]), total: false }, [b.dateField]: { map: [[period]], total: false } },
        dimensions: [[b.geoField], [b.dateField]],
      });
      const values = {};
      t.fields[0].items.forEach((it, i) => { values[it.uris[0].split(':').pop()] = t.cubes[b.measure].values[i][0]; });
      return {
        key, label: b.label, period: t.fields[1].items[0].labels[0].replace(/^\d{6} \((.*)\)$/, '$1'),
        values, scotlandReplaced: b.scotlandReplaced || null, coversNI: !!b.ni,
        source: 'DWP Stat-Xplore', sourceUrl: 'https://stat-xplore.dwp.gov.uk', fetchedAt: new Date().toISOString(),
      };
    } catch (e) {
      // An area DWP doesn't recognise: drop it and ask again.
      const bad = (e.message.match(/invalid value (\S+)/) || [])[1];
      if (!bad) throw e;
      codes = codes.filter(c => b.laValue + c !== bad);
    }
  }
  throw new Error('Too many unrecognised areas');
}

// Cached in memory and on disk for a day, so restarts don't re-query DWP.
function benefitData(key) {
  return cached('benefit:' + key, async () => {
    const file = path.join(CACHE_DIR, `dwp-${key}.json`);
    try {
      const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Date.now() - Date.parse(disk.fetchedAt) < DAY) return disk;
    } catch { /* not cached yet */ }
    const data = await fetchBenefit(key);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
    return data;
  }, DAY);
}

// Warm the cache in the background, a few at a time, so the map is quick for visitors.
async function warmBenefits() {
  const keys = Object.keys(BENEFITS);
  const worker = async () => { for (let k; (k = keys.shift());) await benefitData(k).catch(e => console.warn(`DWP ${k}: ${e.message}`)); };
  await Promise.all([worker(), worker(), worker()]);
  console.log('DWP benefit data ready');
}

async function dwp(req, res, url) {
  if (url.pathname === '/api/dwp/status') return send(res, 200, { configured: !!SX_KEY, benefits: Object.fromEntries(Object.entries(BENEFITS).map(([k, b]) => [k, b.label])) });
  const bm = url.pathname.match(/^\/api\/dwp\/benefit\/(\w+)$/);
  if (bm && BENEFITS[bm[1]] && SX_KEY) {
    try { return send(res, 200, await benefitData(bm[1])); } catch (e) { return send(res, 502, { error: e.message.replace(/^Stat-Xplore \d+: /, 'DWP Stat-Xplore: ') }); }
  }
  if (!SX_KEY) return send(res, 503, { error: 'DWP Stat-Xplore is not set up on this server (no API key).' });
  const code = url.searchParams.get('area') || '';
  if (url.pathname === '/api/dwp/uc' && /^[A-Z]\d{8}$/.test(code)) {
    try {
      return send(res, 200, await ucForArea(code));
    } catch (e) {
      return send(res, e.status || 502, { error: e.message.replace(/^Stat-Xplore \d+: /, 'DWP Stat-Xplore: ') });
    }
  }
  send(res, 404, { error: 'Not found' });
}

// ---------- static files ----------
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found' });
    // "no-cache" = browsers may keep a copy but must check it's current, so visitors get site
    // updates straight away instead of a stale script.
    const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
    // Compress text files (the map boundaries shrink from ~560 KB to ~150 KB).
    if (/\.(json|js|css|html)$/.test(file) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      data = zlib.gzipSync(data);
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function loadDotEnv() {
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env file */ }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  for (const [prefix, target] of Object.entries(PROXIES)) {
    if (url.pathname.startsWith(prefix)) return proxy(req, res, prefix, target);
  }
  if (url.pathname.startsWith('/api/dwp/')) return dwp(req, res, url);
  serveStatic(req, res, url);
}).listen(PORT, () => {
  console.log(`UK Data Checker running at http://localhost:${PORT}`);
  console.log(SX_KEY ? 'DWP Stat-Xplore: enabled' : 'DWP Stat-Xplore: off (set STATXPLORE_API_KEY in .env to enable benefit data)');
  if (SX_KEY) warmBenefits();
});
