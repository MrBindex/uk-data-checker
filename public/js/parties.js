// "Party budget plans": what the biggest UK-wide parties said they would raise, save and spend.
// Tab 1: the 2024 general election manifestos, using one independent source for all parties so
//        the totals are comparable: ICAEW "Chart of the week: General election 2024" (figures
//        for 2028-29, £bn a year, as costed by the parties themselves), with the IFS's verdicts.
// Tab 2: announcements since then (2026). These have NOT been fully costed by the parties or
//        checked independently, and are labelled as party claims with their source and date.
// These figures are typed in by hand (there is no official API for manifestos): update this file
// when a party publishes a new costed plan.

const PARTY_INFO = {
  lab: { name: 'Labour', colour: 'var(--party-lab)' },
  con: { name: 'Conservative', colour: 'var(--party-con)' },
  ref: { name: 'Reform UK', colour: 'var(--party-ref)' },
  ld: { name: 'Liberal Democrats', colour: 'var(--party-ld)' },
  grn: { name: 'Green Party', colour: 'var(--party-grn)' },
  snp: { name: 'SNP', colour: 'var(--party-snp)' },
};

const ICAEW_2024 = { name: 'ICAEW, “Chart of the week: General election 2024” (21 June 2024)', url: 'https://www.icaew.com/insights/viewpoints-on-the-news/2024/jun-2024/chart-of-the-week-general-election-2024' };
const IFS_2024 = 'https://ifs.org.uk/general-election-2024';

// £bn a year by 2028-29. found = tax rises + savings; committed = new spending + tax cuts.
// capital = investment paid for by borrowing, shown separately from day-to-day plans.
const MANIFESTOS_2024 = [
  {
    id: 'lab', taxRises: 9, savings: 1, spending: 11, taxCuts: 0, borrowing: 1,
    rises: 'VAT on private school fees, a bigger windfall tax on oil and gas, closing non-dom and carried-interest loopholes, and more spent on catching tax avoidance.',
    spends: 'More NHS appointments, extra teachers, free breakfast clubs, GB Energy and a borrowing-funded green investment plan.',
    verdict: 'The IFS said both the extra spending and the tax rises were very small for the size of the problems facing public services, and that the manifesto left big choices unsaid.',
    borrowingNote: 'About £1bn a year more borrowing (up to £3.5bn on some measures) for green investment.',
  },
  {
    id: 'con', taxRises: 5, savings: 21, spending: 9, taxCuts: 16,
    rises: 'Closing the “tax gap” (tax that should be paid but isn’t) and cutting the welfare bill by about £12bn, plus fewer civil servants and consultants.',
    spends: 'A further 2p cut to employee National Insurance, a tax break for pensioners, ending stamp duty for most first-time buyers, national service and more defence spending.',
    verdict: 'The IFS was sceptical that £12bn of welfare savings and £6bn from the tax gap could be found, and said unprotected public services would face cuts that weren’t spelled out.',
  },
  {
    id: 'ref', taxRises: 14, savings: 136, spending: 53, taxCuts: 88,
    rises: 'Savings from scrapping net zero subsidies, cutting the cost of the civil service and asylum, halving foreign aid, and stopping interest paid to banks on reserves.',
    spends: 'Raising the tax-free personal allowance to £20,000, abolishing tax on most inheritances, cutting business taxes, and more for the NHS, defence and policing.',
    verdict: 'The IFS said the savings were likely to be much smaller, and the tax cuts much more costly, than Reform claimed — by tens of billions of pounds a year.',
  },
  {
    id: 'ld', taxRises: 26.9, savings: 5.8, spending: 32, taxCuts: 0, capital: 20.7, borrowing: 20.7,
    rises: 'Higher taxes on banks, share buybacks and capital gains for the wealthiest, a bigger tax on private jets and frequent flyers, and £7.2bn from clamping down on tax avoidance.',
    spends: 'Free personal care, more GPs and carers, higher pay for carers, and extra money for schools. Capital investment (homes, energy, flood defences) would be borrowed: about £20.7bn a year.',
    verdict: 'The IFS and other analysts said the £7bn from clamping down on avoidance was the weakest part: there was little detail to show it could be raised.',
    borrowingNote: 'About £20.7bn a year of borrowing on average, for capital investment only.',
  },
  {
    id: 'grn', taxRises: 151, savings: 12, spending: 226, taxCuts: 0, borrowing: 63,
    rises: 'A wealth tax on fortunes above £10m, taxing gains the same as income, higher National Insurance on top earners, and a carbon tax.',
    spends: 'Big increases for the NHS, social care and housing, insulating homes, and green energy investment funded by borrowing.',
    verdict: 'The IFS said the new taxes were unlikely to raise anything like the sums claimed, and that the plans would add around £80bn a year to borrowing by 2030.',
    borrowingNote: 'About £63bn a year of extra borrowing by 2028-29.',
  },
  {
    id: 'snp', none: true,
    note: 'The SNP stands only in Scotland and didn’t publish UK-wide costings. Its 2024 manifesto called on the UK government to spend more — for example £16bn a year more on the NHS in England, which would give Scotland about £1.6bn — and to rejoin the EU.',
    verdict: 'The IFS said the SNP’s calls for more spending didn’t say how they would be paid for, and that Scotland’s own budget faces difficult choices.',
  },
];

