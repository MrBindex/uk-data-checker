// UK Data Checker — single-page app (hash routes).
const { esc } = Charts;
const view = document.getElementById('view');
const ONS_SITE = 'https://www.ons.gov.uk';

// ---------------------------------------------------------------- data access
// Prefer our caching server (/api/...). If the site is hosted as static files
// with no server, fall back to calling the official APIs directly.
const DIRECT = {
  '/api/ons/search': 'https://api.beta.ons.gov.uk/v1/search',
  '/api/ons/site': ONS_SITE,
  '/api/nomis': 'https://www.nomisweb.co.uk/api/v01/dataset',
};
async function api(path, as = 'json') {
  let r;
  try { r = await fetch(path); } catch { r = null; }
  // An HTML reply to a data request means there is no API server here (static hosting).
  const htmlReply = as !== 'html' && (r?.headers.get('content-type') || '').includes('text/html');
  if (!r || (!r.ok && r.status !== 404 && r.status !== 502) || htmlReply) {
    const prefix = Object.keys(DIRECT).find(p => path.startsWith(p));
    if (prefix) r = await fetch(DIRECT[prefix] + path.slice(prefix.length));
  }
  if (!r.ok) {
    let msg = `The source returned an error (${r.status}).`;
    try { msg = (await r.json()).error || msg; } catch { }
    throw new Error(msg);
  }
  return as === 'json' ? r.json() : r.text();
}

const once = {};
const getJSON = url => (once[url] ||= fetch(url).then(r => { if (!r.ok) throw new Error('Missing ' + url); return r.json(); }));
const finances = () => getJSON('data/regional-finances.json');
const localAuthorities = () => getJSON('data/local-authorities.json');

// Nomis CSV → array of objects
async function nomis(dataset, params) {
  const q = new URLSearchParams(params).toString();
  const text = await api(`/api/nomis/${dataset}.data.csv?${q}`, 'text');
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = parseCsvLine(head).map(c => c.toLowerCase());
  return lines.map(l => Object.fromEntries(parseCsvLine(l).map((v, i) => [cols[i], v])));
}
function parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

// ---------------------------------------------------------------- formatting
const nf = (v, d = 0) => v == null || !isFinite(v) ? '–' : v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (m) => { // £ million input
  if (m == null) return '–';
  const a = Math.abs(m);
  if (a >= 1000) return `${m < 0 ? '−' : ''}£${nf(a / 1000, 1)}bn`;
  return `${m < 0 ? '−' : ''}£${nf(a)}m`;
};
const pounds = v => v == null ? '–' : `${v < 0 ? '−' : ''}£${nf(Math.abs(v))}`;
const date = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const tickIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function sourceLine({ name, url, released, extra }) {
  return `<div class="source"><span class="tick">${tickIcon} Official data</span>
    <span>Source: <a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a></span>
    ${released ? `<span>Released ${esc(released)}</span>` : ''}${extra ? `<span>${extra}</span>` : ''}</div>`;
}
const loading = (msg = 'Loading official data…') => `<div class="loading">${esc(msg)}</div>`;
const errorBox = e => `<div class="error"><strong>Couldn't load this data.</strong> ${esc(e.message || e)}<br><span class="small muted">The official source may be busy — try again in a minute.</span></div>`;

// ---------------------------------------------------------------- ONS time series helpers
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
function seriesPoints(data, freq) {
  const arr = data[freq] || [];
  return arr.map(p => ({ label: niceDate(p.date), raw: p.value, value: p.value === '' ? null : Number(p.value) }))
    .filter(p => p.value == null || isFinite(p.value));
}
function niceDate(d) {
  const m = d.match(/^(\d{4}) ([A-Z]{3})$/);
  if (m) return new Date(+m[1], MONTHS[m[2]]).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  return d.replace(/^(\d{4}) (Q\d)$/, '$2 $1');
}
function bestFreq(data) {
  return ['months', 'quarters', 'years'].find(f => (data[f] || []).length) || 'years';
}
function decimalsOf(points) {
  return Math.min(3, Math.max(0, ...points.map(p => (String(p.raw).split('.')[1] || '').length)));
}
function unitFormatter(desc, dec) {
  const pre = desc.preUnit || '';
  const unit = desc.unit || '';
  const suffix = unit === '%' ? '%' : unit ? ` ${unit}` : '';
  return v => `${v < 0 ? '−' : ''}${pre}${nf(Math.abs(v), dec)}${suffix}`;
}
const FREQ_NAME = { months: 'Monthly', quarters: 'Quarterly', years: 'Yearly' };
const PERIOD_WORD = { months: 'month', quarters: 'quarter', years: 'year' };

// Headline indicators shown on the home page (verified ONS series IDs).
const HEADLINES = [
  { uri: '/economy/inflationandpriceindices/timeseries/d7g7/mm23', name: 'Inflation (CPI, annual rate)', explain: 'How much prices rose compared with a year earlier.' },
  { uri: '/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms', name: 'Unemployment rate (16+)', explain: 'Share of people who want work and are looking, but have no job.' },
  { uri: '/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/timeseries/lf24/lms', name: 'Employment rate (16–64)', explain: 'Share of 16 to 64 year olds in work.' },
  { uri: '/employmentandlabourmarket/peoplenotinwork/economicinactivity/timeseries/lf2s/lms', name: 'Economic inactivity rate (16–64)', explain: 'Not working and not looking — e.g. students, carers, long-term sick.' },
  { uri: '/economy/grossdomesticproductgdp/timeseries/ihyq/qna', name: 'GDP growth (quarter on quarter)', explain: 'How much the economy grew compared with the previous quarter.' },
  { uri: '/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/kac3/lms', name: 'Pay growth (total pay, yearly)', explain: 'Average weekly earnings compared with a year earlier, before inflation.' },
  { uri: '/employmentandlabourmarket/peoplenotinwork/outofworkbenefits/timeseries/bcjd/unem', name: 'Claimant Count (UK, thousands)', explain: 'People claiming unemployment-related benefits (JSA + UC searching for work).' },
  { uri: '/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/hf6x/pusf', name: 'Public sector net debt (% of GDP)', explain: 'Government debt compared with the size of the economy.' },
];

