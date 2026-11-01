// Downloads the latest ONS "Country and regional public sector finances" tables and
// the Nomis population / local-authority lookups, and writes small JSON files the
// website reads. Run with: npm run build-data
//
// Nothing here is typed in by hand: every number comes from the official files.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const OUT = path.join(__dirname, '..', 'public', 'data');
const ONS = 'https://www.ons.gov.uk';
const BASE = '/economy/governmentpublicsectorandtaxes/publicsectorfinance/datasets/';
const NOMIS = 'https://www.nomisweb.co.uk/api/v01/dataset';
const GEOPORTAL = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services';
const BOUNDARIES = 'Local_Authority_Districts_May_2023_UK_BUC_V2';

const AREAS = [
  'United Kingdom', 'North East', 'North West', 'Yorkshire and The Humber', 'East Midlands',
  'West Midlands', 'East of England', 'London', 'South East', 'South West',
  'England', 'Wales', 'Scotland', 'Northern Ireland',
];
const AREA_CODES = {
  'United Kingdom': 'K02000001', 'North East': 'E12000001', 'North West': 'E12000002',
  'Yorkshire and The Humber': 'E12000003', 'East Midlands': 'E12000004', 'West Midlands': 'E12000005',
  'East of England': 'E12000006', 'London': 'E12000007', 'South East': 'E12000008',
  'South West': 'E12000009', 'England': 'E92000001', 'Wales': 'W92000004',
  'Scotland': 'S92000003', 'Northern Ireland': 'N92000002',
};

const sleep = ms => new Promise(res => setTimeout(res, ms));

// ONS rate-limits bursts of requests (HTTP 429), so wait and retry politely.
async function politeFetch(url, tries = 6) {
  for (let i = 0; ; i++) {
    const r = await fetch(url);
    if (r.status !== 429 || i >= tries) {
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      await sleep(500);
      return r;
    }
    const wait = (Number(r.headers.get('retry-after')) || 5 * (i + 1)) * 1000;
    console.warn(`  rate limited, waiting ${wait / 1000}s…`);
    await sleep(wait);
  }
}
const getJson = async url => (await politeFetch(url)).json();
const getText = async url => (await politeFetch(url)).text();

