/* Midad Answer Engine — MLKE Integrated Answering Pipeline */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./engine.js'),
      require('./mlke-lexicon.js'),
      require('./mlke-query.js'),
      require('./mlke-translator.js'),
      require('./mlke-knowledge.js')
    );
  } else {
    root.MidadAnswer = factory(
      root.MidadEngine,
      root.MlkeLexicon,
      root.MlkeQuery,
      root.MlkeTranslator,
      root.MlkeKnowledge
    );
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (E, LexiconClass, QueryModule, TranslatorModule, KnowledgeModule) {
  'use strict';

  function getSharedLexicon(userEntries) {
    return LexiconClass.getSharedInstance ? LexiconClass.getSharedInstance(userEntries) : new LexiconClass(userEntries);
  }

  function normalizeMath(value) {
    return String(value || '').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6f0); })
      .replace(/[×✕]/g, '*').replace(/[÷]/g, '/').replace(/[−–]/g, '-')
      .replace(/٫/g, '.').replace(/[٪]/g, '%');
  }

  function extractExpression(question) {
    var q = normalizeMath(question).trim();
    q = q.replace(/^(?:كم(?:\s+يساوي)?|احسب|أحسب|احسبي|أوجد|اوجد|حل|ما\s+(?:ناتج|قيمة)|calculate|compute|solve|what\s+is)\s*[:：]?\s*/i, '');
    q = q.replace(/[؟?!؛;]+\s*$/, '').trim().replace(/س/g, 'x');
    if (!q || q.length > 160 || !/^[\d.xX+\-*/^%=()\s]+$/.test(q) || !/[0-9]/.test(q)) return null;
    if (!/[+\-*/^%=]/.test(q)) return null;
    return q.toLowerCase();
  }

  function parseLinear(source) {
    var tokens = [], re = /(?:\d+(?:\.\d*)?|\.\d+)|[x+\-*/^%=()]/g, m;
    while ((m = re.exec(source)) !== null) tokens.push(m[0]);
    if (!tokens.length || tokens.length > 100 || tokens.join('') !== source.replace(/\s/g, '')) throw new Error('صيغة غير مدعومة');
    var at = 0, depth = 0;
    function val(a, b) {
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 1e14 || Math.abs(b) > 1e14) throw new Error('النتيجة خارج الحدود');
      return {a: a, b: b};
    }
    function mul(a, b) {
      if (Math.abs(a.a) > 1e-12 && Math.abs(b.a) > 1e-12) throw new Error('معادلة غير خطية');
      return val(a.a * b.b + b.a * a.b, a.b * b.b);
    }
    function primary() {
      if (++depth > 32) throw new Error('تعبير متداخل جدًا');
      var t = tokens[at++], result;
      if (t === '(') { result = add(); if (tokens[at++] !== ')') throw new Error('أقواس غير متوازنة'); }
      else if (t === 'x') result = val(1, 0);
      else if (t && /^(?:\d|\.)/.test(t)) result = val(0, Number(t));
      else throw new Error('تعبير غير مكتمل');
      depth--;
      while (tokens[at] === '%') { at++; result = val(result.a / 100, result.b / 100); }
      return result;
    }
    function power() {
      var v = primary();
      if (tokens[at] === '^') {
        at++;
        var exponent = unary();
        if (exponent.a !== 0 || !Number.isInteger(exponent.b) || Math.abs(exponent.b) > 8 || (v.a !== 0 && exponent.b !== 1)) throw new Error('أس غير مدعوم');
        if (exponent.b < 0 && v.b === 0) throw new Error('قسمة على صفر');
        v = v.a !== 0 ? v : val(0, Math.pow(v.b, exponent.b));
      }
      return v;
    }
    function unary() {
      if (tokens[at] === '+') { at++; return unary(); }
      if (tokens[at] === '-') { at++; var v = unary(); return val(-v.a, -v.b); }
      return power();
    }
    function product() {
      var left = unary();
      while (at < tokens.length) {
        var op = tokens[at];
        var implicit = op === 'x' || op === '(';
        if (op !== '*' && op !== '/' && !implicit) break;
        if (!implicit) at++;
        var right = unary();
        if (op === '/') {
          if (Math.abs(right.a) > 1e-12) throw new Error('القسمة على متغير غير مدعومة');
          if (Math.abs(right.b) < 1e-12) throw new Error('القسمة على صفر');
          left = val(left.a / right.b, left.b / right.b);
        } else left = mul(left, right);
      }
      return left;
    }
    function add() {
      var left = product();
      while (tokens[at] === '+' || tokens[at] === '-') {
        var op = tokens[at++], right = product(), sign = op === '+' ? 1 : -1;
        left = val(left.a + sign * right.a, left.b + sign * right.b);
      }
      return left;
    }
    var left = add(), right = null;
    if (tokens[at] === '=') { at++; right = add(); }
    if (at !== tokens.length) throw new Error('صيغة غير مدعومة');
    return {left: left, right: right};
  }

  function displayNumber(n) {
    var rounded = Math.abs(n) < 1e-12 ? 0 : Number(n.toPrecision(12));
    return String(rounded);
  }

  function calculate(question) {
    var expr = extractExpression(question);
    if (!expr) return null;
    try {
      var parsed = parseLinear(expr), left = parsed.left, right = parsed.right;
      if (!right) {
        if (left.a) return {error: 'أدخل معادلة تحتوي على علامة = لحل المجهول.'};
        return {text: 'الحساب المحلي:\n' + expr.replace(/x/g, 'س') + ' = ' + displayNumber(left.b) + '\n\nاستُخدمت قواعد الحساب المبرمجة، وليس مرجعًا خارجيًا.'};
      }
      var a = left.a - right.a, b = right.b - left.b;
      if (!left.a && !right.a) {
        var equal = Math.abs(left.b - right.b) < 1e-10;
        return {text: 'بالحساب المحلي، طرفا المساواة ' + (equal ? 'متساويان.' : 'غير متساويين.') + '\n' + displayNumber(left.b) + (equal ? ' = ' : ' ≠ ') + displayNumber(right.b)};
      }
      if (Math.abs(a) < 1e-12) return {text: Math.abs(b) < 1e-12 ? 'تتحقق المعادلة لكل قيمة للمجهول.' : 'لا يوجد حل لهذه المعادلة الخطية.'};
      return {text: 'حل محلي للمعادلة الخطية:\n' + expr.replace(/x/g, 'س') + '\nبعد تجميع الحدود: ' + displayNumber(a) + ' × س = ' + displayNumber(b) + '\nإذًا س = ' + displayNumber(b / a) + '\n\nاستُخدمت قواعد الجبر المبرمجة، وليس مرجعًا خارجيًا.'};
    } catch (e) { return {error: e && e.message ? e.message : 'التعبير غير مدعوم'}; }
  }

  // PDF.js emits line breaks at visual rows. Rejoin wrapped rows so a
  // paragraph is not mistaken for several independent one-line sentences.
  function joinWrappedLines(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var paragraphs = [], current = '';
    function flush() {
      if (current.trim()) paragraphs.push(current.trim());
      current = '';
    }
    lines.forEach(function (raw) {
      var line = String(raw || '').replace(/[ \t]+/g, ' ').trim();
      if (!line) { flush(); return; }
      var bullet = /^(?:[•▪◦*–—-]|\d+\s*[.)-]|[أ-د]\s*[).-])\s+/.test(line);
      var previousEnded = /[.!?؟؛:]\s*$/.test(current);
      if (current && (previousEnded || bullet)) flush();
      if (bullet) {
        current = line.replace(/^(?:[•▪◦*–—-]|\d+\s*[.)-]|[أ-د]\s*[).-])\s+/, '');
        flush();
      } else {
        current = current ? current + ' ' + line : line;
      }
    });
    flush();
    return paragraphs.join('\n');
  }

  function sentences(text) {
    var normalized = joinWrappedLines(text);
    return (normalized.match(/[^.!?؟؛\n]+[.!?؟؛]?/g) || [])
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length >= 8 && E.words(s).length >= 2; });
  }

  function selectSentences(documents, result, question, limit) {
    var q = new Set(E.words(question).concat(result.queryWords || [])), items = [];
    var semanticPages = new Set(result.semanticPages || []);
    var sources = result.overview ? [] : (result.references || []);

    // Full-reference summaries sample the complete document, not just its opening pages.
    if (result.overview) {
      documents.forEach(function (doc) {
        (doc.pages || []).forEach(function (page) {
          if (page.text) sources.push({
            docId: doc.id, docName: doc.name, page: page.page, type: doc.type,
            text: page.text, ocr: !!page.ocr
          });
        });
      });
      var summarySentenceSeen = new Set();
      var pagePools = sources.map(function (ref, pageIndex) {
        var pool = sentences(ref.text).filter(function (line) {
          if (E.words(line).length < 4 && line.length < 55) return false;
          var key = E.normalize(line);
          if (summarySentenceSeen.has(key)) return false;
          summarySentenceSeen.add(key);
          return true;
        });
        // Preserve the page's narrative order; longest-first favored generic
        // boilerplate and headings over the distinct idea stated first.
        return {ref: ref, pageIndex: pageIndex, sentences: pool.slice(0, 8)};
      }).filter(function (pool) { return pool.sentences.length; });
      var pageCount = Math.min(pagePools.length, limit), chosenPools = [];
      for (var p = 0; p < pageCount; p++) {
        var pageAt = pageCount <= 1 ? 0 : Math.round(p * (pagePools.length - 1) / (pageCount - 1));
        chosenPools.push(pagePools[pageAt]);
      }
      var sampled = [], round = 0;
      while (sampled.length < limit) {
        var addedThisRound = 0;
        chosenPools.forEach(function (pool) {
          var sentence = pool.sentences[round];
          if (sentence && sampled.length < limit) {
            sampled.push({score: 1, order: pool.pageIndex * 1000 + round,
              text: sentence, ref: pool.ref});
            addedThisRound++;
          }
        });
        if (!addedThisRound) break;
        round++;
      }
      return sampled.sort(function (a, b) { return a.order - b.order; });
    }

    sources.slice(0, 240).forEach(function (ref, pageOrder) {
      sentences(ref.text).slice(0, 300).forEach(function (text, index) {
        var terms = E.words(text);
        var matched = new Set(terms.filter(function (w) { return q.has(w); }));
        var pageKey = String(ref.docId || ref.docName) + ':' + String(ref.page);
        var semanticHit = semanticPages.has(pageKey);
        var score = matched.size * 5 + Math.min(terms.length, 30) / 40 + (semanticHit ? 4 : 0);
        // Admit high-confidence semantic hits even when no literal term matches.
        if (q.size && !matched.size && !semanticHit) return;
        items.push({score: score, order: pageOrder * 1000 + index, text: text, ref: ref});
      });
    });

    items.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    var seen = new Set(), perPage = {}, chosen = [];
    items.forEach(function (item) {
      var key = E.normalize(item.text);
      var pageKey = String(item.ref.docId || item.ref.docName) + ':' + item.ref.page;
      var pageCount = perPage[pageKey] || 0;
      if (chosen.length < limit && !seen.has(key) && pageCount < 8) {
        chosen.push(item);
        seen.add(key);
        perPage[pageKey] = pageCount + 1;
      }
    });
    // Present evidence in the original page order after relevance selection.
    chosen.sort(function (a, b) {
      var ad = String(a.ref.docId || a.ref.docName), bd = String(b.ref.docId || b.ref.docName);
      return ad.localeCompare(bd) || Number(a.ref.page || 0) - Number(b.ref.page || 0) || a.order - b.order;
    });
    return chosen;
  }

  function generateStudyFeatures(question, docs, found, limit) {
    var q = E.normalize(question);
    var isQuestionGen = /(?:اسئلة|أسئلة|تمارين|اختبار|اسئلة دراسية|أسئلة دراسية|quiz|questions|exercises)/.test(q);
    var isMcq = /(?:خيارات|اختيار من متعدد|صح ام خطا|صح أو خطأ|صح وخطأ|mcq|true or false)/.test(q);
    var isExplain = false; // Route explanations through the detailed evidence composer.

    if (!isQuestionGen && !isMcq && !isExplain) return null;

    var selected = selectSentences(docs, found, question, limit);
    if (!selected.length) {
      selected = selectSentences(docs, {overview: true, references: []}, question, limit);
    }
    if (!selected.length) return null;

    var refs = selected.map(function (item) { return {docId: item.ref.docId, docName: item.ref.docName,
      page: item.ref.page, type: item.ref.type, excerpt: E.shorten(item.text, 600), ocr: !!item.ref.ocr}; });

    if (isMcq) {
      var bodyItems = selected.map(function (item, i) {
        var cleanText = item.text.replace(/^[•\-*\d.\s]+/, '');
        var num = i + 1;
        if (i % 2 === 0) {
          return 'السؤال [' + num + ']: عبارة صحيحة أم خاطئة؟\n«' + cleanText + '»\n' +
            'أ) صحيحة (مباشرة من ' + item.ref.docName + ' صفحة ' + item.ref.page + ')\n' +
            'ب) خاطئة';
        } else {
          return 'السؤال [' + num + ']: بناءً على النص القائل «' + cleanText + '»:\n' +
            'أ) النص يؤكد هذه الحقيقة بالكامل\n' +
            'ب) النص يناقض هذه الحقيقة\n' +
            'ج) المرجع لا يتطرق إلى هذه المعلومة';
        }
      });
      var header = 'تمارين واختبارات دراسية مستخرجة من مراجعك:';
      var text = header + '\n\n' + bodyItems.join('\n\n') + '\n\nملاحظة: الأسئلة مصوغة مباشرة من نصوص المراجع واقتباساتها (توليد مبرمج مقيّد).';
      return {text: text, origin: 'source', references: refs};
    }

    if (isQuestionGen) {
      var qItems = selected.map(function (item, i) {
        var cleanText = item.text.replace(/^[•\-*\d.\s]+/, '');
        return 'سؤال [' + (i + 1) + ']: استنادًا إلى مرجع (' + item.ref.docName + ' صفحة ' + item.ref.page + '):\n' +
          '«' + cleanText + '»\n' +
          'السؤال: كيف يوضح المرجع المفهوم الوارد في هذا المقطع؟';
      });
      var qHeader = 'أسئلة مراجعة واستذكار مبنية على مراجعك:';
      var qText = qHeader + '\n\n' + qItems.join('\n\n');
      return {text: qText, origin: 'source', references: refs};
    }

    if (isExplain) {
      var expItems = selected.map(function (item, i) {
        return '[' + (i + 1) + '] الشرح والمقطع من (' + item.ref.docName + ' صفحة ' + item.ref.page + '):\n«' + item.text + '»';
      });
      var expHeader = 'توضيح المفاهيم والمقاطع المستخرجة من مراجعك:';
      var expText = expHeader + '\n\n' + expItems.join('\n\n') + '\n\nهذا التوضيح يعتمد حصريًا على النصوص المقتبسة من المرجع.';
      return {text: expText, origin: 'source', references: refs};
    }

    return null;
  }

  function sourceLabel(item) {
    var ref = item.ref || {};
    var name = ref.docName || 'مرجع';
    var page = ref.page ? '، الصفحة ' + ref.page : '';
    return '[' + name + page + ']';
  }

  function isEnglishSource(text) {
    var value = String(text || '');
    return (value.match(/[a-zA-Z]/g) || []).length > (value.match(/[\u0600-\u06ff]/g) || []).length;
  }

  function renderEvidenceItem(item, index, language, learningStore) {
    var original = String(item.text || '').trim();
    var source = sourceLabel(item);
    if (language === 'ar' && isEnglishSource(original) && TranslatorModule) {
      var translated = TranslatorModule.translateSentence(original, learningStore);
      if (translated && translated.status === 'complete' && translated.structured === true && translated.translated &&
          translated.translated.indexOf('[') < 0) {
        return (index + 1) + '. ترجمة معجمية تقريبية: ' + translated.translated +
          '\n   النص الأصلي: ' + original + '\n   المصدر: ' + source;
      }
      return (index + 1) + '. النص الأصلي: ' + original + '\n   المصدر: ' + source +
        '\n   ملاحظة: قاموس الترجمة المحلي لا يغطي هذه الجملة بالكامل.';
    }
    return (index + 1) + '. ' + original + '\n   المصدر: ' + source;
  }

  function uniqueReferences(items) {
    var seen = new Set(), refs = [];
    items.forEach(function (item) {
      var ref = item.ref || {};
      var key = String(ref.docId || ref.docName || '') + ':' + String(ref.page || '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      refs.push({
        docId: ref.docId, docName: ref.docName, page: ref.page, type: ref.type,
        excerpt: E.shorten(ref.text || item.text || '', 600), ocr: !!ref.ocr
      });
    });
    return refs;
  }

  function parseComparisonPair(question) {
    var q = String(question || '').replace(/\s+/g, ' ').trim();
    var match = q.match(/بين\s+(.+?)\s+و\s*(.+?)(?:[؟?!؛;.]|$)/i);
    if (!match) match = q.match(/between\s+(.+?)\s+and\s+(.+?)(?:[?!.;]|$)/i);
    if (!match) match = q.match(/compare\s+(.+?)\s+(?:with|and|vs\.?|versus)\s+(.+?)(?:[?!.;]|$)/i);
    if (!match) match = q.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+?)(?:[?!.;]|$)/i);
    if (!match) return [];
    function clean(value) {
      return String(value || '').replace(/^[\s،,:؛-]+|[\s،,:؛?.!]+$/g, '')
        .replace(/^(?:و|مع|between|compare)\s*/i, '')
        .replace(/\s+(?:بالتفصيل|بشكل كامل|كامل|من حيث|في المرجع)$/i, '')
        .trim();
    }
    var left = clean(match[1]), right = clean(match[2]);
    return left && right && E.normalize(left) !== E.normalize(right) ? [left, right] : [];
  }

  function buildComparisonAnswer(docs, queryObj, question, limit, options) {
    var entities = (queryObj.entities || []).slice(0, 2);
    if (entities.length < 2) return null;

    var groups = [];
    var perEntityLimit = Math.max(12, Math.min(30, Math.ceil(limit / 2)));
    entities.forEach(function (entity) {
      var found = E.search(docs, entity, 60, '', options.learningStore, options.semanticModel);
      var selected = selectSentences(docs, found, entity, perEntityLimit);
      if (!selected.length && found.references && found.references.length) {
        selected = found.references.map(function (ref) { return {text: ref.text, ref: ref}; });
      }
      // BM25 expansion may share generic terms such as "protocol" or "data".
      // Keep only passages that contain the requested entity itself.
      var entityTerms = E.words(entity);
      if (entityTerms.length) {
        selected = selected.filter(function (item) {
          var passageTerms = new Set(E.words(item.text));
          return entityTerms.some(function (term) { return passageTerms.has(term); });
        });
      }
      groups.push({entity: entity, items: selected});
    });
    if (!groups.some(function (group) { return group.items.length; })) return null;

    var lines = ['**مقارنة بين ' + entities[0] + ' و' + entities[1] + ' — أدلة المراجع**', '**الوصف والوظيفة والأدلة المتاحة**'];
    groups.forEach(function (group, groupIndex) {
      lines.push('\n**الطرف ' + (groupIndex + 1) + ': ' + group.entity + '**');
      if (!group.items.length) {
        lines.push('لم يسترجع البحث مقاطع كافية لهذا الطرف من النص المستخرج. هذا لا يثبت غيابه من الملف؛ فقد تكون الصياغة مختلفة أو الصفحة مصوّرة.');
        return;
      }
      lines.push(group.items.map(function (item, i) {
        return renderEvidenceItem(item, i, queryObj.language, options.learningStore);
      }).join('\n\n'));
    });
    lines.push('\n**حدود المقارنة**');
    lines.push('هذه أدلة كل طرف كما وردت في المراجع. لا أقرر أن أحدهما أفضل أو أسرع إلا إذا احتوى المرجع على معيار وبيانات مقارنة صريحة.');
    var allItems = groups.reduce(function (all, group) { return all.concat(group.items); }, []);
    return {
      text: lines.join('\n\n'),
      origin: 'source',
      intent: 'comparison',
      evidenceCount: allItems.length,
      references: uniqueReferences(allItems)
    };
  }

  function sentenceRole(text) {
    var value = E.normalize(text);
    if (/(?:يعرف بانه|تعرف بانها|هو عباره عن|هي عباره عن|هو نظام|هي نظام|is defined as|refers to|is a|are a|is an|are an)/.test(value)) return 'definition';
    if (/(?:بسبب|لان|لانه|نتيجه ل|يؤدي الى|ينتج عن|because|due to|as a result|therefore|leads to)/.test(value)) return 'cause';
    if (/(?:اولا|ثانيا|ثم|بعد ذلك|خطوه|مرحله|يتكون من|تتكون من|يمر عبر|first|second|then|next|step|stage|consists of|is composed of)/.test(value)) return 'process';
    if (/(?:وظيفته|وظيفتها|يستخدم في|تستخدم في|يتيح|يسمح|يمكن من|يعمل على|provides|enables|allows|is used to|used for|functions? as)/.test(value)) return 'function';
    if (/(?:مثلا|على سبيل المثال|مثل|من امثله|for example|such as|e\\.g\\.)/.test(value)) return 'example';
    if (/(?:مزايا|ميزات|فوائد|من فوائد|يساعد على|advantages|benefits|strengths|improves)/.test(value)) return 'advantage';
    if (/(?:عيوب|قيود|محدود|لا يدعم|من سلبيات|limitations|drawbacks|disadvantages|however|but|cannot)/.test(value)) return 'limitation';
    if (/(?:بينما|على خلاف|بالمقابل|بخلاف|مقارنه|يختلف عن|whereas|unlike|in contrast|compared with|compared to)/.test(value)) return 'comparison';
    return 'detail';
  }

  var ROLE_LABELS = {
    definition: 'التعريف والفكرة الأساسية',
    function: 'الوظيفة والاستخدام',
    process: 'آلية العمل والخطوات',
    cause: 'الأسباب والنتائج',
    example: 'أمثلة وتطبيقات',
    advantage: 'الفوائد والمزايا',
    limitation: 'القيود والنقاط التي يجب الانتباه لها',
    comparison: 'نقاط المقارنة والاختلاف',
    detail: 'تفاصيل مرتبطة بالسؤال'
  };

  function rolePriority(intent) {
    if (intent === 'process') return ['process','function','definition','detail','example','cause','advantage','limitation'];
    if (intent === 'cause') return ['cause','function','detail','example','definition','process','limitation','advantage'];
    if (intent === 'definition') return ['definition','function','detail','process','example','cause','advantage','limitation'];
    if (intent === 'function') return ['function','definition','process','detail','example','cause','advantage','limitation'];
    if (intent === 'comparison') return ['comparison','definition','function','detail','advantage','limitation','process','example'];
    return ['definition','function','process','cause','example','advantage','limitation','comparison','detail'];
  }

  function buildDetailedAnswer(selected, queryObj, question, options, found) {
    var grouped = Object.create(null);
    selected.forEach(function (item, index) {
      var role = sentenceRole(item.text);
      if (!grouped[role]) grouped[role] = [];
      grouped[role].push({item: item, index: index});
    });
    var evidenceSections = [], usedRoles = new Set();
    rolePriority(queryObj.intent).forEach(function (role) {
      if (!grouped[role] || !grouped[role].length) return;
      usedRoles.add(role);
      evidenceSections.push('**' + ROLE_LABELS[role] + '**\n' + grouped[role].map(function (entry) {
        return renderEvidenceItem(entry.item, entry.index, queryObj.language, options.learningStore);
      }).join('\n\n'));
    });
    Object.keys(grouped).forEach(function (role) {
      if (usedRoles.has(role)) return;
      evidenceSections.push('**' + (ROLE_LABELS[role] || 'تفاصيل') + '**\n' + grouped[role].map(function (entry) {
        return renderEvidenceItem(entry.item, entry.index, queryObj.language, options.learningStore);
      }).join('\n\n'));
    });
    var title = queryObj.intent === 'process' ? 'شرح مرجعي موسع: آلية العمل والخطوات'
      : queryObj.intent === 'cause' ? 'شرح مرجعي موسع: الأسباب والنتائج'
      : queryObj.intent === 'definition' ? 'شرح مرجعي موسع: المفهوم والتعريف'
      : queryObj.intent === 'function' ? 'شرح مرجعي موسع: الوظيفة ودور المكوّن'
      : queryObj.intent === 'summarization' ? 'ملخص مرجعي موسع موزع على الصفحات'
      : 'إجابة مرجعية موسعة ومنظمة';
    var text = '**' + title + '**\n\n';
    text += '**السؤال:** ' + question + '\n\n';
    text += '**المقاطع الداعمة من المرجع مرتبة بحسب الصفحات**\n\n';
    text += evidenceSections.join('\n\n');
    text += '\n\n**حدود الإجابة**\n';
    text += 'هذه إجابة استرجاعية منظمة: جُمعت مقاطع ذات صلة من صفحات متعددة وربط كل مقطع بمصدره. المحرك لا يستخدم نموذجًا لغويًا توليديًا، لذلك لا يخترع شرحًا حرًا أو معلومات ليست في المرجع. ';
    if (selected.length < Math.max(10, Math.floor((Number(options.maxSentences) || 24) * 0.6))) {
      text += 'النص المستخرج أو الأدلة المطابقة قليلة؛ لذلك لا أستطيع ضمان صفحة كاملة من دون تكرار أو إضافة معلومات غير موثقة.';
    } else {
      text += 'راجع بطاقات الصفحات لقراءة المقاطع ضمن سياقها الكامل.';
    }
    return {
      text: text,
      origin: 'source',
      intent: queryObj.intent,
      evidenceCount: selected.length,
      references: uniqueReferences(selected),
      overview: !!found.overview,
      semanticUsed: !!found.semanticUsed
    };
  }

  function answer(options) {
    options = options || {};
    var lexicon = getSharedLexicon(options.userLexicon);
    var question = String(options.question || '').trim();
    var docs = options.documents || [];
    var strict = options.mode === 'strict';
    var limit = Math.max(1, Math.min(60, Number(options.maxSentences) || 36));
    if (/(?:شرح كامل|اشرح.*(?:بالتفصيل|بشكل كامل|كامل|موسع)|بالتفصيل الشامل|full explanation|in detail|comprehensive explanation)/i.test(question)) {
      limit = Math.max(limit, 48);
    }

    if (!strict && options.allowMath !== false) {
      var calculation = calculate(question);
      if (calculation) return calculation.error
        ? {text: 'تعذّر الحساب: ' + calculation.error + '. يدعم المحرك العمليات الأساسية والمعادلات الخطية البسيطة فقط.', origin: 'calculation', references: []}
        : {text: calculation.text, origin: 'calculation', references: []};
    }

    // Step 1: Query Understanding
    var queryObj = QueryModule ? QueryModule.parseQuery(question, lexicon) : { language: 'ar', intent: 'general', entities: [] };
    var comparisonPair = parseComparisonPair(question);
    if (comparisonPair.length === 2) {
      queryObj.entities = comparisonPair;
      queryObj.intent = 'comparison';
    }

    var kb = new KnowledgeModule.KnowledgeBase();
    docs.forEach(function (doc) {
      (doc.pages || []).forEach(function (page) {
        var fList = KnowledgeModule.extractFactsFromSentence(page.text, doc.name, page.page, doc.id);
        fList.forEach(function (f) { kb.addFact(f); });
      });
    });

    // Handle term_extraction intent directly with structured HTML table
    if (queryObj.intent === 'term_extraction') {
      var terms = kb.getAllTerms();
      if (!terms.length) {
        return {
          text: 'لم يتم العثور على مصطلحات معرفية موثقة في المراجع المضافة.',
          origin: 'miss',
          references: []
        };
      }
      var tbl = '<div class="table-container"><table>' +
        '<thead><tr><th>المصطلح</th><th>التعريف / العلاقة</th><th>النص الأصلي</th><th>المرجع</th><th>الصفحة</th></tr></thead><tbody>';
      terms.forEach(function (t) {
        tbl += '<tr><td><strong>' + t.term + '</strong></td><td>' + t.definition + '</td><td>' + t.sourceText + '</td><td>' + t.docName + '</td><td>' + (t.page || '1') + '</td></tr>';
      });
      tbl += '</tbody></table></div>';
      return {
        text: 'قائمة المصطلحات التقنية المستخرجة من مراجعك:\n\n' + tbl,
        origin: 'source',
        references: terms.map(function (t) {
          return { docName: t.docName, page: t.page, excerpt: t.sourceText, ocr: false };
        })
      };
    }

    // Step 2: Broad retrieval. The rule-based fact extractor only recognizes a
    // narrow set of sentence patterns, so it must not decide that a comparison side
    // is absent merely because its pattern did not match.
    var found = E.search(docs, question, 120, options.priorQuestion || '', options.learningStore, options.semanticModel);

    if (queryObj.intent === 'comparison') {
      var comparison = buildComparisonAnswer(docs, queryObj, question, limit, options);
      if (comparison) return comparison;
    }

    var selected = selectSentences(docs, found, question, limit);
    if (!selected.length && found.references && found.references.length) {
      selected = found.references.map(function (ref) {
        return { text: ref.text, ref: ref };
      });
    }

    var studyFeature = generateStudyFeatures(question, docs, found, limit);
    if (studyFeature) return studyFeature;

    if (!selected.length) {
      return {
        text: strict && !docs.length
          ? 'أضف مرجعًا أولًا؛ وضع المصادر فقط لا يجيب من خارجها.'
          : 'لم أجد معلومات كافية قابلة للتوثيق في النص المستخرج. هذا لا يثبت أن المعلومة غير موجودة في الملف؛ قد تكون الصياغة مختلفة أو في صفحة لم تُقرأ جيدًا. افتح نص الصفحات ذات الصلة وتحقق من الاستخراج أو صحح النص ثم أعد السؤال.',
        origin: 'miss',
        references: []
      };
    }

    return buildDetailedAnswer(selected, queryObj, question, options, found);
  }

  return {
    answer: answer,
    calculate: calculate,
    extractExpression: extractExpression,
    parseLinear: parseLinear,
    sentences: sentences,
    joinWrappedLines: joinWrappedLines,
    parseComparisonPair: parseComparisonPair
  };
}));
