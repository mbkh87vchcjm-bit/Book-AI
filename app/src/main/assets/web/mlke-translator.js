/* Midad Language & Knowledge Engine (MLKE) — Rule-Based Technical English-to-Arabic Translator */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mlke-lexicon.js'));
  else root.MlkeTranslator = factory(root.MlkeLexicon);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (LexiconClass) {
  'use strict';

  function getLexicon() {
    return LexiconClass.getSharedInstance ? LexiconClass.getSharedInstance() : new LexiconClass();
  }

  var VERB_MAP = {
    'provides': { ar: 'يوفر', tense: 'present' },
    'provide': { ar: 'يوفر', tense: 'present' },
    'translates': { ar: 'يحوّل', tense: 'present' },
    'translate': { ar: 'يحول', tense: 'present' },
    'contains': { ar: 'يحتوي على', tense: 'present' },
    'contain': { ar: 'يحتوي على', tense: 'present' },
    'executes': { ar: 'تنفذ', tense: 'present' },
    'execute': { ar: 'ينفذ', tense: 'present' },
    'manages': { ar: 'يدير', tense: 'present' },
    'manage': { ar: 'يدير', tense: 'present' },
    'controls': { ar: 'يتحكم في', tense: 'present' },
    'control': { ar: 'يتحكم في', tense: 'present' },
    'identifies': { ar: 'يحدد', tense: 'present' },
    'identify': { ar: 'يحدد', tense: 'present' },
    'stores': { ar: 'يخزن', tense: 'present' },
    'store': 'يخزن',
    'uses': { ar: 'يستخدم', tense: 'present' },
    'use': { ar: 'يستخدم', tense: 'present' },
    'used': { ar: 'مستخدم', tense: 'passive' },
    'running': { ar: 'المشغلة', tense: 'participle' }
  };

  var COMMON_DICT = {
    'reliable': 'موثوقًا',
    'ordered': 'ومرتبًا',
    'data': 'البيانات',
    'transmission': 'لنقل',
    'devices': 'الأجهزة',
    'device': 'جهاز',
    'between': 'بين',
    'names': 'أسماء',
    'domain': 'النطاقات',
    'into': 'إلى',
    'addresses': 'عناوين',
    'address': 'عنوان',
    'table': 'جدول',
    'rows': 'صفوف',
    'row': 'صف',
    'columns': 'أعمدة',
    'column': 'عمود',
    'instructions': 'التعليمات',
    'stored': 'المخزنة',
    'memory': 'الذاكرة',
    'temporary': 'مؤقتة',
    'programs': 'البرامج',
    'hardware': 'الأجهزة',
    'software': 'البرمجيات',
    'resources': 'موارد',
    'uniquely': 'بصورة فريدة',
    'each': 'كل',
    'incoming': 'الواردة',
    'outgoing': 'الصادرة',
    'network': 'الشبكة',
    'traffic': 'حركة مرور'
  };

  function translateSentence(sentence) {
    var lexicon = getLexicon();
    var original = String(sentence || '').trim();
    if (!original) return { translated: '', confidence: 0, status: 'empty' };

    // Exact lexicon match
    var phraseMatch = lexicon.lookupTerm(original);
    if (phraseMatch && phraseMatch.term_ar) {
      return { translated: phraseMatch.term_ar, confidence: 0.95, status: 'complete' };
    }

    var tokens = original.match(/[a-zA-Z0-9]+|[^\s\w]/g) || [];
    var translatedTokens = [];
    var matchedPhrases = 0;
    var unknownWords = [];

    var i = 0;
    while (i < tokens.length) {
      var word = tokens[i];
      var lower = word.toLowerCase();

      // Check 3-word technical phrase
      if (i + 2 < tokens.length) {
        var p3 = tokens[i] + ' ' + tokens[i+1] + ' ' + tokens[i+2];
        var term3 = lexicon.lookupTerm(p3);
        if (term3 && term3.term_ar) {
          translatedTokens.push(term3.term_ar + (term3.abbreviation ? ' (' + term3.abbreviation + ')' : ''));
          matchedPhrases++;
          i += 3;
          continue;
        }
      }

      // Check 2-word technical phrase
      if (i + 1 < tokens.length) {
        var p2 = tokens[i] + ' ' + tokens[i+1];
        var term2 = lexicon.lookupTerm(p2);
        if (term2 && term2.term_ar) {
          translatedTokens.push(term2.term_ar + (term2.abbreviation ? ' (' + term2.abbreviation + ')' : ''));
          matchedPhrases++;
          i += 2;
          continue;
        }
      }

      // Check single word lexicon match
      var singleTerm = lexicon.lookupTerm(word);
      if (singleTerm && singleTerm.term_ar) {
        translatedTokens.push(singleTerm.term_ar + (singleTerm.abbreviation ? ' (' + singleTerm.abbreviation + ')' : ''));
        matchedPhrases++;
        i++;
        continue;
      }

      // Check verbs & common dictionary
      if (VERB_MAP[lower]) {
        translatedTokens.push(typeof VERB_MAP[lower] === 'object' ? VERB_MAP[lower].ar : VERB_MAP[lower]);
      } else if (COMMON_DICT[lower]) {
        translatedTokens.push(COMMON_DICT[lower]);
      } else if (/^[0-9]+$/.test(word) || /^[^\w\s]$/.test(word)) {
        translatedTokens.push(word);
      } else if (['a', 'an', 'the', 'is', 'are', 'by', 'of', 'in', 'to', 'and'].indexOf(lower) >= 0) {
        // Skip structural articles/auxiliaries
      } else {
        translatedTokens.push('[' + word + ']');
        unknownWords.push(word);
      }
      i++;
    }

    var arResult = translatedTokens.join(' ').replace(/\s+/g, ' ').trim();
    var status = unknownWords.length === 0 ? 'complete' : (matchedPhrases > 0 ? 'partial' : 'unsupported');

    return {
      original: original,
      translated: arResult,
      status: status,
      unknownWords: unknownWords
    };
  }

  return {
    translateSentence: translateSentence
  };
}));
