// Streaming reader for very large .ods spreadsheets (too big to load in one go):
// finds content.xml inside the zip, inflates it as a stream and calls onRow for each row.
const fs = require('fs'), zlib = require('zlib');
function entryStream(file, name) {
  const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size;
  const tail = Buffer.alloc(Math.min(size, 66000)); fs.readSync(fd, tail, 0, tail.length, size - tail.length);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const cdOff = tail.readUInt32LE(eocd + 16), cdLen = tail.readUInt32LE(eocd + 12);
  const cd = Buffer.alloc(cdLen); fs.readSync(fd, cd, 0, cdLen, cdOff);
  for (let p = 0; p < cdLen;) {
    const nlen = cd.readUInt16LE(p + 28), elen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32);
    const n = cd.slice(p + 46, p + 46 + nlen).toString();
    if (n === name) {
      const method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20), lho = cd.readUInt32LE(p + 42);
      const lh = Buffer.alloc(30); fs.readSync(fd, lh, 0, 30, lho);
      const start = lho + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const raw = fs.createReadStream(file, { start, end: start + csize - 1 });
      return method === 8 ? raw.pipe(zlib.createInflateRaw()) : raw;
    }
    p += 46 + nlen + elen + clen;
  }
  throw new Error('not found ' + name);
}
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
// Calls onRow(sheetName, cells[]) for every row.
function readRows(file, onRow) {
  return new Promise((resolve, reject) => {
    let buf = '', sheet = '';
    const s = entryStream(file, 'content.xml');
    s.setEncoding('utf8');
    s.on('data', chunk => {
      buf += chunk;
      let end;
      for (;;) {
        const t = buf.search(/<table:table [^>]*table:name="|<table:table-row[ >]/);
        if (t < 0) { buf = buf.slice(-200); break; }
        if (buf.startsWith('<table:table ', t)) { const m = buf.slice(t).match(/^<table:table [^>]*table:name="([^"]*)"/); if (!m) break; sheet = unesc(m[1]); buf = buf.slice(t + m[0].length); continue; }
        end = buf.indexOf('</table:table-row>', t);
        if (end < 0) { buf = buf.slice(t); break; }
        const row = buf.slice(t, end); buf = buf.slice(end + 18);
        const cells = [];
        const re = /<table:table-cell([^>]*?)(\/>|>([\s\S]*?)<\/table:table-cell>)/g;
        let m;
        while ((m = re.exec(row))) {
          const attrs = m[1];
          const rep = Math.min(+((attrs.match(/number-columns-repeated="(\d+)"/) || [])[1] || 1), 50);
          const val = (attrs.match(/office:value="([^"]*)"/) || [])[1];
          const txt = m[3] ? unesc(m[3].replace(/<text:s[^>]*\/>/g, ' ').replace(/<[^>]+>/g, '')) : '';
          for (let k = 0; k < rep; k++) cells.push(val != null ? Number(val) : txt);
        }
        while (cells.length && cells[cells.length - 1] === '') cells.pop();
        if (cells.length) onRow(sheet, cells);
      }
    });
    s.on('end', resolve); s.on('error', reject);
  });
}
module.exports = { readRows };
