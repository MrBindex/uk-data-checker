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

// `npm run build-data -- immigration` rebuilds just the immigration file.
if (process.argv[2] === 'immigration') {
  buildImmigration(JSON.parse(fs.readFileSync(path.join(OUT, 'local-authorities.json'), 'utf8'))).catch(e => { console.error(e); process.exit(1); });
} else {
  main().catch(e => { console.error(e); process.exit(1); });
}
