// Cost of living extras: wages vs prices, your own inflation rate, mortgages & rent, council tax.
// Live ONS series via the /api/ons/site proxy; Bank of England rates and council tax are built
// into data/living.json by scripts/build-finances.js (`npm run build-data -- living`).

const livingData = () => getJSON('data/living.json');
const houseData = () => getJSON('data/housing.json');
const ONS_TS = {
  pay: '/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/kab9/emp',
  realGrowth: '/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/a3ww/emp',
  cpiIndex: '/economy/inflationandpriceindices/timeseries/d7bt/mm23',
  cpiRate: '/economy/inflationandpriceindices/timeseries/d7g7/mm23',
};
// CPI divisions: annual rate series and weight series (parts per 1,000 of spending).
const CPI_DIVISIONS = [
  { name: 'Food and soft drinks', rate: 'd7g8', weight: 'chzr', hint: 'Supermarket shopping' },
  { name: 'Alcohol and tobacco', rate: 'd7g9', weight: 'chzs', hint: 'Bought to drink or smoke at home' },
  { name: 'Clothing and shoes', rate: 'd7ga', weight: 'chzt', hint: '' },
  { name: 'Rent, water, gas and electricity', rate: 'd7gb', weight: 'chzu', hint: 'Not mortgage payments' },
  { name: 'Furniture and household goods', rate: 'd7gc', weight: 'chzv', hint: 'Appliances, repairs, cleaning' },
  { name: 'Health', rate: 'd7gd', weight: 'chzw', hint: 'Prescriptions, dentist, glasses' },
  { name: 'Transport', rate: 'd7ge', weight: 'chzx', hint: 'Fuel, car costs, train and bus fares' },
  { name: 'Phone and internet', rate: 'd7gf', weight: 'chzy', hint: '' },
  { name: 'Recreation and culture', rate: 'd7gg', weight: 'chzz', hint: 'TV, hobbies, holidays, pets' },
  { name: 'Education', rate: 'd7gh', weight: 'cjuu', hint: 'Fees' },
  { name: 'Eating out and hotels', rate: 'd7gi', weight: 'cjuv', hint: 'Restaurants, cafés, takeaways' },
  { name: 'Other (insurance, personal care…)', rate: 'd7gj', weight: 'cjuw', hint: '' },
];
const MON3 = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
// Monthly points from an ONS series: [{ key: 'YYYY-MM', label, v }]
async function onsMonthly(uri) {
  const d = await api(`/api/ons/site${uri}/data`);
  const pts = d.months.filter(m => m.value !== '' && isFinite(Number(m.value))).map(m => {
    const [y, mon] = m.date.split(' ');
    return { key: `${y}-${MON3[mon]}`, label: `${mon[0]}${mon.slice(1).toLowerCase()} ${y}`, v: Number(m.value) };
  });
  pts.description = d.description;
  return pts;
}
const monthLong = k => new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const signPct = (v, d = 1) => (v == null || !isFinite(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf(Math.abs(v), d)}%`);
const segWire = (id, fn) => document.getElementById(id).addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
  fn(b.dataset.v);
});
const tryStore = { get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };

// ---------------------------------------------------------------- wages vs prices
async function wagesPage() {
  setTitle('Wages vs prices');
  view.innerHTML = loading('Loading pay and prices from the ONS…');
  const [pay, real, cpi, cpiRate] = await Promise.all([onsMonthly(ONS_TS.pay), onsMonthly(ONS_TS.realGrowth), onsMonthly(ONS_TS.cpiIndex), onsMonthly(ONS_TS.cpiRate)]);
  const cpiBy = Object.fromEntries(cpi.map(p => [p.key, p.v]));
  const cpiNow = cpi.at(-1).v;
  const paired = pay.filter(p => cpiBy[p.key]);
  const realPay = paired.map(p => ({ ...p, real: p.v * cpiNow / cpiBy[p.key] }));
  const last = realPay.at(-1);
  const pre = realPay.filter(p => p.key < '2009-01');
  const peak08 = pre.reduce((m, p) => (p.real > m.real ? p : m), pre[0]);
  const ago = n => realPay[realPay.length - 1 - n];
  // Nominal pay growth vs a year earlier, from the single-month level.
  const payBy = Object.fromEntries(pay.map(p => [p.key, p.v]));
  const yoy = k => { const [y, m] = k.split('-'); const prev = payBy[`${Number(y) - 1}-${m}`]; return prev ? (payBy[k] / prev - 1) * 100 : null; };
  const rateBy = Object.fromEntries(cpiRate.map(p => [p.key, p.v]));
  const lastReal = real.at(-1);
  const src = sourceLine({ name: 'ONS Average Weekly Earnings (KAB9, A3WW) and Consumer Prices Index (D7BT, D7G7)', url: ONS_SITE + ONS_TS.pay, released: date(pay.description.releaseDate) });

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Cost of living</span><h1>Is pay beating prices?</h1>
      <p class="lead">Average weekly pay in Great Britain compared with rising prices — the simplest answer to “am I better or worse off?”</p></div>
    <div class="grid">
      <div class="card stat"><div class="label">Average weekly pay</div><div class="value">£${nf(last.v)}</div><div class="meta">${esc(monthLong(last.key))} · total pay including bonuses</div></div>
      <div class="card stat"><div class="label">Real pay growth</div><div class="value ${lastReal.v >= 0 ? 'down' : 'up'}">${signPct(lastReal.v)}</div><div class="meta">Pay growth after inflation, ${esc(lastReal.label)} (3-month average)</div></div>
      <div class="card stat"><div class="label">Real pay vs 2008 peak</div><div class="value">${signPct((last.real / peak08.real - 1) * 100)}</div><div class="meta">Peak before the financial crisis: £${nf(peak08.real)} a week in today’s money (${esc(peak08.label)})</div></div>
      <div class="card stat"><div class="label">Real pay vs 5 years ago</div><div class="value">${signPct((last.real / ago(60).real - 1) * 100)}</div><div class="meta">£${nf(ago(60).real)} → £${nf(last.real)} a week, today’s prices</div></div>
    </div>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Growth</span><h2>Pay growth vs inflation</h2></div>
        <div class="seg" id="gRange"><button type="button" data-v="120" aria-pressed="true">10 years</button><button type="button" data-v="all" aria-pressed="false">All</button></div></div>
      <div class="card chart-card"><div class="chart" id="growthChart"></div>
        <p class="small muted" style="margin:10px 0 0">How much average weekly pay and prices (CPI) rose compared with a year earlier. When the pay line is above the prices line, pay is rising faster than prices.</p>${src}</div>
    </section>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Real terms</span><h2>Average weekly pay in today’s money</h2></div></div>
      <div class="card chart-card"><div class="chart" id="realChart"></div>
        <p class="small muted" style="margin:10px 0 0">Average weekly pay adjusted to ${esc(monthLong(cpi.at(-1).key))} prices using the CPI. This shows what pay could buy, not just its size in pounds.</p>${src}</div>
    </section>
    <section class="section"><div class="grid two">
      <div class="card claim"><h3>An average hides a lot</h3><p>This is the average across all employees. Average pay is pulled up by high earners, and it doesn’t include the self-employed. Your own pay may have changed very differently.</p></div>
      <div class="card claim"><h3>Which inflation?</h3><p>The ONS’s own “real pay” figures use CPIH, which includes owner-occupiers’ housing costs; this page uses CPI. They tell a very similar story. See <a href="#/my-inflation">your own inflation rate</a>.</p></div>
    </div></section>`;

  let gRange = '120';
  const drawGrowth = () => {
    const keys = pay.map(p => p.key).filter(k => yoy(k) != null && rateBy[k] != null);
    const ks = gRange === 'all' ? keys : keys.slice(-Number(gRange));
    Charts.line(document.getElementById('growthChart'), {
      labels: ks.map(monthLong), shortLabel: l => l.slice(-4), format: v => `${nf(v, 1)}%`, ariaLabel: 'Pay growth and inflation',
      series: [{ name: 'Average weekly pay', color: 'var(--series-1)', values: ks.map(yoy) }, { name: 'Prices (CPI)', color: 'var(--series-2)', values: ks.map(k => rateBy[k]) }],
    });
  };
  const drawReal = () => Charts.line(document.getElementById('realChart'), {
    labels: realPay.map(p => p.label), shortLabel: l => l.slice(-4), format: v => `£${nf(v)}`, ariaLabel: 'Real weekly pay',
    series: [{ name: 'Weekly pay, today’s prices', color: 'var(--series-3)', values: realPay.map(p => p.real) }, { name: 'Weekly pay, at the time', color: 'var(--series-7)', values: realPay.map(p => p.v) }],
  });
  segWire('gRange', v => { gRange = v; drawGrowth(); });
  const all = () => { drawGrowth(); drawReal(); };
  all(); onRedraw(all);
}