// ---------------------------------------------------------------- router
const routes = {
  '': home, search, series, areas, area, regions, guide, map: mapPage, bulletins: bulletinsPage, read: readPage,
};
async function router() {
  const [pathPart, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [page, ...rest] = pathPart.split('/');
  const params = new URLSearchParams(qs || '');
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === page || (page === 'area' && a.dataset.nav === 'areas') || (page === 'series' && a.dataset.nav === 'search') || (page === 'read' && a.dataset.nav === 'bulletins')));
  const fn = routes[page] || home;
  hideTooltip();
  window.scrollTo(0, 0);
  try { await fn(params, rest); } catch (e) { view.innerHTML = errorBox(e); console.error(e); }
}
window.addEventListener('hashchange', router);
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => document.dispatchEvent(new Event('redraw')), 150); });
function onRedraw(fn) {
  const h = () => { if (document.body.contains(view)) fn(); };
  document.addEventListener('redraw', h);
  window.addEventListener('hashchange', () => document.removeEventListener('redraw', h), { once: true });
}
const hideTooltip = () => { document.getElementById('tooltip').hidden = true; };
function setTitle(t) { document.title = t ? `${t} – UK Data Checker` : 'UK Data Checker'; }

function searchForm(q = '') {
  return `<form class="searchbar" role="search" onsubmit="event.preventDefault(); location.hash='#/search?q='+encodeURIComponent(this.q.value.trim())">
    <input name="q" type="search" value="${esc(q)}" placeholder="Search ONS data, e.g. inflation, migration, wages…" aria-label="Search official statistics" autocomplete="off">
    <button class="btn" type="submit">Search</button></form>`;
}

// ---------------------------------------------------------------- HOME
async function home() {
  setTitle('');
  const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  view.innerHTML = `
    <section class="hero">
      <span class="eyebrow"><span class="pulse"></span>Live from the ONS, DWP and Home Office</span>
      <h1>Check the numbers <span class="grad">before you share them</span></h1>
      <p class="lead">Official UK statistics, shown clearly — with the source, the date and what it actually measures, every time.</p>
      ${searchForm()}
      <div class="chips">${['inflation', 'unemployment', 'migration', 'house prices', 'wages', 'GDP', 'population'].map(t => `<a class="chip" href="#/search?q=${encodeURIComponent(t)}">${t}</a>`).join('')}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Headline figures</span><h2>The UK right now</h2></div><span class="muted small">Latest official releases · tap any card for the full chart</span></div>
      <div class="grid" id="headlines">${HEADLINES.map(() => `<div class="card stat">${loading('')}</div>`).join('')}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Bulletins</span><h2>Latest official reports</h2></div><a class="btn ghost" href="#/bulletins">All bulletins →</a></div>
      <div class="grid three" id="latestBulletins">${[0, 1, 2].map(() => `<div class="card">${loading('')}</div>`).join('')}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Explore</span><h2>Dig into the data</h2></div></div>
      <div class="grid three">
        <a class="card feature" href="#/map"><div class="icon ic-blue">${icon('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>')}</div>
          <h3>Map of the UK</h3><p>Every council coloured by benefits, pay or immigration. Click any area to zoom in and see all its figures.</p><span class="go">Open the map</span></a>
        <a class="card feature" href="#/areas"><div class="icon ic-green">${icon('<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>')}</div>
          <h3>Your area</h3><p>Benefit claims, Universal Credit, pay and population for your council, compared with the region and the UK.</p><span class="go">Find your area</span></a>
        <a class="card feature" href="#/regions"><div class="icon ic-violet">${icon('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>')}</div>
          <h3>Tax &amp; spending</h3><p>How much tax each region and nation raises, and how much public money is spent there, per person.</p><span class="go">Compare regions</span></a>
      </div>
    </section>

    <section class="section">
      <a class="card feature" href="#/guide" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        <div class="icon ic-orange" style="margin:0">${icon('<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/>')}</div>
        <div style="flex:1;min-width:240px"><h3>Saw a statistic online?</h3><p>If a post doesn't say where a number comes from, what period it covers, or whether it's a count or a rate — be careful. Learn the 8 questions to ask.</p></div>
        <span class="go" style="margin:0">Fact-check guide</span>
      </a>
    </section>`;

  api('/api/ons/search?content_type=bulletin&limit=3&sort=release_date')
    .then(d => { document.getElementById('latestBulletins').innerHTML = d.items.map(bulletinCard).join(''); })
    .catch(() => { document.getElementById('latestBulletins').innerHTML = '<p class="small muted">Couldn\'t load the latest bulletins right now.</p>'; });

  const box = document.getElementById('headlines');
  HEADLINES.forEach(async (h, i) => {
    const card = box.children[i];
    try {
      const d = await api(`/api/ons/site${h.uri}/data`);
      const freq = bestFreq(d);
      const pts = seriesPoints(d, freq).filter(p => p.value != null);
      const dec = decimalsOf(pts.slice(-24));
      const fmt = unitFormatter(d.description, dec);
      const last = pts[pts.length - 1], back = freq === 'months' ? 12 : freq === 'quarters' ? 4 : 1;
      const yearAgo = pts[pts.length - 1 - back];
      const diff = yearAgo ? last.value - yearAgo.value : null;
      const unitWord = d.description.unit === '%' ? ' percentage points' : '';
      card.outerHTML = `<div class="card stat linked">
        <div class="label"><a class="stretch" href="#/series?uri=${encodeURIComponent(h.uri)}">${esc(h.name)}</a></div>
        <div class="value">${fmt(last.value)}</div>
        <div class="meta">${esc(last.label)}${freq === 'months' && d.description.monthLabelStyle ? ` (${esc(d.description.monthLabelStyle)})` : ''}</div>
        ${diff != null ? `<div class="change" title="Compared with a year earlier">${diff === 0 ? 'No change on a year ago' : `${diff > 0 ? '▲' : '▼'} ${nf(Math.abs(diff), dec)}${unitWord ? ' pts' : ''} vs a year ago`}</div>` : ''}
        ${Charts.spark(pts.slice(freq === 'months' ? -36 : -16).map(p => p.value))}
        <div class="meta" style="margin-top:6px">${esc(h.explain)}</div>
        ${sourceLine({ name: `ONS ${d.description.cdid}`, url: ONS_SITE + h.uri, released: date(d.description.releaseDate) })}
      </div>`;
    } catch (e) {
      card.innerHTML = `<div class="label">${esc(h.name)}</div><p class="small muted">Couldn't load right now.</p>`;
    }
  });
}

