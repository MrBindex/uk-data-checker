// Public services: NHS waiting times, schools, and small boats & the asylum backlog.
// Data built by scripts/build-finances.js into data/nhs.json, data/schools.json, data/border.json.

const ymLabel = k => new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayLabel = iso => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const lastOf = arr => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i; return -1; };
const millions = v => `${nf(v / 1e6, 2)} million`;

// ---------------------------------------------------------------- NHS waiting times (England)
async function nhsPage() {
  setTitle('NHS waiting times');
  view.innerHTML = loading();
  const n = await getJSON('data/nhs.json');
  const R = n.rtt, E = n.ae;
  const L = lastOf(R.total), Y = R.months.indexOf(`${Number(R.months[L].slice(0, 4)) - 1}${R.months[L].slice(4)}`);
  const peakI = R.total.reduce((b, v, i) => (v > R.total[b] ? i : b), 0);
  const AL = lastOf(E.pct4);
  const pre = R.months.indexOf('2020-02');
  const rttSrc = sourceLine({ name: R.source.title, url: R.source.page, extra: `To ${esc(ymLabel(R.months[L]))}` });
  const aeSrc = sourceLine({ name: E.source.title, url: E.source.page, extra: `To ${esc(ymLabel(E.months[AL]))}` });
  view.innerHTML = `
    <div class="page-head"><span class="kicker">Public services</span><h1>NHS waiting times in England</h1>
      <p class="lead">How many people are waiting for planned hospital treatment, how long they wait, and how A&amp;E is coping — straight from NHS England’s monthly figures.</p></div>
    <div class="grid">
      <div class="card stat"><div class="label">Waiting list</div><div class="value">${nf(R.total[L] / 1e6, 2)}m</div><div class="meta">treatments waiting, ${esc(ymLabel(R.months[L]))} · ${Y >= 0 ? `${R.total[L] < R.total[Y] ? 'down' : 'up'} ${nf(Math.abs(R.total[L] - R.total[Y]) / 1e3)}k on a year` : ''}</div></div>
      <div class="card stat"><div class="label">Seen within 18 weeks</div><div class="value">${nf(R.pct18[L], 1)}%</div><div class="meta">The legal standard is 92% — last met in ${esc(ymLabel(R.months[lastOf(R.pct18.map(v => (v >= 92 ? v : null)))]))}</div></div>
      <div class="card stat"><div class="label">Waiting over a year</div><div class="value">${nf(R.over52[L] / 1e3, 0)}k</div><div class="meta">${esc(ymLabel(R.months[L]))}${pre >= 0 ? ` · ${nf(R.over52[pre])} in Feb 2020` : ''}</div></div>
      <div class="card stat"><div class="label">A&amp;E within 4 hours</div><div class="value">${nf(E.pct4[AL], 1)}%</div><div class="meta">${esc(ymLabel(E.months[AL]))} · the standard is 95%; ${nf(E.over12[AL])} waited 12+ hours for a bed after the decision to admit</div></div>
    </div>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Planned treatment</span><h2>The waiting list since ${esc(R.months[0].slice(0, 4))}</h2></div>
        <div class="seg" id="rttSeg"><button type="button" data-v="total" aria-pressed="true">People waiting</button><button type="button" data-v="pct18" aria-pressed="false">% within 18 weeks</button><button type="button" data-v="over52" aria-pressed="false">Over a year</button></div></div>
      <div class="card chart-card"><div class="chart" id="rttChart"></div><p class="small muted" id="rttNote" style="margin:10px 0 0"></p>${rttSrc}</div>
    </section>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Emergency care</span><h2>A&amp;E: seen within 4 hours</h2></div></div>
      <div class="card chart-card"><div class="chart" id="aeChart"></div><p class="small muted" style="margin:10px 0 0">Share of all A&amp;E attendances (including minor injury units) where patients were admitted, transferred or discharged within 4 hours of arriving.</p>${aeSrc}</div>
    </section>
    <section class="section"><div class="grid two">
      <div class="card claim"><h3>Treatments, not people</h3><p>The list counts <strong>treatments</strong> (referral pathways), not people — one person can be waiting for several. NHS England’s estimate of the number of individual patients is lower than the headline figure.</p></div>
      <div class="card claim"><h3>Peak was ${nf(R.total[peakI] / 1e6, 2)} million</h3><p>The list peaked in ${esc(ymLabel(R.months[peakI]))}. It grew through the 2010s and jumped after the pandemic, when much planned treatment was paused.</p></div>
      <div class="card claim"><h3>England only</h3><p>Health is run separately in Scotland, Wales and Northern Ireland, which publish their own figures with different targets — so they can’t be added together or compared directly.</p></div>
      <div class="card claim"><h3>Figures include estimates</h3><p>Where a hospital trust didn’t report in a month, NHS England adds an estimate so totals stay comparable. Those are the figures used here.</p></div>
    </div></section>`;
  let mode = 'total';
  const drawRtt = () => {
    const f = { total: v => `${nf(v / 1e6, 2)}m`, pct18: v => `${nf(v, 1)}%`, over52: v => nf(v) }[mode];
    Charts.line(document.getElementById('rttChart'), {
      labels: R.months.map(ymLabel), shortLabel: l => l.slice(-4), format: f, ariaLabel: 'NHS waiting list',
      series: [{ name: { total: 'Treatments waiting', pct18: '% waiting under 18 weeks', over52: 'Waiting over 52 weeks' }[mode], color: 'var(--series-1)', values: R[mode] }, ...(mode === 'pct18' ? [{ name: '92% standard', color: 'var(--series-2)', values: R.months.map(() => 92) }] : [])],
    });
    document.getElementById('rttNote').textContent = { total: 'Number of incomplete referral-to-treatment pathways at the end of each month.', pct18: 'Share of patients on the list who had waited less than 18 weeks. The NHS constitution standard is 92%.', over52: 'Number waiting more than a year. Figures before 2020 were small but not zero.' }[mode];
  };
  const drawAe = () => Charts.line(document.getElementById('aeChart'), {
    labels: E.months.map(ymLabel), shortLabel: l => l.slice(-4), format: v => `${nf(v, 1)}%`, ariaLabel: 'A&E four-hour performance',
    series: [{ name: 'Within 4 hours', color: 'var(--series-3)', values: E.pct4 }, { name: '95% standard', color: 'var(--series-2)', values: E.months.map(() => 95) }],
  });
  segWire('rttSeg', v => { mode = v; drawRtt(); });
  const all = () => { drawRtt(); drawAe(); };
  all(); onRedraw(all);
}

