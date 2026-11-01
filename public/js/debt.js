// "Government debt" — how public sector net debt changed under each Prime Minister.
// Debt: ONS public sector finances (live): HF6W (£bn) and HF6X (% of GDP), excluding
// public sector banks. Prime Ministers' dates: UK Parliament Members API (government posts).

const DEBT_SERIES = {
  cash: '/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/hf6w/pusf',
  pct: '/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/hf6x/pusf',
};
// Dates as recorded by UK Parliament for the post "Prime Minister and First Lord of the Treasury".
// `end: null` = in office now. Update this list when the Prime Minister changes.
const PRIME_MINISTERS = [
  { name: 'Harold Wilson', party: 'Labour', start: '1974-02-28', end: '1976-04-05' },
  { name: 'James Callaghan', party: 'Labour', start: '1976-04-05', end: '1979-05-03' },
  { name: 'Margaret Thatcher', party: 'Conservative', start: '1979-05-04', end: '1990-11-28' },
  { name: 'John Major', party: 'Conservative', start: '1990-11-28', end: '1997-05-02' },
  { name: 'Tony Blair', party: 'Labour', start: '1997-05-01', end: '2007-06-27' },
  { name: 'Gordon Brown', party: 'Labour', start: '2007-06-28', end: '2010-05-06' },
  { name: 'David Cameron', party: 'Conservative', note: 'in coalition with the Liberal Democrats, 2010–15', start: '2010-05-11', end: '2016-07-13' },
  { name: 'Theresa May', party: 'Conservative', start: '2016-07-13', end: '2019-07-24' },
  { name: 'Boris Johnson', party: 'Conservative', start: '2019-07-24', end: '2022-09-06' },
  { name: 'Liz Truss', party: 'Conservative', start: '2022-09-06', end: '2022-10-25' },
  { name: 'Rishi Sunak', party: 'Conservative', start: '2022-10-25', end: '2024-07-05' },
  { name: 'Keir Starmer', party: 'Labour', start: '2024-07-05', end: '2026-07-20' },
  { name: 'Andy Burnham', party: 'Labour', start: '2026-07-20', end: null },
];
const PARTY_COLOUR = { Labour: 'var(--party-lab)', Conservative: 'var(--party-con)' };
// Big events that explain sharp rises, shown on the chart and in each government's row.
const DEBT_EVENTS = [
  { date: '2008-09', label: 'Financial crisis', pm: 'Gordon Brown', text: 'The 2008 financial crisis caused a deep recession: tax income fell and spending on benefits rose. (The cost of rescuing the banks is mostly excluded from this measure.)' },
  { date: '2020-03', label: 'Pandemic', pm: 'Boris Johnson', text: 'The Covid-19 pandemic: furlough, business support and the NHS response, while lockdowns cut tax income.' },
];

const MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const monthKey = d => { const m = d.match(/^(\d{4}) ([A-Z]{3})$/); return m ? `${m[1]}-${String(MON[m[2]] + 1).padStart(2, '0')}` : null; };
const prevMonth = iso => { const [y, m] = iso.slice(0, 7).split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const monthLabel = k => new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

async function debtPage() {
  setTitle('Government debt');
  view.innerHTML = loading('Loading debt figures from the ONS…');
  const [cash, pct] = await Promise.all([api(`/api/ons/site${DEBT_SERIES.cash}/data`), api(`/api/ons/site${DEBT_SERIES.pct}/data`)]);

  // Values by month ("YYYY-MM"). The ONS has monthly figures from 1993; before that it
  // publishes one figure a year, for the end of March. Blank values are skipped — never read
  // as zero — and a date with no figure uses the nearest month that has one.
  const num = v => (v === '' || v == null || !isFinite(Number(v)) ? null : Number(v));
  const monthly = d => Object.fromEntries(d.months.map(m => [monthKey(m.date), num(m.value)]).filter(([k, v]) => k && v != null));
  const cashM = monthly(cash), pctM = monthly(pct);
  // Before 1993 the % of GDP series only has quarterly figures: file each under its quarter's last month.
  for (const q of pct.quarters) {
    const v = num(q.value), mq = q.date.match(/^(\d{4}) Q([1-4])$/);
    if (v == null || !mq) continue;
    const k = `${mq[1]}-${String(Number(mq[2]) * 3).padStart(2, '0')}`;
    if (pctM[k] == null) pctM[k] = v;
  }
  const months = Object.keys(cashM).sort();
  const pctMonths = Object.keys(pctM).sort();
  const latest = months[months.length - 1];
  const firstData = months[0];
  const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5)) - Number(a.slice(5));
  const nearest = (list, k) => list.reduce((best, x) => (Math.abs(monthsBetween(x, k)) < Math.abs(monthsBetween(best, k)) ? x : best), list[0]);
  const pctAt = k => (pctM[k] != null ? pctM[k] : pctM[nearest(pctMonths, k)]);

  // Each government: from the end of the month before taking office to the end of the month
  // before leaving (so periods join up exactly), or to the latest figures for the current one.
  const govs = PRIME_MINISTERS.map(p => {
    const wantFrom = prevMonth(p.start), wantTo = p.end ? prevMonth(p.end) : latest;
    const from = nearest(months, wantFrom < firstData ? firstData : wantFrom);
    const to = nearest(months, wantTo > latest ? latest : wantTo);
    if (to <= from) return null;
    const approx = from !== wantFrom || to !== wantTo;
    const years = ((p.end ? Date.parse(p.end) : Date.now()) - Date.parse(p.start)) / (365.25 * 864e5);
    const startPct = pctAt(from), endPct = pctAt(to);
    return { ...p, from, to, approx, years, startCash: cashM[from], endCash: cashM[to], added: cashM[to] - cashM[from], startPct, endPct, pctChange: startPct != null && endPct != null ? endPct - startPct : null, partial: p.start.slice(0, 7) < firstData };
  }).filter(Boolean);
  const current = govs[govs.length - 1];
  const fmtBn = v => `£${nf(Math.abs(v), Math.abs(v) < 100 ? 1 : 0)}bn`;
  const signedBn = v => `${v < 0 ? '−' : '+'}${fmtBn(v)}`;
  const signedPts = v => v == null ? '–' : `${v < 0 ? '−' : '+'}${nf(Math.abs(v), 1)} pts`;
  const byCash = [...govs].sort((a, b) => b.added - a.added);
  const byPct = [...govs].filter(g => g.pctChange != null).sort((a, b) => b.pctChange - a.pctChange);
  const src = () => sourceLine({ name: 'ONS public sector finances (series HF6W and HF6X)', url: ONS_SITE + DEBT_SERIES.cash, released: date(cash.description.releaseDate), extra: 'Prime Ministers\' dates: <a href="https://members.parliament.uk" target="_blank" rel="noopener">UK Parliament</a>' });

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Tax &amp; spending</span><h1>Which governments added to the national debt?</h1>
      <p class="lead">How much public sector debt rose or fell under every Prime Minister since ${esc(firstData.slice(0, 4))}, using the ONS's official figures — in pounds and, more fairly, as a share of the economy.</p></div>

    <div class="grid">
      <div class="card stat"><div class="label">National debt now</div><div class="value">${fmtBn(cashM[latest])}</div><div class="meta">${esc(monthLabel(latest))} · public sector net debt</div></div>
      <div class="card stat"><div class="label">As a share of the economy</div><div class="value">${nf(pctAt(latest), 1)}%</div><div class="meta">of GDP (everything the UK produces in a year)</div></div>
      <div class="card stat"><div class="label">Most added in pounds</div><div class="value">${esc(byCash[0].name)}</div><div class="meta">${signedBn(byCash[0].added)} (${esc(byCash[0].party)}) — but see the % of GDP view</div></div>
      <div class="card stat"><div class="label">Biggest rise as a share of GDP</div><div class="value">${esc(byPct[0].name)}</div><div class="meta">${signedPts(byPct[0].pctChange)} of GDP (${esc(byPct[0].party)})</div></div>
    </div>

    <div class="callout"><p><strong>Read this fairly:</strong> debt in pounds always tends to grow over time, because prices and the economy grow — so recent governments look worse in cash terms. The change in debt <em>as a share of GDP</em> is the fairer comparison. Governments also inherit plans and face events they didn't choose, such as the 2008 financial crisis and the Covid-19 pandemic.</p></div>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Over time</span><h2>The national debt since ${esc(firstData.slice(0, 4))}</h2></div>
        <div class="seg" id="debtSeg"><button type="button" data-v="pct" aria-pressed="true">% of GDP</button><button type="button" data-v="cash" aria-pressed="false">£ billion</button></div></div>
      <div class="card chart-card"><div class="chart" id="debtChart"></div>
        <div class="legend"><span><i style="background:var(--party-lab);height:10px"></i>Labour Prime Minister</span><span><i style="background:var(--party-con);height:10px"></i>Conservative Prime Minister</span></div>
        <p class="small muted" id="debtNote" style="margin:10px 0 0"></p>
        ${src()}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">By government</span><h2>Debt added under each Prime Minister</h2></div>
        <div class="seg" id="govSeg"><button type="button" data-v="pct" aria-pressed="true">Change in % of GDP</button><button type="button" data-v="cash" aria-pressed="false">£ billion added</button></div></div>
      <div class="card chart-card"><div class="chart" id="govBars"></div>
        <p class="small muted" id="govNote" style="margin:10px 0 0"></p>
        ${src()}</div>
      <div class="card section" style="margin-top:16px">
        <h3>All the figures</h3>
        <div class="table-wrap"><table class="data" id="govTable"></table></div>
        <p class="small muted" style="margin:10px 0 0">Measured from the end of the month before each Prime Minister took office to the end of the month before they left${current.end ? '' : ' (or the latest figures, for the current Prime Minister)'}. ${govs.some(g => g.partial) ? `ONS figures start in ${esc(monthLabel(firstData))}, so ${esc(govs.filter(g => g.partial).map(g => g.name).join(', '))}'s figures cover only part of their time in office.` : ''} Before 1993 the ONS publishes only one figure a year (for the end of March), so for those governments the nearest available month is used — shown under “In office”.</p>
        ${src()}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Context</span><h2>Why debt goes up (and sometimes down)</h2></div></div>
      <div class="grid two">
        <div class="card claim"><h3>Debt rises when the government borrows</h3><p>Every year spending is higher than tax and other income, the gap is borrowed and added to the debt. In a year with a surplus, debt can fall. See <a href="#/revenue">where the money comes from</a> and <a href="#/spending">where it goes</a>.</p></div>
        ${DEBT_EVENTS.map(e => `<div class="card claim"><h3>${esc(e.label)} (${esc(e.pm)})</h3><p>${esc(e.text)}</p></div>`).join('')}
        <div class="card claim"><h3>Why % of GDP is fairer</h3><p>£100bn meant much more in 1990 than today. Comparing debt with the size of the economy — what the country can afford to carry — removes the effect of inflation and growth.</p></div>
      </div>
    </section>`;

  // ---- debt over time, with each Prime Minister's time in office shaded
  let mode = 'pct';
  const drawDebt = () => {
    const box = document.getElementById('debtChart');
    const keys = mode === 'pct' ? pctMonths : months;
    const vals = keys.map(k => (mode === 'pct' ? pctM[k] : cashM[k]));
    debtChart(box, keys, vals, govs, mode === 'pct' ? (v => `${nf(v, 1)}%`) : (v => fmtBn(v)), mode === 'pct' ? (v => `${nf(v)}%`) : (v => `£${nf(v)}bn`));
    document.getElementById('debtNote').textContent = mode === 'pct'
      ? 'Public sector net debt as a percentage of GDP. Shading shows who was Prime Minister.'
      : 'Public sector net debt in pounds, not adjusted for inflation — so it rises over time even when debt is stable relative to the economy.';
  };
  document.getElementById('debtSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    mode = b.dataset.v;
    e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    drawDebt();
  });

  // ---- debt added per Prime Minister
  let govMode = 'pct';
  const drawGov = () => {
    const rows = govs.filter(g => govMode === 'cash' || g.pctChange != null).map(g => ({
      label: g.name, value: govMode === 'cash' ? g.added : g.pctChange, color: PARTY_COLOUR[g.party],
      tip: `${esc(g.party)} · ${esc(monthLabel(g.from))} to ${esc(monthLabel(g.to))} · ${nf(g.years, 1)} years`,
    }));
    Charts.bars(document.getElementById('govBars'), { rows, format: govMode === 'cash' ? signedBn : signedPts, valueName: govMode === 'cash' ? 'Debt added' : 'Change in debt, % of GDP' });
    document.getElementById('govNote').textContent = govMode === 'cash'
      ? 'Cash added to the debt while each Prime Minister was in office. Not adjusted for inflation, so later governments look bigger. Bars to the left mean debt fell.'
      : 'How much debt rose or fell as a share of the economy (percentage points of GDP) while each Prime Minister was in office. Bars to the left mean debt fell relative to the economy.';
  };
  document.getElementById('govSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    govMode = b.dataset.v;
    e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    drawGov();
  });

  document.getElementById('govTable').innerHTML = `<thead><tr><th>Prime Minister</th><th>Party</th><th>In office</th><th>Debt at start</th><th>Debt at end</th><th>Added (£)</th><th>Per year</th><th>% of GDP: start → end</th><th>Change</th></tr></thead>
    <tbody>${govs.map(g => `<tr${g === current && !g.end ? ' class="hl"' : ''}>
      <td>${esc(g.name)}${g.partial ? ' *' : ''}</td>
      <td><span class="party-dot" style="background:${PARTY_COLOUR[g.party]}"></span>${esc(g.party)}${g.note ? `<div class="small muted">${esc(g.note)}</div>` : ''}</td>
      <td>${esc(String(g.start).slice(0, 4))}–${g.end ? esc(g.end.slice(0, 4)) : 'now'}<div class="small muted">${nf(g.years, 1)} yrs${g.approx ? ` · figures for ${esc(monthLabel(g.from))} to ${esc(monthLabel(g.to))}` : ''}</div></td>
      <td>${fmtBn(g.startCash)}</td><td>${fmtBn(g.endCash)}</td><td><strong>${signedBn(g.added)}</strong></td>
      <td>${g.years >= 0.5 ? signedBn(g.added / g.years) : '–'}</td>
      <td>${g.startPct != null ? `${nf(g.startPct, 1)}% → ${nf(g.endPct, 1)}%` : '–'}</td><td><strong>${signedPts(g.pctChange)}</strong></td></tr>`).join('')}</tbody>`;

  const drawAll = () => { drawDebt(); drawGov(); };
  drawAll();
  onRedraw(drawAll);
}

// Line chart with shaded bands for each Prime Minister (coloured by party) and event markers.
function debtChart(box, keys, vals, govs, fmt, axisFmt) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, a, p) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); p?.appendChild(e); return e; };
  box.innerHTML = '';
  const W = Math.max(320, box.clientWidth || 700), H = W < 520 ? 260 : 340;
  const m = { t: 26, r: 14, b: 28, l: 58 };
  const hi = Math.max(...vals), top = (() => { const step = Math.pow(10, Math.floor(Math.log10(hi))) / 2; return Math.ceil(hi / step) * step; })();
  // A true time scale: early years have one figure a year, later ones twelve, so space by date.
  const mIdx = k => Number(k.slice(0, 4)) * 12 + Number(k.slice(5)) - 1;
  const t0 = mIdx(keys[0]), span = Math.max(1, mIdx(keys[keys.length - 1]) - t0);
  const xk = k => m.l + ((Math.min(Math.max(mIdx(k), t0), t0 + span) - t0) / span) * (W - m.l - m.r);
  const x = i => xk(keys[i]);
  const y = v => m.t + (1 - v / top) * (H - m.t - m.b);
  const idx = k => { let i = keys.indexOf(k); if (i < 0) i = keys.findIndex(kk => kk >= k); return i < 0 ? keys.length - 1 : i; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'National debt over time, shaded by Prime Minister' }, box);
  // party bands
  for (const g of govs) {
    const xa = xk(g.from), xb = xk(g.to);
    if (xb <= xa) continue;
    el('rect', { x: xa, y: m.t, width: Math.max(1, xb - xa), height: H - m.t - m.b, fill: PARTY_COLOUR[g.party], 'fill-opacity': 0.13 }, svg);
    if (xb - xa > 52) { // only label bands wide enough for the name
      const t = el('text', { x: (xa + xb) / 2, y: m.t - 8, 'text-anchor': 'middle', class: 'axis-label' }, svg);
      t.textContent = g.name.split(' ').pop();
    }
  }
  for (let i = 0; i <= 4; i++) {
    const v = top * i / 4;
    el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: i ? 'gridline' : 'zero' }, svg);
    el('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'axis-label' }, svg).textContent = axisFmt(v);
  }
  const y0 = Number(keys[0].slice(0, 4)), y1 = Number(keys[keys.length - 1].slice(0, 4));
  const stepY = Math.ceil((y1 - y0) / (W < 520 ? 4 : 9) / 5) * 5;
  for (let yr = Math.ceil(y0 / 5) * 5; yr <= y1; yr += stepY) el('text', { x: xk(`${yr}-01`), y: H - 8, 'text-anchor': 'middle', class: 'axis-label' }, svg).textContent = yr;
  el('path', { d: keys.map((k, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(''), class: 'line', stroke: 'var(--text)' }, svg);
  for (const ev of DEBT_EVENTS) {
    const i = idx(ev.date);
    el('line', { x1: x(i), x2: x(i), y1: m.t, y2: H - m.b, class: 'crosshair' }, svg);
    el('text', { x: x(i) + 4, y: y(vals[i]) - 10, class: 'axis-label', 'font-weight': 600 }, svg).textContent = ev.label;
  }
  // hover readout
  const cross = el('line', { y1: m.t, y2: H - m.b, class: 'crosshair', visibility: 'hidden' }, svg);
  const dot = el('circle', { r: 5, fill: 'var(--text)', class: 'dot', visibility: 'hidden' }, svg);
  const hit = el('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: 'transparent' }, svg);
  const tip = document.getElementById('tooltip');
  const move = evt => {
    const r = svg.getBoundingClientRect();
    // nearest data point to the pointer's date
    const px = (evt.clientX - r.left) * (W / r.width);
    let i = 0;
    for (let j = 1; j < keys.length; j++) if (Math.abs(x(j) - px) < Math.abs(x(i) - px)) i = j;
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(vals[i])); dot.setAttribute('visibility', 'visible');
    const g = govs.find(gg => keys[i] >= gg.from && keys[i] <= gg.to);
    tip.innerHTML = `<div class="t-title">${esc(monthLabel(keys[i]))}</div><div class="t-row"><span>Debt</span><b>${fmt(vals[i])}</b></div>${g ? `<div class="t-row"><span><i style="background:${PARTY_COLOUR[g.party]}"></i> Prime Minister</span><b>${esc(g.name)}</b></div>` : ''}`;
    tip.hidden = false;
    const tr = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(innerWidth - tr.width - 8, evt.clientX + 14)) + 'px';
    tip.style.top = Math.max(8, evt.clientY - tr.height - 10) + 'px';
  };
  hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; });
}
