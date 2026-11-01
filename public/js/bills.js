// "Household bills" — gas, electricity and water costs.
// Built from data/bills.json (Ofgem price cap, DESNZ regional bills, water company bills)
// plus live ONS consumer price indices for how prices have changed.

const billsData = () => getJSON('data/bills.json');
const pence = v => `${nf(v, 2)}p`;
// "1 October to 31 December 2026" → "Oct–Dec 2026"
const shortPeriod = p => {
  const m = String(p).match(/(\d+ )?([A-Z][a-z]{2})[a-z]* (\d{4} )?to (\d+ )?([A-Z][a-z]{2})[a-z]* (\d{4})/);
  return m ? `${m[2]}${m[3] && m[3].trim() !== m[6] ? ` ${m[3].trim()}` : ''}–${m[5]} ${m[6]}` : p;
};
const yearCost = (unitP, standingP, kwh) => (unitP * kwh + standingP * 365) / 100;
const PRICE_SERIES = [
  { cdid: 'd7dt', name: 'Electricity', color: 'var(--series-1)' },
  { cdid: 'd7du', name: 'Gas', color: 'var(--series-2)' },
  { cdid: 'd7dr', name: 'Water', color: 'var(--series-3)' },
  { cdid: 'd7bt', name: 'All prices (CPI)', color: 'var(--series-4)' },
];

