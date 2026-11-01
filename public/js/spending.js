// "How the government spends money" — HM Treasury PESA figures, built into
// data/spending.json by scripts/build-finances.js.

const spendingData = () => getJSON('data/spending.json');

// Plain-English names for the UN COFOG functions HM Treasury uses. Debt interest is
// shown on its own (it sits inside "general public services" in the official tables).
const SPEND_CATS = [
  { key: 'social', fn: '10', name: 'Pensions, benefits & social care', desc: 'State Pension, Universal Credit, disability and family benefits, housing support and adult and children\'s social care.' },
  { key: 'health', fn: '7', name: 'Health', desc: 'Mainly the NHS: hospitals, GPs, medicines and community health services, plus medical research.' },
  { key: 'debt', fn: '1', name: 'Interest on government debt', desc: 'Interest paid on money the government has borrowed. It doesn\'t buy any services, and rises when interest rates or inflation rise.' },
  { key: 'education', fn: '9', name: 'Education', desc: 'Nurseries, schools, colleges and universities, plus school transport and meals.' },
  { key: 'economy', fn: '4', name: 'Transport, business & jobs', desc: 'Railways and roads, support for businesses and energy, science, farming and employment programmes.' },
  { key: 'defence', fn: '2', name: 'Defence', desc: 'The armed forces, military equipment and defence research. (NATO counts defence spending differently, so its figures are higher.)' },
  { key: 'order', fn: '3', name: 'Police, courts, prisons & borders', desc: 'Police, fire services, courts, prisons, and immigration and border services.' },
  { key: 'gps', fn: '1', name: 'Running government & overseas aid', desc: 'Parliament, tax collection, government departments, diplomacy and foreign aid — everything in "general public services" except debt interest.' },
  { key: 'housing', fn: '6', name: 'Housing & local amenities', desc: 'Council and social housing, community development, water supply and street lighting.' },
  { key: 'environment', fn: '5', name: 'Environment & waste', desc: 'Bin collections and waste disposal, pollution control and protecting nature.' },
  { key: 'culture', fn: '8', name: 'Culture, sport & media', desc: 'Museums, libraries, sport, parks and public broadcasting.' },
];
const DEBT_ROW = 'of which: public sector debt interest';
// Colour slices in the pie; everything smaller is grouped into one grey slice (and listed in full).
const PIE_SLICES = 7;

// Plain names for the official function categories (keyed by COFOG number).
const FUNCTION_PLAIN = {
  1: 'Running government & debt interest', 2: 'Defence', 3: 'Police, courts, prisons & borders', 4: 'Transport, business & jobs',
  5: 'Environment & waste', 6: 'Housing & local amenities', 7: 'Health', 8: 'Culture, sport & media', 9: 'Education',
  10: 'Pensions, benefits & social care',
};