// ---------------------------------------------------------------- SEARCH
const TYPES = [
  { id: '', name: 'Everything' },
  { id: 'timeseries', name: 'Data series (charts)' },
  { id: 'bulletin', name: 'Bulletins' },
  { id: 'article', name: 'Articles' },
  { id: 'dataset_landing_page', name: 'Datasets' },
];
const TYPE_LABEL = {
  timeseries: 'Data series', bulletin: 'Bulletin', article: 'Article', dataset_landing_page: 'Dataset', dataset: 'Dataset',
  static_adhoc: 'User-requested data', release: 'Release', static_methodology: 'Methodology', compendium_landing_page: 'Compendium',
  article_download: 'Article', static_foi: 'FOI response', visualisation: 'Visualisation', static_page: 'Page',
};

async function search(params) {
  const q = params.get('q') || '';
  const type = params.get('type') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  setTitle(q ? `Search: ${q}` : 'Search data');
  const link = (o) => '#/search?' + new URLSearchParams({ q, type, page: 1, ...o }).toString();
  view.innerHTML = `
    <div class="page-head"><span class="kicker">Search</span><h1>Search official statistics</h1><p class="lead">Everything the Office for National Statistics publishes. Data series open as interactive charts.</p></div>
    ${searchForm(q)}
    <div class="chips" role="tablist" aria-label="Filter results">${TYPES.map(t => `<a class="chip ${t.id === type ? 'active' : ''}" role="tab" aria-selected="${t.id === type}" href="${link({ type: t.id })}">${t.name}</a>`).join('')}</div>
    <p class="small muted" style="margin-top:12px">Results come from the ONS website search. <strong>Data series</strong> open as charts and <strong>bulletins and articles</strong> open as readable reports here; anything else opens on ons.gov.uk.</p>
    <div id="results">${q ? loading('Searching the ONS…') : '<p class="muted">Type a topic above to search, for example “unemployment”, “CPIH” or “net migration”.</p>'}</div>`;
  if (!q) return;

  const limit = 12;
  const qp = new URLSearchParams({ q, limit, offset: (page - 1) * limit });
  if (type) qp.set('content_type', type);
  const out = document.getElementById('results');
  try {
    const d = await api(`/api/ons/search?${qp}`);
    if (!d.items.length) { out.innerHTML = `<p>No results for “${esc(q)}”. Try a simpler word, or a different filter.</p>`; return; }
    const pages = Math.ceil(d.count / limit);
    out.innerHTML = `<p class="small muted">${nf(d.count)} results</p>` + d.items.map(it => {
      const isSeries = it.type === 'timeseries';
      const inApp = isSeries || READABLE.has(it.type);
      const href = isSeries ? `#/series?uri=${encodeURIComponent(it.uri)}` : inApp ? `#/read?uri=${encodeURIComponent(it.uri)}` : ONS_SITE + it.uri;
      const title = it.highlight?.title || esc(it.title);
      const summary = it.highlight?.summary || esc(it.summary || it.meta_description || '');
      return `<a class="result" href="${esc(href)}" ${inApp ? '' : 'target="_blank" rel="noopener"'}>
        <span class="badge ${inApp ? 'data' : ''}">${esc(TYPE_LABEL[it.type] || it.type)}</span>
        <h3>${safeHighlight(title)}${inApp ? '' : ' ↗'}</h3>
        ${summary ? `<p>${safeHighlight(summary)}</p>` : ''}
        <div class="meta">${it.release_date ? 'Released ' + date(it.release_date) : ''}${it.cdid ? ` · Series ID ${esc(it.cdid)}${it.dataset_id ? ' / ' + esc(it.dataset_id) : ''}` : ''}</div>
      </a>`;
    }).join('') + `<div class="pager">
      ${page > 1 ? `<a class="btn ghost" href="${link({ type, page: page - 1 })}">← Previous</a>` : ''}
      <span class="small muted">Page ${page} of ${nf(pages)}</span>
      ${page < pages ? `<a class="btn ghost" href="${link({ type, page: page + 1 })}">Next →</a>` : ''}</div>`;
  } catch (e) { out.innerHTML = errorBox(e); }
}
// ONS highlights use <em class="ons-highlight">; strip any other markup.
function safeHighlight(html) {
  const keep = String(html).replace(/<em class="ons-highlight">/g, '\u0001').replace(/<\/em>/g, '\u0002');
  const tmp = document.createElement('div'); tmp.innerHTML = keep;
  return esc(tmp.textContent).replace(/\u0001/g, '<em class="ons-highlight">').replace(/\u0002/g, '</em>');
}

