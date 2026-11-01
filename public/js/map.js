// Interactive map of council areas: colour by a chosen measure, hover for the
// value, click to zoom in and see that area's figures. Uses Leaflet (loaded in
// index.html) and the official ONS council boundaries in data/la-boundaries.json.
//
// Measures come from four kinds of source:
//   nomis    – live from the Nomis API (ONS / DWP labour market data)
//   regional – ONS regional public finances (same value for every council in a region)
//   dwp      – DWP Stat-Xplore benefit caseloads, fetched and cached by our server
//   imm      – immigration figures built by scripts/build-finances.js (ONS, Home Office, Census)

const IMM_SRC = {
  ons: 'ONS mid-year estimates (MYE3)',
  homeOffice: 'Home Office immigration statistics',
  census: 'Census 2021 (England & Wales)',
};

const MAP_GROUPS = [
  { name: 'Jobs, pay & tax', measures: {
    claimRate: {
      name: 'Claimant rate (out of work and claiming)', short: 'Claimant rate', unit: '% of 16–64 year olds', rate: true,
      format: v => nf(v, 1) + '%', kind: 'nomis',
      load: () => nomis('NM_162_1', { geography: 'TYPE424', gender: 0, age: 0, measure: 2, measures: 20100, time: 'latest', select: 'date_name,geography_code,obs_value' }),
      uk: () => nomis('NM_162_1', { geography: 'K02000001', gender: 0, age: 0, measure: 2, measures: 20100, time: 'latest', select: 'obs_value' }),
      source: { name: 'ONS Claimant Count (DWP data) via Nomis', url: 'https://www.nomisweb.co.uk/datasets/ucjsa' },
      explain: 'People claiming JSA, or Universal Credit while looking for work, as a share of residents aged 16–64.',
    },
    pay: {
      name: 'Typical full-time pay', short: 'Weekly pay', unit: '£ per week, median, before tax', rate: true,
      format: v => '£' + nf(v), kind: 'nomis',
      load: () => nomis('NM_30_1', { geography: 'TYPE424', sex: 8, item: 2, pay: 1, measures: 20100, time: 'latest', select: 'date_name,geography_code,obs_value' }),
      uk: () => nomis('NM_30_1', { geography: 'K02000001', sex: 8, item: 2, pay: 1, measures: 20100, time: 'latest', select: 'obs_value' }),
      source: { name: 'ONS Annual Survey of Hours and Earnings', url: 'https://www.nomisweb.co.uk/datasets/asher' },
      explain: 'Median weekly pay of full-time workers who live in the area. Based on a survey, so small areas have a margin of error.',
    },
    population: {
      name: 'Population', short: 'Population', unit: 'people', rate: true,
      format: v => nf(v), kind: 'imm', field: 'pop', src: 'ons', periodOverride: 'mid-2025',
      explain: 'Estimated number of people living in the area.',
    },
    revPH: {
      name: 'Tax raised per person (by region)', short: 'Revenue / person (region)', unit: '£ per person, whole region', rate: true,
      format: v => pounds(v), kind: 'regional',
      explain: 'Public revenue raised per person in the region or nation the council is in. The ONS does not publish this for individual councils.',
    },
  } },
  { name: 'Benefits (DWP)', dwp: true, measures: {
    uc: { name: 'Universal Credit — people', short: 'People on UC', kind: 'dwp', explain: 'Everyone on Universal Credit, including people in work on low pay, carers and people too ill to work.' },
    ucHouseholds: { name: 'Universal Credit — households', short: 'UC households', kind: 'dwp', explain: 'Households receiving a Universal Credit payment.' },
    pip: { name: 'Personal Independence Payment (PIP)', short: 'PIP', kind: 'dwp', explain: 'Disability benefit for extra costs of a long-term health condition, for people aged 16 to State Pension age. Paid whether or not someone works.' },
    hb: { name: 'Housing Benefit', short: 'Housing Benefit', kind: 'dwp', explain: 'Help with rent. Now mostly for pensioners and people in supported or temporary housing — most working-age people get housing help through Universal Credit instead.' },
    sp: { name: 'State Pension', short: 'State Pension', kind: 'dwp', explain: 'The largest benefit by far. Counts people receiving it who live in the area.' },
    pc: { name: 'Pension Credit', short: 'Pension Credit', kind: 'dwp', explain: 'Top-up for pensioners on low incomes.' },
    aa: { name: 'Attendance Allowance', short: 'Attendance Allowance', kind: 'dwp', explain: 'Disability benefit for people over State Pension age who need care or supervision.' },
    dla: { name: 'Disability Living Allowance (DLA)', short: 'DLA', kind: 'dwp', explain: 'Now mainly for disabled children, plus some older adults who claimed before PIP.' },
    ca: { name: "Carer's Allowance", short: "Carer's Allowance", kind: 'dwp', explain: 'For people who spend at least 35 hours a week caring for someone.' },
    esa: { name: 'Employment and Support Allowance (ESA)', short: 'ESA', kind: 'dwp', explain: 'Older benefit for people unable to work because of illness or disability; being replaced by Universal Credit.' },
    jsa: { name: "Jobseeker's Allowance (JSA)", short: 'JSA', kind: 'dwp', explain: 'New-style JSA, a short-term benefit for people looking for work who have paid enough National Insurance.' },
    cilif: { name: 'Children in low-income families', short: 'Children in low income', kind: 'dwp', explain: 'Children under 16 in families with less than 60% of median income (before housing costs), from DWP/HMRC records.' },
  } },
  { name: 'Immigration', measures: {
    intNet: { name: 'Net international migration', short: 'Net migration', kind: 'imm', field: 'intNet', src: 'ons', diverging: true, explain: 'People who moved to the area from abroad minus people who left for abroad, over one year. Negative means more left than arrived.' },
    intIn: { name: 'Arrivals from abroad', short: 'Arrivals from abroad', kind: 'imm', field: 'intIn', src: 'ons', explain: 'People moving to the area from outside the UK for at least a year — workers, students, families and refugees.' },
    intOut: { name: 'Departures abroad', short: 'Departures abroad', kind: 'imm', field: 'intOut', src: 'ons', explain: 'People leaving the area to live outside the UK for at least a year.' },
    asylum: { name: 'Asylum seekers in government support', short: 'Supported asylum seekers', kind: 'imm', field: 'asylum', src: 'homeOffice', explain: 'People waiting for an asylum decision who are housed or supported by the Home Office. Does not include refugees who have been granted status.' },
    asylumContingency: { name: 'Asylum seekers in contingency housing (incl. hotels)', short: 'In contingency housing', kind: 'imm', field: 'asylumContingency', src: 'homeOffice', explain: 'Supported asylum seekers in contingency accommodation, which is mostly hotels.' },
    ukraine: { name: 'Homes for Ukraine arrivals', short: 'Homes for Ukraine', kind: 'imm', field: 'ukraine', src: 'homeOffice', explain: 'Total Ukrainians who have arrived under the Homes for Ukraine sponsorship scheme since 2022 (not all still live there).' },
    afghan: { name: 'Afghan Resettlement Programme', short: 'Afghan resettlement', kind: 'imm', field: 'afghan', src: 'homeOffice', explain: 'Afghans resettled through the government programme, including in local authority and private rented housing.' },
    nino: { name: 'New National Insurance numbers — overseas nationals', short: 'NI numbers to overseas nationals', kind: 'dwp', explain: 'Adult overseas nationals who registered for a National Insurance number (needed to work or claim benefits) during the year. Includes short-term workers and students.' },
    bornAbroadPct: { name: 'Born outside the UK (Census 2021)', short: 'Born outside UK', unit: '% of residents', rate: true, format: v => nf(v, 1) + '%', kind: 'imm', field: 'bornAbroadPct', src: 'census', explain: 'Share of residents born outside the UK, including people who have lived here for decades and British citizens born abroad. England and Wales only.' },
  } },
];
// Crime: police recorded crime (England and Wales), built into data/crime.json.
const crimeData = () => getJSON('data/crime.json');
const CRIME_NOTE = ' Police recorded crime depends on what people report and how forces record it. Busy city centres (like Westminster and the City of London) have far more visitors and workers than residents, so their rates per resident look very high.';
const crimeMeasure = (field, name, short, explain) => ({ name, short, kind: 'crime', field, explain: explain + CRIME_NOTE });
MAP_GROUPS.push({ name: 'Crime (England & Wales)', measures: {
  crimeTotal: crimeMeasure('total', 'All police recorded crime', 'All crime', 'Every crime recorded by the police over 12 months (except fraud and computer misuse, which are recorded nationally).'),
  crimeViolence: crimeMeasure('violence', 'Violence against the person', 'Violence', 'Includes assaults with and without injury, stalking and harassment, and homicide.'),
  crimeSexual: crimeMeasure('sexual', 'Sexual offences', 'Sexual offences', 'Includes rape and other sexual offences. Many are reported long after they happened.'),
  crimeRobbery: crimeMeasure('robbery', 'Robbery', 'Robbery', 'Theft using force or the threat of force, from people or businesses.'),
  crimeBurglary: crimeMeasure('burglary', 'Burglary', 'Burglary', 'Breaking into homes and other buildings to steal.'),
  crimeVehicle: crimeMeasure('vehicle', 'Vehicle crime', 'Vehicle crime', 'Theft of or from vehicles, and interfering with them.'),
  crimeShoplifting: crimeMeasure('shoplifting', 'Shoplifting', 'Shoplifting', 'Theft from shops, as recorded by the police (much shoplifting is never reported).'),
  crimeTheftPerson: crimeMeasure('theftPerson', 'Theft from the person', 'Theft from the person', 'Pickpocketing and snatch thefts without force.'),
  crimeDamage: crimeMeasure('damage', 'Criminal damage and arson', 'Criminal damage', 'Vandalism, damage to property and deliberate fires.'),
  crimeDrugs: crimeMeasure('drugs', 'Drug offences', 'Drug offences', 'Possession and dealing. These mostly reflect police activity — more stop and search finds more drugs.'),
  crimeWeapons: crimeMeasure('weapons', 'Weapons possession', 'Weapons possession', 'Carrying knives, firearms or other weapons.'),
  crimePublicOrder: crimeMeasure('publicOrder', 'Public order offences', 'Public order', 'Threatening or abusive behaviour, causing fear or distress, and similar offences.'),
  crimeChange: { name: 'Change in crime on a year earlier', short: 'Change in crime', kind: 'crime', field: 'change', rate: true, diverging: true, unit: '% change in all recorded crime',
    format: v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf(Math.abs(v), 1)}%`,
    explain: 'How total police recorded crime changed compared with the same 12 months a year earlier. Negative (orange) means crime went down.' + CRIME_NOTE },
} });

// Housing: UK House Price Index and ONS private rents, built into data/housing.json.
const housingData = () => getJSON('data/housing.json');
const pct = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf(Math.abs(v), 1)}%`;
MAP_GROUPS.push({ name: 'Housing', measures: {
  housePrice: { name: 'Average house price', short: 'House price', kind: 'housing', field: 'price', src: 'prices', rate: true, unit: '£, all property types', format: v => `£${nf(v)}`,
    explain: 'The average price paid for homes sold in the area, adjusted for the mix of homes sold (so a month with lots of flat sales doesn\'t drag the average down). Click an area to see prices by type of home.' },
  housePriceChange: { name: 'House price change on a year earlier', short: 'Price change', kind: 'housing', field: 'priceChange', src: 'prices', rate: true, diverging: true, unit: '% change in a year', format: pct,
    explain: 'How much the average price changed in the last 12 months. Negative (orange) means prices fell. Not adjusted for inflation.' },
  ftbPrice: { name: 'First-time buyer price', short: 'First-time buyer price', kind: 'housing', field: 'ftbPrice', src: 'prices', rate: true, unit: '£, homes bought by first-time buyers', format: v => `£${nf(v)}`,
    explain: 'The average price paid by people buying their first home.' },
  rent: { name: 'Average private rent', short: 'Monthly rent', kind: 'housing', field: 'rent', src: 'rents', rate: true, unit: '£ a month, private rented homes', format: v => `£${nf(v)}`,
    explain: 'The average monthly rent for privately rented homes, including existing tenancies as well as new lets (so it is lower than advertised asking rents).' },
  rentChange: { name: 'Rent change on a year earlier', short: 'Rent change', kind: 'housing', field: 'rentChange', src: 'rents', rate: true, diverging: true, unit: '% change in a year', format: pct,
    explain: 'How much average private rents changed in the last 12 months. Not adjusted for inflation.' },
} });

// The MP layer: one shape per Westminster constituency (July 2024 boundaries).
const mpData = () => getJSON('data/mps.json');
const MP_GROUPS = [
  { name: 'Your MP', measures: {
    party: { name: 'Party of the MP', short: 'Party', kind: 'mp', rate: true, categorical: true, get: c => c.party,
      explain: 'The party each MP currently sits for, using Parliament\'s official party colours. Some MPs have changed party or become independent since the 2024 general election.' },
    yearsServed: { name: 'Years as an MP', short: 'Years as MP', kind: 'mp', rate: true, unit: 'total years in the House of Commons', get: c => c.yearsServed, format: v => `${nf(v, v < 10 ? 1 : 0)} yrs`,
      explain: 'Total time each MP has spent in the House of Commons, for any constituency, including any earlier spells.' },
    expenses: { name: 'Business costs ("expenses")', short: 'Business costs', kind: 'mp', rate: true, unit: '£ in the financial year', get: c => c.expenses?.total, format: v => `£${nf(v)}`, src: 'ipsa',
      explain: 'What IPSA paid to run each MP\'s office: mostly staff salaries, plus office rent, accommodation in London and travel. This is not the MP\'s own pay.' },
    donations: { zeroClass: true, name: 'Donations registered (as an MP)', short: 'Donations', kind: 'mp', rate: true, unit: '£ registered since the 2024 election', get: c => c.interests?.donations?.value || 0, format: v => `£${nf(v)}`, src: 'register',
      explain: 'Donations and other support MPs must register, such as money for their office or campaign, or in-kind help. Registering a donation is a legal requirement; it does not mean anything improper.' },
    gifts: { zeroClass: true, name: 'Gifts & hospitality registered', short: 'Gifts & hospitality', kind: 'mp', rate: true, unit: '£ registered since the 2024 election', get: c => c.interests?.gifts?.value || 0, format: v => `£${nf(v)}`, src: 'register',
      explain: 'Gifts, tickets, meals and other hospitality worth more than £300 that MPs must register, from UK and overseas sources.' },
    visits: { zeroClass: true, name: 'Overseas visits paid for by others', short: 'Funded visits', kind: 'mp', rate: true, unit: '£ registered since the 2024 election', get: c => c.interests?.visits?.value || 0, format: v => `£${nf(v)}`, src: 'register',
      explain: 'Trips abroad that MPs registered as being paid for by someone other than themselves or Parliament, such as foreign governments, charities or companies.' },
  } },
];
const MAP_MEASURES = Object.assign({}, ...[...MAP_GROUPS, ...MP_GROUPS].map(g => g.measures));
const groupOf = key => MAP_GROUPS.find(g => key in g.measures);

const immigration = () => getJSON('data/immigration.json');
const dwpStatus = () => (once.dwpStatus ||= fetch('/api/dwp/status').then(r => r.ok ? r.json() : { configured: false }).catch(() => ({ configured: false })));

// Raw values for a measure: { values: {code: n}, period, uk, source, notApplicable: {code: reason} }
const rawCache = {};
function loadRaw(key) {
  return (rawCache[key] ||= (async () => {
    const m = MAP_MEASURES[key];
    const out = { values: {}, period: '', uk: null, notApplicable: {} };
    if (m.kind === 'regional') {
      const [fin, las] = await Promise.all([finances(), localAuthorities()]);
      for (const la of las) out.values[la.code] = regionLatest(fin, la.region).revPH;
      out.period = 'Financial year ' + fin.years[fin.years.length - 1];
      out.uk = regionLatest(fin, 'United Kingdom').revPH;
      out.source = { name: `ONS ${fin.sources.revenue.title}`, url: fin.sources.revenue.page };
    } else if (m.kind === 'nomis') {
      const [rows, ukRows] = await Promise.all([m.load(), m.uk ? m.uk() : null]);
      for (const r of rows) if (r.obs_value !== '') out.values[r.geography_code] = Number(r.obs_value);
      out.period = rows[0]?.date_name || '';
      if (ukRows?.[0]) out.uk = Number(ukRows[0].obs_value);
      out.source = m.source;
    } else if (m.kind === 'imm') {
      const imm = await immigration();
      for (const [code, a] of Object.entries(imm.areas)) if (a[m.field] != null) out.values[code] = a[m.field];
      const s = imm.sources[m.src];
      out.period = m.periodOverride || s.period;
      out.source = { name: IMM_SRC[m.src], url: s.page };
      if (m.src === 'census') for (const code of Object.keys(imm.areas)) if (/^[SN]/.test(code)) out.notApplicable[code] = 'Scotland and Northern Ireland ran separate censuses';
    } else if (m.kind === 'housing') {
      const [d, las] = await Promise.all([housingData(), localAuthorities()]);
      out.notes = {};
      for (const [code, a] of Object.entries(d.areas)) {
        if (a[m.field] != null) out.values[code] = a[m.field];
        if (m.field === 'price' && a.priceDetached) {
          out.notes[code] = ['Detached', 'SemiDetached', 'Terraced', 'Flat'].filter(t => a[`price${t}`]).map(t => `${t === 'SemiDetached' ? 'Semi' : t} £${nf(a[`price${t}`])}`).join(' · ');
        }
      }
      if (m.src === 'rents') for (const la of las) if (/^[SN]/.test(la.code)) out.notApplicable[la.code] = 'Rents for individual council areas in Scotland and Northern Ireland aren\'t published in this ONS series';
      const s = d[m.src];
      out.period = s.period;
      out.source = { name: s.title, url: s.page };
    } else if (m.kind === 'crime') {
      const [d, las, imm] = await Promise.all([crimeData(), localAuthorities(), immigration()]);
      const codeOf = Object.fromEntries(las.map(a => [a.name, a.code]));
      out.popFor = {};
      out.notes = {};
      for (const [code, a] of Object.entries(d.areas)) {
        if (a.unreliable) { out.notApplicable[code] = a.unreliable; continue; }
        // A year-on-year change is meaningless if the force changed how much crime it leaves unassigned.
        const f = d.forces?.[a.force];
        if (m.field === 'change' && f && Math.abs(f.unassignedShare - f.prevUnassignedShare) > 0.05) {
          out.notApplicable[code] = `The change isn't reliable here: ${a.force} Police's share of crime not linked to a local area moved from ${Math.round(f.prevUnassignedShare * 100)}% to ${Math.round(f.unassignedShare * 100)}%`;
          continue;
        }
        if (m.field === 'change') { if (a.previous.total) out.values[code] = (a.latest.total / a.previous.total - 1) * 100; }
        else out.values[code] = a.latest[m.field] || 0;
        const notes = [];
        if (a.sharedWith) {
          // One police partnership covers several councils: they share one figure, and rates
          // use the combined population.
          out.popFor[code] = a.sharedWith.reduce((s, n) => s + (imm.areas[codeOf[n]]?.pop || 0), 0);
          notes.push(`Shared figure for ${a.sharedWith.join(', ')} (one police partnership)`);
        }
        const share = d.forces?.[a.force]?.unassignedShare || 0;
        if (share > 0.05) notes.push(`Likely an undercount: ${Math.round(share * 100)}% of ${a.force} Police's recorded crime isn't linked to a local area`);
        if (notes.length) out.notes[code] = notes.join('. ');
      }
      // Forces that leave a lot of crime unassigned make all their areas look lower than they are.
      const bigUnassigned = Object.entries(d.forces || {}).filter(([, f]) => f.unassignedShare > 0.05).sort((x, y) => y[1].unassignedShare - x[1].unassignedShare);
      if (bigUnassigned.length) out.warnings = [`Some police forces don't link all their crime to a local area, so their areas' figures are undercounts: ${bigUnassigned.map(([f, v]) => `${f} (${Math.round(v.unassignedShare * 100)}% unassigned)`).join(', ')}`];
      for (const la of las) if (/^[SN]/.test(la.code)) out.notApplicable[la.code] = 'Scotland and Northern Ireland record crime under different rules and publish it separately, so it isn\'t shown here';
      out.period = m.field === 'change' ? `${d.period} vs ${d.previousPeriod}` : d.period;
      out.source = { name: d.source.title, url: d.source.page };
    } else if (m.kind === 'mp') {
      const d = await mpData();
      for (const [code, c] of Object.entries(d.constituencies)) { const v = m.get(c); if (v != null) out.values[code] = v; }
      out.period = m.src === 'ipsa' ? d.expensesYear : m.src === 'register' ? `to ${date(d.builtAt)}` : `as of ${date(d.builtAt)}`;
      out.source = m.src === 'ipsa' ? { name: d.sources.ipsa.title, url: d.sources.ipsa.page } : m.src === 'register' ? { name: d.sources.register.title, url: d.sources.register.page } : { name: d.sources.members.title, url: d.sources.members.page };
      if (m.categorical) out.colours = Object.fromEntries(Object.values(d.constituencies).map(c => [c.party, c.partyColour || '#888888']));
    } else if (m.kind === 'dwp') {
      const d = await api(`/api/dwp/benefit/${key}`);
      Object.assign(out.values, d.values);
      out.period = d.period;
      out.source = { name: `DWP Stat-Xplore — ${d.label}`, url: d.sourceUrl };
      const las = await localAuthorities();
      for (const la of las) {
        if (la.code.startsWith('N') && !d.coversNI) out.notApplicable[la.code] = 'Northern Ireland runs its own benefits system — not in DWP figures';
        if (la.code.startsWith('S') && d.scotlandReplaced) out.notApplicable[la.code] = `In Scotland this has largely been replaced by ${d.scotlandReplaced}, paid by Social Security Scotland — DWP figures here are not comparable`;
      }
      for (const code of Object.keys(out.notApplicable)) delete out.values[code];
    }
    return out;
  })().catch(e => { delete rawCache[key]; throw e; }));
}

// Shown on the map: raw counts, or per 1,000 residents (fairer between big and small areas).
const shownCache = {};
async function loadShown(key, perK) {
  const m = MAP_MEASURES[key];
  const per = perK && !m.rate;
  const ck = key + (per ? ':per' : '');
  if (shownCache[ck]) return shownCache[ck];
  const raw = await loadRaw(key);
  const out = { ...raw, values: { ...raw.values } };
  if (m.categorical) { // parties: a colour per category, no ranking or bands
    const counts = {};
    for (const v of Object.values(out.values)) counts[v] = (counts[v] || 0) + 1;
    return (shownCache[ck] = { ...out, counts, rank: {}, count: Object.keys(out.values).length, breaks: [], format: v => v, unit: 'seats' });
  }
  if (per) {
    const pop = (await immigration()).areas;
    let sumV = 0, sumP = 0;
    for (const [c, v] of Object.entries(raw.values)) {
      const p = raw.popFor?.[c] ?? pop[c]?.pop;
      if (!p) { delete out.values[c]; continue; }
      out.values[c] = v / p * 1000; sumV += v; sumP += p;
    }
    out.uk = sumP ? sumV / sumP * 1000 : null;
    out.ukLabel = Object.keys(raw.notApplicable).length ? 'Average of areas shown' : 'UK';
  } else if (!m.rate) {
    out.uk = null;
  }
  const sorted = Object.entries(out.values).sort((a, b) => b[1] - a[1]);
  out.rank = Object.fromEntries(sorted.map(([c], i) => [c, i + 1]));
  out.count = sorted.length;
  out.per = per;
  out.format = m.rate ? m.format : per ? (v => `${nf(v, v < 10 && v > -10 ? 1 : 0)} per 1,000`) : (v => nf(v));
  out.unit = m.rate ? m.unit : per ? 'per 1,000 residents' : 'people';
  // Diverging measures (net migration) and mostly-zero measures (register entries) band
  // only the positive values; zero/negative get their own colour.
  if (m.diverging || m.zeroClass) {
    const pos = sorted.map(([, v]) => v).filter(v => v > 0);
    out.breaks = quantileBreaks(pos, 6);
    out.zeroCount = sorted.filter(([, v]) => v === 0).length;
  } else {
    out.breaks = quantileBreaks(sorted.map(([, v]) => v), 7);
  }
  return (shownCache[ck] = out);
}

// Classes with roughly equal numbers of areas in each, so detail isn't lost to a few big outliers.
function quantileBreaks(values, k) {
  const v = [...values].sort((a, b) => a - b);
  const b = [];
  for (let i = 1; i < k; i++) b.push(v[Math.floor((i / k) * v.length)]);
  return [...new Set(b)];
}
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// Colour token for a value. Diverging measures: one orange class for negatives, blues for positives.
function colourToken(v, d, m) {
  if (m.zeroClass) return v === 0 ? '--div-mid' : `--seq-${d.breaks.filter(b => v >= b).length + 2}`;
  if (m.diverging) {
    if (v < 0) return '--div-neg';
    if (v === 0) return '--div-mid';
    return `--seq-${d.breaks.filter(b => v >= b).length + 2}`;
  }
  return `--seq-${d.breaks.filter(b => v >= b).length + 1}`;
}
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

async function mapPage(params) {
  setTitle('Map');
  // Two layers: council areas (the default) and Westminster constituencies with their MPs.
  const mpLayer = params.get('layer') === 'mps';
  const groups = mpLayer ? MP_GROUPS : MAP_GROUPS;
  const layerMeasures = Object.assign({}, ...groups.map(g => g.measures));
  let measure = layerMeasures[params.get('m')] ? params.get('m') : mpLayer ? 'party' : 'claimRate';
  let perK = params.get('per') !== '0';
  let selected = params.get('area') || null;
  const st = await dwpStatus();

  view.innerHTML = `
    <div class="page-head" style="margin-bottom:18px"><span class="kicker">Map</span><h1>${mpLayer ? 'MPs and constituencies' : 'Map of the UK'}</h1>
    <p class="lead">${mpLayer
      ? 'All 650 MPs and the places they represent. Colour the map by party, years as an MP, expenses or donations, and click a constituency to see its MP\'s record.'
      : 'Every council area, coloured by the measure you choose — jobs, every major benefit, and immigration. Hover to see the figure, click an area to zoom in and see all its data.'}</p></div>
    <div class="seg layer-seg" role="group" aria-label="Map areas">
      <a href="#/map" class="${mpLayer ? '' : 'on'}" aria-current="${!mpLayer}">Council areas</a>
      <a href="#/map?layer=mps" class="${mpLayer ? 'on' : ''}" aria-current="${mpLayer}">MPs &amp; constituencies</a>
    </div>
    <div class="controls" style="margin:14px 0">
      <label class="small muted" for="mapMeasure">Colour by</label>
      <select id="mapMeasure" class="select">${groups.map(g => `<optgroup label="${esc(g.name)}${g.dwp && !st.configured ? ' (needs DWP key)' : ''}">${Object.entries(g.measures).map(([k, m]) => `<option value="${k}" ${k === measure ? 'selected' : ''} ${m.kind === 'dwp' && !st.configured ? 'disabled' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`).join('')}</select>
      <div class="seg" id="perSeg" role="group" aria-label="Show as">
        <button type="button" data-v="1" aria-pressed="${perK}">Per 1,000 people</button>
        <button type="button" data-v="0" aria-pressed="${!perK}">Number</button>
      </div>
      <div class="picker map-find"><input id="mapFind" class="select" type="search" placeholder="${mpLayer ? 'Find a constituency or MP…' : 'Find an area…'}" role="combobox" aria-expanded="false" aria-controls="mapFindList" autocomplete="off"><ul id="mapFindList" role="listbox" hidden></ul></div>
      <button class="btn ghost" type="button" id="mapReset">Show whole UK</button>
    </div>
    <div class="map-layout${mpLayer ? ' mp-mode' : ''}">
      <div class="card map-card"><div id="map" role="application" aria-label="Map of UK council areas"></div><div class="map-legend" id="mapLegend"></div></div>
      <aside class="card map-panel" id="mapPanel" aria-live="polite"></aside>
    </div>`;

  const [geo, las, mps] = await Promise.all([
    getJSON(mpLayer ? 'data/pcon-boundaries.json' : 'data/la-boundaries.json'),
    localAuthorities(),
    mpLayer ? mpData() : null,
  ]);
  // Searchable list of places: councils, or constituencies (with their MP's name as the hint).
  const places = mpLayer
    ? geo.features.map(f => ({ code: f.properties.code, name: f.properties.name, region: mps.constituencies[f.properties.code]?.mp || '' })).sort((a, b) => a.name.localeCompare(b.name))
    : las;
  const laByCode = Object.fromEntries(places.map(a => [a.code, a]));

  const map = L.map('map', { zoomSnap: 0.25, minZoom: 4.5, maxZoom: 12, attributionControl: true });
  map.attributionControl.setPrefix('').addAttribution(`Boundaries: <a href="${geo.source.page}" target="_blank" rel="noopener">ONS Open Geography</a> (OGL)`);
  const ukBounds = L.geoJSON(geo).getBounds();
  map.fitBounds(ukBounds, { padding: [8, 8] });
  map.setMaxBounds(ukBounds.pad(0.5));

  let data = null, selLayer = null;
  const layers = {};
  const style = f => {
    const code = f.properties.code;
    const v = data?.values[code];
    const sel = code === selected;
    return {
      fillColor: v == null ? cssVar(data?.notApplicable[code] ? '--map-na' : '--surface-2')
        : MAP_MEASURES[measure].categorical ? data.colours[v] : cssVar(colourToken(v, data, MAP_MEASURES[measure])),
      fillOpacity: 1,
      color: sel ? cssVar('--series-2') : cssVar('--map-line'),
      weight: sel ? 3.5 : 0.6,
    };
  };

  // One shared hover label. (Per-area tooltips got stuck open: re-ordering shapes
  // under the pointer stops the browser sending the "mouse left" event.)
  const hoverTip = L.tooltip({ direction: 'top', offset: [0, -10], className: 'map-tip' });
  let hovered = null;
  const tipHtml = code => {
    const v = data?.values[code];
    const na = data?.notApplicable[code];
    const who = mpLayer && mps.constituencies[code] ? `<br>${esc(mps.constituencies[code].mp)}` : '';
    return `<strong>${esc(laByCode[code]?.name || code)}</strong>${who}<br>${esc(MAP_MEASURES[measure].short)}: <b>${v != null ? esc(data.format(v)) : na ? 'not comparable' : 'no data'}</b>`;
  };
  const endHover = () => {
    if (hovered && layers[hovered]) layer.resetStyle(layers[hovered]);
    hovered = null;
    map.closeTooltip(hoverTip);
  };
  const layer = L.geoJSON(geo, {
    style,
    onEachFeature: (f, l) => {
      const code = f.properties.code;
      layers[code] = l;
      l.on('mouseover', e => {
        if (hovered && hovered !== code) endHover();
        hovered = code;
        if (code !== selected) l.setStyle({ weight: 2, color: cssVar('--text-2') });
        hoverTip.setContent(tipHtml(code)).setLatLng(e.latlng);
        if (!map.hasLayer(hoverTip)) hoverTip.addTo(map);
      });
      l.on('mousemove', e => { if (hovered === code) hoverTip.setLatLng(e.latlng); });
      l.on('mouseout', () => { if (hovered === code) endHover(); });
      l.on('click', () => { endHover(); select(code, true); });
    },
  }).addTo(map);
  map.getContainer().addEventListener('mouseleave', endHover);
  map.on('movestart zoomstart', endHover);

  function legend() {
    const m = MAP_MEASURES[measure];
    const vals = Object.values(data.values);
    const sw = (token, label) => `<div><i style="background:var(${token})"></i><span>${label}</span></div>`;
    let scale;
    if (m.categorical) {
      const parties = Object.entries(data.counts).sort((a, b) => b[1] - a[1]);
      document.getElementById('mapLegend').innerHTML = `
        <div class="small"><strong>${esc(m.name)}</strong> <span class="muted">· ${esc(data.period)}</span></div>
        <ul class="party-legend">${parties.map(([p, n]) => `<li><i style="background:${esc(data.colours[p])}"></i>${esc(p)} <b>${n}</b></li>`).join('')}</ul>
        <p class="small muted" style="margin:6px 0 0">${esc(m.explain)}</p>
        ${sourceLine({ name: data.source.name, url: data.source.url })}`;
      return;
    }
    if (m.diverging || m.zeroClass) {
      const pos = vals.filter(v => v > 0);
      const edges = [Math.min(...pos), ...data.breaks];
      scale = sw(m.zeroClass ? '--div-mid' : '--div-neg', m.zeroClass ? 'None registered' : 'Below 0') + edges.map((e, i) => sw(`--seq-${i + 2}`, data.format(e) + (i === edges.length - 1 ? '+' : ''))).join('');
    } else {
      const edges = [Math.min(...vals), ...data.breaks];
      scale = edges.map((e, i) => sw(`--seq-${i + 1}`, data.format(e) + (i === edges.length - 1 ? '+' : ''))).join('');
    }
    const naCount = Object.keys(data.notApplicable).length;
    const naReasons = [...new Set(Object.values(data.notApplicable))];
    document.getElementById('mapLegend').innerHTML = `
      <div class="small"><strong>${esc(m.name)}</strong> <span class="muted">· ${esc(data.unit)} · ${esc(data.period)}</span></div>
      <div class="legend-scale">${scale}${naCount ? sw('--map-na', 'Not comparable') : ''}<div><i style="background:var(--surface-2);outline:1px solid var(--border)"></i><span>No data</span></div></div>
      <p class="small muted" style="margin:6px 0 0">${esc(m.explain)}${data.per ? ' Shown per 1,000 residents so big and small areas can be compared fairly.' : ''} Each colour band holds about the same number of ${mpLayer ? 'constituencies' : 'areas'}.</p>
      ${[...(data.warnings || []), ...naReasons].map(r => `<p class="small" style="margin:6px 0 0">⚠ ${esc(r)}.</p>`).join('')}
      ${sourceLine({ name: data.source.name, url: data.source.url, extra: data.per ? 'Per 1,000 uses ONS mid-2025 population' : '' })}`;
  }

  async function setMeasure(key) {
    measure = key;
    const m = MAP_MEASURES[key];
    document.getElementById('perSeg').hidden = !!m.rate || mpLayer;
    document.getElementById('mapLegend').innerHTML = loading(m.kind === 'dwp' ? 'Loading from DWP — the first load of a benefit can take up to 30 seconds…' : 'Loading…');
    try {
      const d = await loadShown(key, perK);
      if (measure !== key) return;
      data = d;
      layer.setStyle(style);
      legend();
      if (selected) renderPanel(selected); else introPanel();
    } catch (e) { document.getElementById('mapLegend').innerHTML = errorBox(e); }
    syncUrl();
  }
  const syncUrl = () => history.replaceState(null, '', `#/map?${mpLayer ? 'layer=mps&' : ''}m=${measure}${MAP_MEASURES[measure].rate ? '' : `&per=${perK ? 1 : 0}`}${selected ? '&area=' + selected : ''}`);

  function introPanel() {
    const m = MAP_MEASURES[measure];
    if (mpLayer) {
      const panel = document.getElementById('mapPanel');
      if (m.categorical) {
        panel.innerHTML = `<h3>Click a constituency</h3><p class="small muted">to see its MP: how long they've served, their expenses, and the donations and gifts they've registered.</p>
          <h4 class="small">Seats by party</h4><ol class="rank-list">${Object.entries(data.counts).sort((a, b) => b[1] - a[1]).map(([p, n]) => `<li>${esc(p)} <b>${n}</b></li>`).join('')}</ol>
          <p class="small muted">${esc(mps.nextElection.text)}</p>`;
        return;
      }
      const top = Object.entries(data.values).sort((a, b) => b[1] - a[1]);
      const list = rows => rows.map(([c, v]) => `<li><a href="#" data-code="${c}">${esc(mps.constituencies[c]?.mp || c)}</a> <span class="small muted">${esc(laByCode[c]?.name || '')}</span> <b>${esc(data.format(v))}</b></li>`).join('');
      panel.innerHTML = `<h3>Click a constituency</h3><p class="small muted">to see its MP's full record. Or start with:</p>
        <h4 class="small">Highest — ${esc(m.short)}</h4><ol class="rank-list">${list(top.slice(0, 5))}</ol>
        ${m.zeroClass
          ? `<p class="small muted">${nf(data.zeroCount)} of ${nf(data.count)} MPs have registered none.</p>`
          : `<h4 class="small">Lowest</h4><ol class="rank-list">${list(top.slice(-5).reverse())}</ol>`}`;
      return;
    }
    const top = Object.entries(data.values).sort((a, b) => b[1] - a[1]);
    const list = rows => rows.map(([c, v]) => `<li><a href="#" data-code="${c}">${esc(laByCode[c]?.name || c)}</a> <b>${data.format(v)}</b></li>`).join('');
    document.getElementById('mapPanel').innerHTML = m.kind === 'regional'
      ? `<h3>${esc(m.name)}</h3><p class="small">Every council in a region gets the same colour, because the ONS only estimates tax by region and nation.</p><p class="small">Click any area to see its local figures.</p>`
      : `<h3>Click an area</h3><p class="small muted">to zoom in and see all its figures. Or start with:</p>
        <h4 class="small">Highest — ${esc(m.short)}${data.per ? ' per 1,000' : ''}</h4><ol class="rank-list">${list(top.slice(0, 5))}</ol>
        <h4 class="small">Lowest</h4><ol class="rank-list">${list(top.slice(-5).reverse())}</ol>
        ${data.uk != null ? `<p class="small muted">${esc(data.ukLabel || 'UK')}: <b>${data.format(data.uk)}</b></p>` : ''}`;
  }

  async function select(code, zoom) {
    const prev = selected;
    selected = code;
    if (prev && layers[prev]) layer.resetStyle(layers[prev]);
    selLayer = layers[code];
    if (!selLayer) return;
    layer.resetStyle(selLayer);
    selLayer.bringToFront();
    if (zoom) {
      const opts = { padding: [40, 40], maxZoom: 9.5 };
      // Animation frames don't run in background tabs, so jump instead of flying there.
      if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) map.fitBounds(selLayer.getBounds(), opts);
      else map.flyToBounds(selLayer.getBounds(), { ...opts, duration: 0.6 });
    }
    syncUrl();
    renderPanel(code);
    // The MP profile sits under the map (full width), so bring it into view; on phones every panel does.
    if (mpLayer || innerWidth < 860) document.getElementById('mapPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Side panel: every measure for the chosen area, grouped. Counts show the number
  // and the rate per 1,000 residents, and rank uses the per-1,000 figure.
  async function renderPanel(code) {
    if (mpLayer) return renderMpPanel(code, mps, () => selected === code);
    const la = laByCode[code];
    const panel = document.getElementById('mapPanel');
    const row = async k => {
      const m = MAP_MEASURES[k];
      if (m.kind === 'dwp' && !st.configured) return '';
      try {
        const raw = await loadRaw(k);
        const shown = await loadShown(k, !m.rate);
        const v = raw.values[code];
        const hl = k === measure ? ' class="hl"' : '';
        const label = `<th>${esc(m.short)}<div class="small muted">${esc(shown.period)}</div></th>`;
        if (v == null) return `<tr${hl}>${label}<td class="na">${raw.notApplicable[code] ? `<span class="small">${esc(raw.notApplicable[code])}</span>` : 'no data'}</td></tr>`;
        const main = m.rate ? m.format(v) : nf(v);
        const sub = [];
        if (!m.rate && shown.values[code] != null) sub.push(`${shown.format(shown.values[code])}`);
        if (m.kind !== 'regional' && shown.rank[code]) sub.push(`${ordinal(shown.rank[code])} highest of ${shown.count}`);
        if (shown.uk != null) sub.push(`${shown.ukLabel || 'UK'} ${shown.format(shown.uk)}`);
        if (raw.notes?.[code]) sub.push(raw.notes[code]);
        return `<tr${hl}>${label}<td>${main}${sub.map(s => `<div class="small muted">${esc(s)}</div>`).join('')}</td></tr>`;
      } catch { return ''; }
    };
    panel.innerHTML = `<div class="small muted">${esc(la.region)}</div><h3 style="font-size:1.3rem;margin:2px 0 10px">${esc(la.name)}</h3>${loading()}`;
    const groups = await Promise.all(MAP_GROUPS.map(async g => {
      const rows = (await Promise.all(Object.keys(g.measures).map(row))).join('');
      return rows ? `<details class="panel-group" ${g === groupOf(measure) ? 'open' : ''}><summary>${esc(g.name)}</summary><table class="panel-table">${rows}</table></details>` : '';
    }));
    if (selected !== code) return;
    panel.innerHTML = `
      <div class="small muted">${esc(la.region)}</div>
      <h3 style="font-size:1.3rem;margin:2px 0 10px">${esc(la.name)}</h3>
      ${groups.join('')}
      <div class="controls" style="margin-top:14px"><a class="btn" href="#/area/${code}">Full area profile →</a></div>
      <p class="small muted" style="margin:12px 0 0">Ranks compare all council areas with data, using the per-1,000 figure for counts. Sources are linked under the map.</p>`;
  }

  document.getElementById('mapMeasure').addEventListener('change', e => setMeasure(e.target.value));
  document.getElementById('perSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    perK = b.dataset.v === '1';
    e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    setMeasure(measure);
  });
  document.getElementById('mapReset').addEventListener('click', () => {
    const prev = selected;
    selected = null; selLayer = null;
    if (prev && layers[prev]) layer.resetStyle(layers[prev]);
    map.flyToBounds(ukBounds, { padding: [8, 8], duration: 0.6 });
    syncUrl();
    introPanel();
  });
  document.getElementById('mapPanel').addEventListener('click', e => {
    const a = e.target.closest('a[data-code]'); if (!a) return;
    e.preventDefault(); select(a.dataset.code, true);
  });

  // "Find an area" box
  const input = document.getElementById('mapFind'), list = document.getElementById('mapFindList');
  let matches = [], active = 0;
  const draw = () => {
    list.hidden = !matches.length; input.setAttribute('aria-expanded', !list.hidden);
    list.innerHTML = matches.map((a, i) => `<li role="option" aria-selected="${i === active}" data-code="${a.code}">${esc(a.name)} <span>${esc(a.region)}</span></li>`).join('');
  };
  const choose = code => { matches = []; draw(); input.value = laByCode[code].name; select(code, true); };
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    // (On the MP layer, "region" holds the MP's name, so you can search by MP too.)
    matches = q ? places.filter(a => a.name.toLowerCase().includes(q) || (mpLayer && a.region.toLowerCase().includes(q)))
      .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q)).slice(0, 8) : [];
    active = 0; draw();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { active = Math.min(matches.length - 1, active + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); choose(matches[active].code); }
    else if (e.key === 'Escape') { matches = []; draw(); }
  });
  list.addEventListener('click', e => { const li = e.target.closest('li'); if (li) choose(li.dataset.code); });

  // Re-colour when the light/dark theme changes (colours come from CSS variables).
  onRedraw(() => { if (data) layer.setStyle(style); map.invalidateSize(); });

  if (MAP_MEASURES[measure].kind === 'dwp' && !st.configured) measure = 'claimRate';
  if (mpLayer) map.attributionControl.addAttribution('MPs: <a href="https://members.parliament.uk" target="_blank" rel="noopener">UK Parliament</a> (OPL)');
  await setMeasure(measure);
  if (selected && layers[selected]) select(selected, true);
}
