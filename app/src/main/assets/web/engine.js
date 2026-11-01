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
          // Arabic PDF text is frequently split into glyph fragments whose
          // visual gaps are not reliable word boundaries. Preserve PDF.js spacing
          // for any Arabic boundary; infer missing spaces geometrically for Latin runs.
          var hasArabicBoundary = /[\u0600-\u06ff]/.test(previousText + piece);
          if (!hasExplicitSpace &&
              !hasArabicBoundary &&
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
    size = Number(size) > 0 ? Number(size) : 850;
    overlap = overlap === undefined ? 110 : Math.max(0, Number(overlap) || 0);
    var out = [];
    (doc.pages || []).forEach(function (page) {
      var source = String(page.text || '');
      if (!source.trim()) return;
      var units = [], lines = source.split(/\n/), offset = 0, paragraphStart = -1, paragraphEnd = -1;
      function pushParagraph() {
        if (paragraphStart < 0) return;
        units.push({start: paragraphStart, end: paragraphEnd, kind: 'paragraph'});
        paragraphStart = -1; paragraphEnd = -1;
      }
      lines.forEach(function (line) {
        var start = offset, end = start + line.length;
        var trimmed = line.trim();
        var heading = /^(?:#{1,6}\s+|(?:الفصل|الباب|الوحدة|الموضوع|chapter|section)\s+[\d٠-٩IVX.-]+|[\d٠-٩]+[.)-]\s+)[^.!؟?]{2,100}$/i.test(trimmed);
        var bullet = /^(?:[•▪◦*–—-]|\d+\s*[.)-]|[أ-د]\s*[).-])\s+/.test(trimmed);
        if (!trimmed) pushParagraph();
        else if (heading || bullet) {
          pushParagraph();
          units.push({start: start + line.indexOf(trimmed), end: start + line.lastIndexOf(trimmed) + trimmed.length, kind: heading ? 'heading' : 'bullet'});
        } else {
          if (paragraphStart < 0) paragraphStart = start + line.indexOf(trimmed);
          paragraphEnd = start + line.lastIndexOf(trimmed) + trimmed.length;
          if (/[.!?؟؛:]\s*$/.test(trimmed)) pushParagraph();
        }
        offset = end + 1;
      });
      pushParagraph();

      var segments = [];
      units.forEach(function (unit) {
        var cursor = unit.start;
        while (cursor < unit.end) {
          var end = Math.min(unit.end, cursor + size);
          if (end < unit.end) {
            var candidates = [
              source.lastIndexOf('. ', end), source.lastIndexOf('؟ ', end),
              source.lastIndexOf('؛ ', end), source.lastIndexOf('\n', end),
              source.lastIndexOf(' ', end)
            ];
            var boundary = Math.max.apply(Math, candidates);
            if (boundary >= cursor + size * 0.5) end = boundary + 1;
          }
          if (end <= cursor) end = Math.min(unit.end, cursor + size);
          segments.push({start: cursor, end: end, kind: unit.kind});
          if (end >= unit.end) break;
          var next = Math.max(cursor + 1, end - overlap);
          var space = source.indexOf(' ', next);
          var newline = source.indexOf('\n', next);
          var candidatesNext = [space, newline].filter(function (v) { return v > -1 && v < end; });
          cursor = candidatesNext.length ? Math.max.apply(Math, candidatesNext) + 1 : next;
        }
      });

      var pending = null;
      function emit(segment) {
        var raw = source.slice(segment.start, segment.end);
        var leading = raw.length - raw.trimStart().length;
        var trailing = raw.length - raw.trimEnd().length;
        var start = segment.start + leading, end = segment.end - trailing;
        var piece = source.slice(start, end);
        if (!piece) return;
        out.push({docId: doc.id, docName: doc.name, page: page.page, type: doc.type,
          text: piece, offset: start, endOffset: end, structure: segment.kind,
          ocr: !!page.ocr});
      }
      segments.forEach(function (segment) {
        if (!pending) { pending = segment; return; }
        var gap = source.slice(pending.end, segment.start);
        var combined = source.slice(pending.start, segment.end);
        if (combined.length <= size && gap.length <= 2 &&
            pending.kind === 'paragraph' && segment.kind === 'paragraph') {
          pending.end = segment.end;
        } else { emit(pending); pending = segment; }
      });
      if (pending) emit(pending);
    });
    return out;
  }

  // Character TF-IDF uses short within-token n-grams. Padding preserves
  // word boundaries; grams are never formed across whitespace.
  function characterNgramCounts(text) {
    var counts = Object.create(null);
    baseWords(text).forEach(function (word) {
      var padded = "^" + word + String.fromCharCode(36);
      var chars = Array.from(padded);
      for (var size = 2; size <= 4; size++) {
        for (var i = 0; i + size <= chars.length; i++) {
          var gram = chars.slice(i, i + size).join("");
          counts[gram] = (counts[gram] || 0) + 1;
        }
      }
    });
    return counts;
  }

  function tfWeight(count) {
    return count > 0 ? 1 + Math.log(count) : 0;
  }

  function characterTfidfScores(query, chunks) {
    var queryCounts = characterNgramCounts(query);
    var queryGrams = Object.keys(queryCounts);
    if (!queryGrams.length || !chunks.length) return chunks.map(function () { return 0; });

    var chunkCounts = chunks.map(function (chunk) { return characterNgramCounts(chunk.text); });
    var documentFrequency = Object.create(null);
    chunkCounts.forEach(function (counts) {
      Object.keys(counts).forEach(function (gram) {
        documentFrequency[gram] = (documentFrequency[gram] || 0) + 1;
      });
    });

    var queryVector = Object.create(null), queryNorm = 0;
    queryGrams.forEach(function (gram) {
      var idf = Math.log(1 + (chunks.length + 1) / ((documentFrequency[gram] || 0) + 1));
      var weight = tfWeight(queryCounts[gram]) * idf;
      queryVector[gram] = weight;
      queryNorm += weight * weight;
    });
    queryNorm = Math.sqrt(queryNorm) || 1;

    return chunkCounts.map(function (counts) {
      var dot = 0, norm = 0;
      Object.keys(counts).forEach(function (gram) {
        var idf = Math.log(1 + (chunks.length + 1) / ((documentFrequency[gram] || 0) + 1));
        var weight = tfWeight(counts[gram]) * idf;
        norm += weight * weight;
        if (queryVector[gram]) dot += queryVector[gram] * weight;
      });
      return norm ? dot / (queryNorm * Math.sqrt(norm)) : 0;
    });
  }

  var PHRASE_STOP = new Set(('وظيفه وظيفة الفرق قارن مقارنة مقارنه بين انواع أنواع نوع ما ماذا ماهي هي هو هل اشرح شرح وضح توضيح عرف تعريف معنى معني كيف لماذا ليش سبب الاسباب explain define what function purpose compare comparison difference between types type of the a an is are and please tell me about').split(/\s+/));

  function phraseTerms(text) {
    return baseWords(text).filter(function (word) {
      return word.length > 1 && !PHRASE_STOP.has(word);
    });
  }

  function containsOrderedPhrase(chunkText, queryTerms) {
    if (!queryTerms || queryTerms.length < 2) return false;
    var candidates = baseWords(chunkText);
    if (candidates.length < queryTerms.length) return false;
    outer: for (var start = 0; start <= candidates.length - queryTerms.length; start++) {
      for (var j = 0; j < queryTerms.length; j++) {
        if (candidates[start + j] !== queryTerms[j]) continue outer;
      }
      return true;
    }
    return false;
  }

  // Reciprocal Rank Fusion combines ranked lists without assuming that their
  // raw score scales are comparable (BM25 vs cosine similarity, for example).
  function reciprocalRankFusion(rankings, constant) {
    var k = Number.isFinite(Number(constant)) ? Math.max(1, Number(constant)) : 60;
    var fused = new Map();
    (rankings || []).forEach(function (ranking) {
      (ranking || []).forEach(function (item, position) {
        var index = typeof item === 'number' ? item : item.index;
        if (!Number.isInteger(index)) return;
        var entry = fused.get(index);
        if (!entry) {
          entry = {index: index, score: 0, ranks: Object.create(null)};
          fused.set(index, entry);
        }
        entry.score += 1 / (k + position + 1);
        if (item && typeof item === 'object' && item.signal) entry.ranks[item.signal] = position + 1;
      });
    });
    return Array.from(fused.values()).sort(function (a, b) {
      return b.score - a.score || a.index - b.index;
    });
  }

  function isOverview(query) {
    var q = normalize(query);
    return /(?:لخص|تلخيص|ملخص|اهم النقاط|اهم الافكار|الافكار الرئيسيه|الافكار المهمه|المواضيع|الموضوعات|جميع المواضيع|كل المواضيع|كامل المحتوى|المحتوى بالكامل|نظره عامه|فكره عامه|ملخصا|summari[sz]e|overview|key points|main points|main ideas|all topics|whole document|entire document|full reference)/.test(q);
  }

  function search(documents, query, limit, priorQuery, learningStore, semanticModel) {
    limit = Math.max(1, Math.min(120, Number(limit) || 3));
    var all = [];
    (documents || []).forEach(function (doc) { all = all.concat(chunksForDocument(doc)); });
    var emptyStats = {bm25: 0, character: 0, phrase: 0, semantic: 0};
    if (!all.length) return {references: [], overview: false, queryWords: [], retrievalStats: emptyStats};

    var rawTerms = words(query);
    if (!rawTerms.length && priorQuery) rawTerms = words(priorQuery);
    var overview = isOverview(query);
    if (overview) {
      var seenPages = new Set();
      var pages = all.filter(function (chunk) {
        var key = chunk.docId + ':' + chunk.page;
        if (seenPages.has(key)) return false;
        seenPages.add(key);
        return true;
      });
      var sampleCount = Math.min(limit, pages.length), samples = [];
      for (var pageIndex = 0; pageIndex < sampleCount; pageIndex++) {
        var chosenIndex = sampleCount <= 1 ? 0 : Math.round(pageIndex * (pages.length - 1) / (sampleCount - 1));
        samples.push(pages[chosenIndex]);
      }
      return {references: samples, overview: true, queryWords: rawTerms, retrievalStats: emptyStats};
    }
    if (!rawTerms.length) return {references: [], overview: false, queryWords: rawTerms, retrievalStats: emptyStats};

    var normalizedQuery = normalize(query);
    var termWeights = Object.create(null);
    rawTerms.forEach(function (term) { termWeights[term] = 1.0; });
    var lexicon = getLexicon();
    if (lexicon) {
      var queryTokens = normalizedQuery.match(/[a-z0-9\u0621-\u063a\u0641-\u064a]+/g) || [];
      for (var length = 4; length >= 1; length--) {
        for (var startToken = 0; startToken <= queryTokens.length - length; startToken++) {
          var phraseToken = queryTokens.slice(startToken, startToken + length).join(' ');
          var match = lexicon.lookupTerm(phraseToken);
          if (match) {
            lexicon.expandQueryTerms(phraseToken).forEach(function (expansion) {
              words(expansion).forEach(function (word) {
                if (!termWeights[word]) termWeights[word] = 0.75;
              });
            });
          }
        }
      }
    }

    var terms = Object.keys(termWeights), k1 = 1.2, b = 0.75;
    var tokenSets = all.map(function (chunk) { return words(chunk.text); });
    var docLengths = tokenSets.map(function (tokens) { return tokens.length; });
    var avgDocLength = docLengths.reduce(function (sum, length) { return sum + length; }, 0) / (all.length || 1);
    var df = Object.create(null);
    terms.forEach(function (term) {
      df[term] = tokenSets.reduce(function (count, tokens) {
        return count + (tokens.indexOf(term) >= 0 ? 1 : 0);
      }, 0);
    });

    // Signal 1: BM25 lexical retrieval. Query expansion and user-learned term
    // weights remain local to this signal and never erase independent matches.
    var bm25Scores = all.map(function (chunk, index) {
      var tokens = tokenSets[index], length = docLengths[index], score = 0, matched = 0;
      terms.forEach(function (term) {
        var tf = tokens.reduce(function (count, token) { return count + (token === term ? 1 : 0); }, 0);
        if (!tf) return;
        matched++;
        var idf = Math.log(1 + (all.length - df[term] + 0.5) / (df[term] + 0.5));
        var termScore = idf * ((tf * (k1 + 1)) /
          (tf + k1 * (1 - b + b * (length / (avgDocLength || 1)))));
        var learnedWeight = learningStore && learningStore.getTermWeight
          ? learningStore.getTermWeight(term) : 1.0;
        score += termScore * (termWeights[term] || 0.5) * learnedWeight;
      });
      if (normalizedQuery.length >= 4 && normalize(chunk.text).indexOf(normalizedQuery) >= 0) score *= 2;
      return {index: index, score: score, matched: matched};
    }).filter(function (item) { return item.score > 0; })
      .sort(function (a, b) { return b.score - a.score || b.matched - a.matched || all[a.index].offset - all[b.index].offset; });
    var bm25 = bm25Scores.map(function (item) { return {index: item.index, signal: 'bm25'}; });

    // Signal 2: character TF-IDF cosine over 2–4 character n-grams.
    var charQuery = phraseTerms(query).join(' ') || query;
    var characterScores = characterTfidfScores(charQuery, all);
    var maxCharacterScore = characterScores.reduce(function (max, score) { return Math.max(max, score); }, 0);
    var characterCutoff = Math.max(0.18, maxCharacterScore * 0.28);
    var character = characterScores.map(function (score, index) {
      return {index: index, score: score, signal: 'character'};
    }).filter(function (item) {
      return item.score >= characterCutoff && item.score > 0;
    }).sort(function (a, b) { return b.score - a.score || a.index - b.index; })
      .slice(0, Math.max(20, limit * 5));

    // Signal 3: exact ordered phrase match after conservative question-word removal.
    var phraseQuery = phraseTerms(query), phrase = [];
    if (phraseQuery.length >= 2) {
      all.forEach(function (chunk, index) {
        if (containsOrderedPhrase(chunk.text, phraseQuery)) phrase.push({index: index, signal: 'phrase'});
      });
    }

    // Signal 4: vote only for high-confidence local semantic matches.
    var semanticScores = all.map(function (chunk) {
      if (!semanticModel || typeof semanticModel.similarity !== 'function') return 0;
      try {
        return Math.max(0, Math.min(1, Number(semanticModel.similarity(query, chunk.text)) || 0));
      } catch (_) { return 0; }
    });
    var semantic = semanticScores.map(function (score, index) { return {index: index, score: score}; })
      .filter(function (item) { return item.score >= 0.78; })
      .sort(function (a, b) { return b.score - a.score || a.index - b.index; })
      .map(function (item) { return {index: item.index, signal: 'semantic'}; });

    // RRF fuses rank lists without adding incomparable raw score scales.
    var fused = reciprocalRankFusion([bm25, character, phrase, semantic], 60);
    var ranked = fused.map(function (item) {
      var lexical = bm25Scores.find(function (candidate) { return candidate.index === item.index; });
      return {
        chunk: all[item.index], score: item.score,
        bm25Score: lexical ? lexical.score : 0,
        characterScore: characterScores[item.index] || 0,
        phraseMatch: !!item.ranks.phrase,
        semanticScore: semanticScores[item.index] || 0,
        matched: lexical ? lexical.matched : 0,
        ranks: item.ranks
      };
    });

    var pageCounts = Object.create(null), refs = [], diagnostics = [];
    ranked.forEach(function (item) {
      var key = item.chunk.docId + ':' + item.chunk.page;
      var count = pageCounts[key] || 0;
      if (refs.length < limit && count < 4) {
        refs.push(item.chunk);
        diagnostics.push({
          docId: item.chunk.docId, page: item.chunk.page, offset: item.chunk.offset,
          fusedScore: item.score, bm25Rank: item.ranks.bm25 || null,
          characterRank: item.ranks.character || null, phraseRank: item.ranks.phrase || null,
          semanticRank: item.ranks.semantic || null, characterScore: item.characterScore,
          phraseMatch: item.phraseMatch, semanticScore: item.semanticScore
        });
        pageCounts[key] = count + 1;
      }
    });

    return {
      references: refs,
      overview: false,
      queryWords: terms,
      semanticUsed: semantic.length > 0,
      semanticPages: semantic.map(function (item) {
        return String(all[item.index].docId) + ':' + String(all[item.index].page);
      }),
      retrievalStats: {bm25: bm25.length, character: character.length, phrase: phrase.length, semantic: semantic.length},
      retrievalDiagnostics: diagnostics
    };
  }

  function shorten(value, max) {
    var chars = Array.from(String(value || '').trim());
    if (chars.length <= max) return chars.join('');
    return chars.slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…';
  }

  return {normalize: normalize, words: words, baseWords: baseWords, characterNgramCounts: characterNgramCounts, characterTfidfScores: characterTfidfScores, phraseTerms: phraseTerms, containsOrderedPhrase: containsOrderedPhrase, reciprocalRankFusion: reciprocalRankFusion, extractPdfText: extractPdfText, chunksForDocument: chunksForDocument, search: search, shorten: shorten};
}));
