// Small, dependency-free SVG charts with hover tooltips.
// Charts start their value axis at zero when all values are positive, so
// changes are never visually exaggerated (a common trick in misleading graphs).

const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const tip = () => document.getElementById('tooltip');

  function el(name, attrs = {}, parent) {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  }

  // "Nice" axis ticks.
  function ticks(min, max, count = 5) {
    if (min === max) { max = min + 1; }
    const span = max - min;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
    return out;
  }

  function showTip(html, evt) {
    const t = tip();
    t.innerHTML = html;
    t.hidden = false;
    const pad = 14;
    const r = t.getBoundingClientRect();
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
    t.style.left = Math.max(8, x) + 'px';
    t.style.top = Math.max(8, y) + 'px';
  }
  const hideTip = () => { tip().hidden = true; };

  /**
   * Line chart.
   * opts.series: [{ name, color, values: [number|null] }]  (all share opts.labels)
   * opts.labels: x labels; opts.format: value → string
   */
  function line(container, opts) {
    const { labels, series, format = v => v.toLocaleString('en-GB') } = opts;
    container.innerHTML = '';
    const W = Math.max(320, container.clientWidth || 640);
    const H = opts.height || (W < 500 ? 240 : 300);
    const m = { t: 12, r: 16, b: 28, l: 56 };
    const all = series.flatMap(s => s.values).filter(v => v != null && isFinite(v));
    if (!all.length) { container.innerHTML = '<p class="muted">No data available.</p>'; return; }
    let lo = Math.min(...all), hi = Math.max(...all);
    if (lo > 0 && opts.zero !== false) lo = 0;
    if (hi < 0) hi = 0;
    const yt = ticks(lo, hi);
    lo = yt[0]; hi = yt[yt.length - 1];
    const n = labels.length;
    const x = i => m.l + (n === 1 ? 0.5 : i / (n - 1)) * (W - m.l - m.r);
    const y = v => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel || 'Line chart' }, container);
    for (const v of yt) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'zero' : 'gridline' }, svg);
      const t = el('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'axis-label' }, svg);
      t.textContent = (opts.axisFormat || format)(v);
    }
    // x labels: about 6 evenly spaced
    const every = Math.max(1, Math.ceil(n / (W < 500 ? 4 : 7)));
    for (let i = 0; i < n; i += every) {
      const t = el('text', { x: x(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : 'middle', class: 'axis-label' }, svg);
      t.textContent = opts.shortLabel ? opts.shortLabel(labels[i]) : labels[i];
    }
    for (const s of series) {
      let d = '', pen = false;
      s.values.forEach((v, i) => {
        if (v == null || !isFinite(v)) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      el('path', { d, class: 'line', stroke: s.color }, svg);
      // end-point marker + direct label for the latest value
      const last = s.values.map((v, i) => [v, i]).filter(([v]) => v != null).pop();
      if (last) el('circle', { cx: x(last[1]), cy: y(last[0]), r: 4, fill: s.color, class: 'dot' }, svg);
    }

    // hover layer
    const cross = el('line', { y1: m.t, y2: H - m.b, class: 'crosshair', visibility: 'hidden' }, svg);
    const dots = series.map(s => el('circle', { r: 5, fill: s.color, class: 'dot', visibility: 'hidden' }, svg));
    const hit = el('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: 'transparent' }, svg);
    const move = evt => {
      const pt = svg.getBoundingClientRect();
      const px = (evt.clientX - pt.left) * (W / pt.width);
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      let rows = '';
      series.forEach((s, k) => {
        const v = s.values[i];
        if (v == null) { dots[k].setAttribute('visibility', 'hidden'); return; }
        dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(v)); dots[k].setAttribute('visibility', 'visible');
        rows += `<div class="t-row"><span><i style="background:${s.color}"></i> ${esc(s.name)}</span><b>${format(v)}</b></div>`;
      });
      showTip(`<div class="t-title">${esc(labels[i])}</div>${rows}`, evt);
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); hideTip();
    });

    if (series.length > 1) {
      const lg = document.createElement('div');
      lg.className = 'legend';
      lg.innerHTML = series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('');
      container.appendChild(lg);
    }
  }

  /**
   * Horizontal bar chart.
   * opts.rows: [{ label, value, highlight?, tip? }]; opts.format
   */
  function bars(container, opts) {
    const { rows, format = v => v.toLocaleString('en-GB') } = opts;
    container.innerHTML = '';
    const W = Math.max(300, container.clientWidth || 600);
    const narrow = W < 520;
    const rowH = 30, gap = 2;
    const m = { t: 4, r: narrow ? 64 : 80, b: 4, l: narrow ? 120 : 180 };
    const H = m.t + m.b + rows.length * rowH;
    const vals = rows.map(r => r.value);
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const x = v => m.l + ((v - lo) / (hi - lo || 1)) * (W - m.l - m.r);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel || 'Bar chart' }, container);
    const color = opts.color || 'var(--series-1)';
    const all = [];
    rows.forEach((r, i) => {
      const yy = m.t + i * rowH;
      const g = el('g', {}, svg);
      const lbl = el('text', { x: m.l - 10, y: yy + rowH / 2 + 4, 'text-anchor': 'end', class: 'bar-label' }, g);
      lbl.textContent = narrow && r.label.length > 17 ? r.label.slice(0, 16) + '…' : r.label;
      const x0 = x(Math.min(0, r.value)), x1 = x(Math.max(0, r.value));
      const bar = el('rect', {
        x: x0, y: yy + 5, width: Math.max(1, x1 - x0), height: rowH - 10 - gap, rx: 4,
        fill: r.color || (r.highlight ? 'var(--series-2)' : color), class: 'bar',
      }, g);
      const val = el('text', { x: x1 + 6, y: yy + rowH / 2 + 4, class: 'bar-value' }, g);
      val.textContent = format(r.value);
      all.push(bar);
      const hitR = el('rect', { x: 0, y: yy, width: W, height: rowH, fill: 'transparent' }, g);
      hitR.addEventListener('pointermove', evt => {
        all.forEach(b => b.classList.toggle('dim', b !== bar));
        showTip(`<div class="t-title">${esc(r.label)}</div><div class="t-row"><span>${esc(opts.valueName || 'Value')}</span><b>${format(r.value)}</b></div>${r.tip ? `<div class="muted small" style="margin-top:4px">${r.tip}</div>` : ''}`, evt);
      });
      hitR.addEventListener('pointerleave', () => { all.forEach(b => b.classList.remove('dim')); hideTip(); });
    });
    if (lo < 0) el('line', { x1: x(0), x2: x(0), y1: 0, y2: H, class: 'zero' }, svg);
  }

  /**
   * Horizontal grouped bars: one group per category, one bar per series.
   * opts.categories: [label]; opts.series: [{ name, color, values }]; opts.format
   */
  function groupedBars(container, opts) {
    const { categories, series, format = v => v.toLocaleString('en-GB') } = opts;
    container.innerHTML = '';
    const W = Math.max(300, container.clientWidth || 600);
    const narrow = W < 520;
    const barH = series.length > 1 ? 14 : 20, gap = 2, groupPad = 12;
    const groupH = series.length * (barH + gap) + groupPad;
    const m = { t: 4, r: narrow ? 56 : 72, b: 4, l: narrow ? 120 : 200 };
    const H = m.t + m.b + categories.length * groupH;
    const vals = series.flatMap(s => s.values).filter(v => v != null && isFinite(v));
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const x = v => m.l + ((v - lo) / (hi - lo || 1)) * (W - m.l - m.r);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel || 'Bar chart' }, container);
    const all = [];
    categories.forEach((cat, ci) => {
      const y0 = m.t + ci * groupH;
      const lbl = el('text', { x: m.l - 10, y: y0 + (groupH - groupPad) / 2 + 4, 'text-anchor': 'end', class: 'bar-label' }, svg);
      lbl.textContent = narrow && cat.length > 17 ? cat.slice(0, 16) + '…' : cat.length > 32 ? cat.slice(0, 31) + '…' : cat;
      series.forEach((s, si) => {
        const v = s.values[ci];
        if (v == null || !isFinite(v)) return;
        const yy = y0 + si * (barH + gap);
        const x0 = x(Math.min(0, v)), x1 = x(Math.max(0, v));
        const bar = el('rect', { x: x0, y: yy, width: Math.max(1, x1 - x0), height: barH, rx: 3, fill: s.color, class: 'bar' }, svg);
        if (series.length === 1 || !narrow) {
          const t = el('text', { x: (v < 0 ? x0 - 4 : x1 + 4), y: yy + barH / 2 + 4, 'text-anchor': v < 0 ? 'end' : 'start', class: 'bar-value' }, svg);
          t.textContent = format(v);
        }
        all.push(bar);
      });
      const hit = el('rect', { x: 0, y: y0, width: W, height: groupH - groupPad / 2, fill: 'transparent' }, svg);
      hit.addEventListener('pointermove', evt => {
        showTip(`<div class="t-title">${esc(cat)}</div>${series.map(s => `<div class="t-row"><span><i style="background:${s.color}"></i> ${esc(s.name)}</span><b>${s.values[ci] == null ? '–' : format(s.values[ci])}</b></div>`).join('')}`, evt);
      });
      hit.addEventListener('pointerleave', hideTip);
    });
    if (lo < 0) el('line', { x1: x(0), x2: x(0), y1: 0, y2: H, class: 'zero' }, svg);
    if (series.length > 1) {
      const lg = document.createElement('div');
      lg.className = 'legend';
      lg.innerHTML = series.map(s => `<span><i style="background:${s.color};height:10px;width:10px"></i>${esc(s.name)}</span>`).join('');
      container.appendChild(lg);
    }
  }

  function spark(values, color = 'var(--series-1)') {
    const v = values.filter(n => n != null);
    if (v.length < 2) return '';
    const W = 200, H = 40;
    let lo = Math.min(...v), hi = Math.max(...v);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pts = v.map((n, i) => `${(i / (v.length - 1) * W).toFixed(1)},${(H - 3 - (n - lo) / (hi - lo) * (H - 6)).toFixed(1)}`);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { line, bars, groupedBars, spark, esc };
})();
