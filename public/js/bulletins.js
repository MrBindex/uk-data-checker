// ONS bulletins and articles, read on this site.
//
// The ONS retired its JSON feed for bulletins in 2026, so we fetch the published
// page (through our caching proxy), parse it with the browser's DOMParser and
// rebuild ONLY whitelisted content — text, lists, tables and links — in our own
// styling. Charts are redrawn as interactive charts from the CSV that the ONS
// publishes for every bulletin chart. Nothing from the page is executed.

const BULLETIN_TOPICS = [
  ['', 'Latest'], ['inflation prices', 'Inflation'], ['labour market employment', 'Jobs'],
  ['GDP economy', 'Economy'], ['population migration', 'Population & migration'],
  ['house prices rent housing', 'Housing'], ['health', 'Health'], ['crime', 'Crime'],
  ['public sector finances', 'Public finances'], ['trade', 'Trade'],
];
const READABLE = new Set(['bulletin', 'article']);
const SERIES_COLOURS = [1, 2, 3, 4, 5, 6].map(n => `var(--series-${n})`);

// ---------------------------------------------------------------- list page
async function bulletinsPage(params) {
  setTitle('Bulletins');
  const topic = params.get('topic') || '';
  const q = params.get('q') || topic;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const link = o => '#/bulletins?' + new URLSearchParams({ topic, page: 1, ...o }).toString();
  view.innerHTML = `
    <div class="page-head"><span class="kicker">Bulletins</span><h1>Read the official reports</h1>
      <p class="lead">ONS statistical bulletins explain what the latest figures show. Read them here with interactive charts, tidy tables and plain links to the data.</p></div>
    <form class="searchbar" role="search" onsubmit="event.preventDefault(); location.hash='#/bulletins?q='+encodeURIComponent(this.q.value.trim())">
      <input name="q" type="search" value="${esc(params.get('q') || '')}" placeholder="Search bulletins, e.g. retail sales, migration, wages…" aria-label="Search bulletins" autocomplete="off">
      <button class="btn" type="submit">Search</button></form>
    <div class="chips">${BULLETIN_TOPICS.map(([v, l]) => `<a class="chip ${!params.get('q') && v === topic ? 'active' : ''}" href="${link({ topic: v })}">${l}</a>`).join('')}</div>
    <div id="blist" style="margin-top:22px">${loading('Fetching bulletins from the ONS…')}</div>`;

  const limit = 12;
  const qp = new URLSearchParams({ content_type: 'bulletin', limit, offset: (page - 1) * limit, sort: 'release_date' });
  if (q) qp.set('q', q);
  const box = document.getElementById('blist');
  try {
    const d = await api(`/api/ons/search?${qp}`);
    if (!d.items.length) { box.innerHTML = `<p>No bulletins found${q ? ` for “${esc(q)}”` : ''}.</p>`; return; }
    const pages = Math.ceil(d.count / limit);
    box.innerHTML = `<div class="grid three">${d.items.map(bulletinCard).join('')}</div>
      <div class="pager">${page > 1 ? `<a class="btn ghost" href="${link({ q: params.get('q') || '', page: page - 1 })}">← Newer</a>` : ''}
        <span class="small muted">Page ${page} of ${nf(pages)}</span>
        ${page < pages ? `<a class="btn ghost" href="${link({ q: params.get('q') || '', page: page + 1 })}">Older →</a>` : ''}</div>`;
  } catch (e) { box.innerHTML = errorBox(e); }
}

function bulletinCard(it) {
  const desc = (it.summary || it.meta_description || '').trim();
  return `<div class="card bulletin-card linked">
    <div class="bc-top"><span class="badge data">${esc(it.type === 'article' ? 'Article' : 'Bulletin')}</span><span class="small muted">${esc(date(it.release_date))}</span></div>
    <h3><a class="stretch" href="#/read?uri=${encodeURIComponent(it.uri)}">${esc(it.title)}</a></h3>
    ${desc ? `<p>${esc(desc.slice(0, 180))}${desc.length > 180 ? '…' : ''}</p>` : ''}
    <div class="bc-summary" hidden></div>
    <div class="bc-actions"><button class="btn ghost btn-sm" type="button" data-summary="${esc(it.uri)}" aria-expanded="false">⚡ Quick summary</button><span class="go">Read</span></div>
  </div>`;
}

