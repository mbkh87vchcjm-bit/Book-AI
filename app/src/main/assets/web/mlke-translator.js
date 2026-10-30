/* Midad Language & Knowledge Engine (MLKE) — Rule-Based Technical English-to-Arabic Translator */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mlke-lexicon.js'));
  else root.MlkeTranslator = factory(root.MlkeLexicon);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (LexiconClass) {
  'use strict';

  var lexicon = new LexiconClass();

  var VERB_MAP = {
    'provides': 'يوفر',
    'provide': 'يوفر',
    'translates': 'يحول',
    'translate': 'يحول',
    'contains': 'يحتوي على',
    'contain': 'يحتوي على',
    'executes': 'ينفذ',
    'execute': 'ينفذ',
    'manages': 'يدير',
    'manage': 'يدير',
    'controls': 'يتحكم في',
    'control': 'يتحكم في',
    'identifies': 'يحدد',
    'identify': 'يحدد',
    'stores': 'يخزن',
    'store': 'يخزن',
    'uses': 'يستخدم',
    'use': 'يستخدم',
    'used': 'مستخدم',
    'running': 'المشغلة'
  };

  var COMMON_DICT = {
    'reliable': 'موثوقة',
    'ordered': 'مرتبة',
    'data': 'البيانات',
    'transmission': 'نقل',
    'devices': 'الأجهزة',
    'device': 'جهاز',
    'between': 'بين',
    'names': 'أسماء',
    'domain': 'النطاق',
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
    'hardware': 'العتاد',
    'software': 'البرامج',
    'resources': 'الموارد',
    'uniquely': 'بشكل فريد',
    'each': 'كل',
    'incoming': 'الواردة',
    'outgoing': 'الصادرة',
    'network': 'الشبكة',
    'traffic': 'حركة المرور'
  };

  function translateSentence(sentence) {
    var original = String(sentence || '').trim();
    if (!original) return { translated: '', confidence: 0 };

    var phraseMatch = lexicon.lookupTerm(original);
    if (phraseMatch && phraseMatch.term_ar) {
      return { translated: phraseMatch.term_ar, confidence: 0.95 };
    }

    var tokens = original.match(/[a-zA-Z0-9]+|[^\s\w]/g) || [];
    var translatedTokens = [];
    var matchedPhrases = 0;
    var unknownWords = [];

    var i = 0;
    while (i < tokens.length) {
      var word = tokens[i];
      var lower = word.toLowerCase();

      // Check 3-word technical phrases
      if (i + 2 < tokens.length) {
        var p3 = tokens[i] + ' ' + tokens[i+1] + ' ' + tokens[i+2];
        var term3 = lexicon.lookupTerm(p3);
        if (term3 && term3.term_ar) {
          translatedTokens.push(term3.term_ar);
          matchedPhrases++;
          i += 3;
          continue;
        }
      }

      // Check 2-word technical phrases
      if (i + 1 < tokens.length) {
        var p2 = tokens[i] + ' ' + tokens[i+1];
        var term2 = lexicon.lookupTerm(p2);
        if (term2 && term2.term_ar) {
          translatedTokens.push(term2.term_ar);
          matchedPhrases++;
          i += 2;
          continue;
        }
      }

      // Check single word lexicon match
      var singleTerm = lexicon.lookupTerm(word);
      if (singleTerm && singleTerm.term_ar) {
        translatedTokens.push(singleTerm.term_ar);
        matchedPhrases++;
        i++;
        continue;
      }

      // Check verbs and common words
      if (VERB_MAP[lower]) {
        translatedTokens.push(VERB_MAP[lower]);
      } else if (COMMON_DICT[lower]) {
        translatedTokens.push(COMMON_DICT[lower]);
      } else if (/^[0-9]+$/.test(word) || /^[^\w\s]$/.test(word)) {
        translatedTokens.push(word);
      } else if (['a', 'an', 'the', 'is', 'are', 'by', 'of', 'in', 'to', 'and'].indexOf(lower) >= 0) {
        // Skip structural particles or handle inline
      } else if (lower === 'data') {
        translatedTokens.push('البيانات');
      } else {
        translatedTokens.push('[' + word + ']');
        unknownWords.push(word);
      }
      i++;
    }

    var arResult = translatedTokens.join(' ').replace(/\s+/g, ' ').trim();
    var confidence = unknownWords.length === 0 ? 0.88 : (matchedPhrases > 0 ? 0.65 : 0.40);

    return {
      original: original,
      translated: arResult,
      confidence: confidence,
      unknownWords: unknownWords
    };
  }

  return {
    translateSentence: translateSentence
  };
}));