// Find the newest edition of an ONS dataset landing page and download its xlsx.
async function latestWorkbook(slug) {
  const landing = await getJson(`${ONS}${BASE}${slug}/data`);
  for (const { uri } of landing.datasets) {
    const ed = await getJson(`${ONS}${uri}/data`);
    const file = (ed.downloads || []).map(d => d.file).find(f => /\.xlsx$/i.test(f));
    if (!file) continue;
    const r = await politeFetch(`${ONS}/file?uri=${uri}/${file}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.slice(0, 2).toString() !== 'PK') { // not an xlsx (zip); try the previous edition
      console.warn(`  skipped ${uri} (download was not a spreadsheet)`);
      continue;
    }
    return {
      wb: XLSX.read(buf, { type: 'buffer' }),
      meta: {
        title: landing.description.title,
        edition: ed.description.edition || uri.split('/').pop(),
        released: ed.description.releaseDate,
        page: `${ONS}${uri}`,
        file: `${ONS}/file?uri=${uri}/${file}`,
      },
    };
  }
  throw new Error(`No usable xlsx for ${slug}`);
}

// Each sheet: row 2 = header of years, then label rows. Returns {years, rows:{label: [values]}}
function readSheet(wb, name) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
  const hdr = rows.findIndex(r => r[0] === '£ million');
  const years = rows[hdr].slice(1).map(String);
  const out = {};
  for (const r of rows.slice(hdr + 1)) {
    if (!r || typeof r[0] !== 'string') continue;
    const label = r[0].replace(/\s*\[note \d+\]/gi, '').trim();
    if (out[label]) continue; // keep first occurrence (e.g. duplicate "Depreciation")
    out[label] = r.slice(1, years.length + 1).map(v => (typeof v === 'number' ? v : null));
  }
  return { years, rows: out };
}

function pick(rows, re) {
  const k = Object.keys(rows).find(l => re.test(l));
  if (!k) throw new Error(`Row not found: ${re}`);
  return rows[k];
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  console.log('Downloading ONS revenue tables…');
  const rev = await latestWorkbook('countryandregionalpublicsectorfinancesrevenuetables');
  console.log('Downloading ONS net fiscal balance tables…');
  const nfb = await latestWorkbook('countryandregionalpublicsectorfinancesnetfiscalbalancetables');

  // Population (mid-year) for per-head figures, matched to the financial year's start.
  const yearsNeeded = readSheet(rev.wb, 'United Kingdom').years.map(y => y.slice(0, 4));
  const popCsv = await getText(
    `${NOMIS}/NM_2002_1.data.csv?geography=TYPE480,2092957697,2092957699&gender=0&c_age=200&measures=20100` +
    `&time=${yearsNeeded.slice(-10).join(',')}&select=date_name,geography_code,obs_value`);
  const pop = {};
  for (const line of popCsv.trim().split('\n').slice(1)) {
    const [y, code, v] = line.split(',').map(s => s.replace(/"/g, ''));
    (pop[code] ||= {})[y] = Number(v);
  }

  const areas = {};
  for (const name of AREAS) {
    const r = readSheet(rev.wb, name);
    const n = readSheet(nfb.wb, name);
    const code = AREA_CODES[name];
    const series = {
      'Income Tax': pick(r.rows, /^Income Tax$/),
      'National Insurance (social contributions)': pick(r.rows, /^Social Contributions$/),
      'VAT': pick(r.rows, /^Value Added Tax/),
      'Corporation Tax': pick(r.rows, /^Corporation Tax/),
      'Council Tax': pick(r.rows, /^Council Tax$/),
      'Business rates': pick(r.rows, /^Business Rates paid by Market/),
      'Fuel duties': pick(r.rows, /^Fuel Duties$/),
    };
    const total = pick(r.rows, /^Total Current Receipts \(excl\. North Sea/);
    const named = r.years.map((_, i) => Object.values(series).reduce((s, a) => s + (a[i] || 0), 0));
    series['All other receipts'] = total.map((t, i) => (t == null ? null : t - named[i]));

    // Net fiscal balance sheet uses the same years at its right-hand end.
    const nfbAlign = arr => r.years.map(y => { const j = n.years.indexOf(y); return j < 0 ? null : arr[j]; });
    areas[name] = {
      code,
      revenueTotal: total,
      revenueTotalInclNorthSeaGeo: pick(r.rows, /^Total Current Receipts \(incl\. North Sea Oil & Gas Revenues by geographic/),
      revenueBreakdown: series,
      currentExpenditure: nfbAlign(pick(n.rows, /^Total Current Expenditure$/)),
      capitalExpenditure: nfbAlign(pick(n.rows, /^Capital Expenditure$/)),
      netFiscalBalanceExclNorthSea: nfbAlign(pick(n.rows, /^Net Fiscal Balance excl\. North Sea/)),
      population: r.years.map(y => (pop[code] || {})[y.slice(0, 4)] ?? null),
    };
  }

  const finances = {
    note: 'All money values are £ million, financial years April to March. Built from official ONS tables; population is ONS mid-year estimates via Nomis for the year the financial year starts.',
    years: readSheet(rev.wb, 'United Kingdom').years,
    sources: { revenue: rev.meta, netFiscalBalance: nfb.meta,
      population: { title: 'ONS mid-year population estimates (Nomis NM_2002_1)', page: 'https://www.nomisweb.co.uk/datasets/pestsyoala' } },
    builtAt: new Date().toISOString(),
    areas,
  };
  fs.writeFileSync(path.join(OUT, 'regional-finances.json'), JSON.stringify(finances));
  console.log('Wrote regional-finances.json');

  // Local authority -> region lookup (from Nomis geography hierarchy).
  console.log('Building local authority list…');
  const regionDef = await getJson(`${NOMIS}/NM_162_1/geography/TYPE480.def.sdmx.json`);
  const las = [];
  for (const c of regionDef.structure.codelists.codelist[0].code) {
    const regionName = c.description.value === 'East' ? 'East of England' : c.description.value;
    const csv = await getText(`${NOMIS}/NM_162_1.data.csv?geography=${c.value}TYPE424&gender=0&age=0&measure=1&measures=20100&time=latest&select=geography_name,geography_code`);
    for (const line of csv.trim().split('\n').slice(1)) {
      const m = line.match(/^"(.*)","(.*)"$/);
      if (m) las.push({ name: m[1], code: m[2], region: regionName });
    }
  }
  las.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(OUT, 'local-authorities.json'), JSON.stringify(las));
  console.log(`Wrote local-authorities.json (${las.length} areas)`);

  // Council boundaries for the map: ONS Open Geography Portal, "ultra generalised"
  // (simplified) boundaries matching the April 2023 council list used by Nomis.
  console.log('Downloading council boundaries…');
  const geo = await getJson(`${GEOPORTAL}/${BOUNDARIES}/FeatureServer/0/query?where=1%3D1&outFields=LAD23CD,LAD23NM&outSR=4326&geometryPrecision=4&f=geojson`);
  const codes = new Set(las.map(a => a.code));
  geo.features = geo.features.filter(f => codes.has(f.properties.LAD23CD)).map(f => ({
    type: 'Feature', geometry: f.geometry, properties: { code: f.properties.LAD23CD, name: f.properties.LAD23NM },
  }));
  delete geo.crs;
  geo.source = { title: 'Local Authority Districts (May 2023) Boundaries UK BUC, ONS Open Geography Portal', page: 'https://geoportal.statistics.gov.uk' };
  fs.writeFileSync(path.join(OUT, 'la-boundaries.json'), JSON.stringify(geo));
  console.log(`Wrote la-boundaries.json (${geo.features.length} of ${las.length} areas)`);

  await buildImmigration(las);
  await buildSpending();
  await buildRevenue();
  await buildCrime(las);
  await buildHousing(las);
  await buildBills();
  await buildMps();
  await buildDonations();
  await buildFood();
  await buildFuel();
}

// ---------------------------------------------------------------- immigration
// Three official sources, all by council area:
//  - ONS mid-year estimates, table MYE3: international migration in/out/net
//  - Home Office "Regional and local authority data on immigration groups"
//  - Census 2021 country of birth (England and Wales), via Nomis
async function buildImmigration(las) {
  const codes = new Set(las.map(a => a.code));
  const areas = {};
  const put = (code, k, v) => { if (codes.has(code) && typeof v === 'number') (areas[code] ||= {})[k] = v; };
  const sources = {};

  console.log('Downloading ONS population components (international migration)…');
  const mye = await latestWorkbookAt('/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/populationestimatesforukenglandandwalesscotlandandnorthernireland', /tablesuk\.xlsx$/i);
  const myeRows = XLSX.utils.sheet_to_json(mye.wb.Sheets.MYE3, { header: 1 });
  const h = myeRows.findIndex(r => r[0] === 'Code');
  const col = name => myeRows[h].findIndex(c => String(c).trim().toLowerCase() === name.toLowerCase());
  const popCol = myeRows[h].findIndex(c => /^Estimated Population mid-\d{4}$/.test(c) && myeRows[h].indexOf(c) > 5);
  const [cIn, cOut, cNet] = ['International Migration Inflow', 'International Migration Outflow', 'International Migration Net'].map(col);
  for (const r of myeRows.slice(h + 1)) {
    put(r[0], 'intIn', r[cIn]); put(r[0], 'intOut', r[cOut]); put(r[0], 'intNet', r[cNet]); put(r[0], 'pop', r[popCol]);
  }
  const yr = String(myeRows[h][popCol]).match(/\d{4}/)[0];
  sources.ons = { ...mye.meta, title: 'ONS mid-year population estimates, table MYE3 (components of change)', period: `mid-${yr - 1} to mid-${yr}` };

  console.log('Downloading Home Office immigration groups by local authority…');
  const page = await getJson('https://www.gov.uk/api/content/government/statistical-data-sets/immigration-system-statistics-regional-and-local-authority-data');
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const when = t => { const m = t.toLowerCase().match(/year ending (\w+) (\d{4})/); return m ? +m[2] * 12 + MONTHS.indexOf(m[1]) : -1; };
  const att = page.details.attachments.filter(a => /\.(ods|xlsx)$/i.test(a.url)).sort((a, b) => when(b.title) - when(a.title))[0];
  const ho = XLSX.read(Buffer.from(await (await politeFetch(att.url)).arrayBuffer()), { type: 'buffer' });
  const sheet = ho.SheetNames.find(n => /reg_02/i.test(n));
  const hoRows = XLSX.utils.sheet_to_json(ho.Sheets[sheet], { header: 1 });
  const hh = hoRows.findIndex(r => r.some(c => /ONS code/i.test(c)));
  const hcol = re => hoRows[hh].findIndex(c => re.test(String(c)));
  const cCode = hcol(/ONS code/i);
  const hoCols = {
    asylum: hcol(/^Supported Asylum \(total\)/i),
    asylumContingency: hcol(/Supported Asylum - Contingency/i),
    asylumDispersal: hcol(/Supported Asylum - Dispersal/i),
    ukraine: hcol(/^Homes for Ukraine/i),
    afghan: hcol(/^Afghan Resettlement Programme \(total\)/i),
  };
  for (const r of hoRows.slice(hh + 1)) for (const [k, c] of Object.entries(hoCols)) if (c >= 0) put(r[cCode], k, r[c]);
  sources.homeOffice = {
    title: att.title, file: att.url, page: 'https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-regional-and-local-authority-data',
    period: String(hoRows[0][0]).match(/as at (.*)$/i)?.[1] || att.title, released: page.public_updated_at,
  };

  console.log('Downloading Census 2021 country of birth…');
  const cob = await getText(`${NOMIS}/NM_2024_1.data.csv?geography=TYPE424&measures=20301&select=geography_code,c2021_cob_12_name,obs_value`);
  for (const line of cob.trim().split('\n').slice(1)) {
    const m = line.match(/^"([^"]*)","([^"]*)",(.*)$/);
    if (!m) continue;
    const [, code, cat, v] = m;
    if (cat === 'Europe: United Kingdom') put(code, 'bornAbroadPct', Math.round((100 - Number(v)) * 10) / 10);
  }
  sources.census = { title: 'Census 2021, TS004 Country of birth (England and Wales)', page: 'https://www.nomisweb.co.uk/datasets/c2021ts004', period: 'March 2021' };

  const missing = las.filter(a => !areas[a.code]?.intNet && areas[a.code]?.intNet !== 0).map(a => a.name);
  fs.writeFileSync(path.join(OUT, 'immigration.json'), JSON.stringify({ builtAt: new Date().toISOString(), sources, areas }));
  console.log(`Wrote immigration.json (${Object.keys(areas).length} areas${missing.length ? `; no ONS migration figure for: ${missing.join(', ')}` : ''})`);
}

// Newest xlsx on an ONS dataset page whose filename matches `re`.
async function latestWorkbookAt(base, re) {
  const landing = await getJson(`${ONS}${base}/data`);
  for (const { uri } of landing.datasets) {
    const ed = await getJson(`${ONS}${uri}/data`);
    const file = (ed.downloads || []).map(d => d.file).find(f => re.test(f));
    if (!file) continue;
    const r = await politeFetch(`${ONS}/file?uri=${uri}/${file}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.slice(0, 2).toString() !== 'PK') continue;
    return { wb: XLSX.read(buf, { type: 'buffer' }), meta: { page: `${ONS}${uri}`, file: `${ONS}/file?uri=${uri}/${file}`, released: ed.description.releaseDate } };
  }
  throw new Error(`No usable xlsx at ${base}`);
}