// Fetch and parse a bulletin once; reused by the reader and the quick summaries.
const bulletinCache = new Map();
function loadBulletin(uri) {
  if (!bulletinCache.has(uri)) {
    bulletinCache.set(uri, api(`/api/ons/site${uri}`, 'html')
      .then(html => extractBulletin(new DOMParser().parseFromString(html, 'text/html'), uri))
      .catch(e => { bulletinCache.delete(uri); throw e; }));
  }
  return bulletinCache.get(uri);
}

// "Quick summary" buttons on bulletin cards (anywhere on the site).
document.addEventListener('click', async e => {
  const btn = e.target.closest('button[data-summary]');
  if (!btn) return;
  e.preventDefault();
  const card = btn.closest('.bulletin-card');
  const box = card.querySelector('.bc-summary');
  const open = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!open));
  box.hidden = open;
  btn.textContent = open ? '⚡ Quick summary' : 'Hide summary';
  if (open || box.dataset.loaded) return;
  box.innerHTML = loading('Summarising…');
  try {
    const b = await loadBulletin(btn.dataset.summary);
    box.innerHTML = summaryHtml(b, { compact: true });
    box.dataset.loaded = '1';
  } catch (err) { box.innerHTML = `<p class="small muted">Couldn't load a summary right now.</p>`; }
});

// Tap or click a dotted jargon word to see its plain-English meaning (hover titles don't work on phones).
document.addEventListener('click', e => {
  const tip = document.getElementById('tooltip');
  const term = e.target.closest('abbr.term');
  if (!term) { if (tip.dataset.term) { tip.hidden = true; delete tip.dataset.term; } return; }
  const r = term.getBoundingClientRect();
  tip.innerHTML = `<div class="t-title">${esc(term.textContent)}</div><div>${esc(term.title)}</div>`;
  tip.hidden = false;
  tip.dataset.term = '1';
  const w = tip.getBoundingClientRect().width;
  tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
  tip.style.top = (r.bottom + 8) + 'px';
});

// ---------------------------------------------------------------- quick summary
// Built only from the ONS's own words ("Main points"), shortened to their first
// sentence. Nothing is reworded, so no figure can be changed by the summary.
const GLOSSARY = {
  'CPIH': "Consumer Prices Index including owner occupiers' housing costs — the ONS's main measure of inflation.",
  'CPI': 'Consumer Prices Index — how much the prices of everyday goods and services have changed.',
  'RPI': 'Retail Prices Index — an older inflation measure the ONS says is not a good measure and should not be used.',
  'GDP': 'Gross domestic product — the total value of everything produced in the economy.',
  'percentage points?': 'The simple difference between two percentages, e.g. going from 3% to 4% is a rise of 1 percentage point.',
  'seasonally adjusted': 'Adjusted to remove regular patterns, like Christmas shopping, so months can be compared fairly.',
  'economically inactive|economic inactivity': 'Not working and not looking for work — for example students, carers, retired or long-term sick.',
  'claimant count': 'People claiming benefits mainly because they are unemployed (JSA, or Universal Credit while looking for work).',
  'real terms': 'After taking inflation into account — what money can actually buy.',
  'median': 'The middle value: half are above it, half below. Less affected by a few very high values than an average.',
  'provisional': 'An early estimate that is likely to be updated as more data arrives.',
  'revised|revisions?': 'Earlier figures that have been updated with more complete information.',
  'net migration': 'People moving to the UK minus people leaving.',
  'Labour Force Survey|LFS': "A household survey that is the source of most UK employment and unemployment figures.",
  'PAYE RTI': 'Real-time payroll data from HMRC on people paid through PAYE.',
  'owner occupiers.? housing costs|OOH': 'The cost of owning and living in your own home, estimated from equivalent rents.',
  'quarter on quarter': 'Compared with the previous three-month period.',
  'statistically significant': 'Unlikely to be due to chance in the survey sample.',
};
const GLOSSARY_RE = Object.keys(GLOSSARY).map(k => [new RegExp(`\\b(${k})\\b`, 'i'), GLOSSARY[k]]);
const NUMBER_RE = /(£\s?\d[\d,]*(?:\.\d+)?\s?(?:billion|million|bn|m)?|\d[\d,]*(?:\.\d+)?\s?(?:%|percentage points?|per cent|million|billion)|\b\d{1,3}(?:,\d{3})+\b)/g;

