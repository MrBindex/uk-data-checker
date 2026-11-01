// "Party donations": who gives money to political parties, and how much.
// Data: Electoral Commission register of donations (quarterly reports), built into
// data/donations.json by scripts/build-finances.js (`npm run build-data -- donations`).

const donationsData = () => getJSON('data/donations.json');

// Short names and colours (UK Parliament party colours) by the name on the register.
const DONATION_PARTIES = [
  { re: /^Conservative/, short: 'Conservative', colour: 'var(--party-con)' },
  { re: /^Labour Party/, short: 'Labour', colour: 'var(--party-lab)' },
  { re: /^Reform UK/, short: 'Reform UK', colour: 'var(--party-ref)' },
  { re: /^Liberal Democrats/, short: 'Liberal Democrats', colour: 'var(--party-ld)' },
  { re: /^Green Party/, short: 'Green Party', colour: 'var(--party-grn)' },
  { re: /^Scottish National/, short: 'SNP', colour: 'var(--party-snp)' },
  { re: /^Co-operative/, short: 'Co-operative Party', colour: 'var(--series-5)' },
  { re: /^Sinn F/, short: 'Sinn Féin', colour: 'var(--series-6)' },
];
const DONOR_TYPE_LABEL = { individual: 'Individuals', company: 'Companies', union: 'Trade unions', association: 'Clubs & associations', other: 'Other' };
const DONOR_TYPE_COLOUR = { individual: 'var(--series-1)', company: 'var(--series-4)', union: 'var(--series-2)', association: 'var(--series-3)', other: 'var(--pie-other)' };

