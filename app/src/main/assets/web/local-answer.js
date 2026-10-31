/* A small, deterministic local assistant. This is NOT a trained LLM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./knowledge-graph.js'));
  else root.MidadAnswer = factory(root.MidadEngine, root.MidadKnowledgeGraph);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (E, Knowledge) {
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
    return (String(text || '').match(/[^.!؟?\n]+[.!؟?]?/g) || [])
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length >= 12 && E.words(s).length; });
  }

  function classifyIntent(question) {
    var q = E.normalize(question);
    if (/(?:قارن|مقارنه|الفرق بين|ما الفرق|compare|comparison|difference between|versus|\bvs\b)/.test(q)) return 'compare';
    if (/(?:لماذا|ليش|ما سبب|سبب|اهميه|اهمية|why|reason|cause)/.test(q)) return 'why';
    if (/(?:كيف|ما طريقه|طريقه عمل|خطوات|اليه العمل|how does|how do|how to|steps|process)/.test(q)) return 'how';
    if (/(?:عرف|عرّف|تعريف|ما هو|ماهي|ما هى|ماذا يعني|define|definition|what is|what are)/.test(q)) return 'define';
    if (/(?:لخص|تلخيص|ملخص|summari[sz]e|overview|key points)/.test(q)) return 'summary';
    return 'explain';
  }

  function sentenceRole(text) {
    var q = E.normalize(text);
    if (/(?:يعرف بانه|تعرف بانها|هو عباره عن|هي عباره عن|هو نظام|هي نظام|is defined as|refers to|is a|are a|is an|are an)/.test(q)) return 'definition';
    if (/(?:بسبب|لان|لانه|نتيجه ل|يؤدي الى|ينتج عن|because|due to|as a result|therefore|leads to)/.test(q)) return 'cause';
    if (/(?:اولا|ثانيا|ثم|بعد ذلك|خطوه|مرحله|يتكون من|تتكون من|يمر عبر|first|second|then|next|step|stage|consists of|is composed of)/.test(q)) return 'process';
    if (/(?:وظيفته|وظيفتها|يستخدم في|تستخدم في|يتيح|يسمح|يمكن من|يعمل على|provides|enables|allows|is used to|used for|functions? as)/.test(q)) return 'function';
    if (/(?:مثلا|على سبيل المثال|مثل|من امثله|for example|such as|e\\.g\\.)/.test(q)) return 'example';
    if (/(?:مزايا|ميزات|فوائد|من فوائد|يساعد على|advantages|benefits|strengths|improves)/.test(q)) return 'advantage';
    if (/(?:عيوب|قيود|محدود|لا يدعم|من سلبيات|limitations|drawbacks|disadvantages|however|but|cannot)/.test(q)) return 'limitation';
    if (/(?:بينما|على خلاف|بالمقابل|بخلاف|مقارنه|يختلف عن|whereas|unlike|in contrast|compared with|compared to)/.test(q)) return 'comparison';
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
    comparison: 'المقارنة والاختلاف',
    detail: 'تفاصيل مرتبطة بالسؤال'
  };

  function rolePriority(intent) {
    if (intent === 'define') return ['definition', 'function', 'detail', 'process', 'example', 'cause', 'advantage', 'limitation'];
    if (intent === 'why') return ['cause', 'function', 'detail', 'example', 'limitation', 'definition', 'process', 'advantage'];
    if (intent === 'how') return ['process', 'function', 'detail', 'example', 'definition', 'cause', 'limitation', 'advantage'];
    if (intent === 'compare') return ['comparison', 'definition', 'function', 'detail', 'advantage', 'limitation', 'process', 'example'];
    return ['definition', 'function', 'process', 'cause', 'example', 'advantage', 'limitation', 'comparison', 'detail'];
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

  function collectEvidence(documents, result, question, limit, semanticModel, intent) {
    var queryTerms = Array.from(new Set(result.queryWords && result.queryWords.length ? result.queryWords : E.words(question)));
    var q = new Set(queryTerms), items = [];
    var sources = result.overview ? sampleOverviewSources(documents, 120) : result.references;
    sources.forEach(function (ref, pageOrder) {
      sentences(ref.text).slice(0, 160).forEach(function (text, index) {
        var terms = E.words(text), matched = new Set(terms.filter(function (word) { return q.has(word); }));
        var semantic = 0;
        if (semanticModel && typeof semanticModel.similarity === 'function') {
          try { semantic = Math.max(0, Math.min(1, Number(semanticModel.similarity(question, text)) || 0)); } catch (_) {}
        }
        var role = sentenceRole(text);
        var contentTermCount = terms.filter(function (term) { return !/^\d+$/.test(term); }).length;
        var score;
        if (result.overview) {
          score = Math.min(contentTermCount, 24) / 24 + 1 / (4 + index);
        } else {
          if (!matched.size && semantic < 0.78) return;
          score = matched.size * 3.6 + matched.size / Math.max(1, q.size) * 2.2 + semantic * 1.1;
        }
        if (intent === 'summary') score += 0.4;
        items.push({score: score, role: role, order: pageOrder * 1000 + index,
          text: text, ref: ref, semantic: semantic, matched: matched.size});
      });
    });
    items.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    if (result.overview) {
      // Sample across the complete document set, not only the first ranked pages.
      // This preserves the beginning, middle, end, and smaller secondary sources.
      var bestByPage = new Map();
      items.forEach(function (item) {
        var key = String(item.ref.docId) + ':' + String(item.ref.page);
        if (!bestByPage.has(key)) bestByPage.set(key, item);
      });
      var pageCandidates = Array.from(bestByPage.values()).sort(function (a, b) { return a.order - b.order; });
      if (pageCandidates.length <= limit) return pageCandidates;
      var sampledPages = [];
      for (var sample = 0; sample < limit; sample++) {
        var sampleIndex = Math.round(sample * (pageCandidates.length - 1) / Math.max(1, limit - 1));
        if (pageCandidates[sampleIndex]) sampledPages.push(pageCandidates[sampleIndex]);
      }
      return sampledPages;
    }
    var priority = rolePriority(intent), chosen = [], seenText = new Set(), pageCounts = Object.create(null);
    function add(item) {
      var normalized = E.normalize(item.text);
      var pageKey = String(item.ref.docId) + ':' + String(item.ref.page);
      if (chosen.length >= limit || seenText.has(normalized) || (pageCounts[pageKey] || 0) >= 2) return false;
      chosen.push(item); seenText.add(normalized); pageCounts[pageKey] = (pageCounts[pageKey] || 0) + 1;
      return true;
    }
    // Cover different explanatory roles before filling remaining slots by rank.
    priority.forEach(function (role) {
      var candidate = items.find(function (item) { return item.role === role && !seenText.has(E.normalize(item.text)); });
      if (candidate) add(candidate);
    });
    items.forEach(function (item) { add(item); });
    return chosen;
  }

  function buildAnswerText(selected, question, intent, limit) {
    var refs = [], pageIndex = Object.create(null), sections = Object.create(null);
    selected.forEach(function (item) {
      var key = String(item.ref.docId) + ':' + String(item.ref.page);
      if (!pageIndex[key]) {
        var reference = {docId: item.ref.docId, docName: item.ref.docName,
          page: item.ref.page, type: item.ref.type, excerpt: item.text, ocr: !!item.ref.ocr};
        refs.push(reference);
        pageIndex[key] = refs.length;
      } else {
        var ref = refs[pageIndex[key] - 1];
        if (ref.excerpt.indexOf(item.text) < 0) ref.excerpt += ' ' + item.text;
      }
      if (!sections[item.role]) sections[item.role] = [];
      sections[item.role].push({text: item.text, refNumber: pageIndex[key]});
    });
    var lines = [];
    var sourceCount = refs.length;
    var opening = intent === 'summary'
      ? 'ملخص اقتباسي منظم من مقتطفات موزعة على المراجع والصفحات المتاحة:'
      : 'إجابة منظمة مبنية على النصوص التي عُثر عليها في مراجعك:';
    lines.push(opening);
    var priority = rolePriority(intent), used = new Set();
    priority.forEach(function (role) {
      if (!sections[role] || !sections[role].length) return;
      used.add(role);
      lines.push('');
      lines.push('**' + (ROLE_LABELS[role] || 'تفاصيل') + '**');
      sections[role].forEach(function (evidence) {
        lines.push('• «' + E.shorten(evidence.text, 360) + '» [' + evidence.refNumber + ']');
      });
    });
    Object.keys(sections).forEach(function (role) {
      if (used.has(role)) return;
      lines.push('');
      lines.push('**' + (ROLE_LABELS[role] || 'تفاصيل مرتبطة') + '**');
      sections[role].forEach(function (evidence) {
        lines.push('• «' + E.shorten(evidence.text, 360) + '» [' + evidence.refNumber + ']');
      });
    });
    lines.push('');
    if (selected.length < limit) {
      lines.push('**حدود ما وجدته:** المعلومات المتاحة في النصوص المضافة لا تغطي جميع جوانب السؤال. لم أُكمل الأجزاء الناقصة بمعلومات غير موثقة.');
    } else {
      lines.push('**طريقة قراءة الإجابة:** رتّبت المقاطع بحسب دورها في الشرح. علامات [1] وما بعدها تشير إلى بطاقات المراجع وصفحاتها أدناه.');
    }
    if (intent === 'compare') {
      var labels = String(question || '').match(/\b[A-Z][A-Z0-9+/#.-]{1,9}\b/g) || [];
      labels = Array.from(new Set(labels.map(function (label) { return label.toUpperCase(); }))).slice(0, 2);
      if (labels.length === 2) {
        var sideEvidence = labels.map(function (label) {
          var terms = new Set(E.words(label));
          return selected.filter(function (item) { return E.words(item.text).some(function (term) { return terms.has(term); }); });
        });
        if (sideEvidence[0].length && sideEvidence[1].length) {
          lines.splice(1, 0, '', '**نقطتا المقارنة المطلوبتان: ' + labels[0] + ' و' + labels[1] + '**',
            'توجد أدلة منفصلة عن الطرفين ضمن المراجع. لا أقرر أيهما أفضل إلا إذا ورد معيار المقارنة ونتيجته صراحة في النصوص.');
        }
      }
    }
    return {text: lines.join('\n'), references: refs};
  }

  function answer(options) {
    options = options || {};
    var question = String(options.question || '').trim(), docs = options.documents || [];
    var strict = options.mode === 'strict';
    var limit = Math.max(3, Math.min(12, Number(options.maxSentences) || 8));
    if (!strict && options.allowMath !== false) {
      var calculation = calculate(question);
      if (calculation) return calculation.error
        ? {text: 'تعذّر الحساب: ' + calculation.error + '. يدعم المحرك العمليات الأساسية والمعادلات الخطية البسيطة فقط.', origin: 'calculation', references: []}
        : {text: calculation.text, origin: 'calculation', references: []};
    }
    var intent = classifyIntent(question);
    var semanticModel = options.semanticModel || null;
    var found = E.search(docs, question, 18, options.priorQuestion || '', options.termWeights || null, semanticModel);
    // Treat a recognized summary request as an overview even if the lexical
    // retrieval path returns few topical words after stop-word filtering.
    if (intent === 'summary') found.overview = true;
    var selected = collectEvidence(docs, found, question, limit, semanticModel, intent);
    if (!selected.length && Knowledge && Array.isArray(options.knowledgeFacts)) {
      var knowledgeHits = Knowledge.search(options.knowledgeFacts, question, limit);
      if (knowledgeHits.length) {
        selected = knowledgeHits.map(function (hit) {
          return {text: hit.fact.excerpt, role: sentenceRole(hit.fact.excerpt),
            ref: {docId: hit.fact.docId, docName: hit.fact.docName, page: hit.fact.page,
              type: hit.fact.type || 'pdf', ocr: false}};
        });
      }
    }
    if (!selected.length) return {text: strict && !docs.length
      ? 'أضف مرجعًا أولًا؛ وضع المصادر فقط لا يجيب من خارجها.'
      : 'لم أجد أدلة كافية في مراجعك للإجابة عن هذا السؤال. جرّب صياغة أدق أو أضف مرجعًا يتناول الموضوع. لن أختلق إجابة أو مصدرًا غير موجود.', origin: 'miss', references: []};
    var built = buildAnswerText(selected, question, intent, limit);
    var queryTerms = (found.queryWords || E.words(question)).slice(0, 30);
    return {text: built.text, origin: 'source', references: built.references,
      queryTerms: queryTerms, intent: intent, semanticUsed: !!found.semanticUsed,
      evidenceCount: selected.length};
  }
  return {answer: answer, calculate: calculate, extractExpression: extractExpression, parseLinear: parseLinear,
    sentences: sentences, classifyIntent: classifyIntent, sentenceRole: sentenceRole};
}));