function trend(s) {
  const t = s.toLowerCase();
  const up = /\b(rose|risen|rises?|rising|increase[sd]?|increasing|grew|grown|growth|higher|up)\b/.test(t);
  const down = /\b(fell|fallen|falls?|falling|decrease[sd]?|decreasing|declines?|declined|dropped|lower|down|contracted)\b/.test(t);
  if (up && !down) return 'up';
  if (down && !up) return 'down';
  if (!up && !down && /\b(unchanged|little change|flat|stable|no change|no (statistically )?significant change)\b/.test(t)) return 'same';
  return '';
}
function firstSentence(s) {
  const m = s.match(/^(.{40,}?[.!?])\s+(?=[A-Z(])/);
  return m ? m[1] : s;
}
// Escape, highlight numbers, then add glossary pop-ups (placeholders keep them out of each other's way).
function decorate(text, used) {
  let html = esc(text).replace(NUMBER_RE, '<strong class="num-hl">$1</strong>');
  const parts = [];
  for (const [re, def] of GLOSSARY_RE) {
    if (used.has(def)) continue;
    html = html.replace(re, m => { used.add(def); parts.push(`<abbr class="term" tabindex="0" title="${esc(def)}">${m}</abbr>`); return `\u0000${parts.length - 1}\u0000`; });
  }
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => parts[i]);
}

function summaryHtml(b, { compact = false } = {}) {
  const points = (b.points.length ? b.points : b.fallbackPoints).map(p => firstSentence(p)).filter(Boolean).slice(0, compact ? 3 : 5);
  if (!points.length) return `<p class="small muted">This report has no main points to summarise. ${b.summary ? esc(b.summary) : ''}</p>`;
  const used = new Set();
  const icon = { up: '<span class="trend up" title="Went up">▲</span>', down: '<span class="trend down" title="Went down">▼</span>', same: '<span class="trend same" title="No change">●</span>', '': '<span class="trend dot">•</span>' };
  const [headline, ...rest] = points;
  const words = points.join(' ').split(/\s+/).length;
  return `
    ${compact ? '' : `<div class="qs-head"><span class="kicker">Quick summary</span><span class="small muted">${Math.max(10, Math.round(words / 4))}-second read</span></div>`}
    <p class="qs-headline">${icon[trend(headline)]}<span>${decorate(headline, used)}</span></p>
    ${rest.length ? `<ul class="qs-list">${rest.map(p => `<li>${icon[trend(p)]}<span>${decorate(p, used)}</span></li>`).join('')}</ul>` : ''}
    <p class="qs-note small muted">${b.points.length ? 'Taken word for word from the ONS “Main points”, shortened to the first sentence of each.' : 'Taken word for word from the opening of the report.'}${used.size ? ' Dotted words explain jargon — hover or tap them.' : ''}${b.released ? ` Released ${esc(b.released)}.` : ''}</p>`;
}