async function donationsPage() {
  setTitle('Party donations');
  view.innerHTML = loading('Loading donations from the Electoral Commission register…');
  const d = await donationsData();
  const info = {};
  for (const p of d.parties) {
    const m = DONATION_PARTIES.find(x => x.re.test(p.name));
    info[p.id] = { name: m ? m.short : p.name, full: p.name, colour: m ? m.colour : 'var(--series-7)' };
  }
  info.other = { name: 'Other parties', full: 'All other parties', colour: 'var(--pie-other)' };
  const pName = id => (info[id] || info.other).name;
  const pill = id => `<span class="party-pill"><i style="background:${(info[id] || info.other).colour}"></i>${esc(pName(id))}</span>`;
  const gbp = v => v >= 1e6 ? `£${nf(v / 1e6, v >= 1e7 ? 1 : 2)}m` : v >= 1e3 ? `£${nf(v / 1e3, 0)}k` : `£${nf(v, 0)}`;
  const dayLabel = iso => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const thisYear = Number(d.latest.slice(0, 4));
  const partialYear = d.latest.slice(5) !== '12-31';
  const periodLabel = k => k === 'last12' ? `the 12 months to ${dayLabel(d.latest)}` : k === 'all' ? `${d.years[0]} to ${dayLabel(d.latest)}` : Number(k) === thisYear && partialYear ? `${k} (to ${dayLabel(d.latest)})` : k;
  const src = sourceLine({ name: d.source.title, url: d.source.page, extra: `Donations accepted up to ${esc(dayLabel(d.latest))}` });
  const yearsDesc = [...d.years].reverse();

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Tax &amp; spending</span><h1>Who gives money to political parties?</h1>
      <p class="lead">Every donation over the reporting limit that UK political parties have declared to the Electoral Commission since ${d.years[0]}: how much each party received, who from, and the biggest single gifts.</p></div>

    <div class="section-head" style="margin-bottom:12px"><div><span class="kicker">Period</span></div>
      <div class="period-pick"><div class="seg" id="donPeriod"><button type="button" data-v="last12" aria-pressed="true">Last 12 months</button><button type="button" data-v="year" aria-pressed="false">One year</button><button type="button" data-v="all" aria-pressed="false">Since ${d.years[0]}</button></div>
        <select class="select" id="donYear" aria-label="Year" hidden>${yearsDesc.map(y => `<option value="${y}">${y}${y === thisYear && partialYear ? ' (so far)' : ''}</option>`).join('')}</select></div></div>

    <div class="grid" id="donStats"></div>

    <section class="section">
      <div class="section-head"><div><span class="kicker">By party</span><h2 id="donPartyTitle">Donations to each party</h2></div></div>
      <div class="card chart-card"><div class="chart" id="donBars"></div>
        <p class="small muted" style="margin:10px 0 0">Private donations only — not public money such as “Short money” given to opposition parties, which is shown in the table below.</p>
        ${src}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Who gives</span><h2>Where each party’s donations come from</h2></div></div>
      <div class="card"><div id="donTypes"></div>${src}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Donors</span><h2>The biggest donors</h2></div></div>
      <div class="chips" id="donorChips" style="margin:0 0 12px"></div>
      <div class="card"><ol class="donor-list" id="donorList"></ol>
        <p class="small muted" style="margin:10px 0 0">Totals add up every reported donation from the same donor in the period. The register sometimes lists one donor under several spellings; these are combined by name (people by first and last name, organisations without “Ltd” or “plc”).</p>
        ${src}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Single gifts</span><h2>The largest single donations</h2></div></div>
      <div class="card"><div class="table-wrap"><table class="data" id="bigTable"></table></div>${src}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Over time</span><h2>Donations each year since ${d.years[0]}</h2></div></div>
      <div class="card chart-card"><div class="chart" id="donTrend"></div>
        <p class="small muted" style="margin:10px 0 0">Private donations accepted each year, in pounds at the time (not adjusted for inflation). Donations jump in general election years (2005, 2010, 2015, 2017, 2019, 2024).${partialYear ? ` ${thisYear} covers only donations accepted up to ${esc(dayLabel(d.latest))}.` : ''}</p>
        ${src}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">All the figures</span><h2 id="donTableTitle">Every party</h2></div></div>
      <div class="card"><div class="table-wrap"><table class="data" id="donTable"></table></div>${src}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="kicker">Read this fairly</span><h2>What these figures do and don’t show</h2></div></div>
      <div class="grid two">
        <div class="card claim"><h3>Only larger donations are listed</h3><p>Parties must report gifts over <strong>£11,180</strong> to the central party, or over £2,230 to a local branch (since January 2024; before that £7,500 and £1,500). Smaller gifts — including most members’ subscriptions — don’t appear, so these are not a party’s total income.</p></div>
        <div class="card claim"><h3>Not all of it is cash</h3><p>“Non-cash” donations include free office space, staff, services and events, valued by the party. Loans are reported separately and aren’t included here.</p></div>
        <div class="card claim"><h3>A donation isn’t proof of influence</h3><p>Donors must be on the UK electoral register or be UK businesses, unions or organisations. The register shows who gave money; it doesn’t show that a donor got anything in return.</p></div>
        <div class="card claim"><h3>Timing matters</h3><p>Parties report every three months, and the Commission publishes about three months later — so the most recent donations aren’t shown yet. Donations rise sharply before general elections.</p></div>
      </div>
    </section>`;

  let period = 'last12', donorParty = 'all';
  const draw = () => {
    const P = d.periods[period];
    const ids = Object.keys(P.parties).filter(id => P.parties[id].private > 0 || P.parties[id].public > 0)
      .sort((a, b) => (a === 'other') - (b === 'other') || P.parties[b].private - P.parties[a].private);
    const top = ids.filter(id => id !== 'other')[0];
    const bigDonor = P.donors.all[0];
    const label = periodLabel(period);
    document.getElementById('donStats').innerHTML = `
      <div class="card stat"><div class="label">Donations to parties</div><div class="value">${gbp(P.private)}</div><div class="meta">${nf(P.count)} reported donations · ${esc(label)}</div></div>
      <div class="card stat"><div class="label">Received the most</div><div class="value">${esc(pName(top))}</div><div class="meta">${gbp(P.parties[top].private)} — ${nf(P.parties[top].private / P.private * 100, 0)}% of all donations</div></div>
      <div class="card stat"><div class="label">Biggest donor</div><div class="value value-sm">${esc(bigDonor.name)}</div><div class="meta">${gbp(bigDonor.total)} to ${esc(Object.keys(bigDonor.parties).map(pName).join(', '))}</div></div>
      <div class="card stat"><div class="label">Largest single donation</div><div class="value">${gbp(P.biggest[0].value)}</div><div class="meta">${esc(P.biggest[0].donor)} to ${esc(pName(P.biggest[0].party))}, ${esc(dayLabel(P.biggest[0].date))}</div></div>`;
    document.getElementById('donPartyTitle').textContent = `Donations to each party, ${label}`;
    document.getElementById('donTableTitle').textContent = `Every party, ${label}`;

    Charts.bars(document.getElementById('donBars'), {
      rows: ids.filter(id => P.parties[id].private > 0).map(id => ({ label: pName(id), value: P.parties[id].private, color: (info[id] || info.other).colour, tip: `${nf(P.parties[id].count)} donations` })),
      format: gbp, valueName: 'Private donations', ariaLabel: 'Donations by party',
    });

    // donor types: one 100% bar per party
    const types = Object.keys(DONOR_TYPE_LABEL);
    document.getElementById('donTypes').innerHTML = `<div class="type-key">${types.map(t => `<span><i style="background:${DONOR_TYPE_COLOUR[t]}"></i>${DONOR_TYPE_LABEL[t]}</span>`).join('')}</div>
      ${ids.filter(id => P.parties[id].private > 0).map(id => {
        const p = P.parties[id];
        const parts = types.filter(t => p.types[t]).map(t => ({ t, v: p.types[t], pct: p.types[t] / p.private * 100 }));
        const main = [...parts].sort((a, b) => b.v - a.v)[0];
        return `<div class="type-row"><div class="type-name">${esc(pName(id))}<small>${nf(main.pct, 0)}% from ${esc(DONOR_TYPE_LABEL[main.t].toLowerCase())}</small></div>
          <div class="type-bar" role="img" aria-label="${esc(parts.map(x => `${DONOR_TYPE_LABEL[x.t]} ${nf(x.pct, 0)}%`).join(', '))}">${parts.map(x => `<span style="width:${x.pct}%;background:${DONOR_TYPE_COLOUR[x.t]}" title="${esc(DONOR_TYPE_LABEL[x.t])}: ${gbp(x.v)} (${nf(x.pct, 0)}%)"></span>`).join('')}</div></div>`;
      }).join('')}`;

    // donors, filterable by party
    const chipIds = ['all', ...d.parties.map(p => p.id).filter(id => P.donors[id] && P.donors[id].length)];
    if (!chipIds.includes(donorParty)) donorParty = 'all';
    document.getElementById('donorChips').innerHTML = chipIds.map(id => `<button type="button" class="chip${id === donorParty ? ' active' : ''}" data-id="${id}">${id === 'all' ? 'All parties' : esc(pName(id))}</button>`).join('');
    const donors = P.donors[donorParty] || [];
    const maxD = donors[0] ? donors[0].total : 1;
    document.getElementById('donorList').innerHTML = donors.map(x => `<li>
      <div class="donor-top"><span class="donor-name">${esc(x.name)}<small>${esc(x.status)} · ${nf(x.count)} donation${x.count === 1 ? '' : 's'}</small></span><b>${gbp(x.total)}</b></div>
      <div class="donor-bar"><span style="width:${(x.total / maxD) * 100}%;background:${donorParty === 'all' ? (info[Object.keys(x.parties)[0]] || info.other).colour : (info[donorParty] || info.other).colour}"></span></div>
      ${donorParty === 'all' ? `<div class="donor-parties">${Object.entries(x.parties).map(([id, v]) => `${pill(id)}${Object.keys(x.parties).length > 1 ? `<span class="small muted">${gbp(v)}</span>` : ''}`).join(' ')}</div>` : ''}</li>`).join('') || '<li class="muted">No donations in this period.</li>';

    document.getElementById('bigTable').innerHTML = `<thead><tr><th>Donor</th><th>To</th><th>Amount</th><th>Accepted</th><th>Type</th></tr></thead>
      <tbody>${P.biggest.map(b => `<tr><td>${esc(b.donor)}<div class="small muted">${esc(b.status)}</div></td><td>${pill(b.party)}${b.party === 'other' ? `<div class="small muted">${esc(b.partyName)}</div>` : ''}</td><td><strong>${gbp(b.value)}</strong></td><td>${esc(dayLabel(b.date))}</td><td>${b.cash ? 'Cash' : `Non-cash${b.nature ? `<div class="small muted">${esc(b.nature)}</div>` : ''}`}</td></tr>`).join('')}</tbody>`;

    document.getElementById('donTable').innerHTML = `<thead><tr><th>Party</th><th>Private donations</th><th>Number</th><th>Share</th><th>Public funding</th></tr></thead>
      <tbody>${ids.map(id => { const p = P.parties[id]; return `<tr><td><span class="party-dot" style="background:${(info[id] || info.other).colour}"></span>${esc(id === 'other' ? 'All other parties' : info[id].full)}</td><td><strong>${gbp(p.private)}</strong></td><td>${nf(p.count)}</td><td>${nf(p.private / P.private * 100, 1)}%</td><td>${p.public ? gbp(p.public) : '–'}</td></tr>`; }).join('')}</tbody>`;
  };

  const drawTrend = () => {
    const show = d.parties.map(p => p.id).filter(id => d.years.some(y => (d.periods[y].parties[id]?.private || 0) > 5e5));
    Charts.line(document.getElementById('donTrend'), {
      labels: d.years.map(y => (y === thisYear && partialYear ? `${y} (part)` : String(y))),
      format: gbp, ariaLabel: 'Donations to each party by year',
      series: show.map(id => ({ name: pName(id), color: info[id].colour, values: d.years.map(y => d.periods[y].parties[id]?.private || 0) })),
    });
  };

  document.getElementById('donPeriod').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    const sel = document.getElementById('donYear');
    sel.hidden = b.dataset.v !== 'year';
    period = b.dataset.v === 'year' ? sel.value : b.dataset.v;
    draw();
  });
  document.getElementById('donYear').addEventListener('change', e => { period = e.target.value; draw(); });
  document.getElementById('donorChips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    donorParty = b.dataset.id; draw();
  });
  const drawAll = () => { draw(); drawTrend(); };
  drawAll();
  onRedraw(drawAll);
}
