// "Fuel prices": weekly UK average pump prices for petrol and diesel since 2003 (DESNZ, built
// into data/fuel.json), what a litre is made of (duty, VAT, the rest), and a running-cost
// calculator. Prices in today's money use the ONS CPI index (D7BT), live.

const fuelData = () => getJSON('data/fuel.json');
const CPI_INDEX = '/economy/inflationandpriceindices/timeseries/d7bt/mm23';
const FUEL_KEY = 'fuelCalc.v1';

async function fuelPage() {
  setTitle('Fuel prices');
  view.innerHTML = loading('Loading pump prices…');
  const [f, cpi] = await Promise.all([fuelData(), api(`/api/ons/site${CPI_INDEX}/data`)]);
  const n = f.dates.length, L = n - 1;
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const cpiM = Object.fromEntries(cpi.months.filter(m => m.value !== '').map(m => [m.date, Number(m.value)]));
  const cpiKeys = Object.keys(cpiM);
  const cpiLatest = cpiM[cpiKeys[cpiKeys.length - 1]];
  const cpiAt = iso => cpiM[`${iso.slice(0, 4)} ${MON[Number(iso.slice(5, 7)) - 1]}`] ?? cpiLatest;
  const real = (v, iso) => v * cpiLatest / cpiAt(iso);

  const day = iso => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const pp = v => `${nf(v, 1)}p`;
  const signP = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf(Math.abs(v), 1)}p`;
  const weeksAgo = k => Math.max(0, L - k);
  const yearAgo = f.dates.findIndex(dt => dt >= `${Number(f.dates[L].slice(0, 4)) - 1}${f.dates[L].slice(4)}`);
  const peakOf = k => f[k].reduce((b, v, i) => (v > f[k][b] ? i : b), 0);
  const realPeakOf = k => f[k].reduce((b, v, i) => (real(v, f.dates[i]) > real(f[k][b], f.dates[b]) ? i : b), 0);
  const fuels = [
    { key: 'petrol', name: 'Petrol (unleaded)', duty: 'dutyPetrol', colour: 'var(--series-3)' },
    { key: 'diesel', name: 'Diesel', duty: 'dutyDiesel', colour: 'var(--series-1)' },
  ];
  const src = sourceLine({ name: f.source.title, url: f.source.page, extra: `Week of ${esc(day(f.dates[L]))}` });
  const tank = 55;

  const statCard = fu => {
    const v = f[fu.key][L], wk = v - f[fu.key][weeksAgo(1)], yr = v - f[fu.key][yearAgo];
    const pk = peakOf(fu.key), isRecord = pk === L || pk >= L - 3;
    return `<div class="card stat fuel-stat"><div class="label">${esc(fu.name)}</div><div class="value">${pp(v)}<small> a litre</small></div>
      <div class="meta">${signP(wk)} on the week · ${signP(yr)} on a year ago</div>
      <div class="change">${isRecord ? `<span class="badge warn">Record high: ${pp(f[fu.key][pk])} on ${esc(day(f.dates[pk]))}</span>` : `Record: ${pp(f[fu.key][pk])} (${esc(day(f.dates[pk]))})`}</div>
      <div class="meta">${tank}-litre tank: <strong>£${nf(v * tank / 100, 2)}</strong></div></div>`;
  };

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Bills &amp; cost of living</span><h1>How much is fuel?</h1>
      <p class="lead">The average price of petrol and diesel at UK pumps every week since ${esc(f.dates[0].slice(0, 4))}, how much of each litre is tax, and what driving costs you.</p></div>

    <div class="grid">${fuels.map(statCard).join('')}
      <div class="card stat"><div class="label">Fuel duty</div><div class="value">${nf(f.dutyPetrol[L], 2)}p<small> a litre</small></div><div class="meta">Same for petrol and diesel${f.dutyPetrol[L] < 57.95 ? ` · cut from 57.95p in March 2022` : ''}</div></div>
      <div class="card stat"><div class="label">Diesel vs petrol</div><div class="value">${signP(f.diesel[L] - f.petrol[L])}</div><div class="meta">Diesel’s extra cost a litre this week</div></div>
    </div>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Over time</span><h2>Pump prices since ${esc(f.dates[0].slice(0, 4))}</h2></div>
        <div class="fuel-controls"><div class="seg" id="fuelRange"><button type="button" data-v="52" aria-pressed="false">1 year</button><button type="button" data-v="260" aria-pressed="false">5 years</button><button type="button" data-v="all" aria-pressed="true">All</button></div>
          <div class="seg" id="fuelReal"><button type="button" data-v="cash" aria-pressed="true">Price at the time</button><button type="button" data-v="real" aria-pressed="false">In today’s money</button></div></div></div>
      <div class="card chart-card"><div class="chart" id="fuelChart"></div>
        <p class="small muted" id="fuelNote" style="margin:10px 0 0"></p>
        ${src}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Where your money goes</span><h2>What’s in a litre?</h2></div></div>
      <div class="card"><div id="litre"></div>
        <p class="small muted" style="margin:10px 0 0">Fuel duty is a fixed amount per litre. VAT (${nf(f.vat[L], 0)}%) is charged on top of the price <em>including</em> duty. The rest pays for the fuel itself, refining, delivery and the retailer’s margin.</p>
        ${src}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Your driving</span><h2>What does fuel cost you?</h2></div></div>
      <div class="card fuel-calc">
        <div class="calc-inputs">
          <label>Fuel<select class="select" id="calcFuel"><option value="petrol">Petrol</option><option value="diesel">Diesel</option></select></label>
          <label>Miles a year<input class="select" id="calcMiles" type="number" min="0" step="500" inputmode="numeric"></label>
          <label>Miles per gallon (mpg)<input class="select" id="calcMpg" type="number" min="5" step="1" inputmode="numeric"></label>
        </div>
        <div class="basket-total" id="calcOut"></div>
        <p class="small muted" style="margin:10px 0 0">Uses this week’s UK average pump price. Change the miles and mpg to match your car — your car’s handbook or dashboard shows its mpg. 1 gallon = 4.546 litres.</p>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Read this fairly</span><h2>Making sense of fuel prices</h2></div></div>
      <div class="grid two">
        <div class="card claim"><h3>Records in pence aren’t always records</h3><p>Prices are higher in pence than 20 years ago partly because everything costs more. Switch the chart to <strong>today’s money</strong> to compare fairly: in today’s money, petrol peaked at ${pp(real(f.petrol[realPeakOf('petrol')], f.dates[realPeakOf('petrol')]))} (${esc(day(f.dates[realPeakOf('petrol')]))}) and diesel at ${pp(real(f.diesel[realPeakOf('diesel')], f.dates[realPeakOf('diesel')]))} (${esc(day(f.dates[realPeakOf('diesel')]))}).</p></div>
        <div class="card claim"><h3>${nf((f.dutyPetrol[L] + f.petrol[L] * f.vat[L] / (100 + f.vat[L])) / f.petrol[L] * 100, 0)}% of a litre of petrol is tax</h3><p>This week ${nf((f.dutyPetrol[L] + f.petrol[L] * f.vat[L] / (100 + f.vat[L])) / f.petrol[L] * 100, 0)}% of the petrol price is duty and VAT. Duty is the same per litre whatever the price, so tax is a smaller share when prices are high.</p></div>
        <div class="card claim"><h3>Pump prices lag oil prices</h3><p>Prices at the pump depend on oil prices, the pound–dollar exchange rate and refinery costs, and usually follow wholesale costs with a delay of a few weeks.</p></div>
        <div class="card claim"><h3>A national average</h3><p>These are average prices across UK filling stations. Supermarket forecourts are often cheaper; motorway services and rural areas usually cost more.</p></div>
      </div>
    </section>`;

  // ---- chart
  let range = 'all', mode = 'cash';
  const drawChart = () => {
    const from = range === 'all' ? 0 : Math.max(0, n - Number(range));
    const ds = f.dates.slice(from);
    Charts.line(document.getElementById('fuelChart'), {
      labels: ds.map(day), shortLabel: l => (range === '52' ? l.replace(/^\d+ /, '') : l.slice(-4)),
      series: fuels.map(fu => ({ name: fu.name, color: fu.colour, values: f[fu.key].slice(from).map((v, i) => (mode === 'real' ? real(v, ds[i]) : v)) })),
      format: pp, ariaLabel: 'Petrol and diesel prices over time',
    });
    document.getElementById('fuelNote').textContent = mode === 'real'
      ? `Pence per litre, adjusted to ${cpiKeys[cpiKeys.length - 1].toLowerCase().replace(/^(\d{4}) (\w)(\w+)$/, (_, y, a, b) => `${a.toUpperCase()}${b} ${y}`)} prices using the ONS Consumer Prices Index (CPI), so different years can be compared fairly.`
      : 'Average UK pump price in pence per litre at the time, including duty and VAT.';
  };
  const seg = (id, set) => document.getElementById(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    set(b.dataset.v); drawChart();
  });
  seg('fuelRange', v => { range = v; });
  seg('fuelReal', v => { mode = v; });

  // ---- what's in a litre
  document.getElementById('litre').innerHTML = fuels.map(fu => {
    const price = f[fu.key][L], duty = f[fu.duty][L], vat = price * f.vat[L] / (100 + f.vat[L]), rest = price - duty - vat;
    const parts = [['Fuel duty', duty, 'var(--series-2)'], ['VAT', vat, 'var(--series-4)'], ['Fuel, refining, delivery & retailer', rest, 'var(--series-1)']];
    return `<div class="litre-row"><div class="type-name">${esc(fu.name)}<small>${pp(price)} a litre</small></div>
      <div><div class="type-bar litre-bar" role="img" aria-label="${esc(parts.map(([l, v]) => `${l} ${pp(v)}`).join(', '))}">${parts.map(([l, v, c]) => `<span style="width:${v / price * 100}%;background:${c}" title="${esc(l)}: ${pp(v)}"></span>`).join('')}</div>
      <div class="type-key">${parts.map(([l, v, c]) => `<span><i style="background:${c}"></i>${esc(l)}: <b>${pp(v)}</b> (${nf(v / price * 100, 0)}%)</span>`).join('')}</div></div></div>`;
  }).join('');

  // ---- calculator (remembered in this browser only)
  let calc = { fuel: 'petrol', miles: 7000, mpg: 45 };
  try { calc = { ...calc, ...JSON.parse(localStorage.getItem(FUEL_KEY) || '{}') }; } catch { }
  const els = { fuel: document.getElementById('calcFuel'), miles: document.getElementById('calcMiles'), mpg: document.getElementById('calcMpg') };
  els.fuel.value = calc.fuel; els.miles.value = calc.miles; els.mpg.value = calc.mpg;
  const drawCalc = () => {
    calc = { fuel: els.fuel.value, miles: Math.max(0, Number(els.miles.value) || 0), mpg: Math.max(1, Number(els.mpg.value) || 1) };
    try { localStorage.setItem(FUEL_KEY, JSON.stringify(calc)); } catch { }
    const litres = calc.miles / calc.mpg * 4.546;
    const now = litres * f[calc.fuel][L] / 100, before = litres * f[calc.fuel][yearAgo] / 100;
    document.getElementById('calcOut').innerHTML = `
      <div><span class="label">A year’s fuel</span><b>£${nf(now, 0)}</b><small>${nf(litres, 0)} litres · about £${nf(now / 12, 0)} a month</small></div>
      <div><span class="label">Cost per mile</span><b>${pp(f[calc.fuel][L] * 4.546 / calc.mpg)}</b><small>at ${pp(f[calc.fuel][L])} a litre</small></div>
      <div><span class="label">vs prices a year ago</span><b class="${now > before ? 'up' : 'down'}">${now >= before ? '+' : '−'}£${nf(Math.abs(now - before), 0)}</b><small>a year, at ${pp(f[calc.fuel][yearAgo])} a litre (${esc(day(f.dates[yearAgo]))})</small></div>`;
  };
  Object.values(els).forEach(el => el.addEventListener('input', drawCalc));
  drawCalc();

  drawChart();
  onRedraw(drawChart);
}
