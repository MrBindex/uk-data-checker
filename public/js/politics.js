// Politics: the government's pledge tracker and the Register of Ministers' Gifts and Hospitality.
// Pledges use live official data where it exists (NHS England, Home Office, ONS); the rest show
// the latest official figure with its date and source. Update PLEDGES when a new figure is out.

// Each pledge: what was promised, how it's measured and, for hand-entered ones, the latest figure.
const PLEDGES = [
  { id: 'nhs', area: 'NHS', promise: '92% of patients waiting no more than 18 weeks for planned treatment, by March 2029', interim: '65% by March 2026', live: 'rtt' },
  { id: 'boats', area: 'Borders', promise: 'Cut small boat crossings (“smash the gangs”)', live: 'boats' },
  { id: 'migration', area: 'Migration', promise: 'Significantly reduce net migration', live: 'migration' },
  { id: 'growth', area: 'Economy', promise: 'The highest sustained growth in the G7', live: 'growth', note: 'The UK figure is shown; comparing with other G7 countries needs their figures on the same basis (OECD).' },
  { id: 'income', area: 'Living standards', promise: 'Higher real household disposable income per person by the next election', live: 'rhdi' },
  { id: 'homes', area: 'Housing', promise: '1.5 million new homes in England this Parliament', figure: '208,600 net additional homes in 2024-25', detail: 'Hitting 1.5 million over five years needs about 300,000 a year.', status: 'off', source: { name: 'MHCLG, Housing supply: net additional dwellings, England 2024 to 2025', url: 'https://www.gov.uk/government/statistics/housing-supply-net-additional-dwellings-england-2024-to-2025' } },
  { id: 'tax', area: 'Tax', promise: 'No increase in the rates of Income Tax, National Insurance (for employees) or VAT', figure: 'Rates unchanged after the Autumn Budget 2026', detail: 'Employer National Insurance did rise in April 2025, and frozen tax thresholds mean many people pay more tax without a rate rise.', status: 'kept', source: { name: 'House of Commons Library, Autumn Budget 2026: a summary', url: 'https://researchbriefings.files.parliament.uk/documents/CBP-12252/CBP-12252.pdf' } },
];
const STATUS = { on: ['On track', 'good'], off: ['Off track', 'warn'], kept: ['Kept so far', 'good'], mixed: ['Mixed', 'warn'], unclear: ['Too early to say', ''] };

