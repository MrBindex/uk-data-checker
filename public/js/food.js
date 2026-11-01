// "Cost of the food shop": average shop prices for about 200 grocery items (ONS Shopping
// Prices Comparison Tool data, built into data/food.json) and food inflation (ONS CPI, live).

const foodData = () => getJSON('data/food.json');
const FOOD_SERIES = {
  foodRate: '/economy/inflationandpriceindices/timeseries/d7g8/mm23',
  allRate: '/economy/inflationandpriceindices/timeseries/d7g7/mm23',
  foodIndex: '/economy/inflationandpriceindices/timeseries/d7bu/mm23',
  allIndex: '/economy/inflationandpriceindices/timeseries/d7bt/mm23',
};
// A typical weekly shop, used until the visitor changes it. Quantities are in the item's unit.
const DEFAULT_BASKET = [
  ['Bread - sliced white', 1], ["Milk - cow's (semi-skimmed, fresh)", 2], ['Eggs - free-range', 1],
  ['Butter - dairy (block or tub)', 1], ['Cheese - Cheddar', 0.5], ['Bananas', 1], ['Apples - not cooking', 1],
  ['Potatoes - white', 2], ['Tomatoes', 0.5], ['Onions', 1], ['Chicken - fillet or steak', 1], ['Beef - minced or diced', 0.5],
  ['Pasta - dry', 1], ['Rice - basmati or jasmine', 1], ['Baked beans', 2], ['Tomatoes - canned or jarred', 2],
  ['Tea - unflavoured, bags', 1], ['Coffee - instant', 1],
];
const BASKET_KEY = 'foodBasket.v1';