// ---------------------------------------------------------------- SERIES
async function series(params) {
  const uri = params.get('uri') || '';
  if (!/^\/[a-z0-9/]+$/i.test(uri)) { view.innerHTML = errorBox('That link is not a valid ONS series.'); return; }
  view.innerHTML = loading();
  const d = await api(`/api/ons/site${uri}/data`);
  const desc = d.description;
  setTitle(desc.title);
  const freqs = ['months', 'quarters', 'years'].filter(f => (d[f] || []).length);
  let freq = freqs[0], range = '10';
  const onsUrl = ONS_SITE + uri;
  const csvUrl = `${ONS_SITE}/generator?format=csv&uri=${encodeURIComponent(uri)}`;
  const sa = /\bNSA\b|not seasonally adjusted/i.test(desc.title) ? 'Not seasonally adjusted' : /\bSA\b|seasonally adjusted/i.test(desc.title) ? 'Seasonally adjusted' : null;

  view.innerHTML = `
    <div class="crumbs"><a href="#/search">Search</a> › Data series ${esc(desc.cdid)}</div>
    <h1 style="font-size:clamp(1.5rem,3vw,2.1rem)">${esc(desc.title)}</h1>
    <div class="grid" style="margin:18px 0">
      <div class="card stat"><div class="label">Latest figure</div><div class="value" id="latestVal"></div><div class="meta" id="latestDate"></div></div>
      <div class="card stat"><div class="label">Change on previous period</div><div class="value" id="chgPrev"></div><div class="meta" id="chgPrevNote"></div></div>
      <div class="card stat"><div class="label">Change on a year earlier</div><div class="value" id="chgYear"></div><div class="meta" id="chgYearNote"></div></div>
    </div>
    <div class="card chart-card">
      <div class="chart-head">
        <h3 style="margin:0">${esc(desc.title.split(':')[0])}</h3>
        <div class="controls">
          ${freqs.length > 1 ? `<div class="seg" id="freqSeg">${freqs.map(f => `<button type="button" data-v="${f}" aria-pressed="${f === freq}">${FREQ_NAME[f]}</button>`).join('')}</div>` : ''}
          <div class="seg" id="rangeSeg">${[['5', '5 yrs'], ['10', '10 yrs'], ['25', '25 yrs'], ['all', 'All']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === range}">${l}</button>`).join('')}</div>
        </div>
      </div>
      <div class="chart" id="chart"></div>
      <details class="table-toggle"><summary>Show the numbers as a table</summary><div class="table-wrap" style="margin-top:8px" id="tbl"></div></details>
      ${sourceLine({ name: `ONS, series ${desc.cdid} in dataset ${desc.datasetId}`, url: onsUrl, released: date(desc.releaseDate), extra: desc.nextRelease ? `Next update ${esc(desc.nextRelease)}` : '' })}
    </div>
    <div class="grid two section" style="margin-top:16px">
      <div class="card"><h3>About this figure</h3>
        <dl class="kv">
          <dt>Unit</dt><dd>${esc([desc.preUnit, desc.unit].filter(Boolean).join(' ') || '—')}</dd>
          ${sa ? `<dt>Adjustment</dt><dd>${sa}</dd>` : ''}
          ${desc.monthLabelStyle && freq === 'months' ? `<dt>Monthly figures</dt><dd>${esc(desc.monthLabelStyle)} — each point covers 3 months</dd>` : ''}
          ${desc.keyNote ? `<dt>Note</dt><dd>${esc(desc.keyNote)}</dd>` : ''}
          <dt>Produced by</dt><dd>${esc(desc.contact?.name || 'ONS')}</dd>
        </dl>
      </div>
      <div class="card"><h3>Check it yourself</h3>
        <p class="small">Open the original page on the ONS website or download the full figures.</p>
        <div class="controls">${(d.relatedDocuments || []).filter(r => /\/(bulletins|articles)\//.test(r.uri)).slice(0, 1).map(r => `<a class="btn primary" href="#/read?uri=${encodeURIComponent(r.uri)}">Read the bulletin</a>`).join('')}<a class="btn" href="${esc(onsUrl)}" target="_blank" rel="noopener">View on ONS ↗</a><a class="btn ghost" href="${esc(csvUrl)}" target="_blank" rel="noopener">Download CSV</a><button class="btn ghost" type="button" id="copyCite">Copy citation</button></div>
      </div>
    </div>`;

  document.getElementById('copyCite').onclick = async e => {
    const text = `${desc.title}. Office for National Statistics, series ${desc.cdid} (${desc.datasetId}), released ${date(desc.releaseDate)}. ${onsUrl}`;
    try { await navigator.clipboard.writeText(text); e.target.textContent = 'Copied ✓'; } catch { prompt('Copy this citation:', text); }
  };

  const draw = () => {
    const pts = seriesPoints(d, freq);
    const per = freq === 'months' ? 12 : freq === 'quarters' ? 4 : 1;
    const shown = range === 'all' ? pts : pts.slice(-Number(range) * per);
    const valid = pts.filter(p => p.value != null);
    const dec = decimalsOf(valid.slice(-60));
    const fmt = unitFormatter(desc, dec);
    const last = valid[valid.length - 1], prev = valid[valid.length - 2], yr = valid[valid.length - 1 - per];
    const pp = desc.unit === '%' ? ' pts' : '';
    const chg = (a, b) => b == null ? '–' : `${a.value - b.value > 0 ? '+' : a.value - b.value < 0 ? '−' : ''}${nf(Math.abs(a.value - b.value), dec)}${pp}`;
    document.getElementById('latestVal').textContent = fmt(last.value);
    document.getElementById('latestDate').textContent = last.label;
    document.getElementById('chgPrev').textContent = chg(last, prev);
    document.getElementById('chgPrevNote').textContent = prev ? `from ${fmt(prev.value)} (${prev.label})` : '';
    document.getElementById('chgYear').textContent = freq === 'years' ? chg(last, prev) : chg(last, yr);
    document.getElementById('chgYearNote').textContent = (freq === 'years' ? prev : yr) ? `from ${fmt((freq === 'years' ? prev : yr).value)} (${(freq === 'years' ? prev : yr).label})` : '';
    if (desc.unit === '%') ['chgPrevNote', 'chgYearNote'].forEach(id => { document.getElementById(id).textContent += ' · percentage points'; });
    Charts.line(document.getElementById('chart'), {
      labels: shown.map(p => p.label), format: fmt, ariaLabel: desc.title,
      series: [{ name: desc.cdid, color: 'var(--series-1)', values: shown.map(p => p.value) }],
    });
    document.getElementById('tbl').innerHTML = `<table class="data"><thead><tr><th>Period</th><th>Value</th></tr></thead><tbody>${shown.slice().reverse().map(p => `<tr><td>${esc(p.label)}</td><td>${p.value == null ? '–' : fmt(p.value)}</td></tr>`).join('')}</tbody></table>`;
  };
  const wire = (id, set) => {
    const seg = document.getElementById(id);
    if (!seg) return;
    seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      set(b.dataset.v);
      seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      draw();
    });
  };
  wire('freqSeg', v => { freq = v; });
  wire('rangeSeg', v => { range = v; });
  draw();
  onRedraw(draw);
}

// ---------------------------------------------------------------- AREAS (picker)
async function areas() {
  setTitle('Your area');
  const las = await localAuthorities();
  const byRegion = {};
  las.forEach(a => (byRegion[a.region] ||= []).push(a));
  view.innerHTML = `
    <div class="page-head"><span class="kicker">Your area</span><h1>Benefits, jobs and tax in your area</h1>
    <p class="lead">Choose a council area to see the latest official figures for it, compared with its region and the whole UK.</p></div>
    <div class="picker" id="picker">
      <div class="searchbar"><input id="areaInput" type="search" placeholder="Start typing a council area, e.g. Leeds, Cardiff, Fife…" role="combobox" aria-expanded="false" aria-controls="areaList" aria-autocomplete="list" autocomplete="off"></div>
      <ul id="areaList" role="listbox" hidden></ul>
    </div>
    <section class="section"><h2>Browse by region</h2>
      <div class="grid">${Object.keys(byRegion).sort().map(r => `<details class="card"><summary><strong>${esc(r)}</strong> <span class="muted small">(${byRegion[r].length} areas)</span></summary>
        <ul style="padding-left:18px;margin:10px 0 0">${byRegion[r].map(a => `<li><a href="#/area/${a.code}">${esc(a.name)}</a></li>`).join('')}</ul></details>`).join('')}</div>
    </section>`;
  areaPicker(las);
}
function areaPicker(las) {
  const input = document.getElementById('areaInput'), list = document.getElementById('areaList');
  let matches = [], active = -1;
  const render = () => {
    list.hidden = !matches.length;
    input.setAttribute('aria-expanded', !list.hidden);
    list.innerHTML = matches.map((a, i) => `<li role="option" id="opt${i}" aria-selected="${i === active}" data-code="${a.code}">${esc(a.name)} <span>${esc(a.region)}</span></li>`).join('');
  };
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    matches = q ? las.filter(a => a.name.toLowerCase().includes(q)).sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q)).slice(0, 12) : [];
    active = matches.length ? 0 : -1; render();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { active = Math.min(matches.length - 1, active + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter' && matches[active]) { location.hash = '#/area/' + matches[active].code; }
    else if (e.key === 'Escape') { matches = []; render(); }
  });
  list.addEventListener('click', e => { const li = e.target.closest('li'); if (li) location.hash = '#/area/' + li.dataset.code; });
  input.focus();
}

// ---------------------------------------------------------------- AREA profile
async function area(params, [code]) {
  const las = await localAuthorities();
  const la = las.find(a => a.code === code);
  if (!la) { view.innerHTML = errorBox('Area not found.'); return; }
  setTitle(la.name);
  const fin = await finances();
  const reg = fin.areas[la.region];
  const regionCode = reg.code;
  const regionLabel = la.region;

  view.innerHTML = `
    <div class="crumbs"><a href="#/areas">Areas</a> › ${esc(la.region)} › ${esc(la.name)}</div>
    <h1>${esc(la.name)}</h1>
    <p class="muted">Council area ${esc(la.code)} · ${esc(la.region)}</p>
    <div class="grid" id="tiles" style="margin-top:16px"></div>

    <section class="section">
      <div class="section-head"><h2>People claiming unemployment-related benefits</h2></div>
      <div class="card chart-card">
        <div class="chart-head"><h3 style="margin:0">Claimant rate: % of residents aged 16–64</h3><span class="small muted">Last 5 years, monthly</span></div>
        <div class="chart" id="ccChart">${loading()}</div>
        <div class="callout" style="margin-bottom:0"><p class="small"><strong>What this counts:</strong> the Claimant Count is people claiming Jobseeker's Allowance plus Universal Credit claimants who are required to look for work. It is <em>not</em> everyone on benefits — many Universal Credit claimants are in work, and pensions or disability benefits are not included. Local figures are not seasonally adjusted.</p></div>
        ${sourceLine({ name: 'ONS Claimant Count (DWP administrative data) via Nomis', url: 'https://www.nomisweb.co.uk/datasets/ucjsa', extra: 'Dataset NM_162_1' })}
      </div>
    </section>

    <section class="section" id="ucSection" hidden>
      <div class="section-head"><h2>People on Universal Credit</h2></div>
      <div class="card chart-card"><div class="chart-head"><h3 style="margin:0">People on Universal Credit</h3><span class="small muted">Every 3 months, last 2 years</span></div><div class="chart" id="ucChart">${loading()}</div><div id="ucSource"></div></div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Tax raised and public spending — ${esc(regionLabel)}</h2></div>
      <div class="callout warn"><p class="small">The ONS does not publish total tax receipts for individual council areas. These figures are for the whole of <strong>${esc(regionLabel)}</strong>, which ${esc(la.name)} is part of. <a href="#/regions">Compare all regions →</a></p></div>
      <div id="regionFin"></div>
    </section>`;

  const tiles = document.getElementById('tiles');
  const tileHtml = [];
  const pushTile = html => { tileHtml.push(html); tiles.innerHTML = tileHtml.join(''); };
  tiles.innerHTML = `<div class="card stat">${loading()}</div>`;

  // --- claimant count
  (async () => {
    try {
      const rows = await nomis('NM_162_1', {
        geography: [code, regionCode, 'K02000001'].filter((v, i, a) => a.indexOf(v) === i).join(','),
        gender: 0, age: 0, measure: '1,2', measures: 20100, time: 'latestMINUS59-latest',
        select: 'date_name,geography_code,measure,obs_value',
      });
      const months = [...new Set(rows.map(r => r.date_name))];
      const get = (g, m) => months.map(mo => { const r = rows.find(x => x.geography_code === g && x.measure === String(m) && x.date_name === mo); return r && r.obs_value !== '' ? Number(r.obs_value) : null; });
      const laRate = get(code, 2), laCount = get(code, 1), ukRate = get('K02000001', 2), regRate = get(regionCode, 2);
      const last = months.length - 1;
      const yearAgo = laCount[last - 12];
      pushTile(`<div class="card stat"><div class="label">People claiming (Claimant Count)</div>
        <div class="value">${nf(laCount[last])}</div><div class="meta">${esc(months[last])}</div>
        ${yearAgo != null ? `<div class="change">${laCount[last] >= yearAgo ? '▲ up' : '▼ down'} ${nf(Math.abs(laCount[last] - yearAgo))} on a year earlier</div>` : ''}
        ${sourceLine({ name: 'ONS / DWP via Nomis', url: 'https://www.nomisweb.co.uk/datasets/ucjsa' })}</div>`);
      pushTile(`<div class="card stat"><div class="label">Claimant rate (% of 16–64 year olds)</div>
        <div class="value">${nf(laRate[last], 1)}<small>%</small></div><div class="meta">${esc(months[last])}</div>
        <div class="change">${esc(regionLabel)}: ${nf(regRate[last], 1)}% · UK: ${nf(ukRate[last], 1)}%</div>
        ${sourceLine({ name: 'ONS / DWP via Nomis', url: 'https://www.nomisweb.co.uk/datasets/ucjsa' })}</div>`);
      const drawCC = () => Charts.line(document.getElementById('ccChart'), {
        labels: months, format: v => nf(v, 1) + '%', ariaLabel: 'Claimant rate over time',
        series: [
          { name: la.name, color: 'var(--series-1)', values: laRate },
          ...(regionCode !== 'K02000001' ? [{ name: regionLabel, color: 'var(--series-3)', values: regRate }] : []),
          { name: 'United Kingdom', color: 'var(--series-2)', values: ukRate },
        ],
      });
      drawCC(); onRedraw(drawCC);
    } catch (e) { document.getElementById('ccChart').innerHTML = errorBox(e); }

    // population & pay (after claimant count so tiles keep a stable order)
    try {
      const [popRows, payRows] = await Promise.all([
        nomis('NM_2002_1', { geography: code, gender: 0, c_age: 200, measures: 20100, time: 'latest', select: 'date_name,obs_value' }),
        nomis('NM_30_1', { geography: `${code},K02000001`, sex: 8, item: 2, pay: 1, measures: 20100, time: 'latest', select: 'date_name,geography_code,obs_value' }),
      ]);
      if (popRows[0]) pushTile(`<div class="card stat"><div class="label">Population</div><div class="value">${nf(Number(popRows[0].obs_value))}</div><div class="meta">Mid-${esc(popRows[0].date_name)} estimate</div>${sourceLine({ name: 'ONS mid-year estimates', url: 'https://www.nomisweb.co.uk/datasets/pestsyoala' })}</div>`);
      const pLa = payRows.find(r => r.geography_code === code), pUk = payRows.find(r => r.geography_code === 'K02000001');
      if (pLa && pLa.obs_value) pushTile(`<div class="card stat"><div class="label">Typical full-time pay (median, weekly, before tax)</div><div class="value">£${nf(Number(pLa.obs_value))}</div><div class="meta">${esc(pLa.date_name)}, residents of the area</div><div class="change">UK: £${nf(Number(pUk?.obs_value))}</div>${sourceLine({ name: 'ONS Annual Survey of Hours and Earnings', url: 'https://www.nomisweb.co.uk/datasets/asher' })}</div>`);
    } catch { /* tiles are optional */ }
  })();

  // --- DWP Universal Credit (only when the server has a Stat-Xplore key)
  (async () => {
    try {
      const st = await fetch('/api/dwp/status').then(r => r.ok ? r.json() : { configured: false });
      if (!st.configured || code.startsWith('N')) return; // DWP Universal Credit data covers Great Britain only
      document.getElementById('ucSection').hidden = false;
      document.getElementById('ucChart').innerHTML = loading('Loading from DWP Stat-Xplore — the first visit to an area can take up to 30 seconds…');
      const uc = await api(`/api/dwp/uc?area=${code}`);
      const vals = uc.series.map(s => s.value);
      const drawUC = () => Charts.line(document.getElementById('ucChart'), {
        labels: uc.series.map(s => s.label), format: v => nf(v), ariaLabel: 'People on Universal Credit',
        series: [{ name: uc.measure, color: 'var(--series-1)', values: vals }],
      });
      drawUC(); onRedraw(drawUC);
      document.getElementById('ucSource').innerHTML = `<div class="callout" style="margin-bottom:0"><p class="small"><strong>${nf(vals[vals.length - 1])}</strong> people on Universal Credit in ${esc(uc.series[uc.series.length - 1].label)}. This includes people in work on low pay, carers and people who are too ill to work — not only people who are unemployed.</p></div>${sourceLine({ name: uc.source, url: uc.sourceUrl })}`;
      pushTile(`<div class="card stat"><div class="label">People on Universal Credit</div><div class="value">${nf(vals[vals.length - 1])}</div><div class="meta">${esc(uc.series[uc.series.length - 1].label)}</div>${sourceLine({ name: 'DWP Stat-Xplore', url: uc.sourceUrl })}</div>`);
    } catch (e) {
      const c = document.getElementById('ucChart'); if (c) c.innerHTML = errorBox(e);
    }
  })();

  renderRegionFinance(document.getElementById('regionFin'), fin, la.region);
}

// Region revenue / spending panel, shared by area pages.
function regionLatest(fin, name) {
  const a = fin.areas[name];
  const i = fin.years.length - 1;
  const spend = a.currentExpenditure[i] + a.capitalExpenditure[i];
  const pop = a.population[i];
  return {
    year: fin.years[i], revenue: a.revenueTotal[i], spend, balance: a.netFiscalBalanceExclNorthSea[i], pop,
    revPH: pop ? a.revenueTotal[i] * 1e6 / pop : null,
    spendPH: pop ? spend * 1e6 / pop : null,
  };
}
function finSources(fin) {
  const s = fin.sources;
  return sourceLine({ name: `ONS ${s.revenue.title} (${s.revenue.edition})`, url: s.revenue.page, released: date(s.revenue.released), extra: `<a href="${esc(s.netFiscalBalance.page)}" target="_blank" rel="noopener">Net fiscal balance tables</a> · per-person figures use <a href="${esc(s.population.page)}" target="_blank" rel="noopener">ONS population estimates</a>` });
}
function renderRegionFinance(box, fin, name) {
  const a = fin.areas[name], L = regionLatest(fin, name), UK = regionLatest(fin, 'United Kingdom');
  const i = fin.years.length - 1;
  const shareOfUk = L.revenue / UK.revenue * 100;
  box.innerHTML = `
    <div class="grid">
      <div class="card stat"><div class="label">Tax &amp; other public revenue raised</div><div class="value">${money(L.revenue)}</div><div class="meta">${esc(L.year)} (April–March) · ${nf(shareOfUk, 1)}% of UK total</div></div>
      <div class="card stat"><div class="label">Revenue raised per person</div><div class="value">${pounds(L.revPH)}</div><div class="meta">UK average: ${pounds(UK.revPH)}</div></div>
      <div class="card stat"><div class="label">Public spending per person</div><div class="value">${pounds(L.spendPH)}</div><div class="meta">UK average: ${pounds(UK.spendPH)}</div></div>
      <div class="card stat"><div class="label">Spending minus revenue (net fiscal balance)</div><div class="value">${money(L.balance)}</div><div class="meta">${L.balance > 0 ? 'More spent than raised' : 'More raised than spent'} · UK overall: ${money(UK.balance)}</div></div>
    </div>
    <div class="grid two" style="margin-top:16px">
      <div class="card chart-card"><h3>Where the money raised comes from, ${esc(L.year)}</h3><div class="chart" id="revBreak"></div>${finSources(fin)}</div>
      <div class="card chart-card"><h3>Revenue raised vs public spending over time</h3><p class="small muted" style="margin:0">£ billion, not adjusted for inflation</p><div class="chart" id="revTrend"></div>${finSources(fin)}</div>
    </div>
    <div class="callout"><p class="small"><strong>Reading this fairly:</strong> the UK as a whole spent ${money(UK.balance)} more than it raised in ${esc(L.year)}, so most areas show more spending than revenue. Regional tax figures are ONS <em>estimates</em> — some taxes (like Corporation Tax) are shared out between regions using models. North Sea oil and gas revenue is excluded here.</p></div>`;
  const draw = () => {
    const br = Object.entries(a.revenueBreakdown).map(([k, v]) => ({ label: k, value: v[i] })).sort((x, y) => (k => k === 'All other receipts')(x.label) - (k => k === 'All other receipts')(y.label) || y.value - x.value);
    Charts.bars(document.getElementById('revBreak'), { rows: br, format: money, valueName: L.year });
    const from = Math.max(0, fin.years.length - 20);
    Charts.line(document.getElementById('revTrend'), {
      labels: fin.years.slice(from), format: v => `£${nf(v / 1000, 1)}bn`, axisFormat: v => `£${nf(v / 1000)}bn`,
      shortLabel: y => y.slice(0, 4) + '/' + y.slice(-2),
      series: [
        { name: 'Revenue raised', color: 'var(--series-1)', values: a.revenueTotal.slice(from) },
        { name: 'Public spending (current + capital)', color: 'var(--series-2)', values: a.currentExpenditure.slice(from).map((c, k) => c == null ? null : c + a.capitalExpenditure[from + k]) },
      ],
    });
  };
  draw(); onRedraw(draw);
}

// ---------------------------------------------------------------- REGIONS
async function regions() {
  setTitle('Tax & spending by region');
  const fin = await finances();
  const names = Object.keys(fin.areas).filter(n => !['United Kingdom', 'England'].includes(n));
  const UK = regionLatest(fin, 'United Kingdom');
  const data = names.map(n => ({ name: n, ...regionLatest(fin, n) }));
  let sortKey = 'revPH', sortDir = -1, metric = 'revPH';

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Tax &amp; spending</span><h1>Tax raised and money spent, by region</h1>
    <p class="lead">How much public revenue each English region and UK nation generates, and how much is spent there — per person, so big and small areas can be compared fairly. Financial year ${esc(UK.year)}.</p></div>
    <div class="grid">
      <div class="card stat"><div class="label">UK total revenue raised</div><div class="value">${money(UK.revenue)}</div><div class="meta">${pounds(UK.revPH)} per person</div></div>
      <div class="card stat"><div class="label">UK total public spending</div><div class="value">${money(UK.spend)}</div><div class="meta">${pounds(UK.spendPH)} per person</div></div>
      <div class="card stat"><div class="label">Gap (spending minus revenue)</div><div class="value">${money(UK.balance)}</div><div class="meta">Covered by government borrowing</div></div>
    </div>
    <div class="card chart-card section">
      <div class="chart-head"><h3 style="margin:0" id="barTitle"></h3>
        <div class="seg" id="metricSeg">
          <button type="button" data-v="revPH" aria-pressed="true">Revenue per person</button>
          <button type="button" data-v="spendPH" aria-pressed="false">Spending per person</button>
          <button type="button" data-v="revenue" aria-pressed="false">Total revenue</button>
        </div></div>
      <div class="chart" id="regionBars"></div>
      <p class="small muted" style="margin:6px 0 0">Orange bar = UK average.</p>
      ${finSources(fin)}
    </div>
    <div class="card section">
      <h3>All regions and nations, ${esc(UK.year)}</h3>
      <div class="table-wrap"><table class="data" id="regionTable"></table></div>
      ${finSources(fin)}
    </div>
    <div class="card section">
      <div class="chart-head"><h3 style="margin:0">Claimant rate by region</h3><span class="small muted">% of residents aged 16–64, latest month</span></div>
      <div class="chart" id="ccRegions">${loading()}</div>
      ${sourceLine({ name: 'ONS Claimant Count (DWP data) via Nomis', url: 'https://www.nomisweb.co.uk/datasets/ucjsa' })}
    </div>
    <div class="callout"><p class="small"><strong>Why do some regions get more than they raise?</strong> Revenue depends heavily on how many high earners and big businesses are in an area; spending depends on things like the number of pensioners, health needs and the cost of services. Both are ONS estimates, and the whole UK spent more than it raised. Comparing per person removes the effect of population size.</p></div>`;

  const titles = { revPH: 'Revenue raised per person', spendPH: 'Public spending per person', revenue: 'Total revenue raised' };
  const drawBars = () => {
    document.getElementById('barTitle').textContent = `${titles[metric]}, ${UK.year}`;
    const rows = data.map(d => ({ label: d.name, value: d[metric] })).sort((a, b) => b.value - a.value);
    if (metric !== 'revenue') rows.push({ label: 'UK average', value: UK[metric], highlight: true });
    rows.sort((a, b) => b.value - a.value);
    Charts.bars(document.getElementById('regionBars'), { rows, format: metric === 'revenue' ? money : pounds, valueName: titles[metric] });
  };
  const cols = [
    ['name', 'Area', r => esc(r.name)], ['revenue', 'Revenue', r => money(r.revenue)], ['revPH', 'Revenue / person', r => pounds(r.revPH)],
    ['spend', 'Spending', r => money(r.spend)], ['spendPH', 'Spending / person', r => pounds(r.spendPH)],
    ['balance', 'Spending − revenue', r => money(r.balance)], ['pop', 'Population', r => nf(r.pop)],
  ];
  const drawTable = () => {
    const rows = [...data].sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : -1) * sortDir);
    document.getElementById('regionTable').innerHTML = `<thead><tr>${cols.map(([k, l]) => `<th aria-sort="${k === sortKey ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'}"><button data-k="${k}">${l}${k === sortKey ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${cols.map(([, , f]) => `<td>${f(r)}</td>`).join('')}</tr>`).join('')}
      <tr class="hl">${cols.map(([k, , f]) => `<td>${k === 'name' ? 'United Kingdom' : f(UK)}</td>`).join('')}</tr></tbody>`;
  };
  document.getElementById('regionTable').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (sortKey === b.dataset.k) sortDir *= -1; else { sortKey = b.dataset.k; sortDir = b.dataset.k === 'name' ? 1 : -1; }
    drawTable();
  });
  document.getElementById('metricSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    metric = b.dataset.v;
    e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    drawBars();
  });
  drawBars(); drawTable();

  let ccRows = null;
  const drawCC = () => {
    if (!ccRows) return;
    const rows = ccRows.map(r => ({ label: r.geography_name === 'East' ? 'East of England' : r.geography_name, value: Number(r.obs_value), highlight: r.geography_code === 'K02000001' }))
      .map(r => r.highlight ? { ...r, label: 'United Kingdom' } : r).sort((a, b) => b.value - a.value);
    Charts.bars(document.getElementById('ccRegions'), { rows, format: v => nf(v, 1) + '%', valueName: `Claimant rate, ${ccRows[0].date_name}` });
  };
  try {
    ccRows = await nomis('NM_162_1', { geography: 'TYPE480,2092957697', gender: 0, age: 0, measure: 2, measures: 20100, time: 'latest', select: 'date_name,geography_name,geography_code,obs_value' });
    drawCC();
  } catch (e) { document.getElementById('ccRegions').innerHTML = errorBox(e); }
  onRedraw(() => { drawBars(); drawCC(); });
}

