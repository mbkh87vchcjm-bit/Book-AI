/* Local, deterministic retrieval helpers. Standard BM25 & Cross-Language Lexicon Expansion. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mlke-lexicon.js'));
  else root.MidadEngine = factory(root.MlkeLexicon);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (LexiconClass) {
  'use strict';

  var STOP = new Set(('from in on at by with for of to is are was were a an the and or as it its be what who how why when where explain tell me about this that those these please give my your based document documents source sources file files من في على عن إلى الى ما ماذا لماذا هل هذا هذه ذلك تلك هو هي هم أنا انت ان كان كانت يكون تكون كيف كم متى أين اين مع دون او و ثم قد لقد عند حتى كل بين بعد قبل الذي التي الذين والتي وهو وهي بأن لان أن إن بعض هناك يوجد وجود حسب حول لي ليش اي أي فقط شرح اشرح اريد أريد أعطني اعطني سؤال التالي التاليه التالية يلي لدي عندي').split(/\s+/));

  var getLexicon = function () {
    if (LexiconClass) {
      return LexiconClass.getSharedInstance ? LexiconClass.getSharedInstance() : new LexiconClass();
    }
    return null;
  };

  function normalize(text) {
    var s = String(text || '');
    try { s = s.normalize('NFKC'); } catch (_) {}
    return s.toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[ؤئ]/g, 'ء').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); });
  }

  function stemVariants(token) {
    var variants = [token], t = token;
    if (/^[\u0600-\u06ff]+$/.test(t)) {
      if (t.length > 5 && /^(وال|بال|كال|فال|لل)/.test(t)) t = t.replace(/^(وال|بال|كال|فال|لل)/, '');
      else if (t.length > 4 && /^ال/.test(t)) t = t.slice(2);
      if (t && variants.indexOf(t) < 0) variants.push(t);
      if (t.length > 4 && /(ات|ون|ين|ها|هم)$/.test(t)) {
        var base = t.slice(0, -2);
        if (base.length >= 3 && variants.indexOf(base) < 0) variants.push(base);
      }
      if (t.length > 3 && /ه$/.test(t)) {
        var feminine = t.slice(0, -1);
        if (feminine.length >= 3 && variants.indexOf(feminine) < 0) variants.push(feminine);
      }
    } else if (/^[a-z]+$/.test(t) && t.length > 5) {
      var englishStem = t.replace(/(ing|ed|es|s)$/, '');
      if (englishStem.length > 2 && englishStem !== t) variants.push(englishStem);
    }
    return variants;
  }

  function words(text) {
    var pattern = /c\+\+|c#|f#|tcp\/ip|udp\/ip|http\/2|wi-fi|802\.11[a-z0-9]*|[a-z0-9]+(?:[+#]|\/[a-z0-9]+|\.[a-z0-9]+)*|[\u0621-\u063a\u0641-\u064a\u066e-\u06d3\u06fa-\u06fc\u0750-\u077f\u08a0-\u08c9]+/g;
    var raw = normalize(text).match(pattern) || [], output = [];
    raw.forEach(function (token) {
      var technical = /[+#/.]/.test(token) || /^\d/.test(token);
      if (!technical && (token.length <= 1 || STOP.has(token))) return;
      var local = new Set();
      stemVariants(token).forEach(function (variant) {
        if (variant.length > 1 && (technical || !STOP.has(variant)) && !local.has(variant)) {
          local.add(variant);
          output.push(variant); // Keep repeats across the text: BM25 needs term frequency.
        }
      });
    });
    return output;
  }

  function baseWords(text) {
    var pattern = /c\+\+|c#|f#|tcp\/ip|udp\/ip|http\/2|wi-fi|802\.11[a-z0-9]*|[a-z0-9]+(?:[+#]|\/[a-z0-9]+|\.[a-z0-9]+)*|[\u0621-\u063a\u0641-\u064a\u066e-\u06d3\u06fa-\u06fc\u0750-\u077f\u08a0-\u08c9]+/g;
    var raw = normalize(text).match(pattern) || [], output = [];
    raw.forEach(function (token) {
      var technical = /[+#/.]/.test(token) || /^\d/.test(token);
      if (!technical && (token.length <= 1 || STOP.has(token))) return;
      var stemmed = token;
      if (/^[\u0600-\u06ff]+$/.test(token)) {
        // Safe morphology for embeddings: known prefixes/article and suffixes only.
        if (stemmed.length > 5 && /^(وال|بال|كال|فال|لل)/.test(stemmed)) stemmed = stemmed.replace(/^(وال|بال|كال|فال|لل)/, '');
        else if (stemmed.length > 4 && /^ال/.test(stemmed)) stemmed = stemmed.slice(2);
        if (stemmed.length > 4 && /(ات|ون|ين|ها|هم)$/.test(stemmed)) stemmed = stemmed.slice(0, -2);
      } else if (/^[a-z]+$/.test(stemmed) && stemmed.length > 5) {
        stemmed = stemmed.replace(/(ing|ed|es|s)$/, '');
      }
      if (stemmed.length > 1 && (technical || !STOP.has(stemmed))) output.push(stemmed);
    });
    return output;
  }

  function extractPdfText(items) {
    var lines = [], line = [], previousBaseline = null, previousHeight = 0;

    function metrics(item) {
      var transform = Array.isArray(item.transform) ? item.transform : null;
      var x = transform && Number.isFinite(Number(transform[4])) ? Number(transform[4]) : null;
      var y = transform && Number.isFinite(Number(transform[5])) ? Number(transform[5]) : null;
      var width = Number.isFinite(Number(item.width)) ? Math.abs(Number(item.width)) : 0;
      var height = Number.isFinite(Number(item.height)) ? Math.abs(Number(item.height)) : 0;
      if (!height && transform) height = Math.hypot(Number(transform[2]) || 0, Number(transform[3]) || 0);
      return {x: x, y: y, width: width, height: height, dir: item.dir === 'rtl' ? 'rtl' : 'ltr'};
    }

    function bounds(item) {
      var m = metrics(item);
      if (m.x === null || !m.width) return null;
      // PDF.js positions RTL runs from their right edge and LTR runs from their left edge.
      return m.dir === 'rtl'
        ? {left: m.x - m.width, right: m.x}
        : {left: m.x, right: m.x + m.width};
    }

    function horizontalGap(previous, current) {
      var a = bounds(previous), b = bounds(current);
      if (!a || !b) return null;
      var direction = previous.dir === current.dir ? previous.dir : current.dir;
      return direction === 'rtl' ? a.left - b.right : b.left - a.right;
    }

    function beginsWithClosingPunctuation(value) {
      return /^[,.;:!?،؛؟)\]}»…%]/.test(value);
    }

    function endsWithOpeningPunctuation(value) {
      return /[(\[{«]$/.test(value);
    }

    function flush() {
      if (!line.length) return;
      var visible = line.filter(function (item) { return item && typeof item.str === 'string' && item.str.length; });
      if (!visible.length) { line = []; previousBaseline = null; previousHeight = 0; return; }

      // A common Arabic PDF failure is logical text emitted as many tiny glyphs
      // in visual left-to-right order. Reverse only when the geometry strongly
      // indicates that specific fragmented pattern; never reverse normal RTL runs.
      var rtl = visible.filter(function (item) {
        return item.dir === 'rtl' && /[\u0600-\u06ff\ufb50-\ufdff\ufe70-\ufeff]/.test(item.str);
      });
      var shortRtl = rtl.filter(function (item) { return Array.from(item.str.trim()).length <= 2; });
      var increasing = 0, measured = 0;
      for (var i = 1; i < visible.length; i++) {
        var prev = metrics(visible[i - 1]), next = metrics(visible[i]);
        if (prev.x !== null && next.x !== null && Math.abs(next.x - prev.x) > 0.01) {
          measured++;
          if (next.x > prev.x) increasing++;
        }
      }
      var fragmentedVisualRtl = rtl.length >= 4 &&
        shortRtl.length / rtl.length >= 0.65 &&
        measured > 2 &&
        increasing / measured >= 0.8;
      var ordered = fragmentedVisualRtl ? visible.slice().reverse() : visible.slice();
      var text = '';

      ordered.forEach(function (item, index) {
        var piece = item.str;
        if (index > 0) {
          var previous = ordered[index - 1];
          var previousText = previous.str;
          var gap = horizontalGap(previous, item);
          var height = Math.max(metrics(previous).height, metrics(item).height);
          var gapThreshold = Math.max(1.25, height * 0.20);
          var hasExplicitSpace = /\s$/.test(previousText) || /^\s/.test(piece);
          var joinsArabicFragments = /[\u0600-\u06ff]$/.test(previousText) &&
            /^[\u0600-\u06ff]/.test(piece) &&
            (Array.from(previousText.trim()).length <= 2 || Array.from(piece.trim()).length <= 2);
          if (!hasExplicitSpace &&
              !joinsArabicFragments &&
              !beginsWithClosingPunctuation(piece) &&
              !endsWithOpeningPunctuation(previousText) &&
              gap !== null && gap > gapThreshold) {
            text += ' ';
          }
        }
        text += piece;
      });

      try { text = text.normalize('NFKC'); } catch (_) {}
      text = text.replace(/[ \t]{2,}/g, ' ').trim();
      if (text) lines.push(text);
      line = [];
      previousBaseline = null;
      previousHeight = 0;
    }

    (items || []).forEach(function (item) {
      if (!item) return;
      if (typeof item.str === 'string' && item.str.length) {
        var current = metrics(item);
        if (line.length && current.y !== null && previousBaseline !== null) {
          var tolerance = Math.max(2, Math.max(current.height, previousHeight) * 0.55);
          if (Math.abs(current.y - previousBaseline) > tolerance) flush();
        }
        line.push(item);
        if (current.y !== null) previousBaseline = current.y;
        if (current.height) previousHeight = current.height;
      }
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
        var wordStart = text.indexOf(' ', next);
        cursor = wordStart > -1 && wordStart < end ? wordStart + 1 : next;
      }
    });
    return out;
  }

  function isOverview(query) {
    var q = normalize(query);
    return /(?:لخص|تلخيص|ملخص|اهم النقاط|اهم الافكار|الافكار الرئيسيه|الافكار المهمه|المواضيع|الموضوعات|جميع المواضيع|كل المواضيع|كامل المحتوى|المحتوى بالكامل|نظره عامه|فكره عامه|ملخصا|summari[sz]e|overview|key points|main points|main ideas|all topics|whole document|entire document|full reference)/.test(q);
  }

  function search(documents, query, limit, priorQuery, learningStore, semanticModel) {
    limit = Math.max(1, Math.min(120, Number(limit) || 3));
    var all = [];
    (documents || []).forEach(function (d) { all = all.concat(chunksForDocument(d)); });
    if (!all.length) return { references: [], overview: false, queryWords: [] };

    var rawTerms = words(query);
    if (!rawTerms.length && priorQuery) rawTerms = words(priorQuery);
    var overview = isOverview(query);

    if (overview) {
      var seen = new Set();
      var pages = all.filter(function (c) {
        var key = c.docId + ':' + c.page;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      var sampleCount = Math.min(limit, pages.length), samples = [];
      for (var pageIndex = 0; pageIndex < sampleCount; pageIndex++) {
        var chosenIndex = sampleCount <= 1 ? 0 : Math.round(pageIndex * (pages.length - 1) / (sampleCount - 1));
        samples.push(pages[chosenIndex]);
      }
      return { references: samples, overview: true, queryWords: rawTerms };
    }
    if (!rawTerms.length) return { references: [], overview: false, queryWords: rawTerms };

    // Weighted Query Expansion
    var termWeights = {};
    rawTerms.forEach(function (t) { termWeights[t] = 1.0; });

    var lexicon = getLexicon();
    if (lexicon) {
      var normQuery = normalize(query);
      var wordsInQuery = normQuery.match(/[a-z0-9\u0621-\u063a\u0641-\u064a]+/g) || [];
      for (var len = 4; len >= 1; len--) {
        for (var i = 0; i <= wordsInQuery.length - len; i++) {
          var phrase = wordsInQuery.slice(i, i + len).join(' ');
          var match = lexicon.lookupTerm(phrase);
          if (match) {
            var expansions = lexicon.expandQueryTerms(phrase);
            expansions.forEach(function (exp) {
              words(exp).forEach(function (w) {
                if (!termWeights[w]) termWeights[w] = 0.75;
              });
            });
          }
        }
      }
    }

    var terms = Object.keys(termWeights);

    // Standard BM25 Scoring Formula
    var k1 = 1.2, b = 0.75;
    var tokenSets = all.map(function (c) { return words(c.text); });
    var docLengths = tokenSets.map(function (ts) { return ts.length; });
    var avgDocLength = docLengths.reduce(function (a, b) { return a + b; }, 0) / (all.length || 1);

    var df = {};
    terms.forEach(function (term) {
      df[term] = tokenSets.reduce(function (n, ts) { return n + (ts.indexOf(term) >= 0 ? 1 : 0); }, 0);
    });

    var normalizedQuery = normalize(query);
    var scored = all.map(function (chunk, i) {
      var ts = tokenSets[i], docLen = docLengths[i], score = 0, matched = 0, semanticScore = 0;
      if (semanticModel && typeof semanticModel.similarity === 'function') {
        try { semanticScore = Math.max(0, Math.min(1, Number(semanticModel.similarity(query, chunk.text)) || 0)); }
        catch (_) { semanticScore = 0; }
      }
      terms.forEach(function (term) {
        var tf = ts.reduce(function (n, token) { return n + (token === term ? 1 : 0); }, 0);
        if (tf) {
          matched++;
          var nDocs = all.length;
          var idf = Math.log(1 + (nDocs - df[term] + 0.5) / (df[term] + 0.5));
          var termScore = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / (avgDocLength || 1)))));
          var learnedWeight = (learningStore && learningStore.getTermWeight) ? learningStore.getTermWeight(term) : 1.0;
          score += termScore * (termWeights[term] || 0.5) * learnedWeight;
        }
      });

      var normalizedChunkText = normalize(chunk.text);
      if (normalizedQuery.length >= 4 && normalizedChunkText.indexOf(normalizedQuery) >= 0) {
        score *= 2.0;
      }

      var required = terms.length >= 3 ? 1 : 1;
      if (matched < required && semanticScore < 0.78) score = 0;
      if (semanticScore >= 0.78) score += semanticScore * 1.8;
      return {chunk: chunk, score: score, matched: matched, semanticScore: semanticScore};
    }).filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score || b.matched - a.matched || a.chunk.offset - b.chunk.offset; });

    var pageCounts = Object.create(null);
    var refs = [];
    scored.forEach(function (x) {
      var key = x.chunk.docId + ':' + x.chunk.page;
      var count = pageCounts[key] || 0;
      // A single PDF page can contain several independent chunks. Returning
      // only its first chunk silently discarded most of long explanations.
      if (refs.length < limit && count < 4) {
        refs.push(x.chunk);
        pageCounts[key] = count + 1;
      }
    });

    return {references: refs, overview: false, queryWords: terms,
      semanticUsed: !!(semanticModel && scored.some(function (item) { return item.semanticScore >= 0.78; })),
      semanticPages: scored.filter(function (item) { return item.semanticScore >= 0.78; }).map(function (item) {
        return String(item.chunk.docId) + ':' + String(item.chunk.page);
      })};
  }

  function shorten(value, max) {
    var chars = Array.from(String(value || '').trim());
    if (chars.length <= max) return chars.join('');
    return chars.slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…';
  }

  return {normalize: normalize, words: words, baseWords: baseWords, extractPdfText: extractPdfText, chunksForDocument: chunksForDocument, search: search, shorten: shorten};
}));