async function pledgesPage() {
  setTitle('Pledge tracker');
  view.innerHTML = loading('Loading the latest official figures…');
  const ts = (path, ds) => api(`/api/ons/site/economy/grossdomesticproductgdp/timeseries/${path}/${ds}/data`).catch(() => null);
  const [nhs, border, gdp, rhdi, mig] = await Promise.all([
    getJSON('data/nhs.json').catch(() => null), getJSON('data/border.json').catch(() => null), ts('ihyq', 'ukea'), ts('crxx', 'ukea'),
    loadBulletin('/peoplepopulationandcommunity/populationandmigration/internationalmigration/bulletins/longterminternationalmigrationprovisional/latest').catch(() => null),
  ]);
  const ym = k => new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const live = {};
  if (nhs) {
    const R = nhs.rtt, i = R.pct18.reduce((b, v, j) => (v != null ? j : b), 0), y = R.months.indexOf(`${Number(R.months[i].slice(0, 4)) - 1}${R.months[i].slice(4)}`);
    // On track only if the last year's improvement, kept up, would reach 92% by March 2029.
    const yearsLeft = (Date.UTC(2029, 2, 31) - Date.UTC(Number(R.months[i].slice(0, 4)), Number(R.months[i].slice(5)) - 1)) / (365.25 * 864e5);
    const gain = R.pct18[i] - R.pct18[y], needed = (92 - R.pct18[i]) / yearsLeft;
    live.rtt = { figure: `${nf(R.pct18[i], 1)}% within 18 weeks (${ym(R.months[i])})`, detail: `Up ${nf(gain, 1)} points in a year (from ${nf(R.pct18[y], 1)}%). Reaching 92% by March 2029 needs about ${nf(needed, 1)} points a year.`, status: gain >= needed ? 'on' : 'off', source: { name: R.source.title, url: R.source.page }, spark: R.pct18.slice(-36) };
  }
  if (border) {
    const B = border.boats, y = B.latest.slice(0, 4), now = B.ytd[y], prev = B.ytd[String(y - 1)], prev2 = B.ytd[String(y - 2)];
    live.boats = { figure: `${nf(now)} arrivals so far in ${y}`, detail: `Same period in ${y - 1}: ${nf(prev)}; in ${y - 2}: ${nf(prev2)}.`, status: now < prev ? 'on' : 'off', source: { name: B.source.title, url: B.source.page }, spark: B.months.slice(-24).map(m => m.people) };
  }
  if (gdp) {
    const q = gdp.quarters.filter(x => x.value !== '');
    const last4 = q.slice(-4).map(x => Number(x.value));
    live.growth = { figure: `${nf(Number(q.at(-1).value), 1)}% growth in ${q.at(-1).date}`, detail: `Quarter-on-quarter GDP growth. Average over the last four quarters: ${nf(last4.reduce((a, b) => a + b, 0) / 4, 2)}% a quarter.`, status: 'unclear', source: { name: 'ONS GDP quarter-on-quarter growth (IHYQ)', url: `${ONS_SITE}/economy/grossdomesticproductgdp/timeseries/ihyq/ukea` }, spark: q.slice(-16).map(x => Number(x.value)) };
  }
  if (rhdi) {
    const q = rhdi.quarters.filter(x => x.value !== '');
    const base = q.find(x => x.date === '2024 Q2') || q[q.length - 9];
    const nowV = Number(q.at(-1).value), baseV = Number(base.value);
    live.rhdi = { figure: `£${nf(nowV)} per person (${q.at(-1).date})`, detail: `Real disposable income per person, ${nowV >= baseV ? 'up' : 'down'} ${nf(Math.abs(nowV / baseV - 1) * 100, 1)}% since the election quarter (${base.date}). Quarterly figures are volatile and often revised.`, status: nowV > baseV ? 'on' : 'off', source: { name: 'ONS real households’ disposable income per head (CRXX)', url: `${ONS_SITE}/economy/grossdomesticproductgdp/timeseries/crxx/ukea` }, spark: q.slice(-16).map(x => Number(x.value)) };
  }
  if (mig) {
    const pts = (mig.points.length ? mig.points : mig.fallbackPoints || []);
    // Use the first main point whose opening sentence gives a figure (the first is often a definition).
    const firsts = pts.map(firstSentence);
    const p = firsts.find(x => /net migration/i.test(x) && /\d{1,3},\d{3}/.test(x)) || firsts.find(x => /\d{1,3},\d{3}/.test(x)) || firsts[0];
    const said = p || '';
    live.migration = { figure: said || 'See the latest ONS release', detail: 'Taken word for word from the ONS main points. These are provisional “official statistics in development” and are often revised.', status: /fell|fallen|halved|down|decreas|lower/i.test(said) ? 'on' : /rose|risen|increas|higher/i.test(said) ? 'off' : 'unclear', source: { name: mig.title || 'ONS long-term international migration', url: `${ONS_SITE}/peoplepopulationandcommunity/populationandmigration/internationalmigration/bulletins/longterminternationalmigrationprovisional/latest` } };
  }
  const items = PLEDGES.map(p => ({ ...p, ...(p.live ? live[p.live] || { figure: 'Figures unavailable right now', status: 'unclear', source: { name: 'Source unavailable', url: '#' } } : {}) }));
  const counts = Object.fromEntries(Object.keys(STATUS).map(k => [k, items.filter(i => i.status === k).length]));

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Politics</span><h1>Pledge tracker</h1>
      <p class="lead">The government’s main promises, each matched to the official statistic that measures it — so you can see the numbers, not just the claims.</p></div>
    <div class="grid">
      <div class="card stat"><div class="label">On track or kept</div><div class="value">${counts.on + counts.kept}</div><div class="meta">of ${items.length} pledges tracked</div></div>
      <div class="card stat"><div class="label">Off track</div><div class="value">${counts.off}</div><div class="meta">on current official figures</div></div>
      <div class="card stat"><div class="label">Too early to say</div><div class="value">${counts.unclear}</div><div class="meta">no clear target or not enough data yet</div></div>
    </div>
    <div class="callout"><p><strong>How we judge:</strong> “on track” means the latest official figure is moving the right way fast enough or already meets the target; “off track” means it isn’t. These are our plain reading of the official numbers, not an official assessment — click through to each source and judge for yourself.</p></div>
    <div class="pledge-grid">${items.map(p => `<article class="card pledge-card">
      <div class="pledge-top"><span class="badge">${esc(p.area)}</span><span class="badge ${STATUS[p.status][1]}">${STATUS[p.status][0]}</span></div>
      <h3>${esc(p.promise)}</h3>
      ${p.interim ? `<p class="small muted">Interim target: ${esc(p.interim)}</p>` : ''}
      <p class="pledge-figure">${esc(p.figure)}</p>
      ${p.spark ? `<div class="pledge-spark">${Charts.spark(p.spark)}</div>` : ''}
      ${p.detail ? `<p class="small">${esc(p.detail)}</p>` : ''}
      ${p.note ? `<p class="small muted">${esc(p.note)}</p>` : ''}
      <p class="small muted pledge-src">Source: <a href="${esc(p.source.url)}" target="_blank" rel="noopener">${esc(p.source.name)}</a></p>
    </article>`).join('')}</div>
    <p class="small muted" style="margin-top:16px">Pledges are from Labour’s 2024 manifesto and the “Plan for Change” milestones (December 2024). Figures load live from the official source where it publishes data we can read; others are updated by hand with their date.</p>`;
}

// ---------------------------------------------------------------- ministers' gifts & hospitality
async function ministersPage() {
  setTitle('Ministers’ gifts and hospitality');
  view.innerHTML = loading();
  const d = await getJSON('data/ministers.json');
  const E = d.entries;
  const ministers = [...new Set(E.map(e => e.minister))].sort();
  const depts = [...new Set(E.map(e => e.dept))].sort();
  const byMin = {};
  for (const e of E) { const m = byMin[e.minister] || (byMin[e.minister] = { n: 0, gifts: 0, hosp: 0 }); m.n++; e.kind === 'gift' ? m.gifts++ : m.hosp++; }
  const top = Object.entries(byMin).sort((a, b) => b[1].n - a[1].n).slice(0, 12);
  const hosts = {};
  for (const e of E) if (e.kind === 'hospitality' && e.from) { const k = e.from.replace(/\s+/g, ' ').trim(); hosts[k] = (hosts[k] || 0) + 1; }
  const topHosts = Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const src = sourceLine({ name: d.source.title, url: d.source.page, extra: `${d.periods} monthly registers` });
  view.innerHTML = `
    <div class="page-head"><span class="kicker">Politics</span><h1>Ministers’ gifts and hospitality</h1>
      <p class="lead">Every gift and every meal, event or ticket that government ministers have declared in the Cabinet Office’s monthly register — searchable by minister, department and who gave it.</p></div>
    <div class="grid">
      <div class="card stat"><div class="label">Declarations</div><div class="value">${nf(E.length)}</div><div class="meta">${nf(E.filter(e => e.kind === 'hospitality').length)} hospitality · ${nf(E.filter(e => e.kind === 'gift').length)} gifts</div></div>
      <div class="card stat"><div class="label">Most declarations</div><div class="value value-sm">${esc(top[0]?.[0] || '–')}</div><div class="meta">${top[0] ? `${top[0][1].n} entries` : ''}</div></div>
      <div class="card stat"><div class="label">Most frequent host</div><div class="value value-sm">${esc(topHosts[0]?.[0] || '–')}</div><div class="meta">${topHosts[0] ? `${topHosts[0][1]} hospitality entries` : ''}</div></div>
    </div>
    <section class="section"><div class="grid two">
      <div class="card"><h3>Ministers with the most declarations</h3><div class="chart" id="minBars"></div></div>
      <div class="card"><h3>Who hosted ministers most often</h3><div class="chart" id="hostBars"></div></div>
    </div>${src}</section>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Search</span><h2>Every declaration</h2></div></div>
      <div class="card">
        <div class="calc-inputs">
          <label>Search<input class="select" id="mSearch" type="search" placeholder="e.g. football, Qatar, dinner…"></label>
          <label>Minister<select class="select" id="mMin"><option value="">All ministers</option>${ministers.map(m => `<option>${esc(m)}</option>`).join('')}</select></label>
          <label>Department<select class="select" id="mDept"><option value="">All departments</option>${depts.map(m => `<option>${esc(m)}</option>`).join('')}</select></label>
          <label>Type<select class="select" id="mKind"><option value="">Gifts and hospitality</option><option value="hospitality">Hospitality</option><option value="gift">Gifts</option></select></label>
        </div>
        <p class="small muted" id="mCount"></p>
        <div class="table-wrap" style="max-height:640px"><table class="data" id="mTable"></table></div>
        <p class="small muted" style="margin:10px 0 0">Ministers must declare gifts worth over £140 and hospitality received in their role as a minister. Declaring something doesn’t mean anything improper. Gifts given by ministers (for example to foreign leaders) are included where listed. “Value unknown” is common for hospitality.</p>
        ${src}</div>
    </section>`;
  const drawBars = () => {
    Charts.bars(document.getElementById('minBars'), { rows: top.map(([n, v]) => ({ label: n, value: v.n, tip: `${v.hosp} hospitality · ${v.gifts} gifts` })), format: v => nf(v), valueName: 'Declarations' });
    Charts.bars(document.getElementById('hostBars'), { rows: topHosts.map(([n, v]) => ({ label: n, value: v, color: 'var(--series-3)' })), format: v => nf(v), valueName: 'Hospitality entries' });
  };
  const ids = ['mSearch', 'mMin', 'mDept', 'mKind'].map(id => document.getElementById(id));
  const table = () => {
    const [q, mn, dp, kd] = ids.map(e => e.value.trim().toLowerCase());
    const rows = E.filter(e => (!mn || e.minister.toLowerCase() === mn) && (!dp || e.dept.toLowerCase() === dp) && (!kd || e.kind === kd)
      && (!q || `${e.minister} ${e.from} ${e.what} ${e.dept}`.toLowerCase().includes(q)));
    document.getElementById('mCount').textContent = `${nf(rows.length)} declarations${rows.length > 400 ? ' — showing the 400 most recent' : ''}`;
    document.getElementById('mTable').innerHTML = `<thead><tr><th>Date</th><th>Minister</th><th>Type</th><th>From / to</th><th>What</th><th>Value</th></tr></thead><tbody>${rows.slice(0, 400).map(e => `<tr>
      <td>${e.date ? esc(new Date(`${e.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })) : esc(e.period)}</td>
      <td>${esc(e.minister)}<div class="small muted">${esc(e.dept)}</div></td>
      <td>${e.kind === 'gift' ? `Gift${e.direction ? ` (${esc(e.direction.toLowerCase())})` : ''}` : 'Hospitality'}${e.guest && /yes/i.test(e.guest) ? '<div class="small muted">with a guest</div>' : ''}</td>
      <td>${esc(e.from)}</td><td>${esc(e.what)}${e.outcome ? `<div class="small muted">${esc(e.outcome)}</div>` : ''}</td>
      <td>${e.value != null ? `£${nf(e.value, e.value % 1 ? 2 : 0)}` : `<span class="muted">${esc(e.valueText || '–')}</span>`}</td></tr>`).join('')}</tbody>`;
  };
  ids.forEach(e => e.addEventListener('input', table));
  table(); drawBars(); onRedraw(drawBars);
}
