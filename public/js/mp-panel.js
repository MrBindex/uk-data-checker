// MP profile panel for the "MPs & constituencies" map layer.
// Built from data/mps.json (UK Parliament, IPSA and the Register of Interests, via
// scripts/build-finances.js), plus the latest register entries fetched live.

const IPSA_LABELS = { staffing: 'Staff salaries', office: 'Office costs', accommodation: 'London or constituency accommodation', travel: 'Travel and subsistence', windingUp: 'Winding-up costs (after the election)', other: 'Other costs' };
const longDate = iso => iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
const medianOf = arr => { const a = arr.filter(v => v != null).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };

// Pull the fields we show from a register entry. Donor addresses are deliberately not shown.
function registerEntry(it) {
  const f = {};
  const walk = list => (list || []).forEach(x => { if (x.value != null && f[x.name] == null) f[x.name] = x.value; (x.values || []).flat().forEach(y => walk([y])); });
  walk(it.fields);
  const sumValues = list => (list || []).reduce((s, x) => s + (x.name === 'Value' ? Number(x.value) || 0 : 0) + (x.values || []).flat().reduce((t, y) => t + sumValues([y]), 0), 0);
  const donors = [];
  (it.fields.find(x => x.name === 'Donors')?.values || []).forEach(g => { const n = g.find(x => x.name === 'Name' || x.name === 'DonorName')?.value; if (n) donors.push(n); });
  return {
    date: f.ReceivedDate || f.StartDate || it.registrationDate,
    who: f.DonorName || f.DonorCompanyName || donors.join(', ') || it.summary,
    status: f.DonorStatus || '',
    what: f.PaymentDescription || f.Purpose || '',
    where: f.Country ? `${f.Country}${f.Destination ? ` (${f.Destination})` : ''}` : '',
    value: sumValues(it.fields),
  };
}