// ---------------------------------------------------------------- schools (England)
async function schoolsPage() {
  setTitle('Schools');
  view.innerHTML = loading();
  const s = await getJSON('data/schools.json');
  const N = s.national, now = N.at(-1), first = N[0];
  const src = sourceLine({ name: s.source.title, url: s.source.page, extra: `School census, January ${esc(s.latest.slice(0, 4))}` });
  view.innerHTML = `
    <div class="page-head"><span class="kicker">Public services</span><h1>Schools in England</h1>
      <p class="lead">Class sizes and how many pupils get free school meals, for England and every council, from the Department for Education’s school census.</p></div>
    <div class="grid">
      <div class="card stat"><div class="label">Pupils</div><div class="value">${nf(now.pupils / 1e6, 2)}m</div><div class="meta">in all schools, ${esc(now.year)}</div></div>
      <div class="card stat"><div class="label">Average primary class</div><div class="value">${nf(now.primary.avg, 1)}</div><div class="meta">${nf(now.primary.over30, 1)}% of primary pupils are in classes over 30</div></div>
      <div class="card stat"><div class="label">Average secondary class</div><div class="value">${nf(now.secondary.avg, 1)}</div><div class="meta">${nf(now.secondary.over30, 1)}% of secondary pupils are in classes over 30</div></div>
      <div class="card stat"><div class="label">Free school meals</div><div class="value">${nf(now.fsm, 1)}%</div><div class="meta">of pupils eligible · ${nf(first.fsm, 1)}% in ${esc(first.year)}</div></div>
    </div>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Over time</span><h2>Class sizes and free school meals</h2></div>
        <div class="seg" id="schSeg"><button type="button" data-v="size" aria-pressed="true">Class size</button><button type="button" data-v="fsm" aria-pressed="false">Free school meals</button></div></div>
      <div class="card chart-card"><div class="chart" id="schChart"></div>${src}</div>
    </section>
    <section class="section">
      <div class="section-head"><div><span class="kicker">By council</span><h2>Every council area</h2></div>
        <input class="select" id="schSearch" type="search" placeholder="Filter councils…" aria-label="Filter councils"></div>
      <div class="card"><div class="table-wrap" style="max-height:520px"><table class="data" id="schTable"></table></div>
        <p class="small muted" style="margin:10px 0 0">State-funded schools. Councils here are education authorities (counties and unitary councils), so district councils don’t appear separately.</p>${src}</div>
    </section>
    <section class="section"><div class="grid two">
      <div class="card claim"><h3>Why more pupils get free meals</h3><p>Eligibility has grown partly because of rules protecting pupils as families moved onto Universal Credit, as well as rising hardship — so the rise isn’t only a measure of poverty.</p></div>
      <div class="card claim"><h3>Infant class limit</h3><p>By law, infant classes (Reception to Year 2) should have no more than 30 pupils per teacher, with some exceptions such as twins or appeals.</p></div>
    </div></section>`;
  let mode = 'size', sortKey = 'name';
  const drawChart = () => Charts.line(document.getElementById('schChart'), {
    labels: N.map(x => x.year), format: v => (mode === 'fsm' ? `${nf(v, 1)}%` : nf(v, 1)), zero: mode === 'fsm', ariaLabel: 'Schools over time',
    series: mode === 'fsm' ? [{ name: 'Pupils eligible for free school meals', color: 'var(--series-3)', values: N.map(x => x.fsm) }]
      : [{ name: 'Primary average class', color: 'var(--series-1)', values: N.map(x => x.primary?.avg ?? null) }, { name: 'Secondary average class', color: 'var(--series-2)', values: N.map(x => x.secondary?.avg ?? null) }],
  });
  const table = q => {
    const rows = s.areas.filter(a => !q || a.name.toLowerCase().includes(q.toLowerCase()) || (a.region || '').toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (sortKey === 'name' ? a.name.localeCompare(b.name) : (sortKey === 'fsm' ? b.fsm - a.fsm : (b[sortKey]?.avg ?? 0) - (a[sortKey]?.avg ?? 0))));
    document.getElementById('schTable').innerHTML = `<thead><tr><th><button data-k="name">Council</button></th><th>Region</th><th><button data-k="primary">Primary class</button></th><th><button data-k="secondary">Secondary class</button></th><th><button data-k="fsm">Free school meals</button></th><th>Change since ${esc(s.years[0])}</th></tr></thead>
      <tbody>${rows.map(a => `<tr><td>${esc(a.name)}</td><td class="muted">${esc(a.region || '')}</td><td>${a.primary ? nf(a.primary.avg, 1) : '–'}</td><td>${a.secondary ? nf(a.secondary.avg, 1) : '–'}</td><td><strong>${a.fsm != null ? `${nf(a.fsm, 1)}%` : '–'}</strong></td><td>${a.fsm != null && a.fsmThen != null ? `${a.fsm >= a.fsmThen ? '+' : '−'}${nf(Math.abs(a.fsm - a.fsmThen), 1)} pts` : '–'}</td></tr>`).join('')}</tbody>`;
  };
  document.getElementById('schTable').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (!b) return; sortKey = b.dataset.k; table(document.getElementById('schSearch').value); });
  document.getElementById('schSearch').addEventListener('input', e => table(e.target.value));
  segWire('schSeg', v => { mode = v; drawChart(); });
  table(''); drawChart(); onRedraw(drawChart);
}