// ---------------------------------------------------------------- your inflation rate
async function myInflationPage() {
  setTitle('Your inflation rate');
  view.innerHTML = loading('Loading price rises for each type of spending…');
  const base = '/economy/inflationandpriceindices/timeseries/';
  const [rates, weights, cpiRate] = await Promise.all([
    Promise.all(CPI_DIVISIONS.map(c => onsMonthly(`${base}${c.rate}/mm23`))),
    Promise.all(CPI_DIVISIONS.map(c => api(`/api/ons/site${base}${c.weight}/mm23/data`))),
    onsMonthly(ONS_TS.cpiRate),
  ]);
  const latestRate = rates.map(r => r.at(-1));
  const w = weights.map(d => Number(d.years.filter(y => y.value !== '').at(-1).value));
  const wYear = weights[0].years.filter(y => y.value !== '').at(-1).date;
  const TOTAL = 2000; // a typical month's spending, split like the average household's
  const saved = tryStore.get('myInflation.v1');
  let spend = Array.isArray(saved) && saved.length === CPI_DIVISIONS.length ? saved : w.map(x => Math.round(x / w.reduce((a, b) => a + b, 0) * TOTAL / 5) * 5);
  const cpiNow = cpiRate.at(-1);
  const src = sourceLine({ name: `ONS Consumer Price Inflation: annual rates and ${wYear} weights for the 12 spending groups`, url: `${ONS_SITE}${base}d7g7/mm23`, released: date(rates[0].description.releaseDate) });

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Cost of living</span><h1>What’s your inflation rate?</h1>
      <p class="lead">The official inflation rate is based on what the average household spends. Change the amounts below to match your own monthly spending and see how fast <em>your</em> costs are rising.</p></div>
    <div class="grid">
      <div class="card stat"><div class="label">Your inflation rate</div><div class="value" id="myRate"></div><div class="meta" id="myMeta"></div></div>
      <div class="card stat"><div class="label">Official rate (CPI)</div><div class="value">${nf(cpiNow.v, 1)}%</div><div class="meta">${esc(cpiNow.label)}, prices vs a year earlier</div></div>
      <div class="card stat"><div class="label">Extra cost of your spending</div><div class="value" id="myExtra"></div><div class="meta">vs the same things a year ago</div></div>
    </div>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Your spending</span><h2>How much do you spend a month?</h2></div>
        <button type="button" class="btn ghost" id="infReset">Reset to average household</button></div>
      <div class="card"><div class="infl-grid" id="inflRows"></div>
        <p class="small muted" style="margin:10px 0 0">Leave out mortgage payments, council tax and savings: the CPI doesn’t include them. Your figures stay in this browser.</p>${src}</div>
    </section>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Price rises</span><h2>How fast each type of spending is rising</h2></div></div>
      <div class="card chart-card"><div class="chart" id="divBars"></div><p class="small muted" style="margin:10px 0 0">Change in prices over the last year, ${esc(latestRate[0].label)}.</p>${src}</div>
    </section>
    <div class="callout"><p><strong>An estimate:</strong> this uses the 12 main groups of the CPI. Prices within each group can rise at different speeds — for example, if most of your transport spending is on fuel, your real rate will follow <a href="#/fuel">fuel prices</a> more closely.</p></div>`;

  const rows = document.getElementById('inflRows');
  rows.innerHTML = CPI_DIVISIONS.map((c, i) => `<label class="infl-row"><span><b>${esc(c.name)}</b>${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</span>
    <span class="infl-in">£<input class="select" type="number" min="0" step="10" inputmode="numeric" data-i="${i}" value="${spend[i]}"></span>
    <span class="infl-rate ${latestRate[i].v > cpiNow.v ? 'up' : 'down'}">${signPct(latestRate[i].v)}</span></label>`).join('');
  const calc = () => {
    const tot = spend.reduce((a, b) => a + b, 0);
    const rate = tot ? spend.reduce((s, x, i) => s + x * latestRate[i].v, 0) / tot : 0;
    const extra = spend.reduce((s, x, i) => s + x - x / (1 + latestRate[i].v / 100), 0);
    document.getElementById('myRate').textContent = `${nf(rate, 1)}%`;
    document.getElementById('myMeta').textContent = `On £${nf(tot)} a month · ${rate > cpiNow.v + 0.05 ? 'higher than' : rate < cpiNow.v - 0.05 ? 'lower than' : 'about the same as'} the official rate`;
    document.getElementById('myExtra').textContent = `£${nf(extra)} a month`;
    tryStore.set('myInflation.v1', spend);
  };
  rows.addEventListener('input', e => { const i = Number(e.target.dataset.i); if (isNaN(i)) return; spend[i] = Math.max(0, Number(e.target.value) || 0); calc(); });
  document.getElementById('infReset').onclick = () => { spend = w.map(x => Math.round(x / w.reduce((a, b) => a + b, 0) * TOTAL / 5) * 5); rows.querySelectorAll('input').forEach((el, i) => { el.value = spend[i]; }); calc(); };
  const drawBars = () => Charts.bars(document.getElementById('divBars'), {
    rows: CPI_DIVISIONS.map((c, i) => ({ label: c.name, value: latestRate[i].v, color: latestRate[i].v >= cpiNow.v ? 'var(--series-2)' : 'var(--series-1)' })).sort((a, b) => b.value - a.value),
    format: v => signPct(v), valueName: 'Price rise in a year', ariaLabel: 'Inflation by type of spending',
  });
  calc(); drawBars(); onRedraw(drawBars);
}

// ---------------------------------------------------------------- mortgages & rent
async function mortgagesPage() {
  setTitle('Mortgages and rent');
  view.innerHTML = loading();
  const [lv, hs, las] = await Promise.all([livingData(), houseData(), localAuthorities()]);
  const M = lv.mortgages;
  const lastIdx = s => s.values.reduce((b, v, i) => (v != null ? i : b), -1);
  const S = Object.fromEntries(M.series.map(s => [s.code, s]));
  const two = S.IUMBV34, five = S.IUMBV42, bank = S.IUDBEDR, svr = S.IUMTLMV;
  const i2 = lastIdx(two);
  const twoAgo = i2 - 24;
  const pay = (loan, ratePct, years) => { const r = ratePct / 100 / 12, n = years * 12; return r ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n; };
  const src = sourceLine({ name: M.source.title, url: M.source.page, extra: `Rates to ${esc(monthLong(M.months[i2]))}` });
  const hsrc = sourceLine({ name: `${hs.prices.title}; ${hs.rents.title}`, url: hs.prices.page, extra: `Prices ${esc(hs.prices.period)} · rents ${esc(hs.rents.period)}` });
  const saved = tryStore.get('mortgageCalc.v1') || {};
  const withRent = las.filter(a => hs.areas[a.code]?.rent);

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Cost of living</span><h1>Mortgages and rent</h1>
      <p class="lead">Typical mortgage rates from the Bank of England, what they mean for monthly payments, and how buying compares with renting where you live.</p></div>
    <div class="grid">
      <div class="card stat"><div class="label">2-year fixed rate</div><div class="value">${nf(two.values[i2], 2)}%</div><div class="meta">${esc(monthLong(M.months[i2]))} · 75% loan-to-value · ${twoAgo >= 0 && two.values[twoAgo] != null ? `${nf(two.values[twoAgo], 2)}% two years earlier` : ''}</div></div>
      <div class="card stat"><div class="label">5-year fixed rate</div><div class="value">${nf(five.values[lastIdx(five)], 2)}%</div><div class="meta">75% loan-to-value</div></div>
      <div class="card stat"><div class="label">Bank Rate</div><div class="value">${nf(bank.values[lastIdx(bank)], 2)}%</div><div class="meta">Set by the Bank of England · ${esc(monthLong(M.months[lastIdx(bank)]))}</div></div>
      <div class="card stat"><div class="label">Standard variable rate</div><div class="value">${nf(svr.values[lastIdx(svr)], 2)}%</div><div class="meta">What many pay when a fixed deal ends</div></div>
    </div>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Your mortgage</span><h2>What would I pay each month?</h2></div></div>
      <div class="card fuel-calc"><div class="calc-inputs">
        <label>Amount borrowed (£)<input class="select" id="mLoan" type="number" min="0" step="5000" inputmode="numeric" value="${saved.loan || 200000}"></label>
        <label>Interest rate (%)<input class="select" id="mRate" type="number" min="0" step="0.05" value="${saved.rate || two.values[i2]}"></label>
        <label>Term (years)<input class="select" id="mTerm" type="number" min="1" max="40" step="1" value="${saved.term || 25}"></label>
      </div><div class="basket-total" id="mOut"></div>
      <p class="small muted" style="margin:10px 0 0">A repayment mortgage. The default rate is the Bank of England’s average quoted 2-year fixed rate; your lender’s rate and fees will differ.</p>${src}</div>
    </section>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Over time</span><h2>Mortgage rates and Bank Rate since 2000</h2></div></div>
      <div class="card chart-card"><div class="chart" id="rateChart"></div><p class="small muted" style="margin:10px 0 0">Average interest rates quoted by lenders each month. Fixed rates follow expectations for Bank Rate.</p>${src}</div>
    </section>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Where you live</span><h2>Buying vs renting in your area</h2></div>
        <select class="select" id="rbArea" aria-label="Choose an area">${withRent.map(a => `<option value="${a.code}">${esc(a.name)}</option>`).join('')}</select></div>
      <div class="card"><div class="basket-total" id="rbOut"></div>
        <p class="small muted" style="margin:10px 0 0">Mortgage cost uses the average first-time buyer price with a 10% deposit over 25 years at today’s average 2-year fixed rate (rates for a 90% loan are usually higher). Rent is the average private rent. Rents cover England and Wales.</p>${hsrc}</div>
    </section>`;

  const els = ['mLoan', 'mRate', 'mTerm'].map(id => document.getElementById(id));
  const calc = () => {
    const [loan, rate, term] = els.map(e => Number(e.value) || 0);
    tryStore.set('mortgageCalc.v1', { loan, rate, term });
    const now = pay(loan, rate, term || 25);
    const then = twoAgo >= 0 && two.values[twoAgo] != null ? pay(loan, two.values[twoAgo], term || 25) : null;
    document.getElementById('mOut').innerHTML = `
      <div><span class="label">Monthly payment</span><b>£${nf(now)}</b><small>£${nf(now * 12)} a year</small></div>
      <div><span class="label">Total repaid</span><b>£${nf(now * (term || 25) * 12)}</b><small>£${nf(now * (term || 25) * 12 - loan)} of it interest</small></div>
      ${then ? `<div><span class="label">At the rate two years ago</span><b>£${nf(then)}</b><small>${nf(two.values[twoAgo], 2)}% (${esc(monthLong(M.months[twoAgo]))}) · ${now >= then ? '+' : '−'}£${nf(Math.abs(now - then))} a month now</small></div>` : ''}`;
  };
  els.forEach(e => e.addEventListener('input', calc)); calc();

  const sel = document.getElementById('rbArea');
  sel.value = tryStore.get('rbArea') || (withRent.find(a => a.name === 'Birmingham') || withRent[0]).code;
  const rb = () => {
    const a = hs.areas[sel.value]; tryStore.set('rbArea', sel.value);
    const m = pay(a.ftbPrice * 0.9, two.values[i2], 25);
    document.getElementById('rbOut').innerHTML = `
      <div><span class="label">Average rent</span><b>£${nf(a.rent)}</b><small>a month · ${signPct(a.rentChange)} in a year</small></div>
      <div><span class="label">Mortgage on a first home</span><b>£${nf(m)}</b><small>a month · first-time buyer price £${nf(a.ftbPrice)} (deposit £${nf(a.ftbPrice * 0.1)})</small></div>
      <div><span class="label">Difference</span><b>${m > a.rent ? 'Buying' : 'Renting'} costs £${nf(Math.abs(m - a.rent))} more</b><small>a month, before deposit, fees, repairs and insurance</small></div>`;
  };
  sel.addEventListener('change', rb); rb();

  const drawRates = () => {
    const from = M.months.findIndex(k => k >= '2000-01');
    const ks = M.months.slice(from);
    Charts.line(document.getElementById('rateChart'), {
      labels: ks.map(monthLong), shortLabel: l => l.slice(-4), format: v => `${nf(v, 2)}%`, ariaLabel: 'Mortgage rates and Bank Rate',
      series: [two, five, svr, bank].map((s, i) => ({ name: s.name, color: ['var(--series-1)', 'var(--series-3)', 'var(--series-2)', 'var(--text)'][i], values: s.values.slice(from) })),
    });
  };
  drawRates(); onRedraw(drawRates);
}

// ---------------------------------------------------------------- council tax
const BAND_RATIO = { A: 6, B: 7, C: 8, D: 9, E: 11, F: 13, G: 15, H: 18 };
async function councilTaxPage() {
  setTitle('Council tax');
  view.innerHTML = loading();
  const lv = await livingData();
  const ct = lv.councilTax;
  const A = ct.areas;
  const avg = A.reduce((s, a) => s + a.bandD, 0) / A.length;
  const sorted = [...A].sort((a, b) => b.bandD - a.bandD);
  const change = a => (a.prev ? (a.bandD / a.prev - 1) * 100 : null);
  const src = sourceLine({ name: ct.source.title, url: ct.source.page, extra: `Band D, ${esc(ct.year)}` });

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Cost of living</span><h1>Council tax in England</h1>
      <p class="lead">What every council in England charges in ${esc(ct.year)} for a Band D home — including the parts for the county, police, fire and parish — and how much it went up.</p></div>
    <div class="grid">
      <div class="card stat"><div class="label">Typical Band D bill</div><div class="value">£${nf(avg)}</div><div class="meta">Simple average of ${A.length} councils, ${esc(ct.year)}</div></div>
      <div class="card stat"><div class="label">Highest</div><div class="value value-sm">${esc(sorted[0].name)}</div><div class="meta">£${nf(sorted[0].bandD)} for Band D</div></div>
      <div class="card stat"><div class="label">Lowest</div><div class="value value-sm">${esc(sorted.at(-1).name)}</div><div class="meta">£${nf(sorted.at(-1).bandD)} for Band D</div></div>
      <div class="card stat"><div class="label">Typical rise</div><div class="value">${signPct(A.filter(change).reduce((s, a) => s + change(a), 0) / A.filter(change).length)}</div><div class="meta">from ${esc(ct.prevYear)} (most councils can rise up to 5% without a vote)</div></div>
    </div>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Your bill</span><h2>What’s my council tax?</h2></div></div>
      <div class="card fuel-calc"><div class="calc-inputs">
        <label>Council<select class="select" id="ctArea">${A.map(a => `<option value="${a.code}">${esc(a.name)}</option>`).join('')}</select></label>
        <label>Band<select class="select" id="ctBand">${Object.keys(BAND_RATIO).map(b => `<option${b === 'D' ? ' selected' : ''}>${b}</option>`).join('')}</select></label>
        <label><span>Living alone?</span><select class="select" id="ctAlone"><option value="0">No</option><option value="1">Yes (25% discount)</option></select></label>
      </div><div class="basket-total" id="ctOut"></div>
      <p class="small muted" style="margin:10px 0 0">An average for the council’s area: parish charges vary within a council, so your exact bill may differ slightly. Find your band at <a href="https://www.gov.uk/council-tax-bands" target="_blank" rel="noopener">gov.uk/council-tax-bands</a>.</p>${src}</div>
    </section>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Ranked</span><h2>Every council’s Band D bill</h2></div>
        <input class="select" id="ctSearch" type="search" placeholder="Filter councils…" aria-label="Filter councils"></div>
      <div class="card"><div class="table-wrap" style="max-height:520px"><table class="data" id="ctTable"></table></div>${src}</div>
    </section>
    <section class="section"><div class="grid two">
      <div class="card claim"><h3>Band D isn’t the most common band</h3><p>Most homes in England are in Bands A to C, which pay less than Band D. Band D is used to compare councils fairly.</p></div>
      <div class="card claim"><h3>Scotland and Wales are different</h3><p>Councils in Scotland and Wales set their own council tax under different rules and bands, so they aren’t on this page. Northern Ireland has domestic rates instead.</p></div>
    </div></section>`;

  const area = document.getElementById('ctArea'), band = document.getElementById('ctBand'), alone = document.getElementById('ctAlone');
  area.value = tryStore.get('ctArea') || A[0].code;
  const calc = () => {
    const a = A.find(x => x.code === area.value); tryStore.set('ctArea', area.value);
    const bill = a.bandD * BAND_RATIO[band.value] / 9 * (alone.value === '1' ? 0.75 : 1);
    const prev = a.prev ? a.prev * BAND_RATIO[band.value] / 9 * (alone.value === '1' ? 0.75 : 1) : null;
    document.getElementById('ctOut').innerHTML = `<div><span class="label">Yearly bill</span><b>£${nf(bill, 2)}</b><small>Band ${band.value} in ${esc(a.name)}, ${esc(ct.year)}</small></div>
      <div><span class="label">Monthly (10 instalments)</span><b>£${nf(bill / 10, 2)}</b><small>or £${nf(bill / 12, 2)} over 12 months</small></div>
      ${prev ? `<div><span class="label">Rise from ${esc(ct.prevYear)}</span><b class="up">+£${nf(bill - prev, 2)}</b><small>${signPct(change(a))}</small></div>` : ''}`;
  };
  [area, band, alone].forEach(e => e.addEventListener('change', calc)); calc();
  const table = q => {
    const rows = sorted.filter(a => !q || a.name.toLowerCase().includes(q.toLowerCase()));
    document.getElementById('ctTable').innerHTML = `<thead><tr><th>#</th><th>Council</th><th>Band D ${esc(ct.year)}</th><th>${esc(ct.prevYear)}</th><th>Change</th></tr></thead><tbody>${rows.map(a => `<tr><td class="muted">${sorted.indexOf(a) + 1}</td><td>${esc(a.name)}</td><td><strong>£${nf(a.bandD, 2)}</strong></td><td>${a.prev ? `£${nf(a.prev, 2)}` : '–'}</td><td>${signPct(change(a))}</td></tr>`).join('')}</tbody>`;
  };
  document.getElementById('ctSearch').addEventListener('input', e => table(e.target.value));
  table('');
}