// Latest announcements. Every figure here is the party's own claim unless it says otherwise.
const ANNOUNCEMENTS_2026 = [
  {
    id: 'lab', role: 'In government', when: 'Autumn Budget, 28 October 2026',
    summary: 'Labour is in government, so its plans are the Budget itself. Chancellor John Healey said the Budget kept the manifesto promise not to raise Income Tax, National Insurance or VAT rates on working people.',
    items: [
      { text: 'Tax on income from savings and property to rise by a further 2 percentage points from April 2027 (property income rates 24%, 44% and 49%)' },
      { text: 'Fuel duty freeze extended (as reported ahead of the Budget)' },
      { text: 'Headroom against the fiscal rules reported at about £15bn, down from £23bn', fig: '£15bn' },
    ],
    check: 'Budget measures are costed independently by the Office for Budget Responsibility (OBR). See its October 2026 Economic and Fiscal Outlook for the official totals.',
    sources: [
      { name: 'House of Commons Library: Autumn Budget 2026, a summary', url: 'https://researchbriefings.files.parliament.uk/documents/CBP-12252/CBP-12252.pdf' },
      { name: 'MoneyWeek Budget live', url: 'https://moneyweek.com/economy/news/live/autumn-budget-2026' },
      { name: 'Office for Budget Responsibility', url: 'https://obr.uk' },
    ],
  },
  {
    id: 'con', role: 'Opposition', when: 'Autumn 2026',
    summary: 'Kemi Badenoch says the Conservatives have found more than £70bn of savings, with at least half going to cut the deficit and the rest to tax cuts or investment.',
    items: [
      { text: 'Savings identified (party claim)', fig: '£70bn+' },
      { text: 'About half of the savings would come from welfare' },
      { text: 'At least half of all savings to go to reducing the deficit' },
    ],
    check: 'Not costed independently. The IFS doubted the party’s 2024 welfare savings could be found.',
    sources: [
      { name: 'City AM', url: 'https://www.cityam.com/is-that-it-badenoch-lays-into-healey-budget-speech/' },
      { name: 'BritBrief', url: 'https://britbrief.co.uk/politics/westminster/badenoch-labour-budget-will-make-britons-pay.html' },
    ],
  },
  {
    id: 'ref', role: 'Opposition', when: 'Party conference, September 2026',
    summary: 'Reform UK dropped its 2024 promise of £90bn of tax cuts. It now pledges to raise the tax-free personal allowance to £15,000 in its first Budget, and towards £20,000 by the end of a Parliament.',
    items: [
      { text: 'Personal allowance raised from £12,570 to £15,000 — cost in year one (party estimate)', fig: '£17.7bn', kind: 'spend' },
      { text: '…rising by year five to (party estimate)', fig: '£21bn', kind: 'spend' },
      { text: 'Welfare savings (the State Pension would not be cut)', fig: '£52bn', kind: 'save' },
      { text: 'Ending net zero subsidies', fig: '£10bn', kind: 'save' },
      { text: 'Cutting foreign aid', fig: '£7bn', kind: 'save' },
      { text: 'Fewer civil servants and quangos', fig: '£7bn', kind: 'save' },
    ],
    totals: { save: 76, spend: 17.7, note: 'The savings listed add up to £76bn a year; Reform describes the total as about £80bn.' },
    check: 'Not costed independently. The IFS has estimated that a £20,000 allowance alone would cost £50bn–£80bn a year.',
    sources: [
      { name: 'Chartered Institute of Taxation', url: 'https://www.tax.org.uk/reform-uk-conference-2026-tax-policy' },
      { name: 'LBC', url: 'https://www.lbc.co.uk/article/reform-pledges-raise-tax-free-personal-allowance-5Hjdh26_2/' },
    ],
  },
  {
    id: 'ld', role: 'Opposition', when: 'Party conference, September 2026',
    summary: 'Ed Davey pledged income tax cuts to help with the cost of living, phased in over a Parliament.',
    items: [
      { text: 'Tax-free personal allowance raised to £15,000 by year five (in line with inflation at first)', kind: 'spend' },
      { text: 'Higher-rate (40p) threshold raised from £50,270 to £56,000 — the party says 760,000 people would stop paying the higher rate', kind: 'spend' },
    ],
    check: 'No full costing found. The party says growth from closer trade with the EU would help pay for it — not checked independently.',
    sources: [
      { name: 'ITV News', url: 'https://www.itv.com/news/2026-09-22/ed-davey-says-lib-dems-will-cut-income-tax-to-tackle-cost-of-living' },
      { name: 'Express & Star', url: 'https://www.expressandstar.com/uk-news/davey-pledges-tax-cuts-as-lib-dems-in-fight-of-our-lives-9145873' },
    ],
  },
  {
    id: 'grn', role: 'Opposition', when: 'Party conference, October 2026',
    summary: 'Zack Polanski’s Greens put taxes on wealth at the centre of their plans, to pay for public services and help with energy bills.',
    items: [
      { text: 'Wealth tax: 1% a year on wealth above £10m, 2% above £1bn (party estimate)', fig: '£15bn', kind: 'raise' },
      { text: 'Taxing capital gains at the same rates as income (party estimate)', fig: '£12bn', kind: 'raise' },
      { text: 'National Insurance on investment income (party estimate, Nov 2025)', fig: '£6.1bn', kind: 'raise' },
      { text: '38% windfall tax on the biggest banks’ UK profits above £800m', kind: 'raise' },
      { text: 'Support to keep energy bills down', fig: '£8.4bn', kind: 'spend' },
    ],
    totals: { raise: 33.1, note: 'The three costed tax rises add up to about £33bn a year.' },
    check: 'Not costed independently. Tax Policy Associates has criticised the lack of detailed modelling behind the party’s tax figures.',
    sources: [
      { name: 'Chartered Institute of Taxation', url: 'https://www.tax.org.uk/green-party-conference-2026-busy-tax-policy-agenda-for-challenger-party' },
      { name: 'Green Party', url: 'https://greenparty.org.uk/2026/03/18/zack-polanski-lays-out-plans-to-back-the-caring-majority-in-major-speech/' },
    ],
  },
  {
    id: 'snp', role: 'Scottish Government', when: 'Holyrood election, May 2026',
    summary: 'The SNP’s 2026 plans were for the Scottish Parliament, where it won 58 seats and stayed in government. It has published no new UK-wide budget plan.',
    items: [
      { text: 'Freeze Scottish Income Tax rates for the next Parliament' },
      { text: 'A cap on some food prices (which may need UK government agreement)' },
      { text: 'Higher council tax bands on homes worth over £1m and £2m from 2028 (announced in the January 2026 Scottish Budget)' },
    ],
    check: 'The Fraser of Allander Institute reviewed the SNP’s Holyrood manifesto costings.',
    sources: [
      { name: 'Fraser of Allander Institute', url: 'https://fraserofallander.org/2026-scottish-manifesto-analysis-scottish-national-party/' },
    ],
  },
];

