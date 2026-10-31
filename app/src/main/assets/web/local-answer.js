/* A small, deterministic local assistant. This is NOT a trained LLM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.MidadAnswer = factory(root.MidadEngine);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  function normalizeMath(value) {
    return String(value || '').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6f0); })
      .replace(/[×✕]/g, '*').replace(/[÷]/g, '/').replace(/[−–]/g, '-')
      .replace(/٫/g, '.').replace(/[٪]/g, '%');
  }
  function extractExpression(question) {
    var q = normalizeMath(question).trim();
    // Only solve an explicit expression, never pull numbers out of an unrelated question.
    q = q.replace(/^(?:كم(?:\s+يساوي)?|احسب|أحسب|احسبي|أوجد|اوجد|حل|ما\s+(?:ناتج|قيمة)|calculate|compute|solve|what\s+is)\s*[:：]?\s*/i, '');
    q = q.replace(/[؟?!؛;]+\s*$/, '').trim().replace(/س/g, 'x');
    if (!q || q.length > 160 || !/^[\d.xX+\-*/^%=()\s]+$/.test(q) || !/[0-9]/.test(q)) return null;
    if (!/[+\-*/^%=]/.test(q)) return null;
    return q.toLowerCase();
  }
  // A bounded recursive-descent parser. Values are a*x + b, allowing linear
  // equations while explicitly rejecting nonlinear equations and zero division.
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
        // 2x and 2(3+4) are conventional implicit multiplication.
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
    // Keep the actual characters of each selected sentence for source checking.
    return (String(text || '').match(/[^.!؟\n]+[.!؟]?/g) || [])
      .map(function (s) { return s.trim(); }).filter(function (s) { return s.length >= 8 && E.words(s).length; });
  }
  function sampleOverviewSources(documents, maxPages) {
    maxPages = maxPages || 120;
    var groups = (documents || []).map(function (doc, docIndex) {
      return {doc: doc, docIndex: docIndex, pages: (doc.pages || []).filter(function (page) { return String(page.text || '').trim(); })};
    }).filter(function (group) { return group.pages.length; });
    var total = groups.reduce(function (sum, group) { return sum + group.pages.length; }, 0);
    if (total <= maxPages) {
      return groups.reduce(function (out, group) {
        group.pages.forEach(function (page, pageIndex) {
          out.push({docId: group.doc.id, docName: group.doc.name, page: page.page, type: group.doc.type, text: page.text, ocr: !!page.ocr, docIndex: group.docIndex, pageIndex: pageIndex});
        });
        return out;
      }, []);
    }

    // Give every document a representative sample before distributing the
    // remaining sample budget in proportion to its non-empty page count.
    var quotas = groups.map(function () { return 1; });
    if (groups.length > maxPages) {
      quotas = groups.map(function () { return 0; });
      for (var d = 0; d < maxPages; d++) quotas[Math.round(d * (groups.length - 1) / Math.max(1, maxPages - 1))] = 1;
    } else {
      var remaining = maxPages - groups.length;
      var capacity = groups.reduce(function (sum, group) { return sum + Math.max(0, group.pages.length - 1); }, 0);
      var fractions = [];
      groups.forEach(function (group, index) {
        var exact = capacity ? remaining * Math.max(0, group.pages.length - 1) / capacity : 0;
        var add = Math.min(group.pages.length - 1, Math.floor(exact));
        quotas[index] += add;
        fractions.push({index: index, fraction: exact - Math.floor(exact)});
      });
      var assigned = quotas.reduce(function (sum, quota) { return sum + quota; }, 0);
      fractions.sort(function (a, b) { return b.fraction - a.fraction; });
      while (assigned < maxPages) {
        var progressed = false;
        for (var f = 0; f < fractions.length && assigned < maxPages; f++) {
          var idx = fractions[f].index;
          if (quotas[idx] < groups[idx].pages.length) { quotas[idx]++; assigned++; progressed = true; }
        }
        if (!progressed) break;
      }
    }

    var sampled = [];
    groups.forEach(function (group, index) {
      var quota = quotas[index];
      if (!quota) return;
      for (var j = 0; j < quota; j++) {
        var pageIndex = quota === 1 ? Math.floor((group.pages.length - 1) / 2) : Math.round(j * (group.pages.length - 1) / (quota - 1));
        var page = group.pages[pageIndex];
        sampled.push({docId: group.doc.id, docName: group.doc.name, page: page.page, type: group.doc.type, text: page.text, ocr: !!page.ocr, docIndex: group.docIndex, pageIndex: pageIndex});
      }
    });
    return sampled;
  }

  function selectSentences(documents, result, question, limit) {
    var q = new Set(result.queryWords && result.queryWords.length ? result.queryWords : E.words(question)), items = [];
    var sources = result.overview ? sampleOverviewSources(documents, 120) : result.references;
    sources.forEach(function (ref, pageOrder) {
      sentences(ref.text).slice(0, 160).forEach(function (text, index) {
        var terms = E.words(text), matched = new Set(terms.filter(function (w) { return q.has(w); }));
        var contentTermCount = terms.filter(function (term) { return !/^\d+$/.test(term); }).length;
        var score = result.overview ? Math.min(contentTermCount, 22) / 22 + 1 / (3 + index) : matched.size * 4 + Math.min(terms.length, 20) / 50;
        if (!result.overview && q.size && !matched.size) return;
        items.push({score: score, order: pageOrder * 1000 + index, text: text, ref: ref});
      });
    });
    items.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    var seen = new Set(), chosen = [], seenPages = new Set();
    if (result.overview) {
      // Keep the best sentence per page, then sample pages evenly so a short
      // summary represents the beginning, middle, and end of each source set.
      var bestPerPage = [];
      items.forEach(function (item) {
        var pageKey = String(item.ref.docId) + ':' + String(item.ref.page);
        if (!seenPages.has(pageKey)) { bestPerPage.push(item); seenPages.add(pageKey); }
      });
      if (bestPerPage.length <= limit) chosen = bestPerPage;
      else for (var sample = 0; sample < limit; sample++) {
        var selectedIndex = Math.round(sample * (bestPerPage.length - 1) / Math.max(1, limit - 1));
        chosen.push(bestPerPage[selectedIndex]);
      }
      chosen.sort(function (a, b) { return a.order - b.order; });
      return chosen;
    }
    items.forEach(function (item) {
      var key = E.normalize(item.text);
      if (chosen.length < limit && !seen.has(key)) { chosen.push(item); seen.add(key); }
    });
    return chosen;
  }

  function answer(options) {
    options = options || {};
    var question = String(options.question || '').trim(), docs = options.documents || [];
    var strict = options.mode === 'strict', limit = Math.max(1, Math.min(5, Number(options.maxSentences) || 3));
    if (!strict && options.allowMath !== false) {
      var calculation = calculate(question);
      if (calculation) return calculation.error
        ? {text: 'تعذّر الحساب: ' + calculation.error + '. يدعم المحرك العمليات الأساسية والمعادلات الخطية البسيطة فقط.', origin: 'calculation', references: []}
        : {text: calculation.text, origin: 'calculation', references: []};
    }
    var found = E.search(docs, question, 5, options.priorQuestion || '', options.termWeights || null);
    var selected = selectSentences(docs, found, question, limit);
    if (!selected.length) return {text: strict && !docs.length
      ? 'أضف مرجعًا أولًا؛ وضع المصادر فقط لا يجيب من خارجها.'
      : 'لم أجد نصًا مناسبًا في مراجعك. لا أملك معرفة عامة مولّدة؛ جرّب صياغة أخرى أو أضف مصدرًا. يمكنني أيضًا حساب تعبير أو حل معادلة خطية بسيطة عند السماح بالحساب.', origin: 'miss', references: []};
    var refs = selected.map(function (item) { return {docId: item.ref.docId, docName: item.ref.docName,
      page: item.ref.page, type: item.ref.type, excerpt: E.shorten(item.text, 600), ocr: !!item.ref.ocr}; });
    var opening = found.overview ? 'ملخص اقتباسي من جمل مختارة (قد لا يشمل المرجع كاملًا):' : 'وجدت في المراجع جملًا قد تساعد في الإجابة:';
    var body = refs.map(function (r, i) { return '[' + (i + 1) + '] «' + r.excerpt + '»'; }).join('\n\n');
    return {text: opening + '\n\n' + body + '\n\nهذه جمل منتقاة آليًا، وليست فهمًا أو حلًا مضمونًا. راجع الصفحة الأصلية.', origin: 'source', references: refs, queryTerms: (found.queryWords || []).slice(0, 30)};
  }
  return {answer: answer, calculate: calculate, extractExpression: extractExpression, parseLinear: parseLinear, sentences: sentences};
}));
