// "Where the money comes from" — UK public sector revenue by tax, from the ONS
// revenue tables built into data/revenue.json by scripts/build-finances.js.

const revenueData = () => getJSON('data/revenue.json');

const REVENUE_INFO = {
  income: 'Paid on wages, pensions, self-employed profits, rent and savings above the tax-free Personal Allowance.',
  ni: 'Paid by workers and employers on earnings (called "social contributions" in the official figures). Employee rates were cut twice in 2024, which is why it fell in 2024-25.',
  vat: 'Charged at 20% on most goods and services, with 5% or 0% on some things like children\'s clothes and most food. The official figure includes about £29bn of VAT that public bodies pay and then have refunded.',
  corp: 'Tax on company profits, including North Sea oil and gas companies.',
  council: 'Paid by households to their local council, based on the value band of their home (domestic rates in Northern Ireland).',
  rates: 'Paid by businesses and other organisations on the property they use.',
  fuel: 'A fixed amount per litre of petrol and diesel — with VAT charged on top.',
  stamp: 'Stamp Duty paid when buying a home or other property (with their own versions in Scotland and Wales), plus tax on buying shares.',
  drink: 'Duties on alcohol and tobacco products.',
  cgt: 'Tax on profits from selling things that have gone up in value, such as shares or second homes.',
  iht: 'Mostly Inheritance Tax, paid on estates worth more than the tax-free threshold.',
  ved: 'The annual "car tax" paid on vehicles by households and businesses.',
  nontax: 'Money the public sector receives that isn\'t a tax: interest and dividends, rents, and the operating surplus of public bodies and corporations (largely an accounting entry for the wear and tear of public buildings and roads).',
  other: 'About 20 smaller taxes and levies — such as Air Passenger Duty, Insurance Premium Tax, the Apprenticeship Levy, the TV licence fee and visa fees.',
};
// Plain names for the official row labels shown in the "What's inside" lists.
const REVENUE_ROW_NAMES = {
  'Social Contributions': 'National Insurance contributions',
  'Value Added Tax': 'VAT (total)',
  'VAT Net of Refunds': 'Paid by households and businesses',
  'VAT Refunds': 'Paid by public bodies, then refunded',
  'Corporation Tax (excl. North Sea)': 'Onshore companies',
  'Offshore Corporation Tax - Geographic': 'North Sea oil and gas companies',
  'Business Rates paid by Market sector bodies': 'Businesses',
  'Business Rates paid by private sector non-profit institutions': 'Charities and non-profits',
  'Taxes on Land and Buildings Transactions': 'Stamp Duty on property (UK, Scotland and Wales versions)',
  'Annual Tax on Enveloped Dwellings': 'Tax on homes owned by companies',
  'Stamp Tax on Shares': 'Stamp duty on buying shares',
  'Vehicle excise Duties paid by households': 'Paid by households',
  'Vehicle excise Duties paid by businesses': 'Paid by businesses',
  'Gross Operating Surplus': 'Operating surplus of public bodies',
  'Interest and Dividends': 'Interest and dividends',
  'Rent and Other Current Transfers': 'Rents and other transfers',
  'Taxes on Capital': 'Inheritance Tax and other capital taxes',
  'Environmental Levies': 'Environmental levies (on energy bills)',
  'ETS Auction Receipts': 'Carbon emissions permits (UK ETS)',
  'Custom Duties': 'Customs duties on imports',
};

