/* Midad Language & Knowledge Engine (MLKE) — Linguistic Processors & Question Understanding Engine */
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
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[ؤئ]/g, 'ء').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); });
  }

  function normalizeEnglish(text) {
    var s = String(text || '');
    return s.toLowerCase().trim();
  }

  function detectLanguage(text) {
    var arCount = (text.match(/[\u0600-\u06ff]/g) || []).length;
    var enCount = (text.match(/[a-zA-Z]/g) || []).length;
    if (arCount > enCount) return 'ar';
    if (enCount > arCount) return 'en';
    return 'ar';
  }

  function classifyIntent(question) {
    var norm = normalizeArabic(question);
    var enNorm = normalizeEnglish(question);

    if (/(?:ما هو|ما هي|عرف|تعريف|ما المقصود|what is|define)/.test(norm) || /(?:what is|define)/.test(enNorm)) {
      return 'definition';
    }
    if (/(?:وظيفة|وظيفه|عمل|فوائد|ما فائدة|دور|what does|purpose of|function of)/.test(norm) || /(?:purpose of|function of|what does)/.test(enNorm)) {
      return 'function';
    }
    if (/(?:قارن|ما الفرق|الفرق بين|اختلاف|مقارنة|compare|difference between|vs)/.test(norm) || /(?:compare|difference between|vs)/.test(enNorm)) {
      return 'comparison';
    }
    if (/(?:أنواع|انواع|أنواعها|انواعها|أنواع ال|انواع ال|categories|types of)/.test(norm) || /(?:types of|categories)/.test(enNorm)) {
      return 'classification';
    }
    if (/(?:ترجم|ترجمة|translate)/.test(norm) || /^translate/.test(enNorm)) {
      return 'translation';
    }
    if (/(?:لخص|تلخيص|ملخص|summarize|overview)/.test(norm) || /(?:summarize|overview)/.test(enNorm)) {
      return 'summarization';
    }
    if (/(?:لماذا|سبب|علل|why)/.test(norm) || /^why/.test(enNorm)) {
      return 'cause';
    }
    if (/(?:كيف|طريقة|كيفية|how)/.test(norm) || /^how/.test(enNorm)) {
      return 'process';
    }
    if (/(?:اشرح|توضيح|شرح|explain|clarify)/.test(norm) || /(?:explain|clarify)/.test(enNorm)) {
      return 'explanation';
    }
    if (/(?:علاقة|العلاقة بين|ارتباط|relationship|relation)/.test(norm) || /(?:relationship|relation)/.test(enNorm)) {
      return 'relationship';
    }
    if (/(?:استخرج المصطلحات|المصطلحات المهمة|المفاهيم المهمة|اهم المصطلحات|extract terms|terms|key concepts)/.test(norm) || /(?:extract terms|terms|key concepts)/.test(enNorm)) {
      return 'term_extraction';
    }

    return 'general';
  }

  function extractEntities(question, lexiconInstance) {
    var lexicon = lexiconInstance || (LexiconClass.getSharedInstance ? LexiconClass.getSharedInstance() : new LexiconClass());
    var norm = normalizeArabic(question);
    var words = norm.match(/[a-z0-9\u0621-\u063a\u0641-\u064a]+/g) || [];
    var entities = [];

    // Longest phrase matching: 4-word, 3-word, 2-word, single-word
    for (var len = 4; len >= 1; len--) {
      for (var i = 0; i <= words.length - len; i++) {
        var phrase = words.slice(i, i + len).join(' ');
        var matched = lexicon.lookupTerm(phrase);
        if (matched) {
          var name = matched.abbreviation || matched.term_ar || matched.term_en;
          if (name && entities.indexOf(name) < 0) entities.push(name);
        }
      }
    }

    // Check uppercase abbreviations in original query
    var abbreviations = question.match(/\b[A-Z]{2,6}\b/g) || [];
    abbreviations.forEach(function (abbr) {
      if (entities.indexOf(abbr) < 0) entities.push(abbr);
    });

    return entities;
  }

  function parseQuery(question, lexiconInstance) {
    var lexicon = lexiconInstance || (LexiconClass.getSharedInstance ? LexiconClass.getSharedInstance() : new LexiconClass());
    var lang = detectLanguage(question);
    var intent = classifyIntent(question);
    var entities = extractEntities(question, lexicon);
    var matchedTerm = lexicon.lookupTerm(question);

    var confidence = 0.50;
    if (intent !== 'general') confidence += 0.25;
    if (entities.length > 0) confidence += 0.20;

    return {
      language: lang,
      intent: intent,
      entities: entities,
      domain: matchedTerm ? matchedTerm.domain : 'general',
      confidence: Math.min(0.95, confidence)
    };
  }

  return {
    normalizeArabic: normalizeArabic,
    normalizeEnglish: normalizeEnglish,
    detectLanguage: detectLanguage,
    classifyIntent: classifyIntent,
    extractEntities: extractEntities,
    parseQuery: parseQuery
  };
}));