async function partiesPage() {
  setTitle('Party budget plans');
  const sign = v => `£${nf(v, v % 1 ? 1 : 0)}bn`;
  const parties = MANIFESTOS_2024.map(p => ({
    ...p, ...PARTY_INFO[p.id],
    found: p.none ? null : p.taxRises + p.savings,
    committed: p.none ? null : p.spending + p.taxCuts + (p.capital || 0),
  }));
  const costed = parties.filter(p => !p.none);
  const biggest = [...costed].sort((a, b) => b.committed - a.committed)[0];
  // Not an official statistic, so no "Official data" tick.
  const icaewSrc = `<div class="source"><span>Source: <a href="${ICAEW_2024.url}" target="_blank" rel="noopener">${esc(ICAEW_2024.name)}</a>, from the parties' own costings</span><span>Verdicts: <a href="${IFS_2024}" target="_blank" rel="noopener">Institute for Fiscal Studies</a></span></div>`;

  view.innerHTML = `
    <div class="page-head"><span class="kicker">Tax &amp; spending</span><h1>What would each party do with your money?</h1>
      <p class="lead">How much the six biggest UK-wide parties said they would raise and save, and how much they would spend or give back in tax cuts — side by side, with what independent experts made of the sums.</p></div>

    <div class="seg party-tabs" id="partyTabs" role="tablist">
      <button type="button" role="tab" data-v="2024" aria-pressed="true" aria-selected="true">2024 manifestos (costed)</button>
      <button type="button" role="tab" data-v="2026" aria-pressed="false" aria-selected="false">Latest announcements (2026)</button>
    </div>

    <div id="tab2024">
      <div class="callout"><p><strong>How to read this:</strong> these are the costings the parties published in their 2024 general election manifestos, for the year 2028-29, in £ billion a year. They are the parties’ <em>own</em> sums, collected in one place by the accountancy body ICAEW so they can be compared. <strong>Money found</strong> = tax rises + savings. <strong>Money committed</strong> = new spending + tax cuts. Where a party planned to borrow, that’s shown separately. Independent experts doubted several of these numbers — their verdict is under each party.</p></div>

      <div class="grid">
        <div class="card stat"><div class="label">Biggest plans</div><div class="value">${esc(biggest.name)}</div><div class="meta">${sign(biggest.committed)} a year of spending and tax cuts</div></div>
        <div class="card stat"><div class="label">Smallest plans</div><div class="value">Labour</div><div class="meta">${sign(parties.find(p => p.id === 'lab').committed)} a year — the party that went on to win</div></div>
        <div class="card stat"><div class="label">Biggest tax cuts</div><div class="value">Reform UK</div><div class="meta">£88bn a year, paid for by £136bn of claimed savings</div></div>
        <div class="card stat"><div class="label">Most borrowing</div><div class="value">Green Party</div><div class="meta">£63bn a year by 2028-29</div></div>
      </div>

      <section class="section">
        <div class="section-head"><div><span class="kicker">Compared</span><h2>Money found vs money committed, per year by 2028-29</h2></div>
          <div class="seg" id="cmpSeg"><button type="button" data-v="totals" aria-pressed="true">Totals</button><button type="button" data-v="parts" aria-pressed="false">Every part</button></div></div>
        <div class="card chart-card"><div class="chart" id="partyBars"></div>
          <p class="small muted" id="partyNote" style="margin:10px 0 0"></p>
          ${icaewSrc}</div>
      </section>

      <section class="section">
        <div class="section-head"><div><span class="kicker">Party by party</span><h2>Where the money would come from and go</h2></div></div>
        <div class="party-grid">${parties.map(p => partyCard(p, sign)).join('')}</div>
        <div class="card section" style="margin-top:16px">
          <h3>All the figures</h3>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Party</th><th>Tax rises</th><th>Savings</th><th>Money found</th><th>New spending</th><th>Tax cuts</th><th>Money committed</th><th>Borrowing</th></tr></thead>
            <tbody>${parties.map(p => p.none
              ? `<tr><td><span class="party-dot" style="background:${p.colour}"></span>${esc(p.name)}</td><td colspan="7" class="muted">No UK-wide costings published</td></tr>`
              : `<tr><td><span class="party-dot" style="background:${p.colour}"></span>${esc(p.name)}</td><td>${sign(p.taxRises)}</td><td>${sign(p.savings)}</td><td><strong>${sign(p.found)}</strong></td><td>${sign(p.spending)}${p.capital ? `<div class="small muted">+ ${sign(p.capital)} capital</div>` : ''}</td><td>${p.taxCuts ? sign(p.taxCuts) : '–'}</td><td><strong>${sign(p.committed)}</strong></td><td>${p.borrowing ? sign(p.borrowing) : '–'}</td></tr>`).join('')}</tbody>
          </table></div>
          <p class="small muted" style="margin:10px 0 0">£ billion a year in 2028-29, as costed by each party. Liberal Democrat tax rises include £7.2bn from tackling tax avoidance; their spending excludes capital investment, shown separately and paid for by borrowing. Figures are rounded, so found + borrowing may not exactly equal committed.</p>
          ${icaewSrc}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><div><span class="kicker">Context</span><h2>Why these sums need care</h2></div></div>
        <div class="grid two">
          <div class="card claim"><h3>They’re the parties’ own numbers</h3><p>Manifesto costings aren’t checked by the OBR. Savings such as “cutting waste” or “closing the tax gap” are often much harder to find than promised, so <strong>money found</strong> can be overstated.</p></div>
          <div class="card claim"><h3>Bigger isn’t better or worse</h3><p>A large plan means a bigger change to the size of the state, not that it is better value. Compare with total public spending of more than £1,200bn a year on <a href="#/spending">how the government spends money</a>.</p></div>
          <div class="card claim"><h3>Plans change after elections</h3><p>Governments respond to events. Labour has since raised more tax than its manifesto set out, including employer National Insurance — see <a href="#/revenue">where the money comes from</a>.</p></div>
          <div class="card claim"><h3>Only one year is shown</h3><p>These figures are for a single year (2028-29), when most plans would be in full effect. Some costs and savings would build up gradually.</p></div>
        </div>
      </section>
    </div>

    <div id="tab2026" hidden>
      <div class="callout warn"><p><strong>Not fully costed.</strong> These are announcements made since the 2024 election, mostly at party conferences in 2026. Unless it says otherwise, every figure is the party’s own claim and hasn’t been checked by the OBR or an independent body. Labour, as the government, sets its plans in the Budget, which the OBR does check. A full, comparable costing will come with the next set of manifestos.</p></div>
      <div class="party-grid">${ANNOUNCEMENTS_2026.map(a => announcementCard(a)).join('')}</div>
      <p class="small muted" style="margin:16px 0 0">Collected from party announcements and news reports up to 1 November 2026. Sources are linked on each card.</p>
    </div>`;

  // ---- tabs
  const tabs = document.getElementById('partyTabs');
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    tabs.querySelectorAll('button').forEach(x => { x.setAttribute('aria-pressed', x === b); x.setAttribute('aria-selected', x === b); });
    document.getElementById('tab2024').hidden = b.dataset.v !== '2024';
    document.getElementById('tab2026').hidden = b.dataset.v !== '2026';
    if (b.dataset.v === '2024') drawCmp();
  });

  // ---- comparison chart
  let cmp = 'totals';
  const drawCmp = () => {
    const box = document.getElementById('partyBars');
    if (!box || !box.offsetParent) return;
    const series = cmp === 'totals'
      ? [
        { name: 'Money found (tax rises + savings)', color: 'var(--series-3)', values: costed.map(p => p.found) },
        { name: 'Money committed (spending + tax cuts)', color: 'var(--series-2)', values: costed.map(p => p.committed) },
        { name: 'Borrowing', color: 'var(--series-7)', values: costed.map(p => p.borrowing || null) },
      ]
      : [
        { name: 'Tax rises', color: 'var(--series-6)', values: costed.map(p => p.taxRises) },
        { name: 'Savings', color: 'var(--series-3)', values: costed.map(p => p.savings) },
        { name: 'New spending', color: 'var(--series-2)', values: costed.map(p => p.spending + (p.capital || 0)) },
        { name: 'Tax cuts', color: 'var(--series-4)', values: costed.map(p => p.taxCuts) },
      ];
    Charts.groupedBars(box, { categories: costed.map(p => p.name), series, format: sign, ariaLabel: 'Party plans compared, £ billion a year' });
    document.getElementById('partyNote').textContent = cmp === 'totals'
      ? '£ billion a year by 2028-29. When money committed is bigger than money found, the gap is borrowed. The SNP published no UK-wide costings, so isn’t shown.'
      : '£ billion a year by 2028-29. Liberal Democrat new spending includes £20.7bn of borrowed capital investment. The SNP published no UK-wide costings, so isn’t shown.';
  };
  document.getElementById('cmpSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    cmp = b.dataset.v;
    e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    drawCmp();
  });
  drawCmp();
  onRedraw(drawCmp);
}

