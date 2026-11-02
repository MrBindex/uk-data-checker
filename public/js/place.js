// Postcode search and "compare two areas": everything the site knows about a council area in one
// place. Postcodes are looked up with postcodes.io (open data from ONS / Ordnance Survey); the
// postcode itself is never put in the page address or stored.

const POSTCODES_IO = 'https://api.postcodes.io/postcodes/';

// Gathers one council area's figures from the data files the site already has.
async function placeData() {
  const [las, hs, crime, imm, lv, mps] = await Promise.all([
    localAuthorities(), getJSON('data/housing.json'), getJSON('data/crime.json'), getJSON('data/immigration.json'),
    getJSON('data/living.json').catch(() => null), getJSON('data/mps.json'),
  ]);
  const dwp = {};
  await Promise.all(['uc', 'pip', 'sp'].map(k => api(`/api/dwp/benefit/${k}`).then(d => { dwp[k] = d; }).catch(() => null)));
  const ct = Object.fromEntries((lv?.councilTax.areas || []).map(a => [a.code, a]));
  return { las, hs, crime, imm, lv, ct, dwp, mps };
}
// The figures shown for an area, in a fixed order. `better` says which direction is "good" for ranks.
const PLACE_METRICS = [
  { key: 'pop', label: 'Population', fmt: v => nf(v), note: 'ONS mid-year estimate' },
  { key: 'price', label: 'Average house price', fmt: v => `£${nf(v)}`, note: 'UK House Price Index' },
  { key: 'rent', label: 'Average private rent', fmt: v => `£${nf(v)} a month`, note: 'ONS, England & Wales only' },
  { key: 'bandD', label: 'Council tax (Band D)', fmt: v => `£${nf(v)}`, note: 'England only' },
  { key: 'crimeRate', label: 'Crime per 1,000 people', fmt: v => nf(v, 1), note: 'Police recorded crime, England & Wales', better: 'low' },
  { key: 'ucRate', label: 'On Universal Credit, per 1,000', fmt: v => nf(v, 1), note: 'DWP, Great Britain', better: 'low' },
  { key: 'pipRate', label: 'On PIP, per 1,000', fmt: v => nf(v, 1), note: 'DWP, Great Britain' },
  { key: 'netMig', label: 'Net international migration, per 1,000', fmt: v => nf(v, 1), note: 'ONS mid-year estimates' },
  { key: 'bornAbroad', label: 'Born outside the UK', fmt: v => `${nf(v, 1)}%`, note: 'Census 2021' },
];
function placeFigures(P, code) {
  const im = P.imm.areas[code] || {}, h = P.hs.areas[code] || {}, cr = P.crime.areas[code], pop = im.pop;
  const per = v => (v != null && pop ? v / pop * 1000 : null);
  return {
    pop, price: h.price, rent: h.rent, bandD: P.ct[code]?.bandD,
    crimeRate: cr && !cr.sharedWith && !cr.unreliable ? per(cr.latest.total) : null,
    ucRate: per(P.dwp.uc?.values?.[code]), pipRate: per(P.dwp.pip?.values?.[code]),
    netMig: per(im.intNet), bornAbroad: im.bornAbroadPct,
  };
}
function rankOf(P, key, code) {
  const vals = P.las.map(a => [a.code, placeFigures(P, a.code)[key]]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
  const i = vals.findIndex(([c]) => c === code);
  return i < 0 ? null : { pos: i + 1, of: vals.length };
}

async function postcodePage() {
  setTitle('Your area by postcode');
  view.innerHTML = `
    <div class="page-head"><span class="kicker">Your area</span><h1>Everything about your area</h1>
      <p class="lead">Enter a postcode to see your council, your MP, house prices, rent, council tax, crime, benefits and more — all from official sources.</p></div>
    <form class="searchbar" id="pcForm" role="search">
      <input name="pc" type="search" placeholder="Enter a postcode, e.g. M1 1AE" aria-label="Postcode" autocomplete="postal-code" maxlength="9">
      <button class="btn" type="submit">Look up</button></form>
    <p class="small muted" style="margin-top:8px">Your postcode is checked with <a href="https://postcodes.io" target="_blank" rel="noopener">postcodes.io</a> (open government data) to find your council and constituency. It isn’t stored or added to the page address. Prefer not to? <a href="#/areas">Choose your council from a list</a>.</p>
    <div id="pcOut" style="margin-top:24px"></div>`;
  const P = placeData();
  document.getElementById('pcForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pc = e.target.pc.value.replace(/\s+/g, '').toUpperCase();
    const out = document.getElementById('pcOut');
    if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(pc)) { out.innerHTML = '<p class="error">That doesn’t look like a full UK postcode.</p>'; return; }
    out.innerHTML = loading('Looking up your postcode…');
    try {
      const r = await fetch(POSTCODES_IO + encodeURIComponent(pc));
      if (r.status === 404) { out.innerHTML = '<p class="error">We couldn’t find that postcode. Check it and try again.</p>'; return; }
      const res = (await r.json()).result;
      renderPlace(out, await P, res.codes.admin_district, res.codes.parliamentary_constituency_2024 || res.codes.parliamentary_constituency, res);
    } catch (err) { out.innerHTML = errorBox(err); }
  });
}