// HM Treasury's departmental groups, with clearer names where the official one isn't obvious.
const DEPARTMENTS = {
  'Work and Pensions': ['Department for Work and Pensions (DWP)', 'Pays the State Pension, Universal Credit, PIP and most other benefits across Great Britain.'],
  'Local Government': ['Local councils, police & fire', 'Councils across the UK, plus police forces and fire services: adult and children\'s social care, council-run schools, bins, local roads and housing.'],
  'Health and Social Care': ['Department of Health and Social Care (NHS England)', 'The NHS and public health in England. Health in Scotland, Wales and Northern Ireland is paid for by their own governments.'],
  'HM Treasury': ['HM Treasury', 'Almost all of this is interest on government debt, which is paid through the Treasury.'],
  'Defence': ['Ministry of Defence', 'The armed forces, equipment and defence research.'],
  'Education': ['Department for Education', 'Schools funding, colleges, apprenticeships and support for universities in England (some school funding goes through councils instead).'],
  'Scottish Government': ['Scottish Government', 'Devolved services in Scotland, such as the NHS, schools, transport and Scotland\'s own benefits.'],
  'HM Revenue and Customs': ['HM Revenue and Customs (HMRC)', 'Collecting taxes, plus Child Benefit and tax credits.'],
  'Northern Ireland Executive': ['Northern Ireland Executive', 'Devolved services in Northern Ireland, including health, schools and Northern Ireland\'s benefits system.'],
  'Transport': ['Department for Transport', 'Railways, national roads and support for buses.'],
  'Welsh Government': ['Welsh Government', 'Devolved services in Wales, such as the NHS, schools and transport.'],
  'Science, Innovation and Technology': ['Department for Science, Innovation and Technology', 'Science and research funding, and digital infrastructure.'],
  'Justice': ['Ministry of Justice', 'Courts, prisons and probation.'],
  'Energy Security and Net Zero': ['Department for Energy Security and Net Zero', 'Energy policy and support, and climate schemes.'],
  'Foreign, Commonwealth and Development Office': ['Foreign, Commonwealth and Development Office', 'Diplomacy, embassies and most of the UK\'s foreign aid.'],
  'Culture, Media and Sport': ['Department for Culture, Media and Sport', 'Museums, the arts, sport and the BBC (funded by the licence fee).'],
  'Home Office': ['Home Office', 'Borders, immigration, asylum and national policing functions. (Local police forces are counted under councils, police & fire.)'],
  'Environment, Food and Rural Affairs': ['Department for Environment, Food and Rural Affairs', 'Farming, flood defences and the environment.'],
  'Cabinet Office': ['Cabinet Office', 'Supports the Prime Minister and runs parts of central government.'],
  'Single Intelligence Account': ['Intelligence agencies', 'MI5, MI6 and GCHQ.'],
  'Business and Trade': ['Department for Business and Trade', 'Support for businesses and international trade.'],
  'Housing, Communities and Local Government': ['Ministry of Housing, Communities and Local Government', 'Housing programmes and community funds (most money for councils is counted under the councils themselves).'],
  'Small and Independent Bodies': ['Small and independent bodies', 'Parliament, the Electoral Commission and other small bodies.'],
  "Law Officers' Departments": ['Law Officers\' Departments', 'Including the Crown Prosecution Service.'],
};

function spendDepartments(d) {
  return (d.departments || []).map(x => {
    const [name, desc] = DEPARTMENTS[x.name] || [x.name, ''];
    return { key: x.name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name, desc, value: x.total / 1000, byFunction: x.byFunction };
  }).sort((a, b) => b.value - a.value);
}

function spendLatest(d, label) { const v = d.cash[label]; return v ? v[v.length - 1] : null; }
function fnLabel(d, n) { return Object.keys(d.cash).find(k => k.startsWith(n + '. ')); }

// Category values (£bn), real-terms history and breakdown children (£m) from the data file.
function spendCategories(d) {
  return SPEND_CATS.map(c => {
    const label = fnLabel(d, c.fn);
    const fn = d.functions.find(f => f.name.startsWith(c.fn + '. '));
    const debtCash = d.cash[DEBT_ROW], debtReal = d.real[DEBT_ROW];
    let value, real, children;
    if (c.key === 'debt') {
      value = spendLatest(d, DEBT_ROW);
      real = debtReal;
      children = (fn?.children.find(x => /debt transactions/i.test(x.name))?.parts || []).map(p => ({ name: p.name, value: p.value }));
    } else if (c.key === 'gps') {
      value = spendLatest(d, label) - spendLatest(d, DEBT_ROW);
      real = d.real[label].map((v, i) => v == null ? null : v - (debtReal[i] || 0));
      children = (fn?.children || []).filter(x => !/debt transactions/i.test(x.name));
    } else {
      value = spendLatest(d, label);
      real = d.real[label];
      children = fn?.children || [];
    }
    return { ...c, value, real, cash: c.key === 'debt' ? debtCash : d.cash[label], children: children.filter(x => x.value) };
  }).sort((a, b) => b.value - a.value);
}

const bn = v => `£${nf(v, v >= 100 ? 0 : 1)}bn`;
const fromMillions = m => Math.abs(m) >= 1000 ? `${m < 0 ? '−' : ''}£${nf(Math.abs(m) / 1000, 1)}bn` : `${m < 0 ? '−' : ''}£${nf(Math.abs(m))}m`;

