// Fact-check tools: the claim checker, "What's new" (ONS releases), misleading-chart examples for
// the guide, and share cards (an image of a figure with its date and source).

// Topics the claim checker recognises: words to look for, the page that answers it and, where
// there is one, an ONS series whose latest value is shown alongside.
const CLAIM_TOPICS = [
  { keys: ['inflation', 'prices', 'cost of living', 'cpi', 'price rise'], name: 'Inflation', page: '#/my-inflation', series: '/economy/inflationandpriceindices/timeseries/d7g7/mm23', unit: '%', what: 'CPI inflation: how much prices rose in a year' },
  { keys: ['unemploy', 'jobless', 'out of work'], name: 'Unemployment', page: '#/search?q=unemployment', series: '/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms', unit: '%', what: 'Unemployment rate, people aged 16 and over' },
  { keys: ['wage', 'pay', 'salar', 'earning', 'worse off', 'better off'], name: 'Pay vs prices', page: '#/wages', series: '/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/a3ww/emp', unit: '%', what: 'Real pay growth (after inflation)' },
  { keys: ['gdp', 'growth', 'recession', 'economy'], name: 'Economic growth', page: '#/search?q=gdp', series: '/economy/grossdomesticproductgdp/timeseries/ihyq/ukea', unit: '%', freq: 'quarters', what: 'GDP growth on the previous quarter' },
  { keys: ['debt', 'national debt'], name: 'Government debt', page: '#/debt', series: '/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/hf6x/pusf', unit: '% of GDP', what: 'Public sector net debt as a share of GDP' },
  { keys: ['borrow', 'deficit'], name: 'Government borrowing', page: '#/debt', what: 'Borrowing adds to the national debt — see debt by government' },
  { keys: ['migra', 'immigra', 'foreigners', 'migrants'], name: 'Migration', page: '#/read?uri=' + encodeURIComponent('/peoplepopulationandcommunity/populationandmigration/internationalmigration/bulletins/longterminternationalmigrationprovisional/latest'), what: 'ONS long-term international migration (net migration)' },
  { keys: ['small boat', 'channel', 'crossing', 'asylum', 'hotel', 'illegal'], name: 'Small boats and asylum', page: '#/border', what: 'Home Office small boat arrivals and the asylum backlog' },
  { keys: ['nhs', 'waiting list', 'hospital', 'a&e', 'a and e', 'operation'], name: 'NHS waiting times', page: '#/nhs', what: 'NHS England waiting list and A&E' },
  { keys: ['crime', 'knife', 'burglar', 'shoplift', 'violence', 'police'], name: 'Crime in your area', page: '#/map?layer=crime', what: 'Police recorded crime by council area' },
  { keys: ['house price', 'housing', 'rent', 'mortgage', 'afford'], name: 'Housing costs', page: '#/mortgages', what: 'Mortgage rates, rent and house prices' },
  { keys: ['benefit', 'universal credit', 'pip', 'welfare', 'claimant', 'scroung'], name: 'Benefits', page: '#/map', what: 'DWP benefits by area (Universal Credit, PIP and more)' },
  { keys: ['tax', 'vat', 'income tax', 'national insurance', 'tax burden'], name: 'Taxes', page: '#/revenue', what: 'Where government money comes from' },
  { keys: ['spend', 'foreign aid', 'overseas aid', 'defence', 'welfare bill'], name: 'Government spending', page: '#/spending', what: 'How the government spends money' },
  { keys: ['energy', 'gas', 'electricity', 'price cap', 'water bill'], name: 'Household bills', page: '#/bills', what: 'Energy price cap and water bills' },
  { keys: ['food', 'grocer', 'supermarket', 'bread', 'milk', 'eggs'], name: 'Food prices', page: '#/food', what: 'Grocery prices and food inflation' },
  { keys: ['petrol', 'diesel', 'fuel'], name: 'Fuel prices', page: '#/fuel', what: 'Weekly pump prices' },
  { keys: ['council tax'], name: 'Council tax', page: '#/council-tax', what: 'Band D council tax by council' },
  { keys: ['school', 'class size', 'free school meal', 'pupil'], name: 'Schools', page: '#/schools', what: 'Class sizes and free school meals' },
  { keys: ['donat', 'donor', 'party funding'], name: 'Party donations', page: '#/donations', what: 'Electoral Commission donations register' },
  { keys: ['mp ', 'mps', 'expenses', 'second job'], name: 'MPs', page: '#/map?layer=mps', what: 'MPs’ expenses, donations and votes' },
  { keys: ['pledge', 'promise', 'manifesto', 'target'], name: 'Pledge tracker', page: '#/pledges', what: 'Government pledges vs official figures' },
];
// Wording that often signals a misleading claim, with what to check.
const CLAIM_FLAGS = [
  [/record|highest ever|lowest ever|all[- ]time/i, 'Says “record”', 'Records in pounds are common because prices rise over time. Check whether it’s also a record after inflation or as a share of the economy — and over what period.'],
  [/doubl|tripl|soar|skyrocket|explod|surg|plummet|collaps/i, 'Dramatic wording', 'Find the actual numbers before and after. A doubling from 2 to 4 is very different from 2 million to 4 million.'],
  [/\d+(\.\d+)?\s*(%|per ?cent)/i, 'Uses a percentage', 'Ask: a percentage of what? And is it a percentage change, or a change in percentage points?'],
  [/every|all |none|nobody|always|never/i, 'Sweeping claim', 'Official statistics are almost never “all” or “none”. Look for the actual share.'],
  [/million|billion|£\s?\d/i, 'A big number', 'Big totals sound alarming without context. Compare per person, per year, or as a share of the total.'],
  [/since \d{4}|in the last \d+|over the past/i, 'Picks a start date', 'Changing the start year can flip a trend. Look at the longer chart.'],
  [/they |migrants|foreigners|benefit claimants/i, 'About a group of people', 'Check exactly who is counted — official definitions are often narrower or wider than everyday words.'],
];