// ---------------------------------------------------------------- reader
async function readPage(params) {
  const uri = params.get('uri') || '';
  if (!/^\/[a-z0-9/]+$/i.test(uri)) { view.innerHTML = errorBox('That is not a valid ONS bulletin link.'); return; }
  view.innerHTML = loading('Loading the bulletin from the ONS…');
  const b = await loadBulletin(uri);
  if (!b.sections.length) {
    view.innerHTML = `<div class="card"><h2>${esc(b.title || 'This page')}</h2><p>This page doesn't have a format we can show here.</p><a class="btn" href="${esc(ONS_SITE + uri)}" target="_blank" rel="noopener">Read it on the ONS website ↗</a></div>`;
    return;
  }
  setTitle(b.title);
  const onsUrl = ONS_SITE + uri;
  const words = b.sections.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  const minutes = Math.max(1, Math.round(words / 230));
  const main = b.sections.find(s => /main points|key points/i.test(s.title));

  view.innerHTML = `
    <div class="crumbs"><a href="#/bulletins">Bulletins</a> › ${esc(b.series || b.title)}</div>
    <header class="reader-head">
      <div class="badges">
        <span class="badge data">${b.kind === 'article' ? 'Article' : 'Statistical bulletin'}</span>
        ${b.latest === true ? '<span class="badge good">Latest release</span>' : b.latest === false ? `<span class="badge warn">Not the latest release${b.latestUri ? ` · <a href="#/read?uri=${encodeURIComponent(b.latestUri)}">read the latest</a>` : ''}</span>` : ''}
        ${b.accredited ? `<span class="badge" title="${esc(b.accredited)}">Accredited official statistics</span>` : ''}
      </div>
      <h1>${esc(b.title)}</h1>
      ${b.summary ? `<p class="lead">${esc(b.summary)}</p>` : ''}
      <dl class="reader-meta">
        ${b.released ? `<div><dt>Released</dt><dd>${esc(b.released)}</dd></div>` : ''}
        ${b.nextRelease ? `<div><dt>Next release</dt><dd>${esc(b.nextRelease)}</dd></div>` : ''}
        ${b.contact ? `<div><dt>Produced by</dt><dd>${esc(b.contact)}</dd></div>` : ''}
        <div><dt>Reading time</dt><dd>${minutes} min · ${b.charts.length} chart${b.charts.length === 1 ? '' : 's'}</dd></div>
      </dl>
      <div class="controls">
        <a class="btn ghost" href="${esc(onsUrl)}" target="_blank" rel="noopener">View on ONS ↗</a>
        ${b.previousUri ? `<a class="btn ghost" href="${esc(ONS_SITE + b.previousUri)}" target="_blank" rel="noopener">Previous releases ↗</a>` : ''}
        <button class="btn ghost" type="button" id="citeBtn">Copy citation</button>
      </div>
    </header>

    <section class="quick-summary" aria-label="Quick summary">
      ${summaryHtml(b)}
      <div class="controls" style="margin-top:14px"><button class="btn primary" type="button" data-jump="0">Read the full ${b.kind === 'article' ? 'article' : 'bulletin'} ↓</button></div>
    </section>

    <div class="reader-layout">
      <nav class="reader-toc" aria-label="Contents">
        <div class="toc-title">Contents</div>
        <ol>${b.sections.map((s, i) => `<li><a href="#" data-jump="${i}">${esc(s.title)}</a></li>`).join('')}</ol>
      </nav>
      <article class="reader">
        ${b.sections.map((s, i) => `
          <section class="reader-section ${s === main ? 'keypoints' : ''}" id="rs-${i}">
            <h2><span class="num">${i + 1}</span>${esc(s.title)}</h2>
            ${s.html}
          </section>`).join('')}
        ${sourceLine({ name: `ONS — ${b.title}`, url: onsUrl, released: b.released, extra: 'Text and data © Crown copyright, Open Government Licence' })}
      </article>
    </div>`;

  document.getElementById('citeBtn').onclick = async e => {
    const text = `${b.title}. Office for National Statistics${b.released ? `, released ${b.released}` : ''}. ${onsUrl}`;
    try { await navigator.clipboard.writeText(text); e.target.textContent = 'Copied ✓'; } catch { prompt('Copy this citation:', text); }
  };
  // In-page links (contents, "see section 3") scroll instead of changing the route.
  const sectionIds = b.sections.map(s => s.id);
  const onClick = e => {
    const a = e.target.closest('[data-jump], a[data-anchor]');
    if (!a) return;
    e.preventDefault();
    const i = a.dataset.jump != null ? a.dataset.jump : sectionIds.indexOf(a.dataset.anchor);
    document.getElementById('rs-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  view.addEventListener('click', onClick);
  window.addEventListener('hashchange', () => view.removeEventListener('click', onClick), { once: true });
  // Highlight the section being read.
  const tocLinks = [...view.querySelectorAll('.reader-toc a')];
  const io = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) {
      const i = en.target.id.slice(3);
      tocLinks.forEach(l => l.classList.toggle('active', l.dataset.jump === i));
    }
  }, { rootMargin: '-20% 0px -70% 0px' });
  view.querySelectorAll('.reader-section').forEach(s => io.observe(s));
  window.addEventListener('hashchange', () => io.disconnect(), { once: true });

  b.charts.forEach((c, i) => renderBulletinChart(c, document.getElementById('bchart-' + i)));
}

