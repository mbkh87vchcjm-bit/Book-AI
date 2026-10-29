'use strict';
// Build a deterministic font-template table from the bundled word list. No
// pre-trained OCR/LLM model is used. Requires playwright-core and Chromium.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright-core');
const root = path.resolve(__dirname, '../app/src/main/assets/web');
const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('Set CHROMIUM_PATH to a Chromium executable');
const vocab = JSON.parse(fs.readFileSync(path.join(root, 'ocr/vocabulary.json'), 'utf8'));
const recordBytes = 70; // uint32 word id, uint16 aspect ratio (x512), 512 bitmap bits
const all = [];
for (let i = 0; i < vocab.arabic.length; i++) for (const family of ['Plex', 'OcrNaskh', 'OcrAmiri', 'OcrDejaVu']) {
  all.push({id: i, text: vocab.arabic[i], family, size: 48, rtl: true});
  // Additional rasterizations of common words handle small scan text without
  // multiplying the memory and comparison cost of the entire dictionary.
  if (i < 5000) for (const size of [28, 36]) all.push({id: i, text: vocab.arabic[i], family, size, rtl: true});
}
for (let i = 0; i < vocab.english.length; i++) for (const family of ['Plex', 'OcrDejaVu']) {
  const id = vocab.arabic.length + i;
  all.push({id, text: vocab.english[i], family, rtl: false});
  all.push({id: (id | 0x80000000) >>> 0, text: vocab.english[i][0].toUpperCase() + vocab.english[i].slice(1), family, rtl: false});
}
if (process.env.OCR_TEMPLATE_LIMIT) all.splice(Number(process.env.OCR_TEMPLATE_LIMIT));
const server = http.createServer((req, res) => {
  const f = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!f.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(f, (err, data) => {
    if (err) return res.writeHead(404).end();
    const type = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.ttf':'font/ttf'};
    res.setHeader('content-type', type[path.extname(f)] || 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({executablePath, headless:true, args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']});
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.evaluate(async () => {
      await Promise.all([document.fonts.load('48px Plex', 'الجاذبية ABC'),
        document.fonts.load('48px OcrNaskh', 'الجاذبية'),
        document.fonts.load('48px OcrAmiri', 'الجاذبية'),
        document.fonts.load('48px OcrDejaVu', 'ABC')]);
    });
    const outfile = path.join(root, 'ocr/templates.bin');
    const fd = fs.openSync(outfile, 'w');
    const header = Buffer.alloc(16); header.write('MIDADOC1', 0, 'ascii');
    header.writeUInt32LE(all.length, 8); header.writeUInt16LE(recordBytes, 12); header[14] = 32; header[15] = 16;
    fs.writeSync(fd, header);
    try {
      for (let start = 0; start < all.length; start += 1200) {
        const chunk = all.slice(start, start + 1200);
        const encoded = await page.evaluate(items => {
          const w = 32, h = 16, rec = 70;
          const output = new Uint8Array(items.length * rec);
          const view = new DataView(output.buffer);
          const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 130;
          const ctx = canvas.getContext('2d', {willReadFrequently: true});
          const tiny = document.createElement('canvas'); tiny.width = w; tiny.height = h;
          const small = tiny.getContext('2d', {willReadFrequently: true});
          items.forEach((item, index) => {
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = (item.size || 48) + 'px ' + item.family; ctx.direction = item.rtl ? 'rtl' : 'ltr';
            ctx.textAlign = item.rtl ? 'right' : 'left'; ctx.fillStyle = '#000';
            const anchor = item.rtl ? 1080 : 20;
            const measured = Math.ceil(ctx.measureText(item.text).width) + 50;
            ctx.fillText(item.text, anchor, 80);
            const sx = item.rtl ? Math.max(0, anchor - measured) : 0;
            const sw = Math.min(canvas.width - sx, measured + 40);
            const a = ctx.getImageData(sx, 0, sw, canvas.height).data;
            let x0 = canvas.width, x1 = -1, y0 = canvas.height, y1 = -1;
            for (let y = 0; y < canvas.height; y++) for (let x = 0; x < sw; x++) {
              if (a[(y * sw + x) * 4] < 200) { const ax=x+sx; if (ax < x0) x0 = ax; if (ax > x1) x1 = ax; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            }
            const off = index * rec;
            view.setUint32(off, item.id, true);
            if (x1 < x0) return;
            const bw = x1-x0+1, bh = y1-y0+1;
            view.setUint16(off+4, Math.min(65535, Math.round(512 * bw / bh)), true);
            small.fillStyle = 'white'; small.fillRect(0,0,w,h);
            small.drawImage(canvas, x0,y0,bw,bh, 0,0,w,h);
            const px = small.getImageData(0,0,w,h).data;
            for (let i=0; i<w*h; i++) if (px[i*4] < 200) output[off+6+(i>>3)] |= 1 << (i & 7);
          });
          let binary = '';
          for (let i=0;i<output.length;i+=32768) binary += String.fromCharCode.apply(null, output.subarray(i,i+32768));
          return btoa(binary);
        }, chunk);
        fs.writeSync(fd, Buffer.from(encoded, 'base64'));
        if (start % 12000 === 0) console.log(`templates ${start}/${all.length}`);
      }
    } finally { fs.closeSync(fd); }
    console.log(`Wrote ${all.length} templates to ${outfile}`);
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
