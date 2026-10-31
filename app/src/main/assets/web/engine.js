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
    var result = [];
    raw.forEach(function (token) {
      var technical = /[+#/.]/.test(token) || /^\d/.test(token);
      if ((!technical && token.length < 2) || STOP.has(token)) return;
      // Deduplicate variants only within this token. Preserve repeated tokens
      // across the text so BM25 can calculate real term frequency (TF).
      var localSeen = new Set();
      stemVariants(token).forEach(function (variant) {
        if (variant && (variant.length > 1 || (technical && /^\d$/.test(variant))) && !STOP.has(variant) && !localSeen.has(variant)) {
          localSeen.add(variant);
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

  // Curated bilingual aliases. These are lexical equivalences, not semantic
  // embeddings; each mapping is deliberately explicit and testable.
  var BILINGUAL_ALIASES = [
    {phrases: ['كيف يعمل', 'كيف تعمل', 'كيفية عمل', 'آلية العمل', 'how does', 'how do', 'how to'], terms: ['آلية', 'عمل', 'خطوات', 'عملية', 'process', 'mechanism', 'steps', 'method', 'function']},
    {phrases: ['لماذا', 'ما سبب', 'ما الأسباب', 'why', 'what causes', 'reason for'], terms: ['سبب', 'أسباب', 'نتيجة', 'تأثير', 'cause', 'reason', 'effect', 'because', 'purpose']},
    {phrases: ['قارن بين', 'ما الفرق بين', 'الفرق بين', 'compare', 'difference between'], terms: ['مقارنة', 'اختلاف', 'مزايا', 'عيوب', 'comparison', 'difference', 'whereas', 'unlike']},
    {phrases: ['عرف', 'عرّف', 'ما تعريف', 'ما المقصود', 'define', 'definition of'], terms: ['تعريف', 'يعني', 'مفهوم', 'definition', 'defined', 'means', 'refers']},
    {phrases: ['الذكاء الاصطناعي', 'ذكاء اصطناعي', 'artificial intelligence'], terms: ['ذكاء اصطناعي', 'artificial intelligence']},
    {phrases: ['الشبكة العصبية', 'الشبكات العصبية', 'neural network', 'neural networks'], terms: ['شبكة عصبية', 'neural network']},
    {phrases: ['تعلم الالة', 'التعلم الالي', 'machine learning'], terms: ['تعلم الالة', 'machine learning']},
    {phrases: ['قواعد البيانات', 'قاعدة البيانات', 'database', 'databases'], terms: ['قاعدة البيانات', 'database']},
    {phrases: ['نظام التشغيل', 'انظمة التشغيل', 'operating system', 'operating systems'], terms: ['نظام التشغيل', 'operating system']},
    {phrases: ['شبكة الحاسوب', 'شبكات الحاسوب', 'computer network', 'computer networks'], terms: ['شبكة الحاسوب', 'computer network']},
    {phrases: ['تبديل الحزم', 'packet switching'], terms: ['تبديل الحزم', 'packet switching']},
    {phrases: ['نظام اسماء النطاقات', 'اسماء النطاقات', 'domain name system', 'dns'], terms: ['نظام اسماء النطاقات', 'domain name system', 'dns']},
    {phrases: ['بروتوكول التحكم بالنقل', 'بروتوكول التحكم في النقل', 'transmission control protocol', 'tcp'], terms: ['بروتوكول التحكم بالنقل', 'transmission control protocol', 'tcp']},
    {phrases: ['بروتوكول الانترنت', 'internet protocol'], terms: ['بروتوكول الانترنت', 'internet protocol']},
    {phrases: ['تبديل الشبكات', 'تبديل الشبكة', 'network switching'], terms: ['تبديل الشبكات', 'network switching']},
    {phrases: ['التوجيه', 'توجيه الشبكات', 'network routing', 'routing'], terms: ['توجيه الشبكات', 'network routing', 'routing']},
    {phrases: ['امن المعلومات', 'أمن المعلومات', 'بأمن المعلومات', 'لأمن المعلومات', 'information security', 'cybersecurity', 'cyber security'], terms: ['امن المعلومات', 'information security', 'cybersecurity']},
    {phrases: ['التشفير', 'تشفير البيانات', 'encryption', 'cryptography'], terms: ['تشفير البيانات', 'encryption', 'cryptography']},
    {phrases: ['عنوان ip', 'عناوين ip', 'ip address', 'ip addressing'], terms: ['عنوان ip', 'ip address', 'ip addressing']},
    {phrases: ['نموذج العميل والخادم', 'عميل خادم', 'client server', 'client-server'], terms: ['عميل خادم', 'client server']},
    {phrases: ['هياكل البيانات', 'بنية البيانات', 'data structures', 'data structure'], terms: ['هياكل البيانات', 'data structures']},
    {phrases: ['الخوارزميات', 'الخوارزمية', 'algorithm', 'algorithms'], terms: ['الخوارزمية', 'algorithm']},
    {phrases: ['نظام ادارة قواعد البيانات', 'نظم ادارة قواعد البيانات', 'database management system', 'dbms'], terms: ['نظام ادارة قواعد البيانات', 'database management system', 'dbms']}
  ];

  function expandQueryTerms(query, baseTerms) {
    var normalized = normalize(query).replace(/[^a-z0-9\u0621-\u063a\u0641-\u064a]+/g, ' ').trim();
    var terms = new Set(baseTerms || words(query));
    // A standalone short technical identifier (IP, TCP, DNS) is an exact
    // lookup, not permission to expand every longer phrase containing it.
    // Full Arabic/English phrases still activate their curated aliases.
    if (baseTerms && baseTerms.length === 1 && /^[a-z0-9]{2,4}$/.test(baseTerms[0])) return Array.from(terms);
    BILINGUAL_ALIASES.forEach(function (entry) {
      var matched = entry.phrases.some(function (phrase) {
        var normalizedPhrase = normalize(phrase).replace(/[^a-z0-9\u0621-\u063a\u0641-\u064a]+/g, ' ').trim();
        if (!normalizedPhrase) return false;
        // A short acronym must be a complete tokenizer unit: TCP must not
        // match the TCP portion of the distinct identifier TCP/IP.
        if (/^[a-z0-9]{2,4}$/.test(normalizedPhrase)) return baseTerms.indexOf(normalizedPhrase) >= 0;
        return (' ' + normalized + ' ').indexOf(' ' + normalizedPhrase + ' ') >= 0;
      });
      if (matched) entry.terms.forEach(function (phrase) { words(phrase).forEach(function (term) { terms.add(term); }); });
    });
    return Array.from(terms);
  }

  function search(documents, query, limit, priorQuery, termWeights, semanticModel) {
    limit = Math.max(1, Math.min(20, Number(limit) || 3));
    var all = [];
    (documents || []).forEach(function (d) { all = all.concat(chunksForDocument(d)); });
    if (!all.length) return { references: [], overview: false, queryWords: [] };
    var baseTerms = Array.from(new Set(words(query)));
    // Only inherit the previous question when the current one has no topical
    // words; never contaminate a new topic with stale terms.
    if (!baseTerms.length && priorQuery) baseTerms = Array.from(new Set(words(priorQuery)));
    var terms = expandQueryTerms(query, baseTerms);
    var hasCuratedExpansion = terms.length > baseTerms.length;
    var overview = isOverview(query);
    if (overview) {
      var seen = new Set();
      var samples = all.filter(function (c) {
        var key = c.docId + ':' + c.page;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).slice(0, limit);
      return { references: samples, overview: true, queryWords: terms };
    }
    if (!terms.length && !semanticModel) return { references: [], overview: false, queryWords: terms, semanticUsed: false };

    var tokenSets = all.map(function (c) { return words(c.text); });
    var n = tokenSets.length;
    var totalLength = tokenSets.reduce(function (sum, tokens) { return sum + tokens.length; }, 0);
    var avgdl = totalLength / Math.max(1, n);
    var df = Object.create(null);
    terms.forEach(function (term) {
      df[term] = tokenSets.reduce(function (count, tokens) {
        return count + (tokens.indexOf(term) >= 0 ? 1 : 0);
      }, 0);
    });

    // Standard BM25 (Robertson/Sparck Jones IDF, k1=1.2, b=0.75),
    // with conservative exact-phrase and full-query coverage boosts.
    var normalizedQuery = normalize(query).replace(/[^a-z0-9\u0621-\u063a\u0641-\u064a]+/g, ' ').trim();
    var phraseTokens = normalizedQuery.split(/\s+/).filter(function (t) { return t && !STOP.has(t); });
    var phrase = phraseTokens.join(' ');
    var scored = all.map(function (chunk, i) {
      var tokens = tokenSets[i], length = tokens.length;
      var frequencies = Object.create(null);
      tokens.forEach(function (token) { frequencies[token] = (frequencies[token] || 0) + 1; });
      var lexicalScore = 0, matched = 0;
      terms.forEach(function (term) {
        var tf = frequencies[term] || 0;
        if (!tf) return;
        matched++;
        var documentFrequency = df[term] || 0;
        var idf = Math.log(1 + (n - documentFrequency + 0.5) / (documentFrequency + 0.5));
        var k1 = 1.2, b = 0.75;
        var denominator = tf + k1 * (1 - b + b * length / Math.max(1, avgdl));
        var learnedWeight = termWeights && Object.prototype.hasOwnProperty.call(termWeights, term)
          ? Number(termWeights[term]) : 1;
        if (!Number.isFinite(learnedWeight)) learnedWeight = 1;
        learnedWeight = Math.max(0.75, Math.min(1.5, learnedWeight));
        lexicalScore += idf * (tf * (k1 + 1)) / denominator * learnedWeight;
      });
      var matchedRatio = matched / Math.max(1, terms.length);
      // A curated bilingual phrase may legitimately match only one English or Arabic anchor term.
      // Keep the stricter ratio for ordinary unexpanded queries.
      var minCoverage = hasCuratedExpansion ? 0.08 : 0.16;
      if (matched < 1 || (terms.length >= 4 && matchedRatio < minCoverage)) lexicalScore = 0;
      var semanticScore = 0;
      if (semanticModel && typeof semanticModel.similarity === 'function') {
        try {
          semanticScore = Number(semanticModel.similarity(query, chunk.text)) || 0;
          semanticScore = Math.max(0, Math.min(1, semanticScore));
        } catch (_) { semanticScore = 0; }
      }
      return {chunk: chunk, lexicalScore: lexicalScore, semanticScore: semanticScore,
        matched: matched, matchedRatio: matchedRatio};
    });
    var maxLexicalScore = scored.reduce(function (max, item) { return Math.max(max, item.lexicalScore); }, 0);
    scored = scored.map(function (item) {
      var score = 0;
      if (item.lexicalScore > 0 && maxLexicalScore > 0) {
        // Lexical evidence remains dominant. The corpus-trained neural model
        // can reorder close candidates, but cannot erase an exact BM25 match.
        score = 0.88 * (item.lexicalScore / maxLexicalScore) + 0.12 * item.semanticScore;
      } else if (item.semanticScore >= 0.78) {
        // Semantic-only retrieval has a deliberately high threshold because
        // this tiny model is trained on the user's corpus, not general data.
        score = 0.24 + (item.semanticScore - 0.78) * 0.5;
      }
      if (score > 0 && phrase.length >= 5 && normalize(item.chunk.text).indexOf(phrase) >= 0) score *= 1.12;
      if (score > 0 && item.matchedRatio >= 0.75) score *= 1.06;
      item.score = score;
      return item;
    }).filter(function (item) { return item.score > 0; })

      .sort(function (a, b) { return b.score - a.score || b.matchedRatio - a.matchedRatio || b.matched - a.matched || a.chunk.offset - b.chunk.offset; });

    // Avoid overlapping chunks from the same source page as separate citations.
    var pages = new Set(), refs = [];
    scored.forEach(function (item) {
      var key = item.chunk.docId + ':' + item.chunk.page;
      if (refs.length < limit && !pages.has(key)) { pages.add(key); refs.push(item.chunk); }
    });
    return {references: refs, overview: false, queryWords: terms,
      semanticUsed: !!(semanticModel && scored.some(function (item) { return item.semanticScore > 0; }))};
  }

  function shorten(value, max) {
    var chars = Array.from(String(value || '').trim());
    if (chars.length <= max) return chars.join('');
    return chars.slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…';
  }

  return {normalize: normalize, words: words, expandQueryTerms: expandQueryTerms, extractPdfText: extractPdfText, chunksForDocument: chunksForDocument, search: search, shorten: shorten};
}));