// Pull the parts we need out of the ONS page.
function extractBulletin(doc, uri) {
  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const metaAfter = label => {
    const span = [...doc.querySelectorAll('p span.font-weight-700')].find(s => text(s).toLowerCase().startsWith(label));
    if (!span) return '';
    const p = span.parentElement.cloneNode(true);
    p.querySelectorAll('.visuallyhidden').forEach(n => n.remove());
    return text(p).slice(text(span).length).trim();
  };
  const banner = doc.querySelector('.alert-release-banner');
  const latestLink = banner?.querySelector('a[href*="/latest"], a:not([href*="previousreleases"])');
  const b = {
    kind: /\/articles\//.test(uri) ? 'article' : 'bulletin',
    title: text(doc.querySelector('h1')),
    summary: doc.querySelector('meta[name="description"]')?.content?.trim() || '',
    released: metaAfter('release date'),
    nextRelease: metaAfter('next release'),
    contact: metaAfter('contact'),
    accredited: doc.querySelector('img.meta__image--logo')?.alt || '',
    latest: banner ? banner.classList.contains('alert-release-banner__latest') : null,
    latestUri: null,
    previousUri: banner?.querySelector('a[href*="previousreleases"]')?.getAttribute('href') || null,
    series: text(doc.querySelector('.breadcrumb-bulletins__item:last-child')) || '',
    sections: [],
    charts: [],
    points: [],          // the ONS "Main points", as plain text
    fallbackPoints: [],  // opening paragraphs, for reports without main points
  };
  if (b.latest === false && latestLink) b.latestUri = onsPath(latestLink.getAttribute('href'));
  for (const wrap of doc.querySelectorAll('.section__content--markdown')) {
    const sec = wrap.querySelector('section') || wrap;
    const h2 = sec.querySelector('header h2, h2');
    const title = text(h2).replace(/^\d+\.\s*/, '');
    const paras = el => [...sec.querySelectorAll(el)].filter(n => !n.closest('.markdown-chart-container, .markdown-table-container, .print--hide')).map(text).filter(t => t.length > 30);
    if (/main points|key points|summary/i.test(title) && !b.points.length) b.points = paras('li').length ? paras('li') : paras('p');
    if (!b.fallbackPoints.length) b.fallbackPoints = paras('p').slice(0, 3);
    const parts = [];
    for (const node of sec.childNodes) {
      if (node.nodeName === 'HEADER') continue;
      parts.push(clean(node, b));
    }
    const html = parts.join('').trim();
    if (!title && !html) continue;
    b.sections.push({ id: wrap.id, title: title || 'Section', html, text: text(sec) });
  }
  return b;
}