async function renderMpPanel(code, mps, stillCurrent) {
  const panel = document.getElementById('mapPanel');
  const c = mps.constituencies[code];
  if (!c) { panel.innerHTML = '<h3>No MP data</h3><p class="small muted">This seat may be vacant.</p>'; return; }
  const medianCost = medianOf(Object.values(mps.constituencies).map(x => x.expenses?.total));
  const years = c.yearsServed;
  const e = c.expenses;
  const reg = c.interests || {};
  const heading = t => `<h4 class="mp-h">${t}</h4>`;
  let expenseBars = '';
  if (e) {
    const rows = Object.entries(IPSA_LABELS).map(([k, l]) => ({ l, v: e[k] || 0 })).filter(r => r.v > 0).sort((a, b) => b.v - a.v);
    const max = Math.max(...rows.map(r => r.v));
    expenseBars = `<ul class="mini-bars">${rows.map(r => `<li><div class="mb-row"><span>${esc(r.l)}</span><b>£${nf(r.v)}</b></div><div class="mb-track"><i style="width:${Math.max(1, r.v / max * 100)}%"></i></div></li>`).join('')}</ul>`;
  }

  panel.innerHTML = `
    <div class="mp-head">
      <img class="mp-photo" src="https://members-api.parliament.uk/api/Members/${c.memberId}/Thumbnail" alt="" loading="lazy" width="96" height="96">
      <div><div class="mp-for">MP for ${esc(c.name)}</div>
        <h2 class="mp-name">${esc(c.mp)}</h2>
        <span class="party-pill"><i style="background:${esc(c.partyColour || '#888')}"></i>${esc(c.party)}</span></div>
      <div class="mp-head-actions">
        <a class="btn" href="https://members.parliament.uk/member/${c.memberId}" target="_blank" rel="noopener">Parliament profile ↗</a>
        <button class="btn ghost" type="button" id="backToMap">↑ Back to the map</button>
      </div>
    </div>

    <div class="mp-cols"><section>
    ${heading('Time as an MP')}
    <dl class="mp-facts">
      <div><dt>First elected</dt><dd>${longDate(c.firstElected)}</dd></div>
      <div><dt>Years in the Commons</dt><dd>${nf(years, years < 10 ? 1 : 0)} years${c.breaks ? ' <span class="small muted">(more than one spell or seat)</span>' : ''}</dd></div>
      <div><dt>MP for this seat since</dt><dd>${longDate(c.seatSince)}</dd></div>
    </dl>
    ${c.seatSince.startsWith('2024-07') && c.firstElected < '2024-07' ? '<p class="small muted" style="margin:8px 0 0">Constituency boundaries changed at the 2024 election, so many long-serving MPs\' current seats date from then.</p>' : ''}

    ${heading('Next election')}
    <p class="mp-text">${esc(mps.nextElection.text)} <a href="${esc(mps.nextElection.source)}" target="_blank" rel="noopener">The law ↗</a></p>
    </section><section>

    ${heading(`Business costs (“expenses”), ${esc(mps.expensesYear || '')}`)}
    ${e ? `<div class="mp-big">£${nf(e.total)}</div>
      <p class="small muted" style="margin:2px 0 8px">The typical (median) MP: £${nf(medianCost)}</p>
      ${expenseBars}
      <p class="small muted" style="margin:8px 0 0">This is money IPSA paid to run the MP's office — mostly their staff's salaries — not the MP's own pay, which is set separately. ${esc(mps.expensesYear)} includes the July 2024 election, so new MPs' figures cover part of the year and include setting up an office.</p>
      ${c.expensesRecent ? `<p class="small" style="margin:8px 0 0">${esc(mps.expensesRecentYear)}: £${nf(c.expensesRecent.total)} claimed for office, accommodation and travel (${nf(c.expensesRecent.claims)} claims). Staff salaries aren't included in these claims.</p>` : ''}`
    : `<p class="mp-text muted">No IPSA figures for this MP for ${esc(mps.expensesYear)}${c.seatSince > '2025-04' ? ` — they became an MP on ${longDate(c.seatSince)}, after that year ended` : ''}.</p>`}
    </section></div>

    <section class="mp-register-wrap">
    ${heading('Donations, gifts and hospitality')}
    <div class="mp-reg-sum">
      <div><b>£${nf(reg.donations?.value || 0)}</b><span>Donations (${reg.donations?.count || 0})</span></div>
      <div><b>£${nf(reg.gifts?.value || 0)}</b><span>Gifts &amp; hospitality (${reg.gifts?.count || 0})</span></div>
      <div><b>£${nf(reg.visits?.value || 0)}</b><span>Funded visits (${reg.visits?.count || 0})</span></div>
    </div>
    <div id="mpRegister">${loading('Loading the latest register entries…')}</div>
    <p class="small muted" style="margin:12px 0 0">MPs must register donations, gifts and hospitality worth more than £300. Registering something does not mean anything improper — the register exists so anyone can check.</p>
    <div class="controls" style="margin-top:14px">
      <a class="btn ghost" href="https://members.parliament.uk/member/${c.memberId}/registeredinterests" target="_blank" rel="noopener">Full register on parliament.uk ↗</a>
    </div>
    </section>
    ${sourceLine({ name: 'UK Parliament and IPSA', url: mps.sources.members.page, extra: `Figures checked ${date(mps.builtAt)} · <a href="${esc(mps.sources.ipsa.page)}" target="_blank" rel="noopener">IPSA</a> · <a href="${esc(mps.sources.register.page)}" target="_blank" rel="noopener">Register of Interests</a>` })}`;

  document.getElementById('backToMap').onclick = () => document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Latest register entries (newest first), straight from Parliament via our server.
  const box = () => document.getElementById('mpRegister');
  try {
    const cats = [[3, 'Donation'], [4, 'Gift / hospitality'], [6, 'Gift from abroad'], [5, 'Funded visit']];
    const lists = await Promise.all(cats.map(([id]) => api(`/api/parl/interests/Interests?MemberId=${c.memberId}&CategoryId=${id}&Take=20`).catch(() => null)));
    if (!stillCurrent() || !box()) return;
    if (lists.every(l => l == null)) throw new Error('register unavailable');
    const entries = lists.flatMap((l, i) => (l?.items || []).map(it => ({ ...registerEntry(it), kind: cats[i][1] })))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    box().innerHTML = entries.length
      ? `<ul class="mp-register">${entries.slice(0, 25).map(x => `<li>
          <div class="reg-top"><span class="badge">${esc(x.kind)}</span><span class="reg-date">${x.date ? esc(longDate(String(x.date).slice(0, 10))) : ''}</span><b class="reg-value">${x.value ? `£${nf(x.value)}` : ''}</b></div>
          <div class="reg-who">${esc(x.who)}${x.status ? ` <span class="muted">· ${esc(x.status)}</span>` : ''}</div>
          ${x.what || x.where ? `<div class="reg-what">${esc(x.what)}${x.what && x.where ? ' · ' : ''}${esc(x.where)}</div>` : ''}</li>`).join('')}</ul>
        ${entries.length > 25 ? `<p class="small muted">Showing the 25 most recent entries.</p>` : ''}`
      : '<p class="small muted">Nothing registered in these categories in this Parliament.</p>';
  } catch {
    if (box()) box().innerHTML = '<p class="small muted">Couldn\'t load the register right now — use the “Full register” link below.</p>';
  }
}