async function checkPage(params) {
  setTitle('Check a claim');
  const q = (params.get('q') || '').trim();
  view.innerHTML = `
    <div class="page-head"><span class="kicker">Fact-check</span><h1>Check a claim</h1>
      <p class="lead">Paste something you’ve seen — a headline, a post, a quote — and we’ll find the official figures that answer it, with tips on what to check.</p></div>
    <form class="claim-form" id="claimForm" role="search">
      <textarea class="select" name="q" rows="3" placeholder="e.g. “Immigration is at a record high” or “Food prices have doubled since 2020”" aria-label="The claim to check">${esc(q)}</textarea>
      <div class="controls"><button class="btn primary" type="submit">Check this claim</button>
        <span class="small muted">Nothing you type is stored; searches go to the ONS search service.</span></div>
    </form>
    <div class="chips" style="margin-top:12px">${['Immigration is at a record high', 'Food prices have doubled', 'NHS waiting lists are falling', 'Taxes are the highest ever', 'Small boat crossings are up this year'].map(x => `<a class="chip" href="#/check?q=${encodeURIComponent(x)}">${esc(x)}</a>`).join('')}</div>
    <div id="claimOut" style="margin-top:24px"></div>`;
  document.getElementById('claimForm').addEventListener('submit', e => { e.preventDefault(); const v = e.target.q.value.trim(); if (v) location.hash = `#/check?q=${encodeURIComponent(v)}`; });
  if (!q) return;
  const out = document.getElementById('claimOut');
  const lower = ` ${q.toLowerCase()} `;
  const topics = CLAIM_TOPICS.filter(t => t.keys.some(k => lower.includes(k))).slice(0, 4);
  const flags = CLAIM_FLAGS.filter(([re]) => re.test(q));
  out.innerHTML = `
    <section class="section" style="margin-top:0">
      <div class="section-head"><div><span class="kicker">Step 1</span><h2>The official figures</h2></div></div>
      ${topics.length ? `<div class="grid two" id="topicCards">${topics.map((t, i) => `<div class="card claim-topic"><h3>${esc(t.name)}</h3><p class="small muted">${esc(t.what)}</p><div class="claim-live" id="live${i}">${t.series ? loading('Getting the latest figure…') : ''}</div><a class="btn" href="${t.page}">See the full figures →</a></div>`).join('')}</div>`
      : '<p>We couldn’t match this to one of our topics — see the related ONS data below.</p>'}
    </section>
    ${flags.length ? `<section class="section"><div class="section-head"><div><span class="kicker">Step 2</span><h2>Things to check in this wording</h2></div></div>
      <div class="grid two">${flags.map(([, t, b]) => `<div class="card tip"><h3>${esc(t)}</h3><p class="small" style="margin:0">${esc(b)}</p></div>`).join('')}</div></section>` : ''}
    <section class="section"><div class="section-head"><div><span class="kicker">${flags.length ? 'Step 3' : 'Step 2'}</span><h2>Related ONS data</h2></div></div><div id="claimSearch">${loading('Searching the ONS…')}</div></section>
    <div class="callout"><p><strong>Still unsure?</strong> Independent fact-checkers <a href="https://fullfact.org" target="_blank" rel="noopener">Full Fact</a> and <a href="https://www.bbc.co.uk/news/reality_check" target="_blank" rel="noopener">BBC Verify</a> check viral claims, and the <a href="https://osr.statisticsauthority.gov.uk" target="_blank" rel="noopener">Office for Statistics Regulation</a> challenges misuse of official statistics.</p></div>`;
  topics.forEach((t, i) => {
    if (!t.series) return;
    api(`/api/ons/site${t.series}/data`).then(d => {
      const list = (d[t.freq || 'months'] || []).filter(x => x.value !== '');
      const last = list.at(-1), yr = list[list.length - 1 - (t.freq === 'quarters' ? 4 : 12)];
      const fmt = v => (t.unit === '£bn' ? `£${nf(Number(v), 1)}bn` : `${nf(Number(v), 1)}${t.unit === '%' ? '%' : ` ${t.unit}`}`);
      const box = document.getElementById(`live${i}`);
      if (box) box.innerHTML = `<div class="claim-figure">${fmt(last.value)}</div><div class="small muted">${esc(last.date)}${yr ? ` · a year earlier: ${fmt(yr.value)}` : ''}</div>
        <div class="controls" style="margin-top:8px"><a class="btn ghost btn-sm" href="#/series?uri=${encodeURIComponent(t.series)}">Chart</a><button class="btn ghost btn-sm" type="button" data-share='${esc(JSON.stringify({ title: d.description.title, value: fmt(last.value), sub: last.date, source: `ONS, series ${d.description.cdid}`, url: ONS_SITE + t.series, values: list.slice(-36).map(x => Number(x.value)) }))}'>Share image</button></div>`;
    }).catch(() => { const box = document.getElementById(`live${i}`); if (box) box.innerHTML = ''; });
  });
  try {
    const words = q.replace(/[“”"'.,!?]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !/^(have|been|since|than|that|this|with|from|they|there|their|about|highest|lowest|record|doubled|ever)$/i.test(w)).slice(0, 6).join(' ');
    const d = await api(`/api/ons/search?${new URLSearchParams({ q: words || q, content_type: 'timeseries', limit: 6 })}`);
    document.getElementById('claimSearch').innerHTML = d.items.length ? `<div class="results">${d.items.map(it => `<a class="result" href="#/series?uri=${encodeURIComponent(it.uri)}"><div class="r-top"><span class="badge data">Data series</span><span class="small muted">${esc(it.cdid || '')}</span></div><h3>${esc(it.title)}</h3></a>`).join('')}</div>
      <p class="small"><a href="#/search?q=${encodeURIComponent(words || q)}">See all ONS results →</a></p>` : '<p class="muted">No matching ONS data series.</p>';
  } catch (e) { document.getElementById('claimSearch').innerHTML = errorBox(e); }
}

// ---------------------------------------------------------------- what's new
async function whatsNewPage() {
  setTitle('What’s new');
  view.innerHTML = `
    <div class="page-head"><span class="kicker">Fact-check</span><h1>What’s new in official statistics</h1>
      <p class="lead">The latest ONS reports with a quick summary of each, what’s coming out next, and when the figures on this site were last updated.</p></div>
    <section class="section" style="margin-top:0"><div class="section-head"><div><span class="kicker">Just out</span><h2>Published in the last two weeks</h2></div></div><div id="newOut">${loading('Fetching the latest ONS reports…')}</div></section>
    <section class="section"><div class="section-head"><div><span class="kicker">Coming up</span><h2>Next two weeks</h2></div></div><div class="card" id="upcoming">${loading()}</div></section>
    <section class="section"><div class="section-head"><div><span class="kicker">This site</span><h2>When our figures were last updated</h2></div></div><div class="card"><div class="table-wrap"><table class="data" id="fresh"></table></div>
      <p class="small muted" style="margin:10px 0 0">Pages not listed (headline figures, series charts, bulletins, debt, inflation and pay) load live from the ONS every time.</p></div></section>`;
  const today = new Date(), iso = d => d.toISOString().slice(0, 10);
  const since = new Date(today - 14 * 864e5), until = new Date(+today + 14 * 864e5);
  api(`/api/ons/search?${new URLSearchParams({ content_type: 'bulletin', limit: 12, sort: 'release_date' })}`).then(d => {
    const items = d.items.filter(it => (it.release_date || '').slice(0, 10) >= iso(since));
    document.getElementById('newOut').innerHTML = `<div class="grid three">${(items.length ? items : d.items.slice(0, 6)).map(bulletinCard).join('')}</div>`;
  }).catch(e => { document.getElementById('newOut').innerHTML = errorBox(e); });
  api(`/api/ons/search/releases?${new URLSearchParams({ limit: 40, 'release-type': 'type-upcoming', sort: 'release_date_asc', fromDate: iso(today), toDate: iso(until) })}`).then(d => {
    const rel = (d.releases || []).filter(r => !r.description.cancelled);
    const byDay = {};
    for (const r of rel) (byDay[r.description.release_date.slice(0, 10)] ||= []).push(r);
    document.getElementById('upcoming').innerHTML = Object.keys(byDay).length ? `<div class="upcoming">${Object.entries(byDay).map(([day, rs]) => `<div class="up-day"><h3>${esc(new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }))}</h3><ul>${rs.map(r => `<li><a href="${ONS_SITE}${esc(r.uri)}" target="_blank" rel="noopener">${esc(r.description.title)}</a>${r.description.provisional_date ? `<span class="small muted"> · provisional</span>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>
      ${sourceLine({ name: 'ONS release calendar', url: `${ONS_SITE}/releasecalendar` })}` : '<p class="muted">No releases scheduled.</p>';
  }).catch(e => { document.getElementById('upcoming').innerHTML = errorBox(e); });
  const files = [['Party donations', 'donations', 'built', '#/donations'], ['Food shop prices', 'food', 'builtAt', '#/food'], ['Fuel prices', 'fuel', 'builtAt', '#/fuel'], ['Mortgages & council tax', 'living', 'builtAt', '#/mortgages'], ['NHS waiting times', 'nhs', 'builtAt', '#/nhs'], ['Small boats & asylum', 'border', 'builtAt', '#/border'], ['Schools', 'schools', 'builtAt', '#/schools'], ['Ministers’ gifts & hospitality', 'ministers', 'builtAt', '#/ministers'], ['Household bills', 'bills', 'builtAt', '#/bills'], ['House prices & rents', 'housing', 'builtAt', '#/map?layer=housing'], ['MPs', 'mps', 'builtAt', '#/map?layer=mps']];
  const rows = await Promise.all(files.map(([n, f, k, link]) => getJSON(`data/${f}.json`).then(d => [n, d[k], link]).catch(() => [n, null, link])));
  document.getElementById('fresh').innerHTML = `<thead><tr><th>Page</th><th>Last updated</th></tr></thead><tbody>${rows.map(([n, d, link]) => `<tr><td><a href="${link}">${esc(n)}</a></td><td>${d ? esc(date(d)) : '–'}</td></tr>`).join('')}</tbody>`;
}

// ---------------------------------------------------------------- misleading chart examples (guide)
function misleadingChartsHtml() {
  return `<section class="section"><div class="section-head"><div><span class="kicker">Examples</span><h2>Same numbers, different story</h2></div></div>
    <p class="small muted">These use made-up numbers to show common tricks. Each pair shows exactly the same data.</p>
    <div class="mislead">
      <div class="card"><h3>1. Cutting off the bottom</h3><div class="grid two"><div><span class="badge warn">Misleading</span><div class="chart" id="ex1a"></div></div><div><span class="badge good">Fair</span><div class="chart" id="ex1b"></div></div></div>
        <p class="small">A rise from 50 to 52 looks huge when the axis starts at 49. Starting at zero shows it’s a 4% change.</p></div>
      <div class="card"><h3>2. Picking the start date</h3><div class="grid two"><div><span class="badge warn">Misleading</span><div class="chart" id="ex2a"></div></div><div><span class="badge good">Fair</span><div class="chart" id="ex2b"></div></div></div>
        <p class="small">Starting at a low point makes a figure look like it’s soaring. The longer view shows it’s back where it was.</p></div>
      <div class="card"><h3>3. Ignoring inflation</h3><div class="grid two"><div><span class="badge warn">Misleading</span><div class="chart" id="ex3a"></div></div><div><span class="badge good">Fair</span><div class="chart" id="ex3b"></div></div></div>
        <p class="small">In pounds at the time, spending on something “hit a record”. In today’s money it has barely changed.</p></div>
    </div></section>`;
}
function drawMisleadingCharts() {
  const yrs = Array.from({ length: 11 }, (_, i) => String(2016 + i));
  const a = [50, 50.3, 50.1, 50.6, 51, 50.8, 51.2, 51.5, 51.4, 51.8, 52];
  const long = [80, 78, 81, 79, 60, 52, 55, 62, 70, 76, 80];
  const cash = [100, 102, 105, 107, 110, 118, 128, 134, 138, 142, 146];
  const real = [146, 145, 146, 145, 146, 145, 146, 145, 146, 146, 146];
  const L = (id, labels, values, zero, color = 'var(--series-1)') => Charts.line(document.getElementById(id), { labels, series: [{ name: 'Value', color, values }], zero, height: 180, format: v => nf(v, 1) });
  L('ex1a', yrs, a, false, 'var(--series-2)'); L('ex1b', yrs, a, true);
  L('ex2a', yrs.slice(5), long.slice(5), true, 'var(--series-2)'); L('ex2b', yrs, long, true);
  L('ex3a', yrs, cash, true, 'var(--series-2)'); L('ex3b', yrs, real, true);
}

// ---------------------------------------------------------------- share cards
// Draws a 1200×630 image: the figure, what it is, its date and source, and a small trend line.
function shareCard({ title, value, sub, source, url, values }) {
  const W = 1200, H = 630, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = (w, s) => `${w} ${s}px Geist, system-ui, sans-serif`;
  const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#0b0c0e'); grad.addColorStop(1, '#16182a');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = '#3987e5'; g.fillRect(0, 0, W, 8);
  g.fillStyle = '#9aa0ad'; g.font = font(600, 26); g.fillText('UK DATA CHECKER · OFFICIAL FIGURES', 64, 76);
  // wrap the title
  g.fillStyle = '#ffffff'; g.font = font(700, 44);
  const words = String(title).split(' '); let line = '', y = 150; const lines = [];
  for (const w of words) { if (g.measureText(`${line}${w} `).width > W - 128 && line) { lines.push(line); line = ''; } line += `${w} `; }
  lines.push(line);
  lines.slice(0, 3).forEach(l => { g.fillText(l.trim(), 64, y); y += 54; });
  g.fillStyle = '#5aa6ff'; g.font = font(800, 120); g.fillText(value, 64, y + 110);
  g.fillStyle = '#c8ccd6'; g.font = font(500, 32); g.fillText(sub || '', 64, y + 160);
  const v = (values || []).filter(x => x != null && isFinite(x));
  if (v.length > 2) {
    const x0 = 700, x1 = W - 64, y0 = y + 20, y1 = y + 170, lo = Math.min(...v), hi = Math.max(...v) || 1;
    g.strokeStyle = '#5aa6ff'; g.lineWidth = 5; g.lineJoin = 'round'; g.beginPath();
    v.forEach((n, i) => { const px = x0 + (i / (v.length - 1)) * (x1 - x0), py = y1 - ((n - lo) / (hi - lo || 1)) * (y1 - y0); i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.stroke();
  }
  g.fillStyle = '#9aa0ad'; g.font = font(500, 24);
  g.fillText(`Source: ${source}`.slice(0, 90), 64, H - 80);
  g.fillText(String(url).replace(/^https?:\/\//, '').slice(0, 90), 64, H - 44);
  return new Promise(res => c.toBlob(res, 'image/png'));
}
document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-share]');
  if (!btn) return;
  const info = JSON.parse(btn.dataset.share);
  const blob = await shareCard(info);
  const file = new File([blob], 'uk-data-checker.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: info.title, text: `${info.title}: ${info.value} (${info.sub}). Source: ${info.source}` }); return; } catch { /* cancelled */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'uk-data-checker.png'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

// ---------------------------------------------------------------- embeddable charts
// #/embed?uri=…&freq=…&range=… shows just the chart, latest figure and source (no menus), for iframes.
async function embedPage(params) {
  const uri = params.get('uri') || '';
  if (!/^\/[a-z0-9/]+$/i.test(uri)) { view.innerHTML = errorBox('That link is not a valid ONS series.'); return; }
  view.innerHTML = loading();
  const d = await api(`/api/ons/site${uri}/data`);
  const desc = d.description;
  setTitle(desc.title);
  const freqs = ['months', 'quarters', 'years'].filter(f => (d[f] || []).length);
  const freq = freqs.includes(params.get('freq')) ? params.get('freq') : freqs[0];
  const range = params.get('range') || '10';
  const per = freq === 'months' ? 12 : freq === 'quarters' ? 4 : 1;
  const home = `${location.origin}${location.pathname}#/series?uri=${encodeURIComponent(uri)}`;
  const draw = () => {
    const pts = seriesPoints(d, freq);
    const shown = range === 'all' ? pts : pts.slice(-Number(range) * per);
    const valid = pts.filter(p => p.value != null), last = valid.at(-1);
    const fmt = unitFormatter(desc, decimalsOf(valid.slice(-60)));
    view.innerHTML = `<div class="embed-card">
      <div class="embed-head"><div><h1>${esc(desc.title)}</h1><p><b>${esc(fmt(last.value))}</b> <span class="muted">${esc(last.label)}</span></p></div>
        <a class="embed-brand" href="${esc(home)}" target="_blank" rel="noopener">UK Data <b>Checker</b> ↗</a></div>
      <div class="chart" id="embedChart"></div>
      ${sourceLine({ name: `ONS, series ${desc.cdid}`, url: ONS_SITE + uri, released: date(desc.releaseDate) })}</div>`;
    Charts.line(document.getElementById('embedChart'), { labels: shown.map(p => p.label), format: fmt, ariaLabel: desc.title, series: [{ name: desc.cdid, color: 'var(--series-1)', values: shown.map(p => p.value) }] });
  };
  draw(); onRedraw(draw);
}
