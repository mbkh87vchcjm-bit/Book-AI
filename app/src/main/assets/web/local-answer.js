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

  function sentences(text) {
    return (String(text || '').match(/[^.!؟\n]+[.!؟]?/g) || [])
      .map(function (s) { return s.trim(); }).filter(function (s) { return s.length >= 8 && E.words(s).length; });
  }

  function selectSentences(documents, result, question, limit) {
    var q = new Set(E.words(question)), items = [];
    var sources = result.overview ? [] : result.references;
    if (result.overview) {
      documents.forEach(function (doc) { (doc.pages || []).forEach(function (page) {
        if (page.text) sources.push({docId: doc.id, docName: doc.name, page: page.page, type: doc.type, text: page.text, ocr: !!page.ocr});
      }); });
    }
    sources.slice(0, 120).forEach(function (ref, pageOrder) {
      sentences(ref.text).slice(0, 160).forEach(function (text, index) {
        var terms = E.words(text), matched = new Set(terms.filter(function (w) { return q.has(w); }));
        var score = result.overview ? Math.min(terms.length, 22) / 22 + 1 / (3 + index) : matched.size * 4 + Math.min(terms.length, 20) / 50;
        if (!result.overview && q.size && !matched.size) return;
        items.push({score: score, order: pageOrder * 1000 + index, text: text, ref: ref});
      });
    });
    items.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    var seen = new Set(), chosen = [];
    items.forEach(function (item) {
      var key = E.normalize(item.text);
      if (chosen.length < limit && !seen.has(key)) { chosen.push(item); seen.add(key); }
    });
    if (result.overview) chosen.sort(function (a, b) { return a.order - b.order; });
    return chosen;
  }

  function generateStudyFeatures(question, docs, found, limit) {
    var q = E.normalize(question);
    var isQuestionGen = /(?:اسئلة|أسئلة|تمارين|اختبار|اسئلة دراسية|أسئلة دراسية|quiz|questions|exercises)/.test(q);
    var isMcq = /(?:خيارات|اختيار من متعدد|صح ام خطا|صح أو خطأ|صح وخطأ|mcq|true or false)/.test(q);
    var isExplain = /(?:اشرح|توضيح|مفهوم|ما معنى|ما مفهوم|explain|clarify|concept)/.test(q);

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

  function answer(options) {
    options = options || {};
    var lexicon = getSharedLexicon(options.userLexicon);
    var question = String(options.question || '').trim();
    var docs = options.documents || [];
    var strict = options.mode === 'strict';
    var limit = Math.max(1, Math.min(5, Number(options.maxSentences) || 3));

    if (!strict && options.allowMath !== false) {
      var calculation = calculate(question);
      if (calculation) return calculation.error
        ? {text: 'تعذّر الحساب: ' + calculation.error + '. يدعم المحرك العمليات الأساسية والمعادلات الخطية البسيطة فقط.', origin: 'calculation', references: []}
        : {text: calculation.text, origin: 'calculation', references: []};
    }

    // Step 1: Query Understanding
    var queryObj = QueryModule ? QueryModule.parseQuery(question, lexicon) : { language: 'ar', intent: 'general', entities: [] };

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

    // Step 2: Knowledge Extraction & Inference for Comparisons
    if (KnowledgeModule && queryObj.intent === 'comparison') {
      var inf = KnowledgeModule.inferAnswer(queryObj, docs, kb);
      if (inf) return inf;
    }

    // Step 3: BM25 Retrieval & Selection with Learning Feedback
    var found = E.search(docs, question, 5, options.priorQuestion || '', options.learningStore);

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
          : 'لم أجد معلومات كافية في المراجع المستوردة للإجابة عن هذا السؤال.',
        origin: 'miss',
        references: []
      };
    }

    var refs = selected.map(function (item) {
      return {
        docId: item.ref.docId,
        docName: item.ref.docName,
        page: item.ref.page,
        type: item.ref.type,
        excerpt: E.shorten(item.text, 600),
        ocr: !!item.ref.ocr
      };
    });

    // Step 4: Translation if source is English and question is Arabic
    var bodyPassages = selected.map(function (item, i) {
      var num = i + 1;
      var text = item.text;
      var isEnglishSource = /[a-zA-Z]/.test(text) && (text.match(/[a-zA-Z]/g) || []).length > (text.match(/[\u0600-\u06ff]/g) || []).length;

      if (isEnglishSource && queryObj.language === 'ar' && TranslatorModule) {
        var tr = TranslatorModule.translateSentence(text, options.learningStore);
        return '[' + num + '] الترجمة: «' + tr.translated + '»\nالنص الأصلي: "' + text + '"';
      }
      return '[' + num + '] «' + text + '»';
    });

    var header = found.overview ? 'ملخص اقتباسي من جمل مختارة:' : 'الإجابة المستخرجة من المراجع:';
    var fullText = header + '\n\n' + bodyPassages.join('\n\n') + '\n\nملاحظة: جميع الاقتباسات مربوطة بالمصادر الأصلية ورقم الصفحة.';

    return {
      text: fullText,
      origin: 'source',
      references: refs
    };
  }

  return {
    answer: answer,
    calculate: calculate,
    extractExpression: extractExpression,
    parseLinear: parseLinear,
    sentences: sentences
  };
}));
