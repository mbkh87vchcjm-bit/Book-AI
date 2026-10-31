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

  function normalizeEnglishPhrase(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function exactTerm(lexicon, value) {
    var norm = normalizeEnglishPhrase(value);
    var upper = String(value || '').trim().toUpperCase();
    var entries = lexicon && Array.isArray(lexicon.entries) ? lexicon.entries : [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var candidates = [e.term_ar, e.term_en].concat(e.aliases_ar || [], e.aliases_en || []);
      if ((e.abbreviation && e.abbreviation.toUpperCase() === upper) ||
          candidates.some(function (candidate) {
            return candidate && normalizeEnglishPhrase(candidate) === norm;
          })) return e;
    }
    return null;
  }

  // Reliable sentence patterns for common technical definitions. Unsupported
  // sentences are not promoted from a word list into a false full translation.
  var OBJECT_PHRASES = {
    'reliable data transmission': 'نقل البيانات الموثوق',
    'reliable data transmission between devices': 'نقل البيانات الموثوق بين الأجهزة',
    'reliable and ordered data transmission': 'نقل البيانات الموثوق والمرتب',
    'reliable and ordered data transmission between communicating hosts': 'نقل البيانات الموثوق والمرتب بين الأجهزة المتصلة',
    'domain names into ip addresses': 'أسماء النطاقات إلى عناوين IP',
    'fast data transmission': 'نقل بيانات سريع',
    'network traffic': 'حركة مرور الشبكة',
    'network traffic according to rules': 'حركة مرور الشبكة وفق قواعد محددة'
  };

  function translateKnownSentence(original, lexicon) {
    var match = String(original || '').trim().match(/^(.+?)\s+(provides|provide|translates|translate|contains|contain|manages|manage|controls|control|executes|execute|identifies|identify)\s+(.+?)[.!?]?\s*$/i);
    if (!match) return null;
    var subject = exactTerm(lexicon, match[1]);
    var verbEntry = VERB_MAP[match[2].toLowerCase()];
    var objectArabic = OBJECT_PHRASES[normalizeEnglishPhrase(match[3])];
    if (!subject || !subject.term_ar || !verbEntry || !objectArabic) return null;
    var verbArabic = typeof verbEntry === 'object' ? verbEntry.ar : verbEntry;
    return {
      original: original,
      translated: subject.term_ar + ' ' + verbArabic + ' ' + objectArabic + '.',
      status: 'complete',
      confidence: 0.9,
      structured: true
    };
  }

  function translateSentence(sentence, learningStore) {
    var original = String(sentence || '').trim();
    if (!original) return { translated: '', confidence: 0, status: 'empty' };

    // Check user corrections from learning store first
    if (learningStore && learningStore.lookupCorrection) {
      var correction = learningStore.lookupCorrection(original);
      if (correction && correction.corrected) {
        return {
          original: original,
          translated: correction.corrected,
          status: 'user-confirmed',
          learned: true
        };
      }
    }

    var lexicon = getLexicon();

    var structured = translateKnownSentence(original, lexicon);
    if (structured) return structured;

    // Exact phrase lookup only; substring matches can map 'data' to 'datagram'.
    var phraseMatch = exactTerm(lexicon, original);
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
        var term3 = exactTerm(lexicon, p3);
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
        var term2 = exactTerm(lexicon, p2);
        if (term2 && term2.term_ar) {
          translatedTokens.push(term2.term_ar + (term2.abbreviation ? ' (' + term2.abbreviation + ')' : ''));
          matchedPhrases++;
          i += 2;
          continue;
        }
      }

      // Check single word lexicon match
      var singleTerm = exactTerm(lexicon, word);
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
    var status = 'partial'; // Word-by-word substitutions are not a verified sentence translation.

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
