/* Midad Language & Knowledge Engine (MLKE) — Knowledge Extractor, Knowledge Base & Inference Engine */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mlke-lexicon.js'), require('./mlke-translator.js'));
  else root.MlkeKnowledge = factory(root.MlkeLexicon, root.MlkeTranslator);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (LexiconClass, TranslatorModule) {
  'use strict';

  function KnowledgeBase(initialFacts) {
    this.facts = Array.isArray(initialFacts) ? initialFacts : [];
  }

  KnowledgeBase.prototype.addFact = function (fact) {
    if (!fact || !fact.subject || !fact.relation) return false;
    var exists = this.facts.some(function (f) {
      return f.subject.toLowerCase() === fact.subject.toLowerCase() &&
             f.relation.toLowerCase() === fact.relation.toLowerCase() &&
             f.object.toLowerCase() === (fact.object || '').toLowerCase() &&
             f.docId === fact.docId && f.page === fact.page;
    });
    if (exists) return false;

    this.facts.push({
      id: fact.id || ('fact-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
      subject: fact.subject,
      relation: fact.relation, // is_a, performs, contains, manages, controls, etc.
      object: fact.object || '',
      docId: fact.docId || null,
      docName: fact.docName || '',
      page: fact.page !== undefined && fact.page !== null ? fact.page : null,
      chunkId: fact.chunkId || null,
      offset: fact.offset || 0,
      sourceText: fact.sourceText || '',
      translatedText: fact.translatedText || '',
      status: fact.status || 'evidence-backed', // candidate, evidence-backed, user-confirmed, rejected
      confidence: fact.confidence || 0.90
    });
    return true;
  };

  KnowledgeBase.prototype.queryFacts = function (subject) {
    var s = String(subject || '').toLowerCase();
    return this.facts.filter(function (f) {
      return f.status !== 'rejected' && (f.subject.toLowerCase() === s || f.sourceText.toLowerCase().indexOf(s) >= 0);
    });
  };

  KnowledgeBase.prototype.removeDocFacts = function (docId) {
    if (!docId) return;
    this.facts = this.facts.filter(function (f) { return f.docId !== docId; });
  };

  KnowledgeBase.prototype.getAllTerms = function () {
    var terms = new Map();
    this.facts.forEach(function (f) {
      if (f.status === 'rejected') return;
      var key = f.subject.toLowerCase();
      if (!terms.has(key)) {
        terms.set(key, {
          term: f.subject,
          definition: f.relation + ' ' + f.object,
          sourceText: f.sourceText,
          docName: f.docName,
          page: f.page,
          status: f.status
        });
      }
    });
    return Array.from(terms.values());
  };

  function extractFactsFromSentence(text, docName, page, docId) {
    var str = String(text || '').trim();
    if (!str) return [];

    var facts = [];
    var matchDef = str.match(/^([A-Za-z0-9\s]+)\s+(is|provides|translates|contains|manages|controls|executes|identifies)\s+(.+)$/i);
    if (matchDef) {
      var rel = matchDef[2].trim().toLowerCase();
      var relName = rel === 'is' ? 'is_a' : (rel === 'provides' ? 'performs' : (rel === 'contains' ? 'contains' : rel));
      facts.push({
        subject: matchDef[1].trim(),
        relation: relName,
        object: matchDef[3].trim(),
        docId: docId || null,
        docName: docName || '',
        page: page !== undefined && page !== null ? page : null,
        sourceText: str,
        status: 'evidence-backed',
        confidence: 0.92
      });
    }

    return facts;
  }

  function inferAnswer(queryObj, documents, kb) {
    var intent = queryObj.intent;
    var entities = queryObj.entities || [];

    if (intent === 'comparison' && entities.length >= 2) {
      var e1 = entities[0], e2 = entities[1];
      var f1 = kb.queryFacts(e1), f2 = kb.queryFacts(e2);

      // Check conflicting sources within same entity
      var conflicts1 = f1.filter(function (x, i, arr) {
        return arr.some(function (y, j) { return i !== j && x.relation === y.relation && x.object !== y.object; });
      });

      var tableHtml = '<div class="table-container"><table>' +
        '<thead><tr><th>الموضوع</th><th>الوصف والوظيفة</th><th>المصدر</th><th>الصفحة</th></tr></thead><tbody>';

      if (f1.length) {
        tableHtml += '<tr><td><strong>' + e1 + '</strong></td><td>' + f1[0].sourceText + '</td><td>' + f1[0].docName + '</td><td>' + (f1[0].page || 'غير محدد') + '</td></tr>';
      } else {
        tableHtml += '<tr><td><strong>' + e1 + '</strong></td><td colspan="3">غير متوفر في المرجع</td></tr>';
      }

      if (f2.length) {
        tableHtml += '<tr><td><strong>' + e2 + '</strong></td><td>' + f2[0].sourceText + '</td><td>' + f2[0].docName + '</td><td>' + (f2[0].page || 'غير محدد') + '</td></tr>';
      } else {
        tableHtml += '<tr><td><strong>' + e2 + '</strong></td><td colspan="3">غير متوفر في المرجع</td></tr>';
      }

      tableHtml += '</tbody></table></div>';

      var desc = 'مقارنة بين ' + e1 + ' و' + e2 + ' (بناءً على الحقائق المستخرجة من مراجعك):';
      if (conflicts1.length) {
        desc += '\n(تنبيه: يوجد اختلاف في توصيف ' + e1 + ' بين المصادر؛ تم توثيق كلا الموضعين).';
      }

      return {
        text: desc + '\n\n' + tableHtml,
        origin: 'source',
        references: f1.concat(f2).map(function (f) {
          return { docId: f.docId, docName: f.docName, page: f.page, excerpt: f.sourceText, ocr: false };
        })
      };
    }

    return null;
  }

  return {
    KnowledgeBase: KnowledgeBase,
    extractFactsFromSentence: extractFactsFromSentence,
    inferAnswer: inferAnswer
  };
}));