// ---------------------------------------------------------------- government spending
// HM Treasury "Public Expenditure Statistical Analyses" (PESA): the official breakdown
// of UK public spending by function (UN COFOG categories), published each July.
async function buildSpending() {
  console.log('Downloading HM Treasury PESA tables…');
  const coll = await getJson('https://www.gov.uk/api/content/government/collections/public-expenditure-statistical-analyses-pesa');
  const pub = (coll.links.documents || []).filter(d => /Public Expenditure Statistical Analyses \d{4}/.test(d.title))
    .sort((a, b) => b.title.localeCompare(a.title))[0];
  const page = await getJson(`https://www.gov.uk/api/content${pub.base_path}`);
  const att = n => page.details.attachments.find(a => new RegExp(`Chapter ${n} Tables`, 'i').test(a.title) && /\.xlsx$/i.test(a.url));
  const book = async n => XLSX.read(Buffer.from(await (await politeFetch(att(n).url)).arrayBuffer()), { type: 'buffer' });
  const [c4, c5, c9] = [await book(4), await book(5), await book(9)];
  const rows = (wb, name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
  const num = v => (typeof v === 'number' ? v : null);
  const strip = s => String(s).replace(/\s*\(\d+\)(,\s*\(\d+\))*/g, '').replace(/^\s*(of which:)\s*/i, '$1 ').trim();

  // Tables 4.2 (cash) and 4.3 (real terms): functions over time, £ billion.
  const byFunction = (name) => {
    const r = rows(c4, name);
    const h = r.findIndex(x => x.some(c => /^\d{4}-\d{2}$/.test(c)));
    const years = r[h].slice(1).filter(Boolean).map(String);
    const out = {};
    for (const x of r.slice(h + 1)) if (typeof x[0] === 'string' && x.slice(1).some(v => typeof v === 'number')) out[strip(x[0])] = x.slice(1, years.length + 1).map(num);
    return { years, rows: out };
  };
  const cash = byFunction('4_2');
  const real = byFunction('4_3');

  // Table 4.1: total managed expenditure since 1985-86 (cash, real, % of GDP); later rows are plans.
  const agg = rows(c4, '4_1');
  const aggStart = agg.findIndex(x => /^\d{4}-\d{2}$/.test(String(x[0])));
  const lastOutturn = cash.years[cash.years.length - 1];
  const tme = { years: [], cash: [], real: [], pctGDP: [] };
  for (const x of agg.slice(aggStart)) {
    if (!/^\d{4}-\d{2}$/.test(String(x[0]))) break;
    if (String(x[0]) > lastOutturn) break; // keep outturn only, not plans
    const n = x.filter(v => typeof v === 'number');
    tme.years.push(String(x[0])); tme.cash.push(n[n.length - 3]); tme.real.push(n[n.length - 2]); tme.pctGDP.push(n[n.length - 1]);
  }

  // Table 5.2: sub-functions, £ million, latest year (last column).
  const sub = rows(c5, '5_2');
  const sh = sub.findIndex(x => x.some(c => /^\d{4}-\d{2}$/.test(c)));
  const subYears = sub[sh].slice(1).filter(Boolean).map(String);
  const functions = [];
  let fn = null, lastChild = null;
  for (const x of sub.slice(sh + 2)) {
    const label = typeof x[0] === 'string' ? x[0].trim() : '';
    if (!label) continue;
    if (/^\d+\.\s/.test(label) && x.length <= 1) { fn = { name: strip(label), children: [] }; functions.push(fn); lastChild = null; continue; }
    if (/^EU transactions/i.test(label)) { fn = null; continue; }
    if (!fn) continue;
    const vals = x.slice(1, subYears.length + 1).map(v => (typeof v === 'number' ? v : 0));
    const latest = vals[vals.length - 1];
    if (/^total/i.test(label)) { fn.total = latest; fn = /^Total social protection/i.test(label) ? null : fn; continue; }
    if (/^of which/i.test(label)) { if (lastChild) (lastChild.parts ||= []).push({ name: strip(label).replace(/^of which:\s*/i, ''), value: latest, history: vals }); continue; }
    lastChild = { name: strip(label).replace(/^\d+\.\d+\s+/, ''), value: latest, history: vals };
    fn.children.push(lastChild);
  }

  // Table 5.1: latest year's spending by departmental group, split by function (£ million).
  const dep = rows(c5, '5_1');
  const dh = dep.findIndex(x => x[1] && /General public services/.test(x[1]));
  const depCols = dep[dh].map(c => strip(c || ''));
  const departments = [];
  for (const x of dep.slice(dh + 1)) {
    if (typeof x[0] !== 'string' || /^Public sector expenditure/i.test(x[0])) break;
    const total = x.filter(v => typeof v === 'number').pop();
    const byFunction = {};
    depCols.forEach((c, i) => { if (i && /^\d+\.\s/.test(c) && typeof x[i] === 'number' && x[i]) byFunction[c] = x[i]; });
    departments.push({ name: x[0].trim(), total, byFunction });
  }

  // Table 9.15: identifiable spending per person, by region and function, latest year block.
  const reg = rows(c9, '9.15');
  const head = reg.find(x => x[1] && /General public services/.test(x[1])).slice(1).map(s => strip(s || ''));
  let blockStart = -1, regYear = '';
  reg.forEach((x, i) => { if (x.length === 1 && /^\d{4}-\d{2}$/.test(String(x[0]))) { blockStart = i; regYear = String(x[0]); } });
  const regions = {};
  for (const x of reg.slice(blockStart + 1)) {
    if (typeof x[0] !== 'string' || !x.slice(1).some(v => typeof v === 'number')) break;
    const vals = Object.fromEntries(head.map((h, i) => [h, num(x[i + 1])]).filter(([h]) => h && !/^Total/i.test(h)));
    // The total sits after a blank spacer column, so take the row's last number.
    vals.Total = x.filter(v => typeof v === 'number').pop();
    regions[x[0].trim()] = vals;
  }

  const out = {
    builtAt: new Date().toISOString(),
    source: { title: page.title, page: `https://www.gov.uk${pub.base_path}`, released: page.first_published_at, publisher: 'HM Treasury' },
    year: lastOutturn,
    years: cash.years,
    cash: cash.rows,
    real: real.rows,
    tme,
    functions,
    departments,
    subYears,
    regional: { year: regYear, functions: head.filter(h => h && !/^Total/i.test(h)), regions },
  };
  fs.writeFileSync(path.join(OUT, 'spending.json'), JSON.stringify(out));
  console.log(`Wrote spending.json (${page.title}; ${functions.length} functions, ${Object.keys(regions).length} regions)`);
}

// ---------------------------------------------------------------- where the money comes from
// UK public sector revenue by tax, from the same ONS revenue tables as the regional page
// ("United Kingdom" sheet), grouped into plain-English categories. Every row is kept so
// the website can show what's inside each category.
const REVENUE_GROUPS = [
  { key: 'income', name: 'Income Tax', rows: [/^Income Tax$/] },
  { key: 'ni', name: 'National Insurance', rows: [/^Social Contributions$/] },
  { key: 'vat', name: 'VAT', rows: [/^Value Added Tax/], detail: [/^VAT Net of Refunds/, /^VAT Refunds/] },
  { key: 'corp', name: 'Corporation Tax', rows: [/^Corporation Tax \(excl/, /^Offshore Corporation Tax - Geographic/] },
  { key: 'council', name: 'Council Tax', rows: [/^Council Tax$/, /^Northern Ireland (Regional|District) Domestic Rates/] },
  { key: 'rates', name: 'Business rates', rows: [/^Business Rates paid by/, /^Northern Ireland (Regional|District) Non-Domestic Rates/] },
  { key: 'fuel', name: 'Fuel duty', rows: [/^Fuel Duties$/] },
  { key: 'stamp', name: 'Stamp duties (property and shares)', rows: [/^Taxes on Land and Buildings Transactions/, /^Annual Tax on Enveloped/, /^Stamp Tax on Shares/] },
  { key: 'drink', name: 'Alcohol and tobacco duties', rows: [/^Alcohol Duties/, /^Tobacco Duties/] },
  { key: 'cgt', name: 'Capital Gains Tax', rows: [/^Capital Gains Tax/] },
  { key: 'iht', name: 'Inheritance Tax (and other capital taxes)', rows: [/^Taxes on Capital$/] },
  { key: 'ved', name: 'Vehicle Excise Duty (car tax)', rows: [/^Vehicle excise Duties/] },
  { key: 'nontax', name: 'Non-tax income', rows: [/^Gross Operating Surplus/, /^Interest and Dividends/, /^Rent and Other Current Transfers/] },
];
// Detail rows shown inside "Other taxes" (everything not in a group above).
const OTHER_TAX_DETAIL = [/^Air Passenger Duty/, /^Insurance Premium Tax/, /^Environmental Levies/, /^Climate Change Levy/, /^ETS Auction/, /^Betting and Gaming Duties/,
  /^Apprenticeship Levy/, /^Custom Duties/, /^Digital Services Tax/, /^Soft Drinks/, /^Plastic Packaging/, /^Immigration Skills/, /^Taxes on Landfill/, /^Aggregates Levy/,
  /^Bank Levy/, /^Bank of England Levy/, /^TV Licence Fees/, /^Visa Fees/, /^Energy Profits Levy/, /^Petroleum Revenue Tax - Geographic/, /^Miscellaneous/];

async function buildRevenue() {
  console.log('Building revenue by tax (ONS)…');
  const rev = await latestWorkbook('countryandregionalpublicsectorfinancesrevenuetables');
  const uk = XLSX.utils.sheet_to_json(rev.wb.Sheets['United Kingdom'], { header: 1 });
  const h = uk.findIndex(r => r[0] === '£ million');
  const years = uk[h].slice(1).filter(Boolean).map(String);
  const rows = [];
  for (const r of uk.slice(h + 1)) {
    if (typeof r[0] !== 'string' || !r.slice(1).some(v => typeof v === 'number')) continue;
    rows.push({ label: r[0].replace(/\s*\[note \d+\]/gi, '').replace(/,\s*of which:$/i, '').trim(), values: years.map((_, i) => (typeof r[i + 1] === 'number' ? Math.round(r[i + 1]) : null)) });
  }
  const find = re => rows.find(x => re.test(x.label));
  const total = find(/^Total Current Receipts \(incl\. North Sea Oil & Gas Revenues by geographic/);
  const add = (a, b) => a.map((v, i) => (v ?? 0) + (b[i] ?? 0));
  const groups = REVENUE_GROUPS.map(g => {
    const parts = g.rows.flatMap(re => rows.filter(x => re.test(x.label)));
    // `detail` rows are a breakdown of the total (shown on the site), not added to it.
    const shown = g.detail ? g.detail.flatMap(re => rows.filter(x => re.test(x.label))) : parts;
    return { key: g.key, name: g.name, values: parts.reduce((s, p) => add(s, p.values), years.map(() => 0)), parts: shown.map(p => ({ label: p.label, values: p.values })) };
  });
  // Everything else is "Other taxes", so the groups always add up to the official total.
  const grouped = groups.reduce((s, g) => add(s, g.values), years.map(() => 0));
  const other = total.values.map((t, i) => t - grouped[i]);
  groups.push({ key: 'other', name: 'Other taxes', values: other,
    parts: OTHER_TAX_DETAIL.map(re => find(re)).filter(Boolean).map(p => ({ label: p.label, values: p.values })) });
  const out = {
    builtAt: new Date().toISOString(),
    source: { ...rev.meta, title: 'ONS Country and regional public sector finances: revenue tables (United Kingdom)' },
    years,
    total: total.values,
    groups,
  };
  fs.writeFileSync(path.join(OUT, 'revenue.json'), JSON.stringify(out));
  console.log(`Wrote revenue.json (${years[0]} to ${years[years.length - 1]}; total ${years[years.length - 1]} £${(out.total[out.total.length - 1] / 1000).toFixed(1)}bn)`);
}

// ---------------------------------------------------------------- crime
// Police recorded crime by Community Safety Partnership (CSP), England and Wales, from the
// Home Office open data tables (quarterly). Summed over the latest 12 months and the 12
// months before, then attached to council areas.
// Most CSPs match one council by name. These ones still use older district names or
// cover several councils; councils that share a CSP get the same combined figures.
const CSP_TO_LA = {
  'Allerdale': ['Cumberland'], 'Carlisle': ['Cumberland'], 'Copeland': ['Cumberland'],
  'Barrow-in-Furness': ['Westmorland and Furness'], 'Eden': ['Westmorland and Furness'], 'South Lakeland': ['Westmorland and Furness'],
  'East and Mid Devon': ['East Devon', 'Mid Devon'], 'Northern Devon': ['North Devon', 'Torridge'],
  'South Devon and Dartmoor': ['South Hams', 'Teignbridge', 'West Devon'],
  // Christchurch's crimes may sit in either CSP, so BCP and Dorset share one combined figure.
  'Bournemouth': ['Bournemouth, Christchurch and Poole', 'Dorset'], 'Poole': ['Bournemouth, Christchurch and Poole', 'Dorset'], 'Dorset': ['Bournemouth, Christchurch and Poole', 'Dorset'],
  'North Hampshire': ['Basingstoke and Deane', 'Hart', 'Rushmoor'], 'Dartford and Gravesham': ['Dartford', 'Gravesham'],
  'London, City of': ['City of London'], 'City of York': ['York'], 'Manchester Airport': ['Manchester'],
  'Corby': ['North Northamptonshire'], 'East Northamptonshire': ['North Northamptonshire'], 'Kettering': ['North Northamptonshire'], 'Wellingborough': ['North Northamptonshire'],
  'Daventry and South Northamptonshire': ['West Northamptonshire'], 'Northampton': ['West Northamptonshire'],
  'South Nottinghamshire': ['Broxtowe', 'Gedling', 'Rushcliffe'], 'Cwm Taf': ['Merthyr Tydfil', 'Rhondda Cynon Taf'],
  'Suffolk Coastal': ['East Suffolk'], 'Waveney': ['East Suffolk'], 'Western Suffolk': ['Babergh', 'Mid Suffolk', 'West Suffolk'],
  'Aylesbury Vale': ['Buckinghamshire'], 'Chiltern': ['Buckinghamshire'], 'South Bucks': ['Buckinghamshire'], 'Wycombe': ['Buckinghamshire'],
  'South Warwickshire': ['Stratford-on-Avon', 'Warwick'],
  'North Worcestershire': ['Bromsgrove', 'Redditch', 'Wyre Forest'], 'South Worcester': ['Malvern Hills', 'Worcester', 'Wychavon'],
};
// Crime categories (by the table's offence group / subgroup).
const CRIME_TYPES = {
  violence: r => r.group === 'Violence against the person',
  sexual: r => r.group === 'Sexual offences',
  robbery: r => r.group === 'Robbery',
  burglary: r => /burglary/i.test(r.sub),
  vehicle: r => r.sub === 'Vehicle offences',
  shoplifting: r => r.sub === 'Shoplifting',
  theftPerson: r => r.sub === 'Theft from the person',
  damage: r => r.group === 'Criminal damage and arson',
  drugs: r => r.group === 'Drug offences',
  weapons: r => r.group === 'Possession of weapons offences',
  publicOrder: r => r.group === 'Public order offences',
};

async function buildCrime(las) {
  const { readRows } = require('./ods-stream');
  console.log('Downloading Home Office police recorded crime by area (large file)…');
  const page = await getJson('https://www.gov.uk/api/content/government/statistical-data-sets/police-recorded-crime-and-outcomes-open-data-tables');
  const att = page.details.attachments.filter(a => /Community Safety Partnership open data, year ending March \d{4} to/i.test(a.title) && /\.ods$/i.test(a.url))
    .sort((a, b) => b.title.localeCompare(a.title))[0]; // newest range first ("…2021 to…" sorts after "…2016 to…")
  const tmp = path.join(require('os').tmpdir(), `prc-csp-${Date.now()}.ods`);
  fs.writeFileSync(tmp, Buffer.from(await (await politeFetch(att.url)).arrayBuffer()));

  // Sum offences per CSP per quarter (quarter index = financial year start * 4 + quarter).
  const perQuarter = {};
  const forceOf = {};
  let latestQ = 0;
  await readRows(tmp, (sheet, c) => {
    if (!/^\d{4}_\d{2}$/.test(sheet) || c[0] === 'Financial Year' || typeof c[8] !== 'number') return;
    const q = Number(String(c[0]).slice(0, 4)) * 4 + (Number(c[1]) - 1);
    latestQ = Math.max(latestQ, q);
    forceOf[c[3]] = c[2];
    const r = { group: c[5], sub: c[6] };
    const k = `${c[3]}|${q}`;
    const t = (perQuarter[k] ||= { total: 0 });
    t.total += c[8];
    for (const [type, test] of Object.entries(CRIME_TYPES)) if (test(r)) t[type] = (t[type] || 0) + c[8];
  });
  fs.unlinkSync(tmp);

  const norm = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
  const laByName = new Map(las.map(a => [norm(a.name), a]));
  const csps = [...new Set(Object.keys(perQuarter).map(k => k.split('|')[0]))].filter(n => !/^Unassigned/i.test(n));
  // Group CSPs that feed the same set of councils.
  const blocks = new Map(); // key = sorted LA codes
  const unmatched = [];
  for (const csp of csps) {
    const names = CSP_TO_LA[csp] || [csp];
    const codes = names.map(n => laByName.get(norm(n))?.code).filter(Boolean);
    if (codes.length !== names.length) { unmatched.push(csp); continue; }
    const key = [...new Set(codes)].sort().join(',');
    (blocks.get(key) || blocks.set(key, { codes: key.split(','), csps: [] }).get(key)).csps.push(csp);
  }
  const sumYear = (cspList, endQ) => {
    const out = { total: 0 };
    for (const csp of cspList) for (let q = endQ - 3; q <= endQ; q++) {
      const t = perQuarter[`${csp}|${q}`]; if (!t) continue;
      for (const [k, v] of Object.entries(t)) out[k] = (out[k] || 0) + v;
    }
    return out;
  };
  // Share of each police force's crime that it couldn't link to an area ("Unassigned").
  const forceTotals = {};
  for (const csp of Object.keys(forceOf)) {
    const f = forceOf[csp], t = (forceTotals[f] ||= { all: 0, unassigned: 0, prevAll: 0, prevUnassigned: 0 });
    const n = sumYear([csp], latestQ).total, p = sumYear([csp], latestQ - 4).total;
    t.all += n; t.prevAll += p;
    if (/^Unassigned/i.test(csp)) { t.unassigned += n; t.prevUnassigned += p; }
  }
  const pop = JSON.parse(fs.readFileSync(path.join(OUT, 'immigration.json'), 'utf8')).areas;
  const areas = {};
  for (const b of blocks.values()) {
    const latest = sumYear(b.csps, latestQ), previous = sumYear(b.csps, latestQ - 4);
    const shared = b.codes.length > 1 ? b.codes.map(c => las.find(a => a.code === c).name) : null;
    // A real area has at least ~30 recorded crimes per 1,000 people a year. Far below that means
    // the force is filing this area's crime as "unassigned", so the local figure isn't usable.
    const force = forceOf[b.csps[0]];
    const rate = latest.total / b.codes.reduce((s, c) => s + (pop[c]?.pop || 0), 0) * 1000;
    const ft = forceTotals[force];
    const unreliable = rate < 15
      ? `${force} Police currently records most crime here as “unassigned” (not linked to any local area — ${Math.round(ft.unassigned / ft.all * 100)}% of all its recorded crime), so the local figure isn't reliable`
      : null;
    for (const code of b.codes) areas[code] = { latest, previous, sharedWith: shared, force, unreliable };
  }
  const qLabel = q => { const fy = Math.floor(q / 4), qi = q % 4; const [m, y] = [['June', fy], ['September', fy], ['December', fy], ['March', fy + 1]][qi]; return `year ending ${m} ${y}`; };
  const out = {
    builtAt: new Date().toISOString(),
    period: qLabel(latestQ), previousPeriod: qLabel(latestQ - 4),
    source: { title: 'Home Office police recorded crime open data, by Community Safety Partnership', page: 'https://www.gov.uk/government/statistical-data-sets/police-recorded-crime-and-outcomes-open-data-tables', file: att.url, released: page.public_updated_at },
    forces: Object.fromEntries(Object.entries(forceTotals).map(([f, t]) => [f, {
      recorded: t.all,
      unassignedShare: t.all ? t.unassigned / t.all : 0,
      prevUnassignedShare: t.prevAll ? t.prevUnassigned / t.prevAll : 0,
    }])),
    areas,
  };
  fs.writeFileSync(path.join(OUT, 'crime.json'), JSON.stringify(out));
  const flagged = [...new Set(Object.entries(areas).filter(([, a]) => a.unreliable).map(([c]) => las.find(a => a.code === c).name))];
  console.log(`Wrote crime.json (${Object.keys(areas).length} council areas, ${out.period})${unmatched.length ? `\n  CSPs not matched: ${unmatched.join(', ')}` : ''}${flagged.length ? `\n  Flagged as unreliable (crime filed as unassigned): ${flagged.join(', ')}` : ''}`);
}

// ---------------------------------------------------------------- housing: prices and rents
// House prices: UK House Price Index (HM Land Registry with ONS, Registers of Scotland and
// LPS Northern Ireland), monthly by council. Rents: ONS Price Index of Private Rents.
async function buildHousing(las) {
  const codes = new Set(las.map(a => a.code));
  // Councils whose code changed after a boundary update (e.g. Sheffield, Barnsley) are matched by name.
  const byName = new Map(las.map(a => [a.name.toLowerCase(), a.code]));
  const areas = {};
  const put = (code, k, v, name) => {
    if (!codes.has(code)) code = byName.get(String(name || '').toLowerCase()) || code;
    if (codes.has(code) && v !== '' && v != null && isFinite(Number(v))) (areas[code] ||= {})[k] = Number(v);
  };

  console.log('Downloading UK House Price Index…');
  let hpiCsv = null, hpiUrl = '';
  for (let back = 1; back <= 5 && !hpiCsv; back++) { // published about two months after the data month
    const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back);
    hpiUrl = `https://publicdata.landregistry.gov.uk/market-trend-data/house-price-index-data/UK-HPI-full-file-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.csv`;
    const r = await fetch(hpiUrl);
    if (r.ok) hpiCsv = await r.text();
  }
  if (!hpiCsv) throw new Error('UK HPI file not found');
  const lines = hpiCsv.split(/\r?\n/);
  const head = lines[0].split(',');
  const col = n => head.indexOf(n);
  const toIso = s => { const [dd, mm, yy] = s.split('/'); return `${yy}-${mm}-${dd}`; };
  let latest = '';
  for (const l of lines.slice(1)) { const d = l.slice(0, 10); if (/^\d\d\/\d\d\/\d{4}$/.test(d) && toIso(d) > latest) latest = toIso(d); }
  for (const l of lines.slice(1)) {
    if (!l || toIso(l.slice(0, 10)) !== latest) continue;
    const c = l.split(',');
    const code = c[col('AreaCode')], name = c[col('RegionName')];
    put(code, 'price', c[col('AveragePrice')], name); put(code, 'priceChange', c[col('12m%Change')], name);
    put(code, 'ftbPrice', c[col('FTBPrice')], name);
    for (const t of ['Detached', 'SemiDetached', 'Terraced', 'Flat']) put(code, `price${t}`, c[col(`${t}Price`)], name);
  }
  const hpiMonth = new Date(latest + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  console.log('Downloading ONS Price Index of Private Rents…');
  const pipr = await latestWorkbookAt('/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics', /\.xlsx$/i);
  const pr = XLSX.utils.sheet_to_json(pipr.wb.Sheets['Table 1'], { header: 1 });
  const ph = pr.findIndex(r => r[0] === 'Time period');
  const pc = n => pr[ph].indexOf(n);
  const lastPeriod = Math.max(...pr.slice(ph + 1).map(r => (typeof r[0] === 'number' ? r[0] : 0)));
  for (const r of pr.slice(ph + 1)) {
    if (r[0] !== lastPeriod) continue;
    put(r[pc('Area code')], 'rent', r[pc('Rental price')], r[pc('Area name')]);
    put(r[pc('Area code')], 'rentChange', r[pc('Annual change')], r[pc('Area name')]);
  }
  const rentMonth = new Date(Date.UTC(1899, 11, 30) + lastPeriod * 864e5).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const out = {
    builtAt: new Date().toISOString(),
    prices: { period: hpiMonth, title: 'UK House Price Index (HM Land Registry, ONS, Registers of Scotland, LPS Northern Ireland)', page: 'https://www.gov.uk/government/collections/uk-house-price-index-reports', file: hpiUrl },
    rents: { period: rentMonth, title: 'ONS Price Index of Private Rents', page: pipr.meta.page, released: pipr.meta.released },
    areas,
  };
  fs.writeFileSync(path.join(OUT, 'housing.json'), JSON.stringify(out));
  const noPrice = las.filter(a => !areas[a.code]?.price).map(a => a.name);
  const noRent = las.filter(a => !areas[a.code]?.rent).map(a => a.name);
  console.log(`Wrote housing.json (prices ${hpiMonth}, rents ${rentMonth})${noPrice.length ? `\n  No price for: ${noPrice.join(', ')}` : ''}${noRent.length ? `\n  No rent for: ${noRent.join(', ')}` : ''}`);
}

// ---------------------------------------------------------------- household bills
// Energy: Ofgem price cap (current), DESNZ average bills by region. Water: average bills by
// water company (Discover Water, from the companies' figures reported to Ofwat).
async function buildBills() {
  const out = { builtAt: new Date().toISOString() };

  console.log('Reading the Ofgem energy price cap…');
  try {
    const capUrl = 'https://www.ofgem.gov.uk/your-energy-supply/your-energy-bill/energy-price-cap-unit-rates-and-standing-charges';
    const html = await getText(capUrl);
    const clean = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
    const table = html.match(/<table[\s\S]*?<\/table>/)?.[0] || '';
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map(r => [...r[0].matchAll(/<t[hd][\s\S]*?<\/t[hd]>/g)].map(c => clean(c[0])));
    const periods = rows[0].slice(1).map(p => p.replace(/^Energy price cap per unit and standing charge\s*/i, ''));
    const parse = cell => ({ unit: Number(cell.match(/([\d.]+) pence per kWh/)?.[1]), standing: Number(cell.match(/([\d.]+) pence daily standing charge/)?.[1]) });
    const fuel = name => rows.find(r => new RegExp(`^${name}`, 'i').test(r[0]))?.slice(1).map(parse) || [];
    const elec = fuel('Electricity'), gas = fuel('Gas');
    const notes = clean(html.replace(/<script[\s\S]*?<\/script>/g, '')).match(/Figures are rounded[^.]*\.(?:[^.]*VAT[^.]*\.)?/)?.[0] || '';
    out.priceCap = {
      source: { title: 'Ofgem energy price cap', page: capUrl },
      periods: periods.map((p, i) => ({ period: p, electricity: elec[i], gas: gas[i] })),
      notes,
      // Ofgem's typical domestic consumption values, used to work out a typical yearly bill.
      typicalUse: { electricity: 2700, gas: 11500 },
    };
    if (!out.priceCap.periods.every(p => p.electricity?.unit && p.gas?.unit)) throw new Error('could not read rates');
  } catch (e) { console.warn(`  Ofgem price cap not read: ${e.message}`); }

  console.log('Downloading DESNZ average energy bills by region…');
  const page = await getJson('https://www.gov.uk/api/content/government/statistical-data-sets/annual-domestic-energy-price-statistics');
  const readRegional = async (re, fuel) => {
    const att = page.details.attachments.find(a => re.test(a.title));
    const wb = XLSX.read(Buffer.from(await (await politeFetch(att.url)).arrayBuffer()), { type: 'buffer' });
    const sheet = wb.SheetNames.find(n => /Financial Year/i.test(n)) || wb.SheetNames.find(n => /^\d/.test(n));
    const r = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1 });
    const h = r.findIndex(x => x[0] === 'Year');
    const years = r.slice(h + 1).map(x => String(x[0] ?? '').replace(/\s*\(?[pr]\)?$/i, '').trim()).filter(y => /^\d{4}/.test(y));
    const latestYear = years.sort().pop();
    const billCols = r[h].map((c, i) => [String(c), i]).filter(([c]) => /Bill \(pounds\)/i.test(c));
    const consumption = String(r[0][0]).match(/([\d,]+)\s*kWh/i)?.[1];
    const regions = {};
    for (const x of r.slice(h + 1)) {
      if (String(x[0] ?? '').replace(/\s*\(?[pr]\)?$/i, '').trim() !== latestYear || typeof x[1] !== 'string') continue;
      regions[x[1].trim()] = Object.fromEntries(billCols.map(([c, i]) => [c.split(':')[0].trim(), typeof x[i] === 'number' ? Math.round(x[i]) : null]));
    }
    return { fuel, year: latestYear, consumptionKwh: consumption ? Number(consumption.replace(/,/g, '')) : null, regions, source: { title: att.title, page: 'https://www.gov.uk/government/statistical-data-sets/annual-domestic-energy-price-statistics', released: page.public_updated_at } };
  };
  out.energyByRegion = {
    electricity: await readRegional(/electricity bills for UK regions/i, 'electricity'),
    gas: await readRegional(/gas bills for GB regions/i, 'gas'),
  };

  console.log('Downloading average water bills…');
  const dw = 'https://www.discoverwater.co.uk';
  const dwPage = await getText(`${dw}/annual-bill`);
  const csvNames = [...new Set([...dwPage.matchAll(/data-csv="([^"]+\.csv)"/g)].map(m => m[1]))];
  // Each CSV: a title row, a row of years, then "Company,£123,£120,…" (newest year first).
  const readCsv = async name => {
    const lines = (await getText(`${dw}/csv/${name}`)).trim().split(/\r?\n/);
    const years = lines[1].split(',').slice(1).map(s => s.trim()).filter(Boolean);
    const rows = {};
    for (const l of lines.slice(2)) {
      const cells = l.match(/("[^"]*"|[^,]+)/g)?.map(s => s.replace(/"/g, '').trim()) || [];
      const name = cells[0];
      if (!name || rows[name]) continue;
      rows[name] = years.map((_, i) => { const v = Number(String(cells[i + 1] || '').replace(/[£,]/g, '')); return v > 0 ? v : null; });
    }
    return { years, rows };
  };
  const pick = (re, prev) => csvNames.find(n => re.test(n) && /previous/i.test(n) === prev);
  // The "previous" files hold the latest year plus earlier years, so use them when present.
  const read = async re => readCsv(pick(re, true) || pick(re, false));
  const [combined, water, sewerage] = [await read(/combined/i), await read(/average-water-bill/i), await read(/sewerage/i)];
  out.water = {
    years: combined.years, // newest first
    combined: combined.rows, water: water.rows, sewerage: sewerage.rows,
    source: { title: 'Average household water and sewerage bills by company (Discover Water; figures reported by the water companies to Ofwat)', page: `${dw}/annual-bill` },
  };
  fs.writeFileSync(path.join(OUT, 'bills.json'), JSON.stringify(out));
  console.log(`Wrote bills.json (price cap: ${out.priceCap ? out.priceCap.periods.map(p => p.period).join(' / ') : 'not available'}; energy ${out.energyByRegion.electricity.year}; water ${out.water.years.join(', ')})`);
}

// ---------------------------------------------------------------- MPs
// Every Westminster constituency and its MP, from four official sources:
//  - ONS Open Geography: July 2024 constituency boundaries
//  - UK Parliament Members API: current MP, party, and every Commons membership (for years served)
//  - IPSA: MPs' business costs ("expenses") — annual totals and published individual claims
//  - UK Parliament Register of Members' Financial Interests API: donations, gifts, hospitality and visits
const PARL = 'https://members-api.parliament.uk/api';
const INTERESTS = 'https://interests-api.parliament.uk/api/v1';
const IPSA = 'https://www.theipsa.org.uk/api/download';
const normName = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const money = s => { const n = Number(String(s ?? '').replace(/[£,\s]/g, '')); return isFinite(n) ? n : 0; };
const ipsaYear = y => `20${y.slice(0, 2)}-${y.slice(3)}`;

async function buildMps() {
  console.log('Downloading constituency boundaries…');
  const geo = await getJson(`${GEOPORTAL}/Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC/FeatureServer/0/query?where=1%3D1&outFields=PCON24CD,PCON24NM&outSR=4326&geometryPrecision=4&f=geojson`);
  geo.features = geo.features.map(f => ({ type: 'Feature', geometry: f.geometry, properties: { code: f.properties.PCON24CD, name: f.properties.PCON24NM } }));
  delete geo.crs;
  geo.source = { title: 'Westminster Parliamentary Constituencies (July 2024) Boundaries UK BUC, ONS Open Geography Portal', page: 'https://geoportal.statistics.gov.uk' };
  fs.writeFileSync(path.join(OUT, 'pcon-boundaries.json'), JSON.stringify(geo));
  console.log(`Wrote pcon-boundaries.json (${geo.features.length} constituencies)`);

  console.log('Downloading current MPs from the Members API…');
  const members = [];
  for (let skip = 0; ; skip += 20) {
    const d = await getJson(`${PARL}/Members/Search?House=1&IsCurrentMember=true&skip=${skip}&take=20`);
    members.push(...d.items.map(i => i.value));
    if (skip + 20 >= d.totalResults) break;
  }
  // Full Commons history, 20 MPs per request, to work out first election and total years served.
  const history = {};
  for (let i = 0; i < members.length; i += 20) {
    const ids = members.slice(i, i + 20).map(m => `ids=${m.id}`).join('&');
    for (const h of await getJson(`${PARL}/Members/History?${ids}`)) history[h.value.id] = h.value.houseMembershipHistory.filter(x => x.house === 1);
  }

  console.log('Downloading IPSA business costs…');
  const ipsaCsv = async (type, years) => {
    for (const y of years) {
      const r = await fetch(`${IPSA}?type=${type}&year=${y}`);
      const text = r.ok ? await r.text() : '';
      if (text.length > 1000) return { year: y, rows: XLSX.utils.sheet_to_json(XLSX.read(text.replace(/^﻿+/, ''), { type: 'string' }).Sheets.Sheet1, { defval: '' }) };
    }
    return null;
  };
  const now = new Date();
  const fy = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1; // current financial year start
  const yearCodes = n => Array.from({ length: n }, (_, i) => { const y = fy - i; return `${String(y).slice(2)}_${String(y + 1).slice(2)}`; });
  const totals = await ipsaCsv('totalSpend', yearCodes(4)); // newest published annual totals
  // Claims for the year after the annual totals (the most complete newer year, not a part-year).
  const claims = await ipsaCsv('individualBusinessCosts', yearCodes(4).filter(y => !totals || y > totals.year).reverse());
  const spendCols = { office: 'Office spend', staffing: 'Staffing spend', windingUp: 'Winding-up spend', accommodation: 'Accommodation spend', travel: 'Travel and subsistence (uncapped)', other: 'Other costs (uncapped)' };
  const annual = {};
  for (const r of totals?.rows || []) {
    const id = Number(r.pID); if (!id) continue;
    const v = Object.fromEntries(Object.entries(spendCols).map(([k, c]) => [k, money(r[c])]));
    v.total = Object.values(v).reduce((a, b) => a + b, 0);
    annual[id] = v;
  }
  const recent = {};
  for (const r of claims?.rows || []) {
    const id = Number(r['Parliamentary ID']); if (!id) continue;
    const cat = String(r.Category || 'Other').trim();
    const paid = money(r['Amount Paid']);
    const m = (recent[id] ||= { total: 0, byCategory: {}, claims: 0 });
    m.total += paid; m.claims++;
    m.byCategory[cat] = (m.byCategory[cat] || 0) + paid;
  }

  console.log('Downloading the Register of Members\' Financial Interests…');
  // Category ids in the Interests API: 3 = donations (register category 2), 4 = UK gifts & hospitality (3),
  // 5 = visits outside the UK (4), 6 = gifts from outside the UK (5).
  const groups = { 3: 'donations', 4: 'gifts', 6: 'gifts', 5: 'visits' };
  const sumValues = fields => (fields || []).reduce((s, f) => s + (f.name === 'Value' ? money(f.value) : 0) + (f.values || []).flat().reduce((t, g) => t + sumValues([g]), 0), 0);
  const interests = {};
  let registerCount = 0;
  for (const cat of Object.keys(groups)) {
    for (let skip = 0; ; skip += 20) {
      const d = await getJson(`${INTERESTS}/Interests?CategoryId=${cat}&Take=20&Skip=${skip}`);
      for (const it of d.items) {
        const g = ((interests[it.member.id] ||= {})[groups[cat]] ||= { count: 0, value: 0 });
        g.count++; g.value += sumValues(it.fields); registerCount++;
      }
      if (skip + 20 >= d.totalResults) break;
    }
  }

  // Join everything onto constituencies by name.
  const byName = Object.fromEntries(geo.features.map(f => [normName(f.properties.name), f.properties.code]));
  const day = 864e5;
  const constituencies = {};
  const unmatched = [];
  for (const m of members) {
    const seat = m.latestHouseMembership;
    const code = byName[normName(seat.membershipFrom)];
    if (!code) { unmatched.push(seat.membershipFrom); continue; }
    // Parliament dates have no time zone; read them as UTC so they don't shift by a day.
    const utc = s => Date.parse(s.slice(0, 10) + 'T00:00:00Z');
    const spells = (history[m.id] || []).map(h => [utc(h.membershipStartDate), h.membershipEndDate ? utc(h.membershipEndDate) : now.getTime()]);
    const first = spells.length ? Math.min(...spells.map(s => s[0])) : utc(seat.membershipStartDate);
    const served = spells.reduce((s, [a, b]) => s + Math.max(0, b - a), 0) / day / 365.25;
    constituencies[code] = {
      name: seat.membershipFrom, memberId: m.id, mp: m.nameDisplayAs, party: m.latestParty?.name || 'Unknown',
      partyColour: m.latestParty?.backgroundColour ? `#${m.latestParty.backgroundColour}` : null,
      seatSince: seat.membershipStartDate.slice(0, 10), firstElected: new Date(first).toISOString().slice(0, 10),
      yearsServed: Math.round(served * 10) / 10, breaks: spells.length > 1,
      expenses: annual[m.id] || null, expensesRecent: recent[m.id] || null,
      interests: interests[m.id] || {},
    };
  }
  const out = {
    builtAt: now.toISOString(),
    nextElection: {
      parliamentFirstMet: '2024-07-09', automaticDissolution: '2029-07-09',
      text: 'The next general election must be held by August 2029. This Parliament first met on 9 July 2024 and will automatically be dissolved on 9 July 2029 if an election has not been called before then; polling day follows about five weeks later. The Prime Minister can call an election earlier. A by-election happens only if a seat becomes vacant.',
      source: 'https://www.legislation.gov.uk/ukpga/2022/11/section/4',
    },
    expensesYear: totals ? ipsaYear(totals.year) : null,
    expensesRecentYear: claims ? ipsaYear(claims.year) : null,
    sources: {
      members: { title: 'UK Parliament Members API', page: 'https://members.parliament.uk' },
      ipsa: { title: 'IPSA — MPs\' staffing and business costs', page: 'https://www.theipsa.org.uk/mp-staffing-business-costs' },
      register: { title: 'Register of Members\' Financial Interests', page: 'https://www.parliament.uk/mps-lords-and-offices/standards-and-financial-interests/parliamentary-commissioner-for-standards/registers-of-interests/register-of-members-financial-interests/' },
    },
    constituencies,
  };
  fs.writeFileSync(path.join(OUT, 'mps.json'), JSON.stringify(out));
  console.log(`Wrote mps.json (${Object.keys(constituencies).length} MPs; expenses ${out.expensesYear}${out.expensesRecentYear ? ` + ${out.expensesRecentYear} claims` : ''}; ${registerCount} register entries)${unmatched.length ? `\n  Not matched to a boundary: ${unmatched.join(', ')}` : ''}`);
}

// Donations to political parties from the Electoral Commission register: one CSV per year
// (by the date the party accepted it). Quarterly reports only: pre-poll election reports
// repeat donations that also appear in the quarterly ones.
const EC_DONATIONS = 'https://search.electoralcommission.org.uk/api/csv/Donations';
const DONOR_TYPES = { Individual: 'individual', Company: 'company', 'Limited Liability Partnership': 'company', 'Trade Union': 'union', 'Unincorporated Association': 'association', 'Friendly Society': 'association' };

async function buildDonations() {
  const now = new Date(), thisYear = now.getUTCFullYear();
  const rows = [];
  for (let y = 2001; y <= thisYear; y++) {
    const q = new URLSearchParams({ start: 0, rows: 50, query: '', sort: 'AcceptedDate', order: 'desc', et: 'pp', date: 'Accepted', from: `${y}-01-01`, to: `${y}-12-31`, prePoll: 'false', postPoll: 'true' });
    q.append('register', 'gb'); q.append('register', 'ni');
    const text = (await getText(`${EC_DONATIONS}?${q}`)).replace(/^﻿/, '');
    const sheet = XLSX.read(text, { type: 'string', raw: true }).Sheets.Sheet1;
    const yr = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    console.log(`  ${y}: ${yr.length} donations`);
    rows.push(...yr);
  }
  const dmy = s => { const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
  const donations = rows.map(r => ({
    party: String(r.RegulatedEntityId), partyName: r.RegulatedEntityName,
    value: Number(String(r.Value).replace(/[£,]/g, '')), date: dmy(r.AcceptedDate),
    donorId: String(r.DonorId || r.DonorName), donor: String(r.DonorName).trim(), status: r.DonorStatus,
    isPublic: r.DonorStatus === 'Public Fund' || r.DonationType === 'Public Funds',
    cash: r.DonationType === 'Cash', nature: r.NatureOfDonation || '', unit: r.AccountingUnitName,
  })).filter(d => d.date && isFinite(d.value) && d.value > 0);
  const latest = donations.reduce((m, d) => (d.date > m ? d.date : m), '');

  // Parties shown separately: the 8 that received the most private donations in the last 10 years.
  const names = {};
  for (const d of [...donations].sort((a, b) => a.date.localeCompare(b.date))) names[d.party] = d.partyName;
  const recent = {};
  for (const d of donations) if (!d.isPublic && d.date >= `${thisYear - 10}`) recent[d.party] = (recent[d.party] || 0) + d.value;
  const tracked = Object.entries(recent).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
  const partyKey = id => (tracked.includes(id) ? id : 'other');

  const last12From = (() => { const d = new Date(`${latest}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - 1); return d.toISOString().slice(0, 10); })();
  const periods = { last12: d => d.date > last12From, all: () => true };
  for (let y = 2001; y <= thisYear; y++) periods[y] = d => d.date.startsWith(String(y));

  const round = v => Math.round(v);
  // The register can list one donor under several IDs and spellings ("Mr Ben Peter Delo",
  // "Ben Delo", "Lord Sainsbury of Turville"), so group people by first + last name without titles
  // or peerage "of …" places, and organisations by
  // name without "Ltd"/"Limited"/"plc" and punctuation.
  const TITLES = /^(mr|mrs|ms|miss|mx|dr|sir|dame|lord|lady|baron|baroness|the|rt|hon|right|honourable|prof|professor|rev|cllr)\.?$/i;
  const cleanName = n => n.replace(/\s+/g, ' ').trim().replace(/ of [A-Z][a-z]+( [A-Z][a-z]+)?$/, '').split(' ').filter((w, i, a) => !(TITLES.test(w) && i < a.length - 2)).join(' ');
  const donorKey = d => {
    if (d.status === 'Individual') {
      const w = cleanName(d.donor).toLowerCase().replace(/[^a-z\s'-]/g, '').split(' ').filter(Boolean);
      return `p:${w[0]} ${w[w.length - 1]}`;
    }
    return `o:${d.donor.toLowerCase().replace(/\b(ltd|limited|plc|llp|the)\b/g, '').replace(/[^a-z0-9]/g, '')}`;
  };
  const topDonors = (list, n) => {
    const by = {};
    for (const d of list) {
      const k = donorKey(d);
      const e = by[k] || (by[k] = { names: {}, status: d.status, total: 0, count: 0, parties: {} });
      e.total += d.value; e.count++; e.parties[partyKey(d.party)] = (e.parties[partyKey(d.party)] || 0) + d.value;
      const nm = d.status === 'Individual' ? cleanName(d.donor) : d.donor;
      e.names[nm] = (e.names[nm] || 0) + d.value;
    }
    // Show the spelling used for most of the money.
    for (const e of Object.values(by)) e.name = Object.entries(e.names).sort((a, b) => b[1] - a[1])[0][0];
    return Object.values(by).sort((a, b) => b.total - a.total).slice(0, n).map(e => ({
      name: e.name, status: e.status, total: round(e.total), count: e.count,
      parties: Object.fromEntries(Object.entries(e.parties).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round(v)])),
    }));
  };

  const out = {};
  for (const [key, test] of Object.entries(periods)) {
    const list = donations.filter(test);
    if (!list.length) continue;
    const priv = list.filter(d => !d.isPublic);
    const parties = {};
    for (const d of list) {
      const k = partyKey(d.party);
      const p = parties[k] || (parties[k] = { private: 0, public: 0, count: 0, cash: 0, types: {} });
      if (d.isPublic) { p.public += d.value; continue; }
      p.private += d.value; p.count++; if (d.cash) p.cash += d.value;
      const t = DONOR_TYPES[d.status] || 'other';
      p.types[t] = (p.types[t] || 0) + d.value;
    }
    for (const p of Object.values(parties)) { for (const k of ['private', 'public', 'cash']) p[k] = round(p[k]); for (const t in p.types) p.types[t] = round(p.types[t]); }
    const donors = { all: topDonors(priv, 25) };
    for (const id of tracked) donors[id] = topDonors(priv.filter(d => d.party === id), 15);
    const biggest = [...priv].sort((a, b) => b.value - a.value).slice(0, 15).map(d => ({
      donor: d.status === 'Individual' ? cleanName(d.donor) : d.donor, status: d.status, party: partyKey(d.party), partyName: names[d.party], value: round(d.value), date: d.date, cash: d.cash, nature: d.nature,
    }));
    out[key] = { parties, donors, biggest, count: priv.length, private: round(priv.reduce((s, d) => s + d.value, 0)) };
  }

  const result = {
    source: { title: 'Electoral Commission, register of donations to political parties (quarterly reports)', page: 'https://search.electoralcommission.org.uk' },
    built: now.toISOString().slice(0, 10), latest, last12From,
    parties: tracked.map(id => ({ id, name: names[id] })),
    years: Object.keys(out).filter(k => /^\d{4}$/.test(k)).map(Number),
    periods: out,
  };
  fs.writeFileSync(path.join(OUT, 'donations.json'), JSON.stringify(result));
  console.log(`Wrote donations.json (${donations.length} donations to ${latest}; parties: ${tracked.map(id => names[id]).join(', ')})`);
}

// Average shop prices of grocery items, monthly since January 2021: the data behind the ONS
// Shopping Prices Comparison Tool (published on GitHub by the ONS each month with CPI).
const SPCT_XLSX = 'https://github.com/onsdigital/cpi-items-actions/raw/main/datadownload.xlsx';

async function buildFood() {
  console.log('Downloading ONS shopping prices (average prices)…');
  const wb = XLSX.read(Buffer.from(await (await politeFetch(SPCT_XLSX)).arrayBuffer()));
  const meta = XLSX.utils.sheet_to_json(wb.Sheets.Metadata).filter(m => m.Category1 === 'Groceries');
  const ym = v => String(v).slice(0, 7);
  const prices = {};
  for (const r of XLSX.utils.sheet_to_json(wb.Sheets['Average price'])) {
    if (r.Category1 !== 'Groceries' || !isFinite(r.AVERAGE_PRICE)) continue;
    (prices[r.ID_DESC] = prices[r.ID_DESC] || {})[ym(r.INDEX_DATE)] = r.AVERAGE_PRICE;
  }
  const months = [...new Set(Object.values(prices).flatMap(p => Object.keys(p)))].sort();
  const latest = months[months.length - 1];
  const items = meta.filter(m => prices[m.ID_DESC] && prices[m.ID_DESC][latest] != null).map(m => ({
    name: m.ID_DESC.replace(/\s*\(e\.g\.[^)]*\)/g, '').trim(), size: m.WEIGHT_SIZE, cat: m.Category2,
    prices: months.map(k => (prices[m.ID_DESC][k] != null ? Math.round(prices[m.ID_DESC][k] * 100) / 100 : null)),
  })).sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  const out = {
    source: { title: 'ONS Shopping Prices Comparison Tool (average prices from consumer price inflation)', page: 'https://www.ons.gov.uk/economy/inflationandpriceindices/articles/shoppingpricescomparisontool/2023-05-03', data: SPCT_XLSX },
    builtAt: new Date().toISOString(), months, items,
  };
  fs.writeFileSync(path.join(OUT, 'food.json'), JSON.stringify(out));
  console.log(`Wrote food.json (${items.length} grocery items, ${months[0]} to ${latest})`);
}

// Weekly UK average pump prices (DESNZ), with fuel duty and VAT. The gov.uk page lists the
// newest CSV files, so find them through the content API rather than a fixed address.
async function buildFuel() {
  console.log('Downloading DESNZ weekly road fuel prices…');
  const page = await getJson('https://www.gov.uk/api/content/government/statistics/weekly-road-fuel-prices');
  const csvs = (page.details.attachments || []).filter(a => /csv/i.test(a.content_type) || /\.csv$/i.test(a.url));
  const weeks = {};
  for (const a of csvs) {
    const rows = (await getText(a.url)).replace(/^﻿/, '').trim().split(/\r?\n/).slice(1);
    for (const line of rows) {
      const c = line.split(',');
      const m = c[0].match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m || !isFinite(Number(c[1])) || c[1] === '') continue;
      weeks[`${m[3]}-${m[2]}-${m[1]}`] = { petrol: Number(c[1]), diesel: Number(c[2]), dutyPetrol: Number(c[3]), dutyDiesel: Number(c[4]), vat: Number(c[5]) };
    }
  }
  const dates = Object.keys(weeks).sort();
  const col = k => dates.map(dt => weeks[dt][k]);
  const out = {
    source: { title: 'Department for Energy Security and Net Zero, weekly road fuel prices', page: 'https://www.gov.uk/government/statistics/weekly-road-fuel-prices', updated: page.public_updated_at },
    builtAt: new Date().toISOString(), dates,
    petrol: col('petrol'), diesel: col('diesel'), dutyPetrol: col('dutyPetrol'), dutyDiesel: col('dutyDiesel'), vat: col('vat'),
  };
  fs.writeFileSync(path.join(OUT, 'fuel.json'), JSON.stringify(out));
  console.log(`Wrote fuel.json (${dates.length} weeks, ${dates[0]} to ${dates[dates.length - 1]})`);
}

// `npm run build-data -- immigration` (or `-- spending`, `-- mps`) rebuilds just that file.
if (process.argv[2] === 'food') {
  buildFood().catch(e => { console.error(e); process.exit(1); });
} else if (process.argv[2] === 'fuel') {
  buildFuel().catch(e => { console.error(e); process.exit(1); });
} else if (process.argv[2] === 'donations') {
  buildDonations().catch(e => { console.error(e); process.exit(1); });
} else if (process.argv[2] === 'mps') {
  buildMps().catch(e => { console.error(e); process.exit(1); });
} else if (process.argv[2] === 'housing') {
  buildHousing(JSON.parse(fs.readFileSync(path.join(OUT, 'local-authorities.json'), 'utf8'))).catch(e => { console.error(e); process.exit(1); });
} else if (process.argv[2] === 'bills') {
  buildBills().catch(e => { console.error(e); process.exit(1); });
} else if (process.argv[2] === 'crime') {
  buildCrime(JSON.parse(fs.readFileSync(path.join(OUT, 'local-authorities.json'), 'utf8'))).catch(e => { console.error(e); process.exit(1); });
} else if (process.argv[2] === 'revenue') {
  buildRevenue().catch(e => { console.error(e); process.exit(1); });
} else if (process.argv[2] === 'spending') {
  buildSpending().catch(e => { console.error(e); process.exit(1); });
} else if (process.argv[2] === 'immigration') {
  buildImmigration(JSON.parse(fs.readFileSync(path.join(OUT, 'local-authorities.json'), 'utf8'))).catch(e => { console.error(e); process.exit(1); });
} else {
  main().catch(e => { console.error(e); process.exit(1); });
}