async function spendingPage(params) {
  setTitle('How the government spends money');
  view.innerHTML = loading();
  const [d, imm] = await Promise.all([spendingData(), immigration()]);
  const cats = spendCategories(d);
  const services = spendLatest(d, 'Public sector expenditure on services');
  const adjustments = spendLatest(d, 'Accounting adjustments');
  const tme = spendLatest(d, 'Total Managed Expenditure');
  const pop = Object.values(imm.areas).reduce((s, a) => s + (a.pop || 0), 0);
  const perPerson = tme * 1e9 / pop;
  const ti = d.tme.years.length - 1;
  const tenAgo = d.tme.years.indexOf(`${+d.year.slice(0, 4) - 10}-${String(+d.year.slice(0, 4) - 9).slice(2)}`);
  const realChange = tenAgo >= 0 ? (d.tme.real[ti] / d.tme.real[tenAgo] - 1) * 100 : null;
  const src = d.source;
  const sourceAll = (extra = '') => sourceLine({ name: `HM Treasury, ${src.title}`, url: src.page, released: date(src.released), extra });
  let by = params.get('by') === 'area' || params.get('cat') ? 'area' : 'dept';
  let selected = params.get('cat') && cats.find(c => c.key === params.get('cat')) ? params.get('cat') : cats[0].key;
  const depts = spendDepartments(d);
  let selectedDept = params.get('dept') && depts.find(x => x.key === params.get('dept')) ? params.get('dept') : depts[0].key;

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Tax &amp; spending</span><h1>How the government spends its money</h1>
      <p class="lead">In ${esc(d.year)} the UK public sector spent <strong>${bn(tme)}</strong> — about <strong>£${nf(Math.round(perPerson / 10) * 10)}</strong> for every person in the country. Here's where it went, using HM Treasury's official figures.</p></div>

    <div class="grid">
      <div class="card stat"><div class="label">Total public spending, ${esc(d.year)}</div><div class="value">${bn(tme)}</div><div class="meta">${nf(d.tme.pctGDP[ti], 1)}% of everything the economy produces (GDP)</div></div>
      <div class="card stat"><div class="label">Spending per person</div><div class="value">£${nf(Math.round(perPerson / 10) * 10)}</div><div class="meta">Using the ONS mid-2025 population of ${nf(pop / 1e6, 1)} million</div></div>
      <div class="card stat"><div class="label">Spending per day</div><div class="value">£${nf(tme / 365, 1)}bn</div><div class="meta">Every day of the financial year</div></div>
      ${realChange != null ? `<div class="card stat"><div class="label">Change over 10 years, after inflation</div><div class="value">${realChange >= 0 ? '+' : '−'}${nf(Math.abs(realChange), 0)}%</div><div class="meta">Since ${esc(d.tme.years[tenAgo])}, in ${esc(d.year)} prices</div></div>` : ''}
    </div>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Breakdown</span><h2>Where the money goes</h2></div>
        <div class="seg" id="bySeg" role="group" aria-label="Group spending by">
          <button type="button" data-v="dept" aria-pressed="${by === 'dept'}">By department</button>
          <button type="button" data-v="area" aria-pressed="${by === 'area'}">By area of spending</button>
        </div></div>
      <div class="spend-split" id="spendSplit">
        <div class="card chart-card">
          <div class="pie-wrap"><div class="chart" id="pieChart"></div><ul class="pie-legend" id="pieLegend"></ul></div>
          <p class="small muted" style="margin:14px 0 0" id="pieNote"></p>
          ${sourceAll('Tables 5.1, 4.2 and 5.2')}</div>
        <div class="card spend-detail" id="spendDetail" aria-live="polite"></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Your tax</span><h2>Where would your tax go?</h2></div></div>
      <div class="card">
        <label class="small muted" for="taxAmount">Enter an amount of tax, e.g. what you paid last year</label>
        <div class="tax-input"><span>£</span><input id="taxAmount" type="number" min="0" step="100" value="5000" inputmode="decimal"></div>
        <div class="table-wrap" style="margin-top:14px"><table class="data" id="taxTable"></table></div>
        <p class="small muted" style="margin:12px 0 0">This splits your amount in the same proportions as all public spending on services. In reality taxes aren't earmarked for particular services, and some spending is paid for by borrowing rather than tax.</p>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Fact check</span><h2>Common claims, checked</h2></div><span class="small muted">Calculated from the official tables</span></div>
      <div class="grid two" id="claims"></div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Over time</span><h2>Total spending since ${esc(d.tme.years[0])}</h2></div>
        <div class="seg" id="tmeSeg"><button type="button" data-v="real" aria-pressed="true">After inflation</button><button type="button" data-v="cash" aria-pressed="false">Cash</button><button type="button" data-v="pct" aria-pressed="false">% of GDP</button></div></div>
      <div class="card chart-card"><div class="chart" id="tmeChart"></div>
        <p class="small muted" id="tmeNote" style="margin:10px 0 0"></p>
        ${sourceAll('Table 4.1, outturn only (not plans)')}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">By region</span><h2>Spending per person in each region</h2></div>
        <select class="select" id="regionFn" aria-label="Choose a spending area"></select></div>
      <div class="card chart-card"><div class="chart" id="regionSpend"></div>
        <p class="small muted" style="margin:10px 0 0">“Identifiable” spending only: money that can be linked to people in a particular place, such as schools, hospitals and benefits. Spending for the whole UK — like defence, debt interest and foreign aid — isn't shared out between regions here. Financial year ${esc(d.regional.year)}.</p>
        ${sourceAll('Table 9.15 (Country and Regional Analysis)')}</div>
    </section>

    <div class="callout small"><p><strong>About these figures:</strong> they are HM Treasury outturn (actual spending) for the whole public sector — central government, councils and public corporations — grouped using the UN's standard categories (COFOG), so they can be compared over time and with other countries. “After inflation” figures are in ${esc(d.year)} prices. See also <a href="#/regions">tax raised and spending by region</a>.</p></div>`;

  // ---- one big pie: by department or by area of spending, plus a detail panel
  const sync = () => history.replaceState(null, '', by === 'dept' ? `#/spending?by=dept&dept=${selectedDept}` : `#/spending?cat=${selected}`);
  const items = () => by === 'dept'
    ? depts.map(x => ({ key: x.key, name: x.name, value: x.value }))
    : cats.map(c => ({ key: c.key, name: c.name, value: c.value }));
  const drawPie = () => {
    const all = items();
    const top = all.slice(0, PIE_SLICES);
    const rest = all.slice(PIE_SLICES);
    const restTotal = rest.reduce((s, x) => s + x.value, 0);
    const cur = by === 'dept' ? selectedDept : selected;
    const slices = top.map((x, i) => ({ ...x, color: `var(--series-${i + 1})` }));
    if (rest.length) slices.push({ key: 'other', name: by === 'dept' ? `All other departments (${rest.length})` : 'Everything else', value: restTotal, color: 'var(--pie-other)' });
    const selIdx = Math.max(0, slices.findIndex(s => s.key === cur || (s.key === 'other' && rest.some(x => x.key === cur))));
    Charts.donut(document.getElementById('pieChart'), {
      slices: slices.map(s => ({ label: s.name, value: s.value, color: s.color })), selected: selIdx,
      format: v => bn(v), valueName: d.year, ariaLabel: `Public spending ${by === 'dept' ? 'by department' : 'by area'}, ${d.year}`,
      center: { value: bn(services), label: `spent on services, ${d.year}` },
      onSelect: (_, i) => choose(slices[i].key === 'other' ? rest[0].key : slices[i].key),
    });
    const pct = v => `${nf(v / services * 100, 1)}%`;
    const row = (x, color) => `<li><button type="button" data-key="${x.key}" class="${x.key === cur ? 'on' : ''}"><i style="background:${color}"></i><span>${esc(x.name)}</span><b>${bn(x.value)}</b><em>${pct(x.value)}</em></button></li>`;
    document.getElementById('pieLegend').innerHTML = slices.filter(s => s.key !== 'other').map(s => row(s, s.color)).join('')
      + (rest.length ? `<li class="pl-group">${esc(slices[slices.length - 1].label || slices[slices.length - 1].name)} · ${bn(restTotal)}</li>${rest.map(x => row(x, 'var(--pie-other)')).join('')}` : '');
    document.getElementById('pieNote').innerHTML = (by === 'dept'
      ? 'Grouped by the government department (or devolved government or councils) responsible for the money. “Local Government” is councils, police and fire services across the UK.'
      : 'Grouped by what the money is for, using the UN\'s standard categories.')
      + ` Shares are of the ${bn(services)} spent on services; a further ${bn(adjustments)} of “accounting adjustments” (technical differences between budgets and the national accounts) isn't assigned to a service.`;
  };
  const choose = key => {
    if (by === 'dept') selectedDept = key; else selected = key;
    sync(); drawPie(); drawDetail();
  };
  document.getElementById('pieLegend').addEventListener('click', e => { const b = e.target.closest('button[data-key]'); if (b) choose(b.dataset.key); });
  document.getElementById('bySeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    by = b.dataset.v;
    e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    sync(); drawPie(); drawDetail();
  });

  const heading = t => `<h4 class="small muted" style="margin:16px 0 4px;text-transform:uppercase;letter-spacing:.06em;font-size:.72rem">${t}</h4>`;
  const miniBars = list => {
    const max = Math.max(...list.map(k => Math.abs(k.value)));
    return `<ul class="mini-bars">${list.map(k => `
      <li${k.title ? ` title="${esc(k.title)}"` : ''}><div class="mb-row"><span>${esc(k.name)}</span><b>${fromMillions(k.value)}</b></div>
      <div class="mb-track"><i style="width:${Math.max(1, Math.abs(k.value) / max * 100)}%"></i></div></li>`).join('')}</ul>`;
  };
  const drawDetail = () => (by === 'dept' ? drawDeptDetail() : drawAreaDetail());

  const drawDeptDetail = () => {
    const x = depts.find(y => y.key === selectedDept);
    const box = document.getElementById('spendDetail');
    const parts = Object.entries(x.byFunction).map(([fn, v]) => ({ name: FUNCTION_PLAIN[fn.split('.')[0]] || fn.replace(/^\d+\.\s*/, ''), value: v, title: `Official category: ${fn}` }))
      .filter(p => p.value > 0).sort((a, b) => b.value - a.value);
    box.innerHTML = `<div class="detail-grid"><div>
      <select class="select" id="catPick" aria-label="Choose a department" style="width:100%">${depts.map(y => `<option value="${y.key}" ${y.key === selectedDept ? 'selected' : ''}>${esc(y.name)}</option>`).join('')}</select>
      <div class="stat" style="margin-top:14px"><div class="label">${esc(d.year)}</div><div class="value">${bn(x.value)}</div>
        <div class="meta">£${nf(x.value / services * 100, 2)} of every £100 · about £${nf(Math.round(x.value * 1e9 / pop / 10) * 10)} per person</div></div>
      ${x.desc ? `<p class="small" style="color:var(--text-2);margin:10px 0 0">${esc(x.desc)}</p>` : ''}
      </div><div>
      ${parts.length > 1 ? heading('What it spends on') + miniBars(parts) : ''}
      ${parts.length === 1 ? `${heading('What it spends on')}<p class="small muted" style="margin:4px 0 0">All of it is counted as <strong>${esc(parts[0].name)}</strong>.</p>` : ''}
      </div></div>`;
    document.getElementById('catPick').onchange = e => choose(e.target.value);
  };

  const drawAreaDetail = () => {
    const c = cats.find(x => x.key === selected);
    const box = document.getElementById('spendDetail');
    const kids = [...c.children].sort((a, b) => b.value - a.value);
    box.innerHTML = `<div class="detail-grid"><div>
      <select class="select" id="catPick" aria-label="Choose a spending area" style="width:100%">${cats.map(x => `<option value="${x.key}" ${x.key === selected ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <div class="stat" style="margin-top:14px"><div class="label">${esc(d.year)}</div><div class="value">${bn(c.value)}</div>
        <div class="meta">£${nf(c.value / services * 100, 2)} of every £100 · about £${nf(Math.round(c.value * 1e9 / pop / 10) * 10)} per person</div></div>
      <p class="small" style="color:var(--text-2);margin:10px 0 0">${esc(c.desc)}</p>
      </div><div>
      ${kids.length ? `<h4 class="small muted" style="margin:16px 0 4px;text-transform:uppercase;letter-spacing:.06em;font-size:.72rem">What's inside</h4><div class="chart" id="detailBars"></div>` : ''}
      ${kids.some(k => k.parts?.length) ? `<details class="table-toggle"><summary>More detail</summary><ul class="small detail-parts">${kids.filter(k => k.parts?.length).map(k => `<li><strong>${esc(k.name)}</strong>: ${k.parts.filter(p => p.value).map(p => `${esc(p.name)} ${fromMillions(p.value)}`).join('; ')}</li>`).join('')}</ul></details>` : ''}
      <h4 class="small muted" style="margin:16px 0 4px;text-transform:uppercase;letter-spacing:.06em;font-size:.72rem">After inflation, ${esc(d.years[0])} to ${esc(d.year)}</h4>
      <div class="chart" id="detailTrend"></div>
      </div></div>`;
    // A wrapping list rather than an SVG chart, so long official names stay readable in the narrow panel.
    if (kids.length) {
      const max = Math.max(...kids.map(k => Math.abs(k.value)));
      const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
      // Plain names for the most jargon-heavy official labels (the official label stays in the hover title).
      const plain = s => ({
        'Social exclusion n.e.c.': 'Universal Credit, tax credits & other income support',
        'Old age': 'Old age (State Pension & care for older people)',
        'Sickness and disability': 'Sickness & disability (incl. PIP and care)',
        'Executive and legislative organs, financial and fiscal affairs, external affairs': 'Parliament, tax collection & diplomacy',
        'General economic, commercial and labour affairs': 'Business support & jobs programmes',
      }[s] || cap(s).replace(/\s*n\.e\.c\.$/i, ' (other)').replace(/^R&D /, 'Research: '));
      document.getElementById('detailBars').innerHTML = miniBars(kids.map(k => ({ name: plain(k.name), value: k.value, title: `Official label: ${k.name}` })));
    }
    Charts.line(document.getElementById('detailTrend'), {
      labels: d.years, height: 180, format: v => bn(v), axisFormat: v => `£${nf(v)}bn`, shortLabel: y => y.slice(0, 4),
      series: [{ name: c.name, color: 'var(--series-1)', values: c.real }], ariaLabel: `${c.name} over time`,
    });
    document.getElementById('catPick').onchange = e => choose(e.target.value);
  };

  // ---- tax calculator
  const drawTax = () => {
    const amount = Math.max(0, Number(document.getElementById('taxAmount').value) || 0);
    document.getElementById('taxTable').innerHTML = `<thead><tr><th>Area</th><th>Share</th><th>Your £${nf(amount)}</th></tr></thead><tbody>${cats.map(c => `<tr><td>${esc(c.name)}</td><td>${nf(c.value / services * 100, 1)}%</td><td>£${nf(amount * c.value / services, 2)}</td></tr>`).join('')}</tbody>`;
  };
  document.getElementById('taxAmount').addEventListener('input', drawTax);

  // ---- fact-check cards, computed from the data (a card is skipped if its row is missing)
  const find = (fnNum, re) => d.functions.find(f => f.name.startsWith(fnNum + '. '))?.children.find(c => re.test(c.name));
  const part = (child, re) => child?.parts?.find(p => re.test(p.name));
  // Same base as the "every £100" chart, so the numbers on the page agree with each other.
  const pctOf = m => (m / 1000) / services * 100;
  const claims = [];
  const aid = find('1', /foreign economic aid/i);
  if (aid) claims.push({ q: 'Is foreign aid a big part of spending?', a: `${fromMillions(aid.value)} went on foreign economic aid — about <strong>£${nf(pctOf(aid.value), 2)} in every £100</strong> spent on public services.`, note: 'The UK\'s official overseas development assistance (ODA) total is counted differently and is higher, as it also includes some costs recorded under other headings, such as hosting refugees in the UK.' });
  const debt = spendLatest(d, DEBT_ROW);
  const defence = spendLatest(d, fnLabel(d, '2')), order = spendLatest(d, fnLabel(d, '3'));
  if (debt && defence && order) claims.push({ q: 'How much goes on interest on the national debt?', a: `${bn(debt)} — ${debt > defence + order ? `<strong>more than defence and policing, courts and prisons combined</strong> (${bn(defence + order)})` : `compared with ${bn(defence)} on defence`}.`, note: 'Debt interest rose sharply after 2021 because of higher inflation (some government debt is linked to inflation) and higher interest rates.' });
  const pensions = part(find('10', /old age/i), /pensions/i);
  const unemp = find('10', /^unemployment/i);
  const uc = part(find('10', /social exclusion/i), /universal credit/i);
  if (pensions && unemp && uc) {
    const working = unemp.value + uc.value;
    claims.push({ q: 'Do most benefits go to people who are out of work?', a: pensions.value > working
      ? `No. Pensions alone cost <strong>${fromMillions(pensions.value)}</strong> — more than all Universal Credit, tax credits and income support (${fromMillions(uc.value)}) and unemployment benefits (${fromMillions(unemp.value)}) put together.`
      : `Pensions cost ${fromMillions(pensions.value)}; Universal Credit, tax credits and income support ${fromMillions(uc.value)}; and unemployment benefits ${fromMillions(unemp.value)}.`,
      note: 'And most Universal Credit goes to people who are in work, caring, or too ill to work — not only to people who are unemployed.' });
  }
  const imm2 = part(find('3', /police services/i), /immigration/i);
  if (imm2) claims.push({ q: 'How much is spent on immigration and borders?', a: `${fromMillions(imm2.value)} is recorded as “immigration and citizenship” — about <strong>£${nf(pctOf(imm2.value), 2)} in every £100</strong> spent on public services.`, note: 'This is how HM Treasury classifies it. Some related costs, such as parts of asylum support, may be recorded under other headings, so the full cost is likely higher.' });
  const nhs = find('7', /medical services/i);
  if (nhs) claims.push({ q: 'How much does the NHS cost?', a: `Medical services cost ${fromMillions(nhs.value)} — about <strong>£${nf(Math.round(nhs.value * 1e6 / pop / 10) * 10)} per person</strong> a year.`, note: 'Health is the second-largest area of spending after pensions, benefits and social care.' });
  document.getElementById('claims').innerHTML = claims.map(c => `<div class="card claim"><h3>${esc(c.q)}</h3><p>${c.a}</p><p class="small muted" style="margin:0">${esc(c.note)}</p>${sourceAll('Table 5.2')}</div>`).join('');

  // ---- total over time
  let tmeMode = 'real';
  const drawTme = () => {
    const vals = { real: d.tme.real, cash: d.tme.cash, pct: d.tme.pctGDP }[tmeMode];
    const pct = tmeMode === 'pct';
    Charts.line(document.getElementById('tmeChart'), {
      labels: d.tme.years, shortLabel: y => y.slice(0, 4),
      format: v => pct ? `${nf(v, 1)}%` : bn(v), axisFormat: v => pct ? `${nf(v)}%` : `£${nf(v)}bn`,
      series: [{ name: 'Total managed expenditure', color: 'var(--series-1)', values: vals }], ariaLabel: 'Total public spending over time',
    });
    document.getElementById('tmeNote').textContent = {
      real: `Adjusted for inflation to ${d.year} prices, so years can be compared fairly.`,
      cash: 'Not adjusted for inflation — cash figures always tend to rise over time, so they can exaggerate growth.',
      pct: 'Spending as a share of GDP shows how big the state is compared with the whole economy. The peaks are the financial crisis (2009–10) and the pandemic (2020–21).',
    }[tmeMode];
  };
  document.getElementById('tmeSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    tmeMode = b.dataset.v;
    e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    drawTme();
  });

  // ---- regional per person
  const reg = d.regional;
  const fnSelect = document.getElementById('regionFn');
  const regFns = ['Total', ...reg.functions.filter(f => !/^of which/i.test(f))];
  fnSelect.innerHTML = regFns.map(f => `<option value="${esc(f)}">${esc(f === 'Total' ? 'All identifiable spending' : f.replace(/^\d+\.\s*/, ''))}</option>`).join('');
  const drawRegion = () => {
    const f = fnSelect.value;
    const ukKey = Object.keys(reg.regions).find(r => /^UK/i.test(r));
    const rows = Object.entries(reg.regions).filter(([r]) => r !== 'England' && r !== ukKey && reg.regions[r][f] != null)
      .map(([r, v]) => ({ label: r === 'East' ? 'East of England' : r, value: v[f] }))
      .concat(reg.regions[ukKey]?.[f] != null ? [{ label: 'UK average', value: reg.regions[ukKey][f], highlight: true }] : [])
      .sort((a, b) => b.value - a.value);
    Charts.bars(document.getElementById('regionSpend'), { rows, format: v => `£${nf(v)}`, valueName: 'Per person' });
  };
  fnSelect.addEventListener('change', drawRegion);

  const drawAll = () => { drawPie(); drawDetail(); drawTme(); drawRegion(); };
  drawAll(); drawTax();
  onRedraw(drawAll);
}