const ALLOWED = new Set(['P', 'UL', 'OL', 'LI', 'H3', 'H4', 'H5', 'STRONG', 'B', 'EM', 'I', 'SUP', 'SUB', 'BR', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION', 'A']);
const DROP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'BUTTON', 'FORM', 'INPUT', 'SVG', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'LINK', 'META']);

// Rebuild a node as safe HTML. Unknown tags are unwrapped, never copied.
function clean(node, b) {
  if (node.nodeType === Node.TEXT_NODE) return esc(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.nodeName;
  const cls = node.classList;
  if (DROP.has(tag)) return '';
  if (cls.contains('print--hide') || cls.contains('visuallyhidden') || cls.contains('notes-holder-js')) return '';
  if (cls.contains('markdown-chart-container')) return chartBlock(node, b);
  if (cls.contains('markdown-table-container')) return tableBlock(node, b);
  if (cls.contains('pym-interactive') || node.querySelector?.(':scope > iframe')) {
    const url = node.dataset.url || node.querySelector('iframe')?.getAttribute('src') || '';
    const title = node.dataset.title || node.querySelector('iframe')?.title || 'Interactive content';
    return `<div class="callout small">📊 <strong>${esc(title)}</strong> is an interactive tool. <a href="${esc(new URL(url, ONS_SITE).href)}" target="_blank" rel="noopener">Open it on the ONS website ↗</a></div>`;
  }
  const inner = [...node.childNodes].map(n => clean(n, b)).join('');
  if (tag === 'IMG') {
    const src = node.getAttribute('src') || '';
    return /^(\/|https:\/\/(www|cdn)\.ons\.gov\.uk\/)/.test(src) ? `<img class="reader-img" loading="lazy" src="${esc(new URL(src, ONS_SITE).href)}" alt="${esc(node.alt || '')}">` : '';
  }
  if (tag === 'FIGCAPTION') return `<p class="small muted">${inner}</p>`;
  if (tag === 'FOOTER') return `<div class="small muted">${inner}</div>`;
  if (!ALLOWED.has(tag)) return inner;
  if (tag === 'A') return cleanLink(node, inner);
  let attrs = '';
  if (tag === 'TD' || tag === 'TH') {
    for (const a of ['colspan', 'rowspan']) { const v = node.getAttribute(a); if (/^\d{1,2}$/.test(v || '')) attrs += ` ${a}="${v}"`; }
    if (tag === 'TH' && node.getAttribute('scope')) attrs += ` scope="${node.getAttribute('scope') === 'row' ? 'row' : 'col'}"`;
  }
  if (tag === 'BR') return '<br>';
  const t = tag.toLowerCase();
  if ((t === 'p' || t === 'li') && !inner.trim()) return '';
  return `<${t}${attrs}>${inner}</${t}>`;
}

function onsPath(href) {
  try {
    const u = new URL(href, ONS_SITE);
    return u.hostname === 'www.ons.gov.uk' ? u.pathname.replace(/\/$/, '') : null;
  } catch { return null; }
}

// Links: ONS series and bulletins open on this site; everything else opens in a new tab.
function cleanLink(node, inner) {
  const href = (node.getAttribute('href') || '').trim();
  if (!inner.trim()) return '';
  if (href.startsWith('#')) {
    if (/back to table of contents/i.test(node.textContent)) return '';
    return `<a href="#" data-anchor="${esc(href.slice(1))}">${inner}</a>`;
  }
  if (href.startsWith('mailto:')) return `<a href="${esc(href)}">${inner}</a>`;
  const path = onsPath(href);
  if (path) {
    if (/\/timeseries\/[a-z0-9]+\/[a-z0-9]+$/i.test(path)) return `<a href="#/series?uri=${encodeURIComponent(path)}">${inner}</a>`;
    if (/\/(bulletins|articles)\/[a-z0-9]+\/[a-z0-9]+$/i.test(path)) return `<a href="#/read?uri=${encodeURIComponent(path)}">${inner}</a>`;
    return `<a href="${esc(ONS_SITE + path + (new URL(href, ONS_SITE).search || ''))}" target="_blank" rel="noopener">${inner}<span class="ext" aria-hidden="true">↗</span></a>`;
  }
  if (/^https?:\/\//i.test(href)) return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}<span class="ext" aria-hidden="true">↗</span></a>`;
  return inner;
}

function chartBlock(node, b) {
  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const chartEl = node.querySelector('.markdown-chart[data-uri]');
  const uri = chartEl?.dataset.uri;
  if (!uri) return '';
  const heads = [...node.querySelectorAll('h3, h4')].filter(h => !h.closest('.print--hide') && !h.classList.contains('print--hide'));
  const title = text(heads.find(h => h.tagName === 'H3')) || 'Figure';
  const subtitle = text(heads.find(h => h.tagName === 'H4' && !/^source:/i.test(text(h))));
  const source = text(heads.find(h => /^source:/i.test(text(h)))).replace(/^source:\s*/i, '');
  const idx = b.charts.push({ uri, title, subtitle, source }) - 1;
  return `<figure class="b-figure">
      <figcaption><strong>${esc(title)}</strong>${subtitle ? `<span>${esc(subtitle)}</span>` : ''}</figcaption>
      <div class="chart" id="bchart-${idx}">${loading('Drawing chart…')}</div>
      <div class="b-figure-foot"><span class="small muted">${source ? `Source: ${esc(source)}` : ''}</span>
        <span class="controls"><a class="small" href="${esc(`${ONS_SITE}/generator?uri=${uri}&format=csv`)}" target="_blank" rel="noopener">Download data (CSV)</a></span></div>
    </figure>`;
}

function tableBlock(node, b) {
  const table = node.querySelector('table');
  if (!table) return '';
  const fig = node.querySelector('figure');
  const tidy = s => (s || '').replace(/\s+/g, ' ').trim();
  const cap = table.querySelector('caption');
  const subEl = cap?.querySelector('.table__subtitle');
  const subtitle = tidy(subEl?.textContent);
  subEl?.remove();
  const titleText = tidy(cap?.textContent || fig?.querySelector('figcaption, h3, h4')?.textContent);
  cap?.remove();
  const dl = node.querySelector('a[href*="format=csv"]') || node.querySelector('a[href*="/download/table"]');
  const foot = fig?.querySelector('footer');
  foot?.remove();
  return `<figure class="b-figure b-table">
      ${titleText ? `<figcaption><strong>${esc(titleText)}</strong>${subtitle ? `<span>${esc(subtitle)}</span>` : ''}</figcaption>` : ''}
      <div class="table-wrap"><table class="data">${[...table.childNodes].map(n => clean(n, b)).join('')}</table></div>
      <div class="b-figure-foot"><span class="small muted">${foot ? clean(foot, b) : ''}</span>
        ${dl ? `<a class="small" href="${esc(new URL(dl.getAttribute('href'), ONS_SITE).href)}" target="_blank" rel="noopener">Download table</a>` : ''}</div>
    </figure>`;
}

// ---------------------------------------------------------------- charts from ONS CSVs
async function renderBulletinChart(c, box) {
  if (!box) return;
  try {
    const [csv, cfg] = await queued(() => Promise.all([
      api(`/api/ons/site/generator?uri=${encodeURIComponent(c.uri)}&format=csv`, 'text'),
      api(`/api/ons/site/chartconfig?uri=${encodeURIComponent(c.uri)}`, 'text').catch(() => ''),
    ]));
    if (!document.body.contains(box)) return;
    const type = (cfg.match(/options\.chart\.type\s*=\s*"(\w+)"/) || [])[1] || '';
    const d = parseChartCsv(csv);
    if (!d.categories.length || !d.series.length) throw new Error('No chart data');
    const dec = Math.min(2, Math.max(0, ...d.series.flatMap(s => s.raw).map(v => (String(v).split('.')[1] || '').length)));
    const pct = d.unit.trim() === '%';
    const fmt = v => `${v < 0 ? '−' : ''}${nf(Math.abs(v), dec)}${pct ? '%' : ''}`;
    const shown = d.series.slice(0, SERIES_COLOURS.length).map((s, i) => ({ name: s.name || d.unit || 'Value', values: s.values, color: SERIES_COLOURS[i] }));
    const isTime = /line|area|spline/.test(type) || (!type && d.categories.length > 12);
    const draw = () => {
      if (isTime) Charts.line(box, { labels: d.categories, series: shown, format: fmt, ariaLabel: c.title });
      else Charts.groupedBars(box, { categories: d.categories, series: shown, format: fmt, ariaLabel: c.title });
      box.insertAdjacentHTML('beforeend', `
        ${d.unit && !pct ? `<p class="small muted" style="margin:8px 0 0">Unit: ${esc(d.unit)}</p>` : ''}
        ${d.notes ? `<p class="small muted chart-notes">${esc(d.notes.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))}</p>` : ''}
        ${d.series.length > shown.length ? `<p class="small muted">Showing the first ${shown.length} of ${d.series.length} series — see the table for all.</p>` : ''}
        <details class="table-toggle"><summary>Show the numbers as a table</summary>
          <div class="table-wrap" style="margin-top:8px"><table class="data"><thead><tr><th></th>${d.series.map(s => `<th>${esc(s.name)}</th>`).join('')}</tr></thead>
          <tbody>${d.categories.map((cat, i) => `<tr><td>${esc(cat)}</td>${d.series.map(s => `<td>${s.values[i] == null ? '–' : fmt(s.values[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`);
    };
    draw();
    onRedraw(draw);
  } catch {
    // Fall back to the ONS's own picture of the chart.
    box.innerHTML = `<img class="reader-img" loading="lazy" src="${esc(`${ONS_SITE}/chartimage?uri=${c.uri}`)}" alt="${esc(c.title)}">`;
  }
}

// ONS chart CSV: title, subtitle, Notes, Unit rows, then a header row (blank or
// "Category" first cell, then series names) and the data. Cells can span lines.
function parseChartCsv(text) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const metaEnd = Math.max(rows.findIndex(r => r[0] === 'Unit'), rows.findIndex(r => r[0] === 'Notes'), 1);
  const unit = ((rows.find(r => r[0] === 'Unit') || [])[1] || '').trim();
  const notes = ((rows.find(r => r[0] === 'Notes') || [])[1] || '').trim();
  const h = rows.findIndex((r, i) => i > metaEnd && r.length > 1 && r.slice(1).some(c => c.trim()));
  const names = rows[h].slice(1).map(s => s.trim());
  const body = rows.slice(h + 1).filter(r => r[0] !== undefined && r[0].trim() !== '');
  const series = names.map((name, j) => {
    const raw = body.map(r => (r[j + 1] ?? '').replace(/,/g, '').trim());
    return { name, raw, values: raw.map(v => (v === '' || isNaN(v) ? null : Number(v))) };
  }).filter(s => s.values.some(v => v != null));
  return { unit, notes, categories: body.map(r => r[0].trim()), series };
}

// Full CSV parser (quoted cells may contain commas, quotes and line breaks).
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// At most a few chart downloads at once, so the ONS doesn't rate-limit us.
const chartQueue = { running: 0, waiting: [] };
function queued(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      chartQueue.running++;
      try { resolve(await fn()); } catch (e) { reject(e); } finally {
        chartQueue.running--;
        chartQueue.waiting.shift()?.();
      }
    };
    if (chartQueue.running < 3) run(); else chartQueue.waiting.push(run);
  });
}
