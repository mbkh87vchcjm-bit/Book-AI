/* Midad Language & Knowledge Engine — Arabic/English query understanding. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mlke-lexicon.js'));
  else root.MlkeQuery = factory(root.MlkeLexicon);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (LexiconClass) {
  'use strict';

  function normalizeArabic(text) {
    var s = String(text || '');
    try { s = s.normalize('NFKC'); } catch (_) {}
    return s.toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/[ؤئ]/g, 'ء')
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6f0); })
      .replace(/[؟?!،؛,:;()[\]{}"“”']/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeEnglish(text) {
    var s = String(text || '');
    try { s = s.normalize('NFKC'); } catch (_) {}
    return s.toLowerCase().replace(/[^a-z0-9+#./\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function detectLanguage(text) {
    var value = String(text || '');
    var arCount = (value.match(/[\u0600-\u06ff]/g) || []).length;
    var enCount = (value.match(/[a-zA-Z]/g) || []).length;
    if (arCount > enCount) return 'ar';
    if (enCount > arCount) return 'en';
    return arCount || enCount ? 'mixed' : 'unknown';
  }

  var INTENTS = [
    ['comparison', /(?:قارن|مقارنه|مقارنة|ما الفرق|ايش الفرق|وش الفرق|الفرق بين|اوجه الشبه|اوجه الاختلاف|اختلافات|compare|comparison|difference between|\bvs\b)/],
    ['summarization', /(?:لخص|تلخيص|ملخص|اهم النقاط|اهم الافكار|الافكار الرئيسيه|المواضيع|الموضوعات|جميع المواضيع|كل المواضيع|كامل المحتوى|المحتوى بالكامل|نظره عامه|summari[sz]e|overview|key points|main points|main ideas|whole document|entire document)/],
    ['term_extraction', /(?:استخرج المصطلحات|المصطلحات المهمه|المفاهيم المهمه|اهم المصطلحات|اريد المصطلحات|اعطني المصطلحات|extract terms|key concepts|glossary)/],
    ['classification', /(?:ما هي انواع|ماهي انواع|ايش انواع|وش انواع|انواع|اصناف|تصنيفات|صنف|تصنيف|اقسام|ما هي فئات|types of|categories|classify)/],
    ['definition', /(?:ما هو|ما هي|ماهي|ايش هو|ايش هي|وش هو|وش هي|عرف|تعريف|ما المقصود|ماذا يعني|معني|معنى|what is|define|meaning of)/],
    ['function', /(?:وظيفه|وظيفة|ما فائدة|ايش فايده|وش فايده|فائده|فوائد|دور|ماذا يفعل|ماذا تعمل|يستخدم في|purpose of|function of|what does)/],
    ['cause', /(?:لماذا|ليش|ما سبب|سبب|علل|بماذا يسبب|why|because|reason for)/],
    ['process', /(?:كيف|كيفيه|طريقه|خطوات|مراحل|كيف يتم|how to|how does|how is)/],
    ['relationship', /(?:ما العلاقه|العلاقه بين|علاقه|ارتباط|يرتبط|relationship|relation between)/],
    ['translation', /(?:ترجم|ترجمه|معني بالانجليزي|بالانجليزي|translate|translation)/],
    ['explanation', /(?:اشرح|وضح|فسر|شرح|توضيح|explain|clarify|describe)/]
  ];

  function classifyIntent(question) {
    var norm = normalizeArabic(question);
    var en = normalizeEnglish(question);
    for (var i = 0; i < INTENTS.length; i++) {
      if (INTENTS[i][1].test(norm) || INTENTS[i][1].test(en)) return INTENTS[i][0];
    }
    return 'general';
  }

  var ENTITY_STOP = new Set(('ما ماذا ايش وش هو هي هل لي عن في من على الى الي بين اريد اشرح عرف قارن الفرق انواع وظيفة فائدة فوائد دور كيف لماذا ليش').split(/\s+/));

  function queryTokens(question) {
    return normalizeArabic(question).match(/[a-z0-9]+(?:[+#./-][a-z0-9+#./-]+)*|[\u0621-\u063a\u0641-\u064a]+/g) || [];
  }

  function extractEntities(question, lexiconInstance) {
    var lexicon = lexiconInstance || (LexiconClass.getSharedInstance ? LexiconClass.getSharedInstance() : new LexiconClass());
    var tokens = queryTokens(question), found = [], seen = Object.create(null);
    for (var length = Math.min(7, tokens.length); length >= 1; length--) {
      for (var start = 0; start + length <= tokens.length; start++) {
        var part = tokens.slice(start, start + length);
        if (part.some(function (token) { return ENTITY_STOP.has(token); })) continue;
        var match = lexicon.lookupTerm(part.join(' '));
        if (!match) continue;
        var name = match.abbreviation || match.term_ar || match.term_en;
        var key = String(match.id || name).toLowerCase();
        if (name && !seen[key]) {
          seen[key] = true;
          found.push({name: name, start: start, end: start + length});
        }
      }
    }
    // Keep only longest non-overlapping recognized phrases.
    found.sort(function (a, b) { return (b.end - b.start) - (a.end - a.start) || a.start - b.start; });
    var occupied = Object.create(null), selected = [];
    found.forEach(function (item) {
      var overlaps = false;
      for (var i = item.start; i < item.end; i++) if (occupied[i]) overlaps = true;
      if (!overlaps) {
        selected.push(item);
        for (var j = item.start; j < item.end; j++) occupied[j] = true;
      }
    });
    selected.sort(function (a, b) { return a.start - b.start; });
    var abbreviations = String(question).match(/\b[A-Z][A-Z0-9]{1,7}\b/g) || [];
    abbreviations.forEach(function (abbr) {
      var match = lexicon.lookupTerm(abbr);
      var canonical = match ? (match.abbreviation || match.term_ar || abbr) : abbr;
      if (!selected.some(function (item) { return item.name === canonical; })) selected.push({name: canonical, start: -1});
    });
    return selected.map(function (item) { return item.name; });
  }

  function parseQuery(question, lexiconInstance) {
    var text = String(question || '').trim();
    var lexicon = lexiconInstance || (LexiconClass.getSharedInstance ? LexiconClass.getSharedInstance() : new LexiconClass());
    var language = detectLanguage(text), intent = classifyIntent(text);
    var entities = extractEntities(text, lexicon), matchedTerm = lexicon.lookupTerm(text);
    var confidence = 0.35;
    if (intent !== 'general') confidence += 0.25;
    if (entities.length) confidence += Math.min(0.30, entities.length * 0.15);
    if (language === 'mixed') confidence += 0.05;
    return {language: language, intent: intent, entities: entities,
      domain: matchedTerm ? matchedTerm.domain : (entities.length ? 'technical' : 'general'),
      confidence: Math.min(0.90, confidence)};
  }

  return {normalizeArabic: normalizeArabic, normalizeEnglish: normalizeEnglish,
    detectLanguage: detectLanguage, classifyIntent: classifyIntent,
    extractEntities: extractEntities, parseQuery: parseQuery};
}));