async function billsPage() {
  setTitle('Household bills');
  view.innerHTML = loading();
  const b = await billsData();
  const cap = b.priceCap;
  const now = cap?.periods[cap.periods.length - 1];
  const before = cap?.periods.length > 1 ? cap.periods[cap.periods.length - 2] : null;
  const use = cap?.typicalUse || { electricity: 2700, gas: 11500 };
  const energyYear = p => p ? yearCost(p.electricity.unit, p.electricity.standing, use.electricity) + yearCost(p.gas.unit, p.gas.standing, use.gas) : null;
  const energyNow = energyYear(now), energyBefore = energyYear(before);
  const w = b.water;
  const waterNow = w.combined.Average?.[0];
  const waterPrev = w.combined.Average?.[1];
  const capSource = () => cap ? sourceLine({ name: cap.source.title, url: cap.source.page, extra: esc(now.period) }) : '';
  const regionSource = () => sourceLine({ name: `DESNZ, ${b.energyByRegion.electricity.source.title.replace(/ \(QEP.*$/, '')} and gas equivalent`, url: b.energyByRegion.electricity.source.page, released: date(b.energyByRegion.electricity.source.released) });
  const waterSource = () => sourceLine({ name: w.source.title, url: w.source.page });

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Cost of living</span><h1>Household bills: energy and water</h1>
      <p class="lead">What a typical home pays for electricity, gas and water — and how much those prices have really gone up — using figures from Ofgem, the government and the water companies.</p></div>

    <div class="grid">
      ${energyNow ? `<div class="card stat"><div class="label">Typical energy bill now (gas + electricity)</div><div class="value">£${nf(Math.round(energyNow))}<small>/yr</small></div><div class="meta">About £${nf(Math.round(energyNow / 12))} a month under the price cap, ${esc(now.period)}</div></div>` : ''}
      ${waterNow ? `<div class="card stat"><div class="label">Average water and sewerage bill</div><div class="value">£${nf(waterNow)}<small>/yr</small></div><div class="meta">England and Wales, ${esc(w.years[0])}${waterPrev ? ` · ${waterNow >= waterPrev ? '▲' : '▼'} ${nf(Math.abs(waterNow / waterPrev - 1) * 100, 0)}% on ${esc(w.years[1])}` : ''}</div></div>` : ''}
      ${energyNow && waterNow ? `<div class="card stat"><div class="label">Energy and water together</div><div class="value">£${nf(Math.round(energyNow + waterNow))}<small>/yr</small></div><div class="meta">About £${nf(Math.round((energyNow + waterNow) / 12))} a month for a typical home</div></div>` : ''}
      <div class="card stat"><div class="label">Price rise since 2015</div><div class="value" id="sinceValue">…</div><div class="meta" id="sinceMeta">Electricity, from the ONS consumer price index</div></div>
    </div>

    ${cap ? `<section class="section">
      <div class="section-head"><div><span class="kicker">Energy</span><h2>The energy price cap now</h2></div></div>
      <div class="grid two">
        <div class="card">
          <div class="table-wrap"><table class="data cap-table">
            <thead><tr><th></th><th>${esc(before ? shortPeriod(before.period) : '')}</th><th>${esc(shortPeriod(now.period))} (now)</th></tr></thead>
            <tbody>
              ${['electricity', 'gas'].map(f => `
                <tr><td><strong>${f === 'gas' ? 'Gas' : 'Electricity'}</strong> unit rate</td><td>${before ? pence(before[f].unit) + '/kWh' : ''}</td><td><strong>${pence(now[f].unit)}/kWh</strong></td></tr>
                <tr><td>${f === 'gas' ? 'Gas' : 'Electricity'} standing charge</td><td>${before ? pence(before[f].standing) + '/day' : ''}</td><td><strong>${pence(now[f].standing)}/day</strong></td></tr>`).join('')}
              <tr class="hl"><td>Typical yearly bill</td><td>${energyBefore ? `£${nf(Math.round(energyBefore))}` : ''}</td><td>£${nf(Math.round(energyNow))}</td></tr>
            </tbody></table></div>
          <p class="small muted" style="margin:12px 0 0">The cap limits the <em>rates</em> suppliers can charge on standard variable tariffs — not your total bill, which depends on how much you use. These are Great Britain averages for Direct Debit; rates vary by region and payment method. The typical bill uses Ofgem's typical usage of ${nf(use.electricity)} kWh of electricity and ${nf(use.gas)} kWh of gas a year. ${esc(cap.notes)}</p>
          ${capSource()}
        </div>
        <div class="card">
          <h3>Work out your own energy cost</h3>
          <p class="small muted">Find your yearly usage (in kWh) on a recent bill or annual statement.</p>
          <label class="calc-row"><span>Electricity a year</span><span class="tax-input"><input id="useElec" type="number" min="0" step="100" value="${use.electricity}" inputmode="numeric"><span class="small muted">kWh</span></span></label>
          <label class="calc-row"><span>Gas a year</span><span class="tax-input"><input id="useGas" type="number" min="0" step="100" value="${use.gas}" inputmode="numeric"><span class="small muted">kWh</span></span></label>
          <div id="calcOut" class="calc-out"></div>
        </div>
      </div>
    </section>` : ''}

    <section class="section">
      <div class="section-head"><div><span class="kicker">By region</span><h2>Average energy bills where you live, ${esc(b.energyByRegion.electricity.year)}</h2></div>
        <div class="controls">
          <div class="seg" id="fuelSeg"><button type="button" data-v="electricity" aria-pressed="true">Electricity</button><button type="button" data-v="gas" aria-pressed="false">Gas</button></div>
          <select class="select" id="payPick" aria-label="Payment method"></select>
        </div></div>
      <div class="card chart-card"><div class="chart" id="regionBills"></div>
        <p class="small muted" id="regionNote" style="margin:10px 0 0"></p>
        ${regionSource()}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Water</span><h2>Average water bills by company, ${esc(w.years[0])}</h2></div>
        <div class="seg" id="waterSeg"><button type="button" data-v="combined" aria-pressed="true">Both</button><button type="button" data-v="water" aria-pressed="false">Water</button><button type="button" data-v="sewerage" aria-pressed="false">Sewerage</button></div></div>
      <div class="grid two">
        <div class="card chart-card"><div class="chart" id="waterBars"></div>${waterSource()}</div>
        <div class="card chart-card"><h3>The average bill over time</h3><div class="chart" id="waterTrend"></div>
          <p class="small muted" style="margin:10px 0 0">Water bills are capped by Ofwat for five years at a time.${w.years.includes('2025-26') ? ' The big jump in April 2025 came from the 2025–2030 settlement, which allowed companies to raise bills to pay for investment in pipes, reservoirs and cutting sewage spills.' : ''}</p>
          ${waterSource()}</div>
      </div>
      <div class="callout small"><p><strong>Scotland and Northern Ireland:</strong> in Scotland, water and sewerage charges are collected with Council Tax (by Scottish Water); in Northern Ireland, households don't pay separate water charges. Some companies supply only water and others only sewerage, so your two bills may come from different companies.</p></div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Over time</span><h2>How much have bills really gone up?</h2></div><span class="small muted">Prices compared with 2015 (2015 = 100)</span></div>
      <div class="card chart-card"><div class="chart" id="priceTrend">${loading('Loading price indices from the ONS…')}</div>
        <p class="small muted" style="margin:10px 0 0">A value of 200 means prices have doubled since 2015. “All prices” is the Consumer Prices Index (CPI), the government's main measure of inflation — compare it with the energy and water lines to see whether bills have risen faster than prices in general.</p>
        ${sourceLine({ name: 'ONS Consumer Price Inflation (series D7DT, D7DU, D7DR, D7BT)', url: `${ONS_SITE}/economy/inflationandpriceindices/timeseries/d7dt/mm23` })}</div>
    </section>`;

  // ---- calculator
  const drawCalc = () => {
    if (!cap) return;
    const e = Math.max(0, Number(document.getElementById('useElec').value) || 0);
    const g = Math.max(0, Number(document.getElementById('useGas').value) || 0);
    const ec = yearCost(now.electricity.unit, now.electricity.standing, e), gc = yearCost(now.gas.unit, now.gas.standing, g);
    document.getElementById('calcOut').innerHTML = `
      <div class="mb-row"><span>Electricity</span><b>£${nf(ec, 0)}/yr</b></div>
      <div class="mb-row"><span>Gas</span><b>£${nf(gc, 0)}/yr</b></div>
      <div class="calc-total"><span>Total</span><b>£${nf(ec + gc, 0)} a year · £${nf((ec + gc) / 12, 0)} a month</b></div>
      <p class="small muted" style="margin:8px 0 0">At the ${esc(now.period)} price cap rates, including standing charges.</p>`;
  };
  if (cap) ['useElec', 'useGas'].forEach(id => document.getElementById(id).addEventListener('input', drawCalc));

  // ---- regional energy bills
  let fuel = 'electricity';
  const payPick = document.getElementById('payPick');
  const fillPay = () => {
    const types = Object.keys(Object.values(b.energyByRegion[fuel].regions)[0] || {});
    const keep = payPick.value;
    payPick.innerHTML = types.map(t => `<option value="${esc(t)}">${esc(t === 'Overall' ? 'All payment methods' : t)}</option>`).join('');
    payPick.value = types.includes(keep) ? keep : (types.includes('Direct debit') ? 'Direct debit' : types[0]);
  };
  const drawRegions = () => {
    const d = b.energyByRegion[fuel];
    const t = payPick.value;
    const rows = Object.entries(d.regions).filter(([, v]) => v[t] != null)
      .map(([r, v]) => ({ label: r, value: v[t], highlight: /^(United Kingdom|Great Britain|UK|GB)/i.test(r) })).sort((a, z) => z.value - a.value);
    Charts.bars(document.getElementById('regionBills'), { rows, format: v => `£${nf(v)}`, valueName: `${t} bill, ${d.year}` });
    document.getElementById('regionNote').textContent = `Average yearly ${fuel} bill in ${d.year}, assuming a home uses ${nf(d.consumptionKwh)} kWh a year (the government's standard figure for these tables, so it differs from Ofgem's typical usage above). Includes standing charges and VAT.${fuel === 'gas' ? ' Northern Ireland\'s gas market is separate and isn\'t included.' : ''}`;
  };
  document.getElementById('fuelSeg').addEventListener('click', e => {
    const x = e.target.closest('button'); if (!x) return;
    fuel = x.dataset.v;
    e.currentTarget.querySelectorAll('button').forEach(y => y.setAttribute('aria-pressed', y === x));
    fillPay(); drawRegions();
  });
  payPick.addEventListener('change', drawRegions);

  // ---- water
  let waterKind = 'combined';
  const drawWater = () => {
    const rows = Object.entries(w[waterKind]).filter(([n, v]) => n !== 'Average' && v[0] != null)
      .map(([n, v]) => ({ label: n, value: v[0], tip: v[1] ? `${w.years[1]}: £${nf(v[1])} (${v[0] >= v[1] ? '+' : '−'}${nf(Math.abs(v[0] / v[1] - 1) * 100, 0)}%)` : '' }));
    if (w[waterKind].Average?.[0]) rows.push({ label: 'Average', value: w[waterKind].Average[0], highlight: true });
    rows.sort((a, z) => z.value - a.value);
    Charts.bars(document.getElementById('waterBars'), { rows, format: v => `£${nf(v)}`, valueName: `Average ${waterKind === 'combined' ? 'water and sewerage' : waterKind} bill, ${w.years[0]}` });
    const avg = w[waterKind].Average || [];
    Charts.line(document.getElementById('waterTrend'), {
      labels: [...w.years].reverse(), height: 220, format: v => `£${nf(v)}`, axisFormat: v => `£${nf(v)}`,
      series: [{ name: 'Average bill', color: 'var(--series-3)', values: [...avg].reverse() }], ariaLabel: 'Average water bill over time',
    });
  };
  document.getElementById('waterSeg').addEventListener('click', e => {
    const x = e.target.closest('button'); if (!x) return;
    waterKind = x.dataset.v;
    e.currentTarget.querySelectorAll('button').forEach(y => y.setAttribute('aria-pressed', y === x));
    drawWater();
  });

  // ---- price indices since 2015 (live from the ONS)
  let priceSeries = null;
  const drawPrices = () => {
    if (!priceSeries) return;
    Charts.line(document.getElementById('priceTrend'), {
      labels: priceSeries.labels, format: v => nf(v, 1), shortLabel: l => l.slice(-4), series: priceSeries.series, ariaLabel: 'Energy and water prices since 2015',
    });
  };
  Promise.all(PRICE_SERIES.map(s => api(`/api/ons/site/economy/inflationandpriceindices/timeseries/${s.cdid}/mm23/data`)))
    .then(all => {
      const months = all[0].months.filter(m => Number(m.year) >= 2015);
      const labels = months.map(m => niceDate(m.date));
      priceSeries = { labels, series: all.map((d, i) => {
        const byDate = Object.fromEntries(d.months.map(m => [m.date, Number(m.value)]));
        return { name: PRICE_SERIES[i].name, color: PRICE_SERIES[i].color, values: months.map(m => byDate[m.date] ?? null) };
      }) };
      const last = s => s.values[s.values.length - 1];
      const [elec, , , cpi] = priceSeries.series;
      document.getElementById('sinceValue').textContent = `+${nf(last(elec) - 100, 0)}%`;
      document.getElementById('sinceMeta').textContent = `Electricity prices since 2015, compared with +${nf(last(cpi) - 100, 0)}% for prices in general (ONS, ${labels[labels.length - 1]})`;
      drawPrices();
    })
    .catch(() => { document.getElementById('priceTrend').innerHTML = '<p class="small muted">Couldn\'t load price indices from the ONS right now.</p>'; document.getElementById('sinceValue').textContent = '–'; });

  const drawAll = () => { drawRegions(); drawWater(); drawPrices(); };
  fillPay(); drawCalc(); drawAll();
  onRedraw(drawAll);
}
