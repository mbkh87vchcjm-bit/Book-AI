/* Local, deterministic retrieval helpers. No network or model calls live here. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MidadEngine = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STOP = new Set(('من في على عن إلى الى ما ماذا لماذا هل هذا هذه ذلك تلك هو هي هم أنا انت ان كان كانت يكون تكون كيف كم متى أين اين مع دون او و ثم قد لقد عند حتى كل بين بعد قبل الذي التي الذين والتي وهو وهي بأن لان أن إن بعض هناك يوجد وجود حسب حول لي ليش اي أي فقط شرح اشرح اريد أريد أعطني اعطني سؤال التالي التاليه التالية يلي لدي عندي the a an is are was were of to for on in at by with from and or as it its be what who how why when where explain tell me about this that those these please give my your based document documents source sources file files').split(/\s+/));

  function normalize(text) {
    var s = String(text || '');
    try { s = s.normalize('NFKC'); } catch (_) {}
    return s.toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[ؤئ]/g, 'ء').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); });
  }

  function stemVariants(token) {
    var variants = [token];
    var t = token;
    if (/^[\u0600-\u06ff]+$/.test(t)) {
      // Remove only known compound clitics or the definite article.
      // Never strip a standalone initial و/ف/ب: that corrupted words such as
      // البيانات -> يانات. Keep each intermediate form for safer matching.
      if (t.length > 5 && /^(وال|بال|كال|فال|لل)/.test(t)) {
        t = t.replace(/^(وال|بال|كال|فال|لل)/, '');
      } else if (t.length > 4 && /^ال/.test(t)) {
        t = t.slice(2);
      }
      if (t && variants.indexOf(t) < 0) variants.push(t);

      // Conservative common plural / possessive suffixes.
      if (t.length > 4 && /(ات|ون|ين|ها|هم)$/.test(t)) {
        var withoutSuffix = t.slice(0, -2);
        if (withoutSuffix.length >= 3 && variants.indexOf(withoutSuffix) < 0) variants.push(withoutSuffix);
      }
      // normalize() folds ta marbuta to ه. Retain the ه-form and add a
      // secondary feminine-ending variant rather than replacing the original.
      if (t.length > 3 && /ه$/.test(t)) {
        var feminineBase = t.slice(0, -1);
        if (feminineBase.length >= 3 && variants.indexOf(feminineBase) < 0) variants.push(feminineBase);
      }
    } else if (/^[a-z]+$/.test(t) && t.length > 5) {
      var englishStem = t.replace(/(ing|ed|es|s)$/, '');
      if (englishStem.length > 2 && englishStem !== t) variants.push(englishStem);
    }
    return variants;
  }

  function words(text) {
    // Keep common technical identifiers intact. A generic alphanumeric regex
    // previously discarded C++/C# and split TCP/IP and IEEE 802.11.
    var tokenPattern = /c\+\+|c#|f#|tcp\/ip|udp\/ip|http\/2|wi-fi|802\.11[a-z0-9]*|[a-z0-9]+(?:[+#]|\/[a-z0-9]+|\.[a-z0-9]+)*|[\u0621-\u063a\u0641-\u064a\u066e-\u06d3\u06fa-\u06fc\u0750-\u077f\u08a0-\u08c9]+/g;
    var raw = normalize(text).match(tokenPattern) || [];
    var result = [], seen = new Set();
    raw.forEach(function (token) {
      var technical = /[+#/.]/.test(token) || /^\d/.test(token);
      if ((!technical && token.length < 2) || STOP.has(token)) return;
      stemVariants(token).forEach(function (variant) {
        if (variant && variant.length > 1 && !STOP.has(variant) && !seen.has(variant)) {
          seen.add(variant);
          result.push(variant);
        }
      });
    });
    return result;
  }


  // PDF.js may return Arabic PDFs as individual visual-order glyphs (not words).
  // Reassemble those lines without inserting a space between every glyph, and
  // reverse only strongly RTL fragmented runs whose x positions progress LTR.
  function extractPdfText(items) {
    var lines = [], line = [];
    function flush() {
      if (!line.length) return;
      var visible = line.filter(function (item) { return item && item.str; });
      var rtl = visible.filter(function (item) { return item.dir === 'rtl' && /[\u0600-\u06ff\ufb50-\ufdff\ufe70-\ufeff]/.test(item.str); });
      var shortRtl = rtl.filter(function (item) { return Array.from(item.str.trim()).length <= 2; });
      var increasing = 0, measured = 0;
      for (var i = 1; i < visible.length; i++) {
        var prev = visible[i - 1].transform, next = visible[i].transform;
        if (prev && next && Math.abs(next[4] - prev[4]) > 0.01) { measured++; if (next[4] > prev[4]) increasing++; }
      }
      var fragmentaryVisualRtl = rtl.length >= 4 && shortRtl.length / rtl.length >= 0.65 && measured > 2 && increasing / measured >= 0.8;
      var ordered = fragmentaryVisualRtl ? visible.slice().reverse() : visible;
      var text = ordered.map(function (item) { return item.str; }).join('');
      try { text = text.normalize('NFKC'); } catch (_) {}
      text = text.replace(/[ \t]{2,}/g, ' ').trim();
      if (text) lines.push(text);
      line = [];
    }
    (items || []).forEach(function (item) {
      if (item.str) line.push(item);
      if (item.hasEOL) flush();
    });
    flush();
    return lines.join('\n');
  }

  function chunksForDocument(doc, size, overlap) {
    size = size || 850;
    overlap = overlap === undefined ? 110 : overlap;
    var out = [];
    (doc.pages || []).forEach(function (page) {
      var text = String(page.text || '').trim();
      var cursor = 0;
      while (cursor < text.length) {
        var end = Math.min(text.length, cursor + size);
        if (end < text.length) {
          var boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf(' ', end));
          if (boundary > cursor + size * 0.55) end = boundary;
        }
        var piece = text.slice(cursor, end).trim();
        if (piece) out.push({docId: doc.id, docName: doc.name, page: page.page, type: doc.type, text: piece, offset: cursor, ocr: !!page.ocr});
        if (end >= text.length) break;
        var next = Math.max(cursor + 1, end - overlap);
        // Start at a word boundary, without skipping the overlap entirely.
        var wordStart = text.indexOf(' ', next);
        cursor = wordStart > -1 && wordStart < end ? wordStart + 1 : next;
      }
    });
    return out;
  }

  function isOverview(query) {
    var q = normalize(query);
    return /(?:لخص|تلخيص|ملخص|اهم النقاط|نظره عامه|فكره عامه|ملخصا|summari[sz]e|overview|key points|main points)/.test(q);
  }

  function search(documents, query, limit, priorQuery) {
    limit = limit || 3;
    var all = [];
    (documents || []).forEach(function (d) { all = all.concat(chunksForDocument(d)); });
    if (!all.length) return { references: [], overview: false, queryWords: [] };
    var terms = Array.from(new Set(words(query)));
    // Only inherit the previous question when the current one has no topical
    // words. Adding old terms to a new one-word topic can suppress its real hit
    // (or falsely cite an unrelated page from the previous turn).
    if (!terms.length && priorQuery) terms = Array.from(new Set(words(priorQuery)));
    var overview = isOverview(query);
    if (overview) {
      // Overview requests have no topical terms. Select representative beginnings, one per document/page.
      var seen = new Set();
      var samples = all.filter(function (c) {
        var key = c.docId + ':' + c.page;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).slice(0, limit);
      return { references: samples, overview: true, queryWords: terms };
    }
    if (!terms.length) return { references: [], overview: false, queryWords: terms };
    var tokenSets = all.map(function (c) { return words(c.text); });
    var df = {};
    terms.forEach(function (term) {
      df[term] = tokenSets.reduce(function (n, ts) { return n + (ts.indexOf(term) >= 0 ? 1 : 0); }, 0);
    });
    var scored = all.map(function (chunk, i) {
      var ts = tokenSets[i], score = 0, matched = 0;
      terms.forEach(function (term) {
        var tf = ts.reduce(function (n, token) { return n + (token === term ? 1 : 0); }, 0);
        if (tf) {
          matched++;
          score += Math.log(1 + (all.length + 0.5) / (df[term] + 0.5)) * (1 + Math.log(tf)) * (term.length >= 5 ? 1.15 : 1);
        }
      });
      var required = terms.length >= 3 ? 2 : 1;
      if (matched < required || (terms.length > 1 && matched / terms.length < 0.3)) score = 0;
      return {chunk: chunk, score: score, matched: matched};
    }).filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score || b.matched - a.matched || a.chunk.offset - b.chunk.offset; });
    // Avoid showing overlapping pieces of the same page as multiple independent citations.
    var pages = new Set();
    var refs = [];
    scored.forEach(function (x) {
      var key = x.chunk.docId + ':' + x.chunk.page;
      if (refs.length < limit && !pages.has(key)) { pages.add(key); refs.push(x.chunk); }
    });
    return {references: refs, overview: false, queryWords: terms};
  }

  function shorten(value, max) {
    var chars = Array.from(String(value || '').trim());
    if (chars.length <= max) return chars.join('');
    return chars.slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…';
  }

  return {normalize: normalize, words: words, extractPdfText: extractPdfText, chunksForDocument: chunksForDocument, search: search, shorten: shorten};
}));
