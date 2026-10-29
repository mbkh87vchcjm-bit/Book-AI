/* Deterministic, font-template OCR for clean printed text. No learned model. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MidadOcr = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var W = 32, H = 16, RECORD = 70, BYTE_COUNT = 64;
  var MAX_WORDS_PER_PAGE = 350, cache;
  var popcount = new Uint8Array(256);
  for (var i = 1; i < 256; i++) popcount[i] = popcount[i >> 1] + (i & 1);

  function xhr(url, kind) {
    return new Promise(function (resolve, reject) {
      var req = new XMLHttpRequest(); req.open('GET', url, true);
      if (kind === 'binary') req.responseType = 'arraybuffer';
      req.onload = function () {
        if ((req.status >= 200 && req.status < 300) || req.status === 0) resolve(kind === 'binary' ? req.response : req.responseText);
        else reject(new Error('تعذّر تحميل بيانات قوالب القراءة المحلية.'));
      };
      req.onerror = function () { reject(new Error('تعذّر تحميل بيانات قوالب القراءة المحلية.')); };
      req.send();
    });
  }
  function bucket(aspect) { return Math.max(0, Math.min(95, Math.round(Math.log(Math.max(0.04, aspect)) * 12) + 40)); }
  function decodeTable(buffer, vocabulary) {
    var bytes = new Uint8Array(buffer), view = new DataView(buffer);
    if (bytes.length < 16 || String.fromCharCode.apply(null, bytes.subarray(0, 8)) !== 'MIDADOC1') throw new Error('بيانات قارئ الصور غير صالحة.');
    var n = view.getUint32(8, true), rec = view.getUint16(12, true);
    if (rec !== RECORD || n > 200000 || bytes.length !== 16 + n * RECORD || bytes[14] !== W || bytes[15] !== H) throw new Error('بيانات قارئ الصور غير مكتملة.');
    if (!vocabulary || !Array.isArray(vocabulary.arabic) || !Array.isArray(vocabulary.english)) throw new Error('قاموس قارئ الصور غير صالح.');
    var buckets = Array.from({length: 96}, function () { return []; });
    for (var i = 0; i < n; i++) {
      var offset = 16 + i * RECORD, aspect = view.getUint16(offset + 4, true) / 512;
      if (aspect > 0) buckets[bucket(aspect)].push(offset);
    }
    return {bytes: bytes, view: view, buckets: buckets, vocabulary: vocabulary};
  }
  function load() {
    if (!cache) cache = Promise.all([xhr('ocr/templates.bin', 'binary'), xhr('ocr/vocabulary.json', 'text')])
      .then(function (parts) { return decodeTable(parts[0], JSON.parse(parts[1])); })
      .catch(function (err) { cache = null; throw err; });
    return cache;
  }
  function wordFor(table, id) {
    var title = !!(id & 0x80000000), index = id & 0x7fffffff;
    if (index < table.vocabulary.arabic.length) return {text: table.vocabulary.arabic[index], rtl: true};
    var text = table.vocabulary.english[index - table.vocabulary.arabic.length] || '';
    if (title && text) text = text[0].toUpperCase() + text.slice(1);
    return {text: text, rtl: false};
  }
  function feature(canvas, box) {
    var tiny = document.createElement('canvas'); tiny.width = W; tiny.height = H;
    var ctx = tiny.getContext('2d', {willReadFrequently: true});
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(canvas, box.left, box.top, box.width, box.height, 0, 0, W, H);
    var px = ctx.getImageData(0, 0, W, H).data, bits = new Uint8Array(BYTE_COUNT);
    for (var i = 0; i < W * H; i++) if (px[i * 4] < 200) bits[i >> 3] |= 1 << (i & 7);
    return bits;
  }
  function scoreFeature(table, bits, aspect) {
    var b = bucket(aspect), best = 999, next = 999, bestId = -1, offsets = table.buckets;
    var minBucket = Math.max(0, b - 5), maxBucket = Math.min(offsets.length - 1, b + 5);
    for (var bi = minBucket; bi <= maxBucket; bi++) {
      var list = offsets[bi];
      for (var j = 0; j < list.length; j++) {
        var off = list[j], candidateAspect = table.view.getUint16(off + 4, true) / 512;
        var delta = Math.abs(Math.log(aspect / candidateAspect));
        if (delta > 0.34) continue;
        var distance = 0, start = off + 6;
        // A lower bound allows early exit after a promising match is found.
        var maxDifferent = Math.ceil(Math.min(next, 0.38) * (W * H));
        for (var k = 0; k < BYTE_COUNT; k++) {
          distance += popcount[bits[k] ^ table.bytes[start + k]];
          if (distance > maxDifferent) break;
        }
        var score = distance / (W * H) + Math.min(delta * 0.12, 0.10);
        var id = table.view.getUint32(off, true);
        if (id === bestId) { if (score < best) best = score; }
        else if (score < best) { next = best; best = score; bestId = id; }
        else if (score < next) next = score;
      }
    }
    // Similar but different words are intentionally not presented as certain.
    // A low distance still does not guarantee correctness, especially for words
    // absent from the dictionary. Prefer a visible unknown over a weak match.
    if (bestId < 0 || best > 0.075 || (next - best < 0.006 && best > 0.015)) return {text: '□', rtl: false, uncertain: true, score: best};
    var result = wordFor(table, bestId);
    result.uncertain = !result.text; result.score = best;
    if (!result.text) result.text = '□';
    return result;
  }
  function gray(r, g, b) { return (77 * r + 150 * g + 29 * b) >> 8; }
  function binarize(image) {
    var hist = new Uint32Array(256), pixels = image.data, total = image.width * image.height;
    for (var i = 0; i < total; i++) hist[gray(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2])]++;
    var sum = 0; for (var p = 0; p < 256; p++) sum += p * hist[p];
    var backWeight = 0, backSum = 0, best = 0, threshold = 0;
    for (var t = 0; t < 256; t++) {
      backWeight += hist[t]; if (!backWeight) continue;
      var foreWeight = total - backWeight; if (!foreWeight) break;
      backSum += t * hist[t];
      var meanBack = backSum / backWeight, meanFore = (sum - backSum) / foreWeight;
      var variance = backWeight * foreWeight * Math.pow(meanBack - meanFore, 2);
      if (variance > best) { best = variance; threshold = t; }
    }
    // Include anti-aliased edges on clean pages; avoid treating white paper as ink.
    threshold = threshold < 40 ? 190 : Math.min(205, Math.max(100, threshold + 25));
    var mask = new Uint8Array(total);
    for (var q = 0; q < total; q++) mask[q] = gray(pixels[q * 4], pixels[q * 4 + 1], pixels[q * 4 + 2]) < threshold ? 1 : 0;
    return mask;
  }
  function runs(values, minimum) {
    var found = [], start = -1;
    for (var i = 0; i <= values.length; i++) {
      var ink = i < values.length && values[i] >= minimum;
      if (ink && start < 0) start = i;
      if (!ink && start >= 0) { found.push({start: start, end: i - 1}); start = -1; }
    }
    return found;
  }
  function layout(mask, width, height) {
    var rows = new Uint32Array(height);
    for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) rows[y] += mask[y * width + x];
    var rowRuns = runs(rows, Math.max(2, Math.floor(width * 0.0005)));
    var lengths = rowRuns.map(function (r) { return r.end - r.start + 1; }).filter(function (n) { return n >= 2; }).sort(function (a, b) { return a - b; });
    var typical = lengths.length ? lengths[Math.floor(lengths.length * 0.7)] : 4;
    var mergeGap = Math.max(3, Math.min(18, Math.round(typical * 0.7)));
    var lines = [];
    rowRuns.forEach(function (r) {
      var last = lines[lines.length - 1];
      if (last && r.start - last.end - 1 <= mergeGap) last.end = r.end;
      else lines.push({start: r.start, end: r.end});
    });
    return lines.map(function (line) {
      var lineHeight = line.end - line.start + 1;
      if (lineHeight < 7 || lineHeight > Math.min(220, height * 0.5)) return [];
      var cols = new Uint32Array(width);
      for (var y = line.start; y <= line.end; y++) for (var x = 0; x < width; x++) cols[x] += mask[y * width + x];
      var colRuns = runs(cols, 1);
      if (!colRuns.length) return [];
      var wordGap = Math.max(3, Math.round(lineHeight * 0.18));
      var segments = [];
      colRuns.forEach(function (r) {
        var last = segments[segments.length - 1];
        if (last && r.start - last.end - 1 < wordGap) last.end = r.end;
        else segments.push({start: r.start, end: r.end});
      });
      return segments.map(function (s) {
        var top = height, bottom = -1;
        for (var yy = line.start; yy <= line.end; yy++) for (var xx = s.start; xx <= s.end; xx++) if (mask[yy * width + xx]) { top = Math.min(top, yy); bottom = Math.max(bottom, yy); }
        return {left: s.start, top: top, width: s.end - s.start + 1, height: bottom - top + 1};
      }).filter(function (box) { return box.width >= 2 && box.height >= 3; });
    }).filter(function (line) { return line.length > 0 && line.length <= 80; });
  }
  async function recognize(canvas, options) {
    options = options || {};
    var table = await load(), ctx = canvas.getContext('2d', {willReadFrequently: true});
    var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var lines = layout(binarize(image), canvas.width, canvas.height);
    var output = [], recognized = 0, uncertain = 0, used = 0;
    for (var li = 0; li < lines.length; li++) {
      if (options.shouldStop && options.shouldStop()) throw new Error('أوقفت قراءة الصورة.');
      var words = [];
      for (var wi = 0; wi < lines[li].length; wi++) {
        if (++used > MAX_WORDS_PER_PAGE) break;
        var box = lines[li][wi], result = scoreFeature(table, feature(canvas, box), box.width / box.height);
        if (result.uncertain) uncertain++; else recognized++;
        words.push(result);
      }
      if (words.length) {
        var arabic = words.filter(function (w) { return w.rtl; }).length;
        var latin = words.filter(function (w) { return !w.rtl && !w.uncertain; }).length;
        if (arabic > latin) words.reverse();
        output.push(words.map(function (w) { return w.text; }).join(' '));
      }
      if (options.onProgress) options.onProgress(li + 1, lines.length);
      // Let the UI render status and accept a stop click between lines.
      if (li % 2 === 1) await new Promise(function (resolve) { setTimeout(resolve, 0); });
      if (used > MAX_WORDS_PER_PAGE) break;
    }
    return {text: output.join('\n'), recognized: recognized, uncertain: uncertain,
      truncated: used > MAX_WORDS_PER_PAGE, lines: lines.length};
  }
  return {recognize: recognize, load: load, decodeTable: decodeTable, binarize: binarize, layout: layout, scoreFeature: scoreFeature, feature: feature};
}));