function partyCard(p, sign) {
  const head = `<div class="party-card-head"><span class="party-swatch" style="background:${p.colour}"></span><h3>${esc(p.name)}</h3></div>`;
  if (p.none) {
    return `<article class="card party-card">${head}
      <p class="party-none">No UK-wide costings published</p>
      <p>${esc(p.note)}</p>
      <div class="party-verdict"><span class="badge">Independent view</span><p>${esc(p.verdict)}</p></div></article>`;
  }
  const max = Math.max(p.found + (p.borrowing || 0), p.committed);
  const seg = (v, cls, label) => v ? `<span class="${cls}" style="width:${(v / max) * 100}%" title="${esc(label)}: ${sign(v)}"></span>` : '';
  return `<article class="card party-card">${head}
    <div class="party-totals">
      <div><span class="label">Money found</span><b>${sign(p.found)}</b><small>${sign(p.taxRises)} tax rises · ${sign(p.savings)} savings</small></div>
      <div><span class="label">Money committed</span><b>${sign(p.committed)}</b><small>${sign(p.spending + (p.capital || 0))} spending${p.taxCuts ? ` · ${sign(p.taxCuts)} tax cuts` : ''}</small></div>
    </div>
    <div class="party-balance">
      <div class="pb-row">${seg(p.taxRises, 'pb-tax', 'Tax rises')}${seg(p.savings, 'pb-save', 'Savings')}${seg(p.borrowing, 'pb-borrow', 'Borrowing')}</div>
      <div class="pb-row">${seg(p.spending + (p.capital || 0), 'pb-spend', 'New spending')}${seg(p.taxCuts, 'pb-cut', 'Tax cuts')}</div>
      <p class="pb-key"><span><i class="pb-tax"></i>Tax rises</span><span><i class="pb-save"></i>Savings</span>${p.borrowing ? '<span><i class="pb-borrow"></i>Borrowing</span>' : ''}<span><i class="pb-spend"></i>Spending</span>${p.taxCuts ? '<span><i class="pb-cut"></i>Tax cuts</span>' : ''}</p>
    </div>
    ${p.borrowingNote ? `<p class="small muted">${esc(p.borrowingNote)}</p>` : ''}
    <dl class="party-detail"><dt>Money from</dt><dd>${esc(p.rises)}</dd><dt>Money on</dt><dd>${esc(p.spends)}</dd></dl>
    <div class="party-verdict"><span class="badge">Independent view</span><p>${esc(p.verdict)}</p></div></article>`;
}

