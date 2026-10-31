'use strict';

// Integration tests for the bundled WebView assets. CHROMIUM_PATH and a local
// playwright-core installation are required. No model or Android device is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright-core');

const web = path.resolve(__dirname, '../app/src/main/assets/web');
const fixture = name => path.resolve(__dirname, 'fixtures', name);
const executablePath = process.env.CHROMIUM_PATH || chromium.executablePath();
const openBrowsers = new Set();
if (!executablePath || !fs.existsSync(executablePath)) throw new Error('Install Playwright Chromium or set CHROMIUM_PATH to a local executable.');

function server() {
  return new Promise(resolve => {
    const instance = http.createServer((req, res) => {
      const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(web, '.' + (requestPath === '/' ? '/index.html' : requestPath));
      if (!file.startsWith(web + path.sep)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end(); return; }
        const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json'};
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(data);
      });
    });
    instance.listen(0, '127.0.0.1', () => resolve(instance));
  });
}
async function browserPage(url, init) {
  const browser = await chromium.launch({executablePath, headless: true,
    args: ['--no-sandbox', '--no-zygote', '--disable-dev-shm-usage', '--allow-file-access-from-files']});
  openBrowsers.add(browser);
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  if (init) await page.addInitScript(init);
  await page.goto(url, {waitUntil: 'load'});
  return {browser, page, errors};
}
async function finish(scope, label) {
  assert.deepEqual(scope.errors, [], `${label}: browser errors`);
  await scope.browser.close(); openBrowsers.delete(scope.browser); console.log(`${label}: PASS`);
}
async function upload(page, source, name) {
  const input = typeof source === 'string' ? fixture(source) : {name, mimeType: 'application/pdf', buffer: source};
  await page.locator('#file-input').setInputFiles(input);
  await page.waitForFunction(() => document.querySelector('#stop-btn').hidden, null, {timeout: 60000});
}
async function closeImportNotice(page) {
  if (await page.locator('#import-ok').count()) {
    const text = await page.locator('.modal').innerText(); await page.locator('#import-ok').click(); return text;
  }
  return '';
}
async function ask(page, question) { await page.locator('#question').fill(question); await page.locator('#send-btn').click(); }