function renderPlace(out, P, code, pcon, pcRes) {
  const la = P.las.find(a => a.code === code);
  if (!la) { out.innerHTML = '<p class="error">We don’t have figures for that council area yet.</p>'; return; }
  const f = placeFigures(P, code), mp = P.mps.constituencies[pcon];
  out.innerHTML = `
    <div class="place-head card"><div><span class="kicker">${esc(pcRes ? `${pcRes.postcode} · ` : '')}${esc(la.region)}</span><h2>${esc(la.name)}</h2>
      <p class="small muted">${pcRes?.parliamentary_constituency_2024 ? `Constituency: ${esc(pcRes.parliamentary_constituency_2024)}` : ''}${pcRes?.admin_ward ? ` · Ward: ${esc(pcRes.admin_ward)}` : ''}</p></div>
      <div class="controls"><a class="btn primary" href="#/area/${code}">Jobs, benefits &amp; tax →</a><a class="btn ghost" href="#/compare?a=${code}">Compare with another area</a></div></div>
    ${mp ? `<div class="card place-mp"><span class="party-pill"><i style="background:${esc(mp.partyColour || 'var(--muted)')}"></i>${esc(mp.party)}</span>
      <h3>Your MP: ${esc(mp.mp)}</h3><p class="small muted">MP since ${esc(new Date(mp.seatSince).getFullYear())} · ${nf(mp.yearsServed)} years in the Commons${mp.expenses?.total ? ` · £${nf(mp.expenses.total)} business costs last year` : ''}</p>
      <a class="btn ghost btn-sm" href="#/map?layer=mps">See their votes, expenses and donations on the map →</a></div>` : ''}
    <div class="grid place-grid">${PLACE_METRICS.map(m => {
      const v = f[m.key]; if (v == null) return '';
      const rk = m.key === 'pop' ? null : rankOf(P, m.key, code);
      return `<div class="card stat"><div class="label">${esc(m.label)}</div><div class="value">${m.fmt(v)}</div><div class="meta">${rk ? `${rankWord(rk.pos)} highest of ${rk.of} council areas · ` : ''}${esc(m.note)}</div></div>`;
    }).join('')}</div>
    <p class="small muted">Rank 1 = highest figure. Sources: ONS, HM Land Registry, MHCLG, Home Office, DWP Stat-Xplore and UK Parliament — see each page for details and dates. <a href="#/map">Explore all of these on the map →</a></p>`;
}
const rankWord = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

async function comparePage(params) {
  setTitle('Compare two areas');
  view.innerHTML = loading();
  const P = await placeData();
  const opts = sel => P.las.map(a => `<option value="${a.code}"${a.code === sel ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
  const a0 = P.las.some(a => a.code === params.get('a')) ? params.get('a') : 'E08000025';
  const b0 = P.las.some(a => a.code === params.get('b')) ? params.get('b') : 'E08000003';
  view.innerHTML = `
    <div class="page-head"><span class="kicker">Your area</span><h1>Compare two areas</h1>
      <p class="lead">Put any two council areas side by side, with each one’s rank among all UK council areas.</p></div>
    <div class="card"><div class="calc-inputs"><label>First area<select class="select" id="cmpA">${opts(a0)}</select></label><label>Second area<select class="select" id="cmpB">${opts(b0)}</select></label></div>
      <div class="table-wrap"><table class="data compare-table" id="cmpTable"></table></div>
      <p class="small muted" style="margin:10px 0 0">Rank 1 = highest figure out of all council areas with data. “Per 1,000” figures use each area’s population so big and small areas can be compared fairly. A blank means the figure isn’t published for that part of the UK.</p></div>`;
  const A = document.getElementById('cmpA'), B = document.getElementById('cmpB');
  const draw = () => {
    const fa = placeFigures(P, A.value), fb = placeFigures(P, B.value);
    const na = P.las.find(x => x.code === A.value).name, nb = P.las.find(x => x.code === B.value).name;
    history.replaceState(null, '', `#/compare?a=${A.value}&b=${B.value}`);
    document.getElementById('cmpTable').innerHTML = `<thead><tr><th>Figure</th><th>${esc(na)}</th><th>${esc(nb)}</th><th>Difference</th></tr></thead><tbody>${PLACE_METRICS.map(m => {
      const va = fa[m.key], vb = fb[m.key];
      const ra = va != null && m.key !== 'pop' ? rankOf(P, m.key, A.value) : null, rb = vb != null && m.key !== 'pop' ? rankOf(P, m.key, B.value) : null;
      const diff = va > 0 && vb > 0 ? (va / vb - 1) * 100 : null;
      return `<tr><td>${esc(m.label)}<div class="small muted">${esc(m.note)}</div></td>
        <td><strong>${va != null ? m.fmt(va) : '–'}</strong>${ra ? `<div class="small muted">${rankWord(ra.pos)} of ${ra.of}</div>` : ''}</td>
        <td><strong>${vb != null ? m.fmt(vb) : '–'}</strong>${rb ? `<div class="small muted">${rankWord(rb.pos)} of ${rb.of}</div>` : ''}</td>
        <td>${diff == null ? '–' : `${esc(na)} is ${nf(Math.abs(diff), 0)}% ${diff >= 0 ? 'higher' : 'lower'}`}</td></tr>`;
    }).join('')}</tbody>`;
  };
  A.addEventListener('change', draw); B.addEventListener('change', draw);
  draw();
}