async function foodPage() {
  setTitle('Cost of the food shop');
  view.innerHTML = loading('Loading food prices from the ONS…');
  const [d, foodRate, allRate, foodIndex, allIndex] = await Promise.all([
    foodData(), ...Object.values(FOOD_SERIES).map(u => api(`/api/ons/site${u}/data`)),
  ]);
  const months = d.months, L = months.length - 1, Y = L - 12;
  const monthName = k => new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const unit = s => ({ '1000 g': 'per kg', '1000 ml': 'per litre', each: 'each' }[s] || (s ? s.replace(/^(\d+) (g|ml)$/, '$1$2') : ''));
  const qtyUnit = s => ({ '1000 g': 'kg', '1000 ml': 'litre' }[s] || '×');
  const p = v => (v == null ? '–' : v < 1 ? `${nf(v * 100, 0)}p` : `£${nf(v, 2)}`);
  const pct = v => (v == null || !isFinite(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf(Math.abs(v), 1)}%`);
  const byName = Object.fromEntries(d.items.map(i => [i.name, i]));
  const yearChange = i => (i.prices[Y] && i.prices[L] ? (i.prices[L] / i.prices[Y] - 1) * 100 : null);

  // ONS series helpers (blank values skipped)
  const monthly = s => s.months.filter(m => m.value !== '' && isFinite(Number(m.value))).map(m => ({ date: m.date, v: Number(m.value) }));
  const fr = monthly(foodRate), ar = monthly(allRate), fi = monthly(foodIndex), ai = monthly(allIndex);
  const lastF = fr[fr.length - 1], lastA = ar[ar.length - 1];
  const idxAgo = (s, n) => s[s.length - 1 - n]?.v;
  const food5 = (fi[fi.length - 1].v / idxAgo(fi, 60) - 1) * 100, all5 = (ai[ai.length - 1].v / idxAgo(ai, 60) - 1) * 100;
  const peak = fr.reduce((m, x) => (x.v > m.v ? x : m), fr[0]);
  const onsMonth = k => k.replace(/^(\d{4}) (\w)(\w+)$/, (_, y, a, b) => `${a}${b.toLowerCase()} ${y}`);
  const onsSrc = sourceLine({ name: 'ONS Consumer Price Inflation (series D7G8, D7G7, D7BU, D7BT)', url: ONS_SITE + FOOD_SERIES.foodRate, released: date(foodRate.description.releaseDate) });
  const shopSrc = sourceLine({ name: d.source.title, url: d.source.page, extra: `Prices to ${esc(monthName(months[L]))}` });

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Bills &amp; cost of living</span><h1>What does the food shop cost?</h1>
      <p class="lead">Average UK shop prices for around 200 everyday grocery items, collected by the ONS for its inflation figures — and how fast food prices are rising compared with everything else.</p></div>

    <div class="grid">
      <div class="card stat"><div class="label">Food price inflation</div><div class="value">${nf(lastF.v, 1)}%</div><div class="meta">${esc(onsMonth(lastF.date))} · food and soft drinks vs a year earlier</div></div>
      <div class="card stat"><div class="label">All prices (CPI)</div><div class="value">${nf(lastA.v, 1)}%</div><div class="meta">${lastF.v > lastA.v ? 'Food is rising faster than prices overall' : 'Food is rising more slowly than prices overall'}</div></div>
      <div class="card stat"><div class="label">Food vs five years ago</div><div class="value">${pct(food5)}</div><div class="meta">All prices: ${pct(all5)} over the same five years</div></div>
      <div class="card stat"><div class="label">Peak food inflation</div><div class="value">${nf(peak.v, 1)}%</div><div class="meta">${esc(onsMonth(peak.date))}</div></div>
    </div>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Your shop</span><h2>Build your basket</h2></div>
        <button type="button" class="btn ghost" id="basketReset">Reset to typical shop</button></div>
      <div class="card">
        <div class="basket-total" id="basketTotal"></div>
        <div class="table-wrap"><table class="data basket" id="basketTable"></table></div>
        <div class="basket-add"><label for="basketSearch" class="small muted">Add an item</label>
          <input class="select" id="basketSearch" list="foodItems" placeholder="Search, e.g. cheese, rice, coffee…" autocomplete="off">
          <datalist id="foodItems">${d.items.map(i => `<option value="${esc(i.name)}">${esc(i.cat)} · ${esc(unit(i.size))}</option>`).join('')}</datalist></div>
        <p class="small muted" style="margin:10px 0 0">Average prices paid across UK shops, including supermarkets and smaller stores, for a typical product of each type — your own shop may cost more or less. Prices for items sold by weight (e.g. cheese, mince) are per kilogram, so set the amount you buy.</p>
        ${shopSrc}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Over the last year</span><h2>Biggest price rises and falls</h2></div>
        <div class="seg" id="moverSeg"><button type="button" data-v="up" aria-pressed="true">Rises</button><button type="button" data-v="down" aria-pressed="false">Falls</button></div></div>
      <div class="card chart-card"><div class="chart" id="movers"></div>
        <p class="small muted" style="margin:10px 0 0">Change in average price from ${esc(monthName(months[Y]))} to ${esc(monthName(months[L]))}. Click an item to see its price each month.</p>
        ${shopSrc}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">By aisle</span><h2>Typical price change by type of food</h2></div></div>
      <div class="card chart-card"><div class="chart" id="aisles"></div>
        <p class="small muted" style="margin:10px 0 0">The middle (median) change across the items in each group, ${esc(monthName(months[Y]))} to ${esc(monthName(months[L]))}.</p>
        ${shopSrc}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">One item</span><h2 id="itemTitle">Price each month</h2></div>
        <select class="select" id="itemPick" aria-label="Choose an item">${[...new Set(d.items.map(i => i.cat))].map(c => `<optgroup label="${esc(c)}">${d.items.filter(i => i.cat === c).map(i => `<option>${esc(i.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="card chart-card"><div class="chart" id="itemChart"></div><p class="small muted" id="itemNote" style="margin:10px 0 0"></p>${shopSrc}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Over time</span><h2>Food inflation vs all prices</h2></div>
        <div class="seg" id="infSeg"><button type="button" data-v="10" aria-pressed="true">10 years</button><button type="button" data-v="all" aria-pressed="false">Since ${esc(fr[0].date.slice(0, 4))}</button></div></div>
      <div class="card chart-card"><div class="chart" id="infChart"></div>
        <p class="small muted" style="margin:10px 0 0">How much prices rose compared with the same month a year before. Food means food and non-alcoholic drinks bought to eat at home.</p>
        ${onsSrc}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Read this fairly</span><h2>What these prices mean</h2></div></div>
      <div class="grid two">
        <div class="card claim"><h3>Lower inflation doesn’t mean lower prices</h3><p>When food inflation falls from ${nf(peak.v, 0)}% (its peak) to ${nf(lastF.v, 1)}%, prices are still <strong>rising</strong> — just more slowly. Food is ${pct(food5)} dearer than five years ago.</p></div>
        <div class="card claim"><h3>Averages across all shops</h3><p>These are average prices across many shops and brands, so they won’t match one supermarket’s shelf price, and they don’t include loyalty-card or multi-buy deals.</p></div>
        <div class="card claim"><h3>Why the item list starts in 2025</h3><p>The ONS changed how it collects and publishes these average prices in 2025, so the item prices here start in January 2025 and can’t be compared with its older figures. Food inflation (the chart above) goes back much further.</p></div>
        <div class="card claim"><h3>Pack sizes change</h3><p>Prices are compared for the same amount of product, so “shrinkflation” — a smaller pack for the same price — shows up as a price rise.</p></div>
      </div>
    </section>`;

  // ---- basket (remembered in this browser only)
  let basket;
  try { basket = JSON.parse(localStorage.getItem(BASKET_KEY)); } catch { }
  if (!Array.isArray(basket)) basket = DEFAULT_BASKET.map(([name, qty]) => ({ name, qty }));
  basket = basket.filter(b => byName[b.name]);
  const save = () => { try { localStorage.setItem(BASKET_KEY, JSON.stringify(basket)); } catch { } };
  const drawBasket = () => {
    let now = 0, ago = 0;
    const rows = basket.map((b, k) => {
      const it = byName[b.name], pn = it.prices[L], pa = it.prices[Y];
      now += pn * b.qty; if (pa != null) ago += pa * b.qty; else ago += pn * b.qty;
      const ch = yearChange(it);
      return `<tr><td>${esc(it.name)}<div class="small muted">${esc(it.cat)} · ${esc(unit(it.size))}</div></td>
        <td>${p(pn)}</td><td class="${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}">${pct(ch)}</td>
        <td><div class="qty"><button type="button" data-k="${k}" data-d="-1" aria-label="Less ${esc(it.name)}">−</button><span>${nf(b.qty, b.qty % 1 ? 1 : 0)}${qtyUnit(it.size) === '×' ? '' : ` ${qtyUnit(it.size)}`}</span><button type="button" data-k="${k}" data-d="1" aria-label="More ${esc(it.name)}">+</button></div></td>
        <td><strong>${p(pn * b.qty)}</strong></td><td><button type="button" class="link-btn" data-rm="${k}" aria-label="Remove ${esc(it.name)}">Remove</button></td></tr>`;
    });
    document.getElementById('basketTable').innerHTML = `<thead><tr><th>Item</th><th>Price now</th><th>vs a year ago</th><th>Amount</th><th>Cost</th><th></th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="6" class="muted">Your basket is empty — add an item below.</td></tr>'}</tbody>`;
    const ch = ago ? (now / ago - 1) * 100 : null;
    document.getElementById('basketTotal').innerHTML = `
      <div><span class="label">Your basket now</span><b>£${nf(now, 2)}</b><small>${esc(monthName(months[L]))}</small></div>
      <div><span class="label">Same basket a year ago</span><b>£${nf(ago, 2)}</b><small>${esc(monthName(months[Y]))}</small></div>
      <div><span class="label">Change</span><b class="${ch > 0 ? 'up' : 'down'}">${ch == null ? '–' : `${ch >= 0 ? '+' : '−'}£${nf(Math.abs(now - ago), 2)}`}</b><small>${pct(ch)} · about £${nf(Math.abs(now - ago) * 52, 0)} a year if bought weekly</small></div>`;
  };
  // Items sold by weight or volume (priced per kg or litre) go up in halves; packs in whole numbers.
  const step = (qty, size) => (qtyUnit(size) === '×' ? 1 : qty < 1 ? 0.25 : qty < 2 ? 0.5 : 1);
  document.getElementById('basketTable').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rm != null) basket.splice(Number(b.dataset.rm), 1);
    else {
      const it = basket[Number(b.dataset.k)], up = b.dataset.d === '1';
      const size = byName[it.name].size, s = up ? step(it.qty, size) : step(it.qty - 0.01, size);
      it.qty = Math.round((it.qty + (up ? s : -s)) * 100) / 100;
      if (it.qty <= 0) basket.splice(Number(b.dataset.k), 1);
    }
    save(); drawBasket();
  });
  const search = document.getElementById('basketSearch');
  const addFromSearch = () => {
    const it = byName[search.value.trim()];
    if (!it) return;
    const have = basket.find(b => b.name === it.name);
    if (have) have.qty += 1; else basket.push({ name: it.name, qty: 1 });
    search.value = ''; save(); drawBasket();
  };
  search.addEventListener('change', addFromSearch);
  search.addEventListener('keydown', e => { if (e.key === 'Enter') addFromSearch(); });
  document.getElementById('basketReset').addEventListener('click', () => { basket = DEFAULT_BASKET.map(([name, qty]) => ({ name, qty })); save(); drawBasket(); });

  // ---- movers
  let moverDir = 'up';
  const withChange = d.items.map(i => ({ i, ch: yearChange(i) })).filter(x => x.ch != null);
  const pickItem = name => {
    document.getElementById('itemPick').value = name; drawItem();
    document.getElementById('itemTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const drawMovers = () => {
    const list = [...withChange].sort((a, b) => (moverDir === 'up' ? b.ch - a.ch : a.ch - b.ch)).slice(0, 12);
    Charts.bars(document.getElementById('movers'), {
      rows: list.map(x => ({ label: x.i.name, value: x.ch, color: x.ch >= 0 ? 'var(--series-2)' : 'var(--series-3)', tip: `${p(x.i.prices[Y])} → ${p(x.i.prices[L])} (${esc(unit(x.i.size))})` })),
      format: pct, valueName: 'Change in a year', ariaLabel: 'Biggest food price changes', onSelect: r => pickItem(r.label),
    });
  };
  document.getElementById('moverSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    moverDir = b.dataset.v;
    e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    drawMovers();
  });

  // ---- aisles
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const drawAisles = () => {
    const cats = [...new Set(withChange.map(x => x.i.cat))].map(c => {
      const chs = withChange.filter(x => x.i.cat === c).map(x => x.ch);
      return { label: c, value: median(chs), tip: `${chs.length} items` };
    }).sort((a, b) => b.value - a.value);
    Charts.bars(document.getElementById('aisles'), { rows: cats.map(c => ({ ...c, color: c.value >= 0 ? 'var(--series-2)' : 'var(--series-3)' })), format: pct, valueName: 'Typical change in a year', ariaLabel: 'Price change by type of food' });
  };

  // ---- one item
  const pickSel = document.getElementById('itemPick');
  pickSel.value = 'Bread - sliced white';
  const drawItem = () => {
    const it = byName[pickSel.value];
    document.getElementById('itemTitle').textContent = `${it.name}: price each month`;
    Charts.line(document.getElementById('itemChart'), {
      labels: months.map(monthName), shortLabel: l => l.replace(/^(\w{3})\w* (\d{2})(\d{2})$/, '$1 $3'),
      series: [{ name: `${it.name} (${unit(it.size)})`, color: 'var(--series-1)', values: it.prices }],
      format: p, zero: true, ariaLabel: `${it.name} average price`,
    });
    const first = it.prices.findIndex(v => v != null);
    document.getElementById('itemNote').textContent = `Average price ${unit(it.size)}: ${p(it.prices[L])} in ${monthName(months[L])}, ${pct((it.prices[L] / it.prices[first] - 1) * 100)} since ${monthName(months[first])}${yearChange(it) != null ? `, ${pct(yearChange(it))} in a year` : ''}.`;
  };
  pickSel.addEventListener('change', drawItem);

  // ---- inflation over time
  let infRange = '10';
  const drawInf = () => {
    const keys = fr.map(x => x.date);
    const aMap = Object.fromEntries(ar.map(x => [x.date, x.v]));
    const from = infRange === 'all' ? 0 : Math.max(0, keys.length - 120);
    const ks = keys.slice(from);
    Charts.line(document.getElementById('infChart'), {
      labels: ks.map(k => k.replace(/^(\d{4}) (\w{3})$/, (_, y, m) => `${m[0]}${m.slice(1).toLowerCase()} ${y}`)),
      shortLabel: l => l.slice(-4),
      series: [{ name: 'Food prices', color: 'var(--series-2)', values: fr.slice(from).map(x => x.v) }, { name: 'All prices (CPI)', color: 'var(--series-1)', values: ks.map(k => aMap[k] ?? null) }],
      format: v => `${nf(v, 1)}%`, ariaLabel: 'Food inflation compared with CPI inflation',
    });
  };
  document.getElementById('infSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    infRange = b.dataset.v;
    e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    drawInf();
  });

  drawBasket();
  const drawAll = () => { drawMovers(); drawAisles(); drawItem(); drawInf(); };
  drawAll();
  onRedraw(drawAll);
}