// ---------------------------------------------------------------- GUIDE
function guide() {
  setTitle('Spotting misleading statistics');
  const tips = [
    ['Where does the number come from?', 'Official figures always have a named source and a date. If a post just says "studies show" or gives no link, treat it with caution. Every figure on this site links back to its source.'],
    ['Is it a count or a rate?', 'A big area will almost always have more claimants, more crime and more tax than a small one. Compare rates or "per person" figures to see if an area is really different.'],
    ['What period does it cover?', 'Check the date. Old figures get reshared as if they were new. Tax figures here use financial years (April to March); labour market figures often cover 3-month periods.'],
    ['Is the comparison fair?', 'Comparing a single bad month to a single good month can make any trend look dramatic. Look at the longer chart — this site shows several years by default.'],
    ['Does the chart start at zero?', 'Cutting off the bottom of a chart makes small changes look huge. Our charts start at zero for positive values so changes are shown honestly.'],
    ['What exactly is being counted?', '"People on benefits" can mean very different things. The Claimant Count only covers people claiming because they are out of work and looking. Universal Credit also includes people in work, carers and people too ill to work. State Pension is the largest benefit of all.'],
    ['Has it been adjusted?', 'Seasonally adjusted figures remove regular patterns like Christmas hiring. Money figures over many years may not be adjusted for inflation — £1 in 2005 bought more than £1 today.'],
    ['Is it an estimate?', 'Many official statistics come from surveys and have a margin of error. Small changes — like 0.1 percentage points — may not be meaningful. Figures are also sometimes revised later.'],
  ];
  view.innerHTML = `
    <div class="page-head"><span class="kicker">Fact-check guide</span><h1>How to spot misleading statistics</h1>
    <p class="lead">Numbers are often shared without context — sometimes by mistake, sometimes on purpose. Before you believe or share a statistic, ask these questions.</p></div>
    <div class="grid two tips" style="margin-top:20px">${tips.map(([t, b]) => `<div class="card tip"><h3>${esc(t)}</h3><p class="small" style="margin:0">${esc(b)}</p></div>`).join('')}</div>
    <section class="section"><h2>Check a claim now</h2>${searchForm()}
    <p class="small muted">Or look up <a href="#/areas">your local area</a>, or <a href="#/regions">tax and spending by region</a>. You can also use the independent fact-checker <a href="https://fullfact.org" target="_blank" rel="noopener">Full Fact</a>, or the <a href="https://osr.statisticsauthority.gov.uk" target="_blank" rel="noopener">Office for Statistics Regulation</a>, which challenges misuse of official statistics.</p></section>`;
}

// ---------------------------------------------------------------- theme
(() => {
  const root = document.documentElement;
  try { const t = localStorage.getItem('theme'); if (t) root.dataset.theme = t; } catch { }
  document.getElementById('themeToggle').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch { }
    document.dispatchEvent(new Event('redraw'));
  });
})();

router();