// Make a real, image-only, multi-page PDF from JPEGs. There is no text layer:
// a result requires PDF.js rendering followed by the local image reader.
function imagePdf(images) {
  const objects = new Map();
  const str = x => Buffer.from(x, 'binary');
  objects.set(1, str('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.set(2, str(`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, i) => `${3 + 3*i} 0 R`).join(' ')}] >>`));
  images.forEach((jpeg, i) => {
    const p = 3 + 3*i, stream = str('q\n600 0 0 800 0 0 cm\n/Im0 Do\nQ\n');
    objects.set(p, str(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /XObject << /Im0 ${p+2} 0 R >> >> /Contents ${p+1} 0 R >>`));
    objects.set(p+1, Buffer.concat([str(`<< /Length ${stream.length} >>\nstream\n`), stream, str('endstream')]));
    objects.set(p+2, Buffer.concat([str(`<< /Type /XObject /Subtype /Image /Width 1200 /Height 1600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, str('\nendstream')]));
  });
  let chunks = [str('%PDF-1.4\n%\xff\xff\xff\xff\n')], offsets = [0], position = chunks[0].length;
  for (let i = 1; i <= objects.size; i++) {
    const object = Buffer.concat([str(`${i} 0 obj\n`), objects.get(i), str('\nendobj\n')]);
    offsets[i] = position; chunks.push(object); position += object.length;
  }
  const xref = ['xref', `0 ${offsets.length}`, '0000000000 65535 f ', ...offsets.slice(1).map(x => `${String(x).padStart(10, '0')} 00000 n `),
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>`, `startxref\n${position}\n%%EOF\n`].join('\n');
  chunks.push(str(xref)); return Buffer.concat(chunks);
}
async function createScannedPdf(page) {
  const images = await page.evaluate(async () => {
    await document.fonts.load('48px OcrNaskh', 'الجاذبية');
    return ['الطاقة هي القدرة على بذل شغل', 'الجاذبية هي قوة تجذب الأجسام نحو الأرض'].map(text => {
      const c = document.createElement('canvas'); c.width = 1200; c.height = 1600;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#faf9f4'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.font = '48px OcrNaskh'; ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = '#171717';
      ctx.fillText(text, 1120, 210);
      return c.toDataURL('image/jpeg', .86).split(',')[1];
    });
  });
  return imagePdf(images.map(x => Buffer.from(x, 'base64')));
}

(async () => {
  const localServer = await server();
  const url = `http://127.0.0.1:${localServer.address().port}/`;
  try {
    for (const [label, address] of [['HTTP', url], ['file URL', pathToFileURL(path.join(web, 'index.html')).href]]) {
      const scope = await browserPage(address), page = scope.page;
      await upload(page, 'physics.pdf');
      assert.equal(await page.locator('.source-item').count(), 1);
      await ask(page, 'What is osmosis?');
      await page.waitForSelector('.reference-card');
      const answer = await page.locator('.message.assistant').innerText();
      assert.match(answer, /Osmosis/); assert.match(answer, /صفحة (2|٢)/);
      await page.locator('.reference-card').click();
      assert.match(await page.locator('.modal').innerText(), /semipermeable/);
      await page.locator('#open-full-page').click();
      assert.match(await page.locator('.modal').innerText(), /Osmosis/);
      await page.reload(); assert.equal(await page.locator('.message.assistant').count(), 1);
      await page.locator('#menu-btn').click(); await page.locator('#new-session').click();
      assert.equal(await page.locator('.message').count(), 0); assert.equal(await page.locator('.source-item').count(), 0);
      await finish(scope, `${label}: text PDF, page citation, persistence and isolated notebook`);
    }

    for (const [label, address] of [['HTTP', url], ['file URL', pathToFileURL(path.join(web, 'index.html')).href]]) {
      const scope = await browserPage(address), page = scope.page;
      const pdf = await createScannedPdf(page);
      await upload(page, pdf, 'scanned-arabic.pdf');
      assert.match(await closeImportNotice(page), /تجريبية/);
      assert.equal(await page.locator('.source-item').count(), 1);
      await ask(page, 'ما هي الجاذبية؟');
      await page.waitForSelector('.reference-card');
      const answer = await page.locator('.message.assistant').last().innerText();
      assert.match(answer, /الجاذبية/); assert.match(answer, /صفحة (2|٢)/); assert.match(answer, /من صورة/);
      await page.locator('.reference-card').last().click();
      assert.match(await page.locator('.modal').innerText(), /غير دقيق/);
      await page.locator('#open-full-page').click();
      assert.equal(await page.locator('.ocr-preview').count(), 1);
      assert.match(await page.locator('.excerpt-text').innerText(), /الجاذبية/);
      await page.locator('#edit-page').click();
      assert.equal(await page.locator('.ocr-preview').count(), 1);
      await page.locator('#page-edit').fill('الجاذبية قوة تجذب الأجسام نحو الأرض. هذا نص مصحح يدويًا.');
      await page.locator('#edit-save').click();
      await page.locator('#modal-close').click();
      await ask(page, 'ما هي الجاذبية؟');
      assert.match(await page.locator('.message.assistant').last().innerText(), /الجاذبية قوة تجذب/);
      await page.reload();
      assert.match(await page.locator('.message.assistant').last().innerText(), /الجاذبية قوة تجذب/);
      await finish(scope, `${label}: image-only PDF OCR, page provenance, preview and correction`);
    }

    {
      const scope = await browserPage(url), page = scope.page;
      const results = await page.evaluate(async () => {
        const text = 'الجاذبية هي قوة تجذب الأجسام نحو الأرض', out = [];
        for (const font of ['Plex', 'OcrNaskh', 'OcrAmiri', 'OcrDejaVu']) for (const size of [28, 36, 48, 64]) {
          await document.fonts.load(size + 'px ' + font, text);
          const c = document.createElement('canvas'); c.width = 1300; c.height = 230;
          const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          ctx.fillStyle = '#000'; ctx.font = size + 'px ' + font; ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillText(text, 1200, 100);
          const recognition = await MidadOcr.recognize(c);
          const table = await MidadOcr.load();
          const boxes = MidadOcr.layout(MidadOcr.binarize(ctx.getImageData(0, 0, c.width, c.height)), c.width, c.height);
          const diagnostics = boxes.map(line => line.map(box => {
            const match = MidadOcr.scoreFeature(table, MidadOcr.feature(c, box), box.width / box.height);
            return {text: match.text, score: Number(match.score.toFixed(4)), uncertain: !!match.uncertain, width: box.width, height: box.height};
          }));
          out.push([font, size, recognition, diagnostics]);
        }
        return out;
      });
      const expected = 'الجاذبية هي قوة تجذب الأجسام نحو الأرض'.split(' ');
      for (const [font, size, result, diagnostics] of results) {
        const actual = result.text.split(' ');
        assert.equal(actual.length, expected.length, `${font} ${size}: word count`);
        const correctWords = actual.filter((w, i) => w === expected[i]).length;
        assert.ok(correctWords >= 6, `${font} ${size}: expected >=6 correct words, got ${correctWords}/${expected.length}; OCR=${JSON.stringify(result.text)}; boxes=${JSON.stringify(diagnostics)}`);
        assert.ok(actual.every((w, i) => w === expected[i] || w === '□'), `${font} ${size}: no incorrect guess in this sample`);
      }
      const unknown = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 1300; c.height = 230;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.font = '48px OcrNaskh'; ctx.textAlign = 'right'; ctx.direction = 'rtl'; ctx.fillStyle = '#000';
        ctx.fillText('سفسطةتخمينيةزغرغوطية', 1200, 100);
        return MidadOcr.recognize(c);
      });
      assert.equal(unknown.text, '□');
      await finish(scope, 'Four clean Arabic fonts and four sizes; unrecognized word marked');
    }

    {
      const scope = await browserPage(url), page = scope.page;
      await upload(page, 'arabic-reference.pdf'); await ask(page, 'ما هي الجاذبية؟');
      await page.waitForSelector('.reference-card'); assert.match(await page.locator('.message.assistant').innerText(), /الجاذبية/);
      await page.locator('.reference-card').click(); assert.match(await page.locator('.modal').innerText(), /الأرض/);
      await finish(scope, 'Fragmented Arabic text PDF search and excerpt');
    }

    {
      const scope = await browserPage(url), page = scope.page;
      await upload(page, 'encrypted.pdf'); assert.match(await closeImportNotice(page), /كلمة مرور/);
      assert.equal(await page.locator('.source-item').count(), 0);
      await upload(page, 'scanned.pdf'); assert.match(await closeImportNotice(page), /تجريبية/);
      assert.equal(await page.locator('.source-item').count(), 1);
      await finish(scope, 'Protected PDF is rejected; existing image PDF is imported with a warning');
    }

    {
      const scope = await browserPage(url), page = scope.page;
      await ask(page, 'احسب 12 × 5');
      let answer = await page.locator('.message.assistant').last().innerText();
      assert.match(answer, /60/); assert.match(answer, /ليس من مرجع/);
      assert.equal(await page.locator('.message.assistant').last().locator('.reference-card').count(), 0);
      await page.locator('#mode-shortcut').click(); await page.locator('#strict-mode').locator('..').click(); await page.locator('#save-settings').click();
      await ask(page, 'احسب 12 × 5'); assert.match(await page.locator('.message.assistant').last().innerText(), /أضف مرجعًا/);
      await page.locator('#mode-shortcut').click(); await page.locator('#strict-mode').locator('..').click();
      await page.locator('#allow-math').locator('..').click(); await page.locator('#ocr-enabled').locator('..').click(); await page.locator('#save-settings').click();
      await ask(page, 'احسب 12 × 5'); assert.match(await page.locator('.message.assistant').last().innerText(), /لم أجد/);
      await upload(page, 'scanned.pdf'); assert.match(await closeImportNotice(page), /فعّل قراءة الصور/);
      assert.equal(await page.locator('.source-item').count(), 0);
      await finish(scope, 'Local calculation and enforceable strict, calculation and OCR controls');
    }

    {
      const scope = await browserPage(url), page = scope.page;
      const pdf = await createScannedPdf(page);
      await page.evaluate(() => {
        const original = window.MidadOcr.recognize;
        window.MidadOcr.recognize = async function (...args) { await new Promise(r => setTimeout(r, 400)); return original(...args); };
      });
      await page.locator('#file-input').setInputFiles({name: 'cancel.pdf', mimeType: 'application/pdf', buffer: pdf});
      await page.waitForSelector('#stop-btn:not([hidden])'); await page.locator('#stop-btn').click();
      await page.waitForSelector('#import-ok', {timeout: 30000});
      assert.match(await page.locator('.modal').innerText(), /أُ?وقفت/);
      assert.equal(await page.locator('.source-item').count(), 0);
      await finish(scope, 'Cancellation does not save a partially read PDF');
    }

    for (const badState of ['{', '{"sessions":[]}']) {
      const scope = await browserPage(url, () => {
        window.__saveCount = 0;
        window.NativeBridge = {getState() { return window.__badState; }, saveState() { window.__saveCount++; return true; }};
      });
      await scope.page.addInitScript(value => { window.__badState = value; }, badState); await scope.page.reload();
      await ask(scope.page, 'سؤال'); assert.equal(await scope.page.evaluate(() => window.__saveCount), 0);
      assert.match(await scope.page.locator('#toast').innerText(), /الحفظ متوقف/);
      await finish(scope, 'Unreadable saved data is not overwritten');
    }
  } finally {
    await Promise.all([...openBrowsers].map(browser => browser.close().catch(() => {})));
    await new Promise(resolve => localServer.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