async function revenuePage(params) {
  setTitle('Where the money comes from');
  view.innerHTML = loading();
  const [d, fin, sp] = await Promise.all([revenueData(), finances(), spendingData().catch(() => null)]);
  const i = d.years.length - 1;
  const year = d.years[i].replace(' to ', '-').replace(/-20(\d\d)$/, '-$1');
  const total = d.total[i] / 1000;
  const ukFin = fin.areas['United Kingdom'];
  const fi = fin.years.indexOf(d.years[i]);
  const pop = fi >= 0 ? ukFin.population[fi] : null;
  const groups = d.groups.map(g => ({ ...g, value: g.values[i] / 1000, desc: REVENUE_INFO[g.key] || '' })).sort((a, b) => b.value - a.value);
  const share = v => v / total * 100;
  const big3 = groups.filter(g => ['income', 'ni', 'vat'].includes(g.key)).reduce((s, g) => s + g.value, 0);
  const src = d.source;
  const sourceRev = (extra = '') => sourceLine({ name: src.title, url: src.page, released: date(src.released), extra });
  let selected = groups.find(g => g.key === params.get('tax')) ? params.get('tax') : groups[0].key;

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Tax &amp; spending</span><h1>Where the government's money comes from</h1>
      <p class="lead">In ${esc(year)} the UK public sector raised <strong>${bn(total)}</strong>${pop ? ` — about <strong>£${nf(Math.round(total * 1e9 / pop / 10) * 10)}</strong> for every person` : ''}. Here's which taxes it came from, using the ONS's official figures.</p></div>

    <div class="grid">
      <div class="card stat"><div class="label">Total public revenue, ${esc(year)}</div><div class="value">${bn(total)}</div><div class="meta">Taxes plus other income</div></div>
      ${pop ? `<div class="card stat"><div class="label">Per person</div><div class="value">£${nf(Math.round(total * 1e9 / pop / 10) * 10)}</div><div class="meta">ONS mid-${esc(d.years[i].slice(0, 4))} population of ${nf(pop / 1e6, 1)} million</div></div>` : ''}
      <div class="card stat"><div class="label">Per day</div><div class="value">£${nf(total / 365, 1)}bn</div><div class="meta">Every day of the financial year</div></div>
      <div class="card stat"><div class="label">The “big three”</div><div class="value">${nf(share(big3), 0)}%</div><div class="meta">Income Tax, VAT and National Insurance together</div></div>
    </div>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Breakdown</span><h2>Every source of public money</h2></div><span class="small muted">Click a slice or a name to see what's inside it</span></div>
      <div class="spend-split" id="spendSplit">
        <div class="card chart-card">
          <div class="pie-wrap"><div class="chart" id="revPie"></div><ul class="pie-legend" id="revLegend"></ul></div>
          ${sourceRev(`United Kingdom, ${esc(year)}`)}
        </div>
        <div class="card spend-detail" id="revDetail" aria-live="polite"></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Over time</span><h2>The biggest taxes since ${esc(d.years[0].slice(0, 4))}</h2></div>
        <div class="seg" id="revSeg"><button type="button" data-v="cash" aria-pressed="true">£ billion</button><button type="button" data-v="share" aria-pressed="false">Share of all revenue</button></div></div>
      <div class="card chart-card"><div class="chart" id="revTrend"></div>
        <p class="small muted" id="revTrendNote" style="margin:10px 0 0"></p>
        ${sourceRev()}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">The gap</span><h2>Money in vs money out, ${esc(year)}</h2></div></div>
      <div class="card" id="gapCard"></div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Fact check</span><h2>Common claims, checked</h2></div><span class="small muted">Calculated from the official tables</span></div>
      <div class="grid two" id="revClaims"></div>
    </section>

    <div class="callout small"><p><strong>About these figures:</strong> ONS “current receipts” for the whole UK public sector — central government, councils and public corporations — in cash terms (not adjusted for inflation), for financial years (April to March). They are the same figures used on the <a href="#/regions">tax by region</a> page. See also <a href="#/spending">how the government spends money</a>.</p></div>`;

  // ---- pie + list + detail
  const SLICES = 7;
  const drawPie = () => {
    const top = groups.slice(0, SLICES), rest = groups.slice(SLICES);
    const restTotal = rest.reduce((s, g) => s + g.value, 0);
    const slices = top.map((g, k) => ({ key: g.key, label: g.name, value: g.value, color: `var(--series-${k + 1})` }));
    if (rest.length) slices.push({ key: 'rest', label: 'Everything else', value: restTotal, color: 'var(--pie-other)' });
    const selIdx = Math.max(0, slices.findIndex(s => s.key === selected || (s.key === 'rest' && rest.some(g => g.key === selected))));
    Charts.donut(document.getElementById('revPie'), {
      slices, selected: selIdx, format: v => bn(v), valueName: year, ariaLabel: `Public revenue by source, ${year}`,
      center: { value: bn(total), label: `raised in ${year}` },
      onSelect: (_, k) => choose(slices[k].key === 'rest' ? rest[0].key : slices[k].key),
    });
    const row = (g, color) => `<li><button type="button" data-key="${g.key}" class="${g.key === selected ? 'on' : ''}"><i style="background:${color}"></i><span>${esc(g.name)}</span><b>${bn(g.value)}</b><em>${nf(share(g.value), 1)}%</em></button></li>`;
    document.getElementById('revLegend').innerHTML = top.map((g, k) => row(g, `var(--series-${k + 1})`)).join('')
      + (rest.length ? `<li class="pl-group">Everything else · ${bn(restTotal)}</li>${rest.map(g => row(g, 'var(--pie-other)')).join('')}` : '');
  };
  const choose = key => { selected = key; history.replaceState(null, '', `#/revenue?tax=${key}`); drawPie(); drawDetail(); };
  document.getElementById('revLegend').addEventListener('click', e => { const b = e.target.closest('button[data-key]'); if (b) choose(b.dataset.key); });

  const drawDetail = () => {
    const g = groups.find(x => x.key === selected);
    const parts = g.parts.map(p => ({ name: REVENUE_ROW_NAMES[p.label] || p.label, value: p.values[i] })).filter(p => p.value);
    const prev = g.values[i - 1] / 1000;
    const change = prev ? (g.value / prev - 1) * 100 : null;
    const box = document.getElementById('revDetail');
    box.innerHTML = `<div class="detail-grid"><div>
        <select class="select" id="taxPick" aria-label="Choose a source of revenue" style="width:100%">${groups.map(x => `<option value="${x.key}" ${x.key === selected ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <div class="stat" style="margin-top:14px"><div class="label">${esc(year)}</div><div class="value">${bn(g.value)}</div>
          <div class="meta">£${nf(share(g.value), 2)} of every £100 raised${pop ? ` · about £${nf(Math.round(g.value * 1e9 / pop / 10) * 10)} per person` : ''}</div>
          ${change != null ? `<div class="change">${change >= 0 ? '▲' : '▼'} ${nf(Math.abs(change), 1)}% on the year before (cash)</div>` : ''}</div>
        <p class="small" style="color:var(--text-2);margin:10px 0 0">${esc(g.desc)}</p>
      </div><div>
        ${parts.length > 1 ? `<h4 class="small muted" style="margin:16px 0 4px;text-transform:uppercase;letter-spacing:.06em;font-size:.72rem">What's inside</h4>
          <ul class="mini-bars">${(() => { const max = Math.max(...parts.map(p => Math.abs(p.value))); return parts.sort((a, b) => b.value - a.value).map(p => `<li><div class="mb-row"><span>${esc(p.name)}</span><b>${fromMillions(p.value)}</b></div><div class="mb-track"><i style="width:${Math.max(1, Math.abs(p.value) / max * 100)}%"></i></div></li>`).join(''); })()}</ul>
          ${g.key === 'other' ? '<p class="small muted" style="margin:8px 0 0">Plus a few very small taxes not listed separately.</p>' : ''}` : ''}
        <h4 class="small muted" style="margin:16px 0 4px;text-transform:uppercase;letter-spacing:.06em;font-size:.72rem">${esc(d.years[0].slice(0, 4))} to ${esc(year)}, £ billion (cash)</h4>
        <div class="chart" id="revDetailTrend"></div>
      </div></div>`;
    Charts.line(document.getElementById('revDetailTrend'), {
      labels: d.years.map(y => y.replace(' to ', '-')), height: 180, shortLabel: y => y.slice(0, 4),
      format: v => bn(v), axisFormat: v => `£${nf(v)}bn`,
      series: [{ name: g.name, color: 'var(--series-1)', values: g.values.map(v => v == null ? null : v / 1000) }], ariaLabel: `${g.name} over time`,
    });
    document.getElementById('taxPick').onchange = e => choose(e.target.value);
  };

  // ---- the four biggest taxes over time
  let trendMode = 'cash';
  const trendKeys = ['income', 'vat', 'ni', 'corp'];
  const drawTrend = () => {
    const series = trendKeys.map((k, n) => {
      const g = d.groups.find(x => x.key === k);
      return { name: g.name, color: `var(--series-${n + 1})`, values: g.values.map((v, y) => v == null ? null : trendMode === 'cash' ? v / 1000 : v / d.total[y] * 100) };
    });
    Charts.line(document.getElementById('revTrend'), {
      labels: d.years.map(y => y.replace(' to ', '-')), shortLabel: y => y.slice(0, 4), series,
      format: v => trendMode === 'cash' ? bn(v) : `${nf(v, 1)}%`, axisFormat: v => trendMode === 'cash' ? `£${nf(v)}bn` : `${nf(v)}%`,
      ariaLabel: 'Biggest taxes over time',
    });
    document.getElementById('revTrendNote').textContent = trendMode === 'cash'
      ? 'Cash figures, not adjusted for inflation — so they naturally rise over time. Switch to “share of all revenue” to compare years fairly.'
      : 'Each tax as a percentage of all public revenue that year.';
  };
  document.getElementById('revSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    trendMode = b.dataset.v;
    e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    drawTrend();
  });

  // ---- revenue vs spending (same ONS publication, so the figures are consistent)
  const spend = fi >= 0 ? (ukFin.currentExpenditure[fi] + ukFin.capitalExpenditure[fi]) / 1000 : null;
  document.getElementById('gapCard').innerHTML = spend ? `
    <div class="gap-bars">
      <div><span>Money raised</span><div class="gap-track"><i style="width:${total / spend * 100}%;background:var(--series-1)"></i></div><b>${bn(total)}</b></div>
      <div><span>Money spent</span><div class="gap-track"><i style="width:100%;background:var(--series-2)"></i></div><b>${bn(spend)}</b></div>
    </div>
    <p style="margin:14px 0 0">The public sector spent <strong>${bn(spend - total)}</strong> more than it raised in ${esc(year)}. That gap is covered by borrowing, which adds to the national debt — and the interest on that debt is itself one of the biggest areas of <a href="#/spending?cat=debt">public spending</a>.</p>
    ${sourceLine({ name: 'ONS Country and regional public sector finances (United Kingdom)', url: fin.sources.netFiscalBalance.page, extra: 'Revenue includes North Sea oil and gas; spending is current plus capital' })}`
    : '<p class="muted">Spending figures for this year aren\'t available.</p>';

  // ---- fact checks, computed from the data (skipped if a figure is missing)
  const G = k => groups.find(g => g.key === k);
  const claims = [];
  claims.push({ q: 'Does most tax come from income tax?', a: `Income Tax is the biggest single source, at ${bn(G('income').value)} — but that's only <strong>${nf(share(G('income').value), 0)}%</strong> of all revenue. Income Tax, VAT and National Insurance together make up <strong>${nf(share(big3), 0)}%</strong>.`, note: 'The rest comes from dozens of smaller taxes, plus non-tax income such as interest and rents.' });
  const vatPerPerson = pop ? G('vat').value * 1e9 / pop : null;
  if (vatPerPerson) claims.push({ q: 'How much VAT does each person pay?', a: `VAT raised ${bn(G('vat').value)} — about <strong>£${nf(Math.round(vatPerPerson / 10) * 10)} per person</strong>, including children, though businesses collect it and people pay different amounts depending on what they buy.`, note: 'The official VAT figure includes about £29bn paid by public bodies and refunded to them, so VAT paid by households and businesses is lower.' });
  const transport = sp?.functions?.find(f => f.name.startsWith('4. '))?.children.find(c => /^Transport/i.test(c.name));
  const roads = transport?.parts?.filter(p => /roads/i.test(p.name));
  // Compare the same financial year in both tables.
  const ry = sp?.subYears?.indexOf(year);
  if (roads?.length && ry >= 0 && roads.every(p => p.history)) {
    const roadsSpend = roads.reduce((s, p) => s + p.history[ry], 0) / 1000;
    claims.push({ q: 'Does fuel duty pay for the roads?', a: `In ${esc(year)} fuel duty raised ${bn(G('fuel').value)}, and spending on national and local roads was about <strong>${bn(roadsSpend)}</strong>.`, note: 'Taxes in the UK aren\'t earmarked: fuel duty goes into the general pot, and road spending comes out of it, like everything else.' });
  }
  const ni = G('ni');
  const niPrev = ni.values[i - 1] / 1000;
  if (niPrev) claims.push({ q: 'Has National Insurance gone up?', a: `In ${esc(year)} National Insurance raised ${bn(ni.value)}, <strong>${ni.value < niPrev ? 'down' : 'up'} ${bn(Math.abs(ni.value - niPrev))}</strong> on the year before.`, note: 'Employee National Insurance rates were cut in January and April 2024. Employers\' rates rose from April 2025, which will show up in the next year\'s figures.' });
  document.getElementById('revClaims').innerHTML = claims.map(c => `<div class="card claim"><h3>${esc(c.q)}</h3><p>${c.a}</p><p class="small muted" style="margin:0">${esc(c.note)}</p>${sourceRev()}</div>`).join('');

  const drawAll = () => { drawPie(); drawDetail(); drawTrend(); };
  drawAll();
  onRedraw(drawAll);
}