function announcementCard(a) {
  const info = PARTY_INFO[a.id];
  const kindLabel = { save: 'Saving', spend: 'Cost', raise: 'Raises' };
  return `<article class="card party-card">
    <div class="party-card-head"><span class="party-swatch" style="background:${info.colour}"></span><h3>${esc(info.name)}</h3><span class="badge">${esc(a.role)}</span></div>
    <p class="small muted" style="margin:0 0 8px">${esc(a.when)}</p>
    <p>${esc(a.summary)}</p>
    <ul class="pledge-list">${a.items.map(i => `<li><span>${i.kind ? `<em class="pledge-kind k-${i.kind}">${kindLabel[i.kind]}</em>` : ''}${esc(i.text)}</span>${i.fig ? `<b>${esc(i.fig)}</b>` : ''}</li>`).join('')}</ul>
    ${a.totals ? `<p class="small"><strong>${a.totals.save ? `Savings listed: £${a.totals.save}bn a year` : ''}${a.totals.save && a.totals.spend ? ' · ' : ''}${a.totals.spend ? `Cost: £${a.totals.spend}bn in year one` : ''}${a.totals.raise ? `Tax rises claimed: about £${Math.round(a.totals.raise)}bn a year` : ''}</strong><br><span class="muted">${esc(a.totals.note)}</span></p>` : ''}
    <div class="party-verdict"><span class="badge warn">Checked?</span><p>${esc(a.check)}</p></div>
    <p class="small muted party-sources">Sources: ${a.sources.map(s => `<a href="${s.url}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(' · ')}</p>
  </article>`;
}