// ---------------------------------------------------------------- small boats & asylum backlog
async function borderPage() {
  setTitle('Small boats and asylum');
  view.innerHTML = loading();
  const b = await getJSON('data/border.json');
  const M = b.boats.months, Q = b.backlog.quarters;
  const latest = b.boats.latest, yNow = latest.slice(0, 4);
  const ytd = y => b.boats.ytd[y] ?? 0;
  const byYear = {};
  for (const m of M) byYear[m.month.slice(0, 4)] = (byYear[m.month.slice(0, 4)] || 0) + m.people;
  const years = Object.keys(byYear).sort();
  const peakYear = years.reduce((p, y) => (byYear[y] > byYear[p] ? y : p), years[0]);
  const last7 = b.boats.last30.slice(-7).reduce((s, d) => s + d.people, 0);
  const qNow = Q.at(-1), qYear = Q[Q.length - 5], qPeak = Q.reduce((p, q) => (q.total > p.total ? q : p), Q[0]);
  const bSrc = sourceLine({ name: b.boats.source.title, url: b.boats.source.page, extra: `To ${esc(dayLabel(latest))}` });
  const aSrc = sourceLine({ name: b.backlog.source.title, url: b.backlog.source.page, extra: `As at ${esc(dayLabel(qNow.date))}` });
  view.innerHTML = `
    <div class="page-head"><span class="kicker">Public services</span><h1>Small boats and the asylum backlog</h1>
      <p class="lead">People crossing the English Channel in small boats, and how many asylum claims are waiting for a decision — from the Home Office’s own figures.</p></div>
    <div class="grid">
      <div class="card stat"><div class="label">Arrived this year</div><div class="value">${nf(ytd(yNow))}</div><div class="meta">1 Jan to ${esc(dayLabel(latest))} · same period ${Number(yNow) - 1}: ${nf(ytd(String(Number(yNow) - 1)))}</div></div>
      <div class="card stat"><div class="label">Last 7 days</div><div class="value">${nf(last7)}</div><div class="meta">people detected arriving by small boat</div></div>
      <div class="card stat"><div class="label">Peak year</div><div class="value">${esc(peakYear)}</div><div class="meta">${nf(byYear[peakYear])} people</div></div>
      <div class="card stat"><div class="label">Asylum claims awaiting a decision</div><div class="value">${nf(qNow.total / 1e3, 1)}k</div><div class="meta">${esc(dayLabel(qNow.date))} · ${qYear ? `${qNow.total < qYear.total ? 'down' : 'up'} from ${nf(qYear.total / 1e3, 1)}k a year earlier` : ''} · peak ${nf(qPeak.total / 1e3, 0)}k (${esc(dayLabel(qPeak.date))})</div></div>
    </div>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Crossings</span><h2>Small boat arrivals</h2></div>
        <div class="seg" id="boatSeg"><button type="button" data-v="year" aria-pressed="true">Each year</button><button type="button" data-v="month" aria-pressed="false">Each month</button></div></div>
      <div class="card chart-card"><div class="chart" id="boatChart"></div><p class="small muted" id="boatNote" style="margin:10px 0 0"></p>${bSrc}</div>
    </section>
    <section class="section">
      <div class="section-head"><div><span class="kicker">Backlog</span><h2>Asylum claims waiting for a first decision</h2></div></div>
      <div class="card chart-card"><div class="chart" id="backlogChart"></div><p class="small muted" style="margin:10px 0 0">Claims (main applicants and their dependants) waiting for an initial decision at the end of each quarter, and how many had waited over 6 months.</p>${aSrc}</div>
    </section>
    <section class="section"><div class="grid two">
      <div class="card claim"><h3>Small boats are part of the picture</h3><p>Most people who come to the UK arrive legally on visas. Small boat arrivals are a small share of total immigration — see net migration on the <a href="#/map">map</a> and the ONS migration figures.</p></div>
      <div class="card claim"><h3>Weather drives week-to-week swings</h3><p>Crossings depend heavily on sea conditions, so a quiet or busy week says little on its own. Compare the same period across years.</p></div>
      <div class="card claim"><h3>“Backlog” has several meanings</h3><p>This counts claims awaiting a <em>first</em> decision. Appeals and people waiting to be removed or granted further leave are counted separately.</p></div>
      <div class="card claim"><h3>Provisional figures</h3><p>The weekly small boats figures are operational data and can be revised in the quarterly official statistics.</p></div>
    </div></section>`;
  let mode = 'year';
  const drawBoats = () => {
    if (mode === 'year') {
      Charts.bars(document.getElementById('boatChart'), { rows: years.map(y => ({ label: y === yNow ? `${y} (to date)` : y, value: byYear[y], color: y === yNow ? 'var(--series-2)' : 'var(--series-1)' })), format: v => nf(v), valueName: 'People', ariaLabel: 'Small boat arrivals each year' });
      document.getElementById('boatNote').textContent = 'People detected arriving in the UK by small boat each calendar year.';
    } else {
      Charts.line(document.getElementById('boatChart'), { labels: M.map(m => ymLabel(m.month)), shortLabel: l => l.slice(-4), format: v => nf(v), ariaLabel: 'Small boat arrivals each month', series: [{ name: 'People arriving', color: 'var(--series-1)', values: M.map(m => m.people) }] });
      document.getElementById('boatNote').textContent = 'People arriving each month. Crossings are usually highest in late summer and autumn.';
    }
  };
  const drawBacklog = () => Charts.line(document.getElementById('backlogChart'), {
    labels: Q.map(q => dayLabel(q.date)), shortLabel: l => l.slice(-4), format: v => nf(v), ariaLabel: 'Asylum backlog',
    series: [{ name: 'Awaiting initial decision', color: 'var(--series-1)', values: Q.map(q => q.initial) }, { name: 'Waiting over 6 months', color: 'var(--series-2)', values: Q.map(q => q.over6m) }],
  });
  segWire('boatSeg', v => { mode = v; drawBoats(); });
  const all = () => { drawBoats(); drawBacklog(); };
  all(); onRedraw(all);
}
