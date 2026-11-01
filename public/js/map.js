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
const MAP_MEASURES = Object.assign({}, ...MAP_GROUPS.map(g => g.measures));
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
  if (per) {
    const pop = (await immigration()).areas;
    let sumV = 0, sumP = 0;
    for (const [c, v] of Object.entries(raw.values)) {
      const p = pop[c]?.pop;
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
  if (m.diverging) {
    const pos = sorted.map(([, v]) => v).filter(v => v > 0);
    out.breaks = quantileBreaks(pos, 6);
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
  let measure = MAP_MEASURES[params.get('m')] ? params.get('m') : 'claimRate';
  let perK = params.get('per') !== '0';
  let selected = params.get('area') || null;
  const st = await dwpStatus();

  view.innerHTML = `
    <div class="page-head" style="margin-bottom:18px"><span class="kicker">Map</span><h1>Map of the UK</h1>
    <p class="lead">Every council area, coloured by the measure you choose — jobs, every major benefit, and immigration. Hover to see the figure, click an area to zoom in and see all its data.</p></div>
    <div class="controls" style="margin:14px 0">
      <label class="small muted" for="mapMeasure">Colour by</label>
      <select id="mapMeasure" class="select">${MAP_GROUPS.map(g => `<optgroup label="${esc(g.name)}${g.dwp && !st.configured ? ' (needs DWP key)' : ''}">${Object.entries(g.measures).map(([k, m]) => `<option value="${k}" ${k === measure ? 'selected' : ''} ${m.kind === 'dwp' && !st.configured ? 'disabled' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`).join('')}</select>
      <div class="seg" id="perSeg" role="group" aria-label="Show as">
        <button type="button" data-v="1" aria-pressed="${perK}">Per 1,000 people</button>
        <button type="button" data-v="0" aria-pressed="${!perK}">Number</button>
      </div>
      <div class="picker map-find"><input id="mapFind" class="select" type="search" placeholder="Find an area…" role="combobox" aria-expanded="false" aria-controls="mapFindList" autocomplete="off"><ul id="mapFindList" role="listbox" hidden></ul></div>
      <button class="btn ghost" type="button" id="mapReset">Show whole UK</button>
    </div>
    <div class="map-layout">
      <div class="card map-card"><div id="map" role="application" aria-label="Map of UK council areas"></div><div class="map-legend" id="mapLegend"></div></div>
      <aside class="card map-panel" id="mapPanel" aria-live="polite"></aside>
    </div>`;

  const [geo, las] = await Promise.all([getJSON('data/la-boundaries.json'), localAuthorities()]);
  const laByCode = Object.fromEntries(las.map(a => [a.code, a]));

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
      fillColor: v == null ? cssVar(data?.notApplicable[code] ? '--map-na' : '--surface-2') : cssVar(colourToken(v, data, MAP_MEASURES[measure])),
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
    return `<strong>${esc(laByCode[code]?.name || code)}</strong><br>${esc(MAP_MEASURES[measure].short)}: <b>${v != null ? data.format(v) : na ? 'not comparable' : 'no data'}</b>`;
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
    if (m.diverging) {
      const pos = vals.filter(v => v > 0);
      const edges = [Math.min(...pos), ...data.breaks];
      scale = sw('--div-neg', 'Below 0') + edges.map((e, i) => sw(`--seq-${i + 2}`, data.format(e) + (i === edges.length - 1 ? '+' : ''))).join('');
    } else {
      const edges = [Math.min(...vals), ...data.breaks];
      scale = edges.map((e, i) => sw(`--seq-${i + 1}`, data.format(e) + (i === edges.length - 1 ? '+' : ''))).join('');
    }
    const naCount = Object.keys(data.notApplicable).length;
    const naReasons = [...new Set(Object.values(data.notApplicable))];
    document.getElementById('mapLegend').innerHTML = `
      <div class="small"><strong>${esc(m.name)}</strong> <span class="muted">· ${esc(data.unit)} · ${esc(data.period)}</span></div>
      <div class="legend-scale">${scale}${naCount ? sw('--map-na', 'Not comparable') : ''}<div><i style="background:var(--surface-2);outline:1px solid var(--border)"></i><span>No data</span></div></div>
      <p class="small muted" style="margin:6px 0 0">${esc(m.explain)}${data.per ? ' Shown per 1,000 residents so big and small areas can be compared fairly.' : ''} Each colour band holds about the same number of areas.</p>
      ${naReasons.map(r => `<p class="small" style="margin:6px 0 0">⚠ ${esc(r)}.</p>`).join('')}
      ${sourceLine({ name: data.source.name, url: data.source.url, extra: data.per ? 'Per 1,000 uses ONS mid-2025 population' : '' })}`;
  }

  async function setMeasure(key) {
    measure = key;
    const m = MAP_MEASURES[key];
    document.getElementById('perSeg').hidden = !!m.rate;
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
  const syncUrl = () => history.replaceState(null, '', `#/map?m=${measure}${MAP_MEASURES[measure].rate ? '' : `&per=${perK ? 1 : 0}`}${selected ? '&area=' + selected : ''}`);

  function introPanel() {
    const m = MAP_MEASURES[measure];
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
    if (innerWidth < 860) document.getElementById('mapPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Side panel: every measure for the chosen area, grouped. Counts show the number
  // and the rate per 1,000 residents, and rank uses the per-1,000 figure.
  async function renderPanel(code) {
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
    matches = q ? las.filter(a => a.name.toLowerCase().includes(q)).sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q)).slice(0, 8) : [];
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
  await setMeasure(measure);
  if (selected && layers[selected]) select(selected, true);
}
