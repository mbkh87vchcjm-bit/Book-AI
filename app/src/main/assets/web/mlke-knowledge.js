/* Midad Language & Knowledge Engine (MLKE) — Knowledge Extractor, Knowledge Base & Inference Engine */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mlke-lexicon.js'), require('./mlke-translator.js'));
  else root.MlkeKnowledge = factory(root.MlkeLexicon, root.MlkeTranslator);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (LexiconClass, TranslatorModule) {
  'use strict';

  var lexicon = new LexiconClass();

  function KnowledgeBase() {
    this.facts = [];
  }

  KnowledgeBase.prototype.addFact = function (fact) {
    if (!fact || !fact.subject || !fact.relation) return false;
    this.facts.push({
      id: 'fact-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      subject: fact.subject,
      relation: fact.relation,
      object: fact.object || '',
      docName: fact.docName || '',
      page: fact.page || 1,
      sourceText: fact.sourceText || '',
      confidence: fact.confidence || 0.90
    });
    return true;
  };

  KnowledgeBase.prototype.queryFacts = function (subject) {
    var s = String(subject || '').toLowerCase();
    return this.facts.filter(function (f) {
      return f.subject.toLowerCase() === s || f.sourceText.toLowerCase().indexOf(s) >= 0;
    });
  };

  function extractFactsFromSentence(text, docName, page) {
    var str = String(text || '').trim();
    if (!str) return [];

    var facts = [];
    var matchDef = str.match(/^([A-Za-z0-9\s]+)\s+(is|provides|translates|contains|manages|controls)\s+(.+)$/i);
    if (matchDef) {
      facts.push({
        subject: matchDef[1].trim(),
        relation: matchDef[2].trim().toLowerCase(),
        object: matchDef[3].trim(),
        docName: docName,
        page: page,
        sourceText: str,
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

      var tableLines = [
        'مقارنة بين ' + e1 + ' و' + e2 + ' (بناءً على المراجع المستخرجة):',
        '| الخاصية | ' + e1 + ' | ' + e2 + ' |',
        '| --- | --- | --- |'
      ];

      var r1 = f1.length ? f1[0].sourceText : 'غير متوفر في المرجع';
      var r2 = f2.length ? f2[0].sourceText : 'غير متوفر في المرجع';
      tableLines.push('| الوصف والوظيفة | ' + r1 + ' | ' + r2 + ' |');

      return {
        text: tableLines.join('\n'),
        origin: 'source',
        references: f1.concat(f2).map(function (f) {
          return { docName: f.docName, page: f.page, excerpt: f.sourceText, ocr: false };
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
