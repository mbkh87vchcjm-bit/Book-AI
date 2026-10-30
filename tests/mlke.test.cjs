'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Lexicon = require('../app/src/main/assets/web/mlke-lexicon.js');
const Query = require('../app/src/main/assets/web/mlke-query.js');
const Translator = require('../app/src/main/assets/web/mlke-translator.js');
const Knowledge = require('../app/src/main/assets/web/mlke-knowledge.js');

test('MLKE Lexicon: lookups Arabic/English terms and expands query terms', () => {
  const lex = new Lexicon();
  const tcp = lex.lookupTerm('TCP');
  assert.ok(tcp);
  assert.equal(tcp.term_en, 'Transmission Control Protocol');

  const expanded = lex.expandQueryTerms('TCP');
  assert.ok(expanded.includes('TCP'));
  assert.ok(expanded.some(t => t.includes('التحكم')));

  const added = lex.addOrUpdate({
    term_ar: 'المنفذ',
    term_en: 'Port',
    abbreviation: 'PORT',
    domain: 'networking'
  });
  assert.ok(added);
  assert.equal(lex.lookupTerm('PORT').term_en, 'Port');
});

test('MLKE Query: analyzes language and classifies question intents', () => {
  assert.equal(Query.detectLanguage('ما هو TCP؟'), 'ar');
  assert.equal(Query.detectLanguage('What is DNS?'), 'en');

  assert.equal(Query.classifyIntent('ما هو TCP؟'), 'definition');
  assert.equal(Query.classifyIntent('ما وظيفة DNS؟'), 'function');
  assert.equal(Query.classifyIntent('قارن بين TCP وUDP'), 'comparison');
  assert.equal(Query.classifyIntent('ترجم هذه الفقرة'), 'translation');

  const parsed = Query.parseQuery('ما هو TCP؟');
  assert.equal(parsed.intent, 'definition');
  assert.ok(parsed.entities.includes('TCP'));
});

test('MLKE Translator: performs rule-based technical translation', () => {
  const res1 = Translator.translateSentence('TCP provides reliable data transmission between devices.');
  assert.ok(res1.translated.includes('يوفر'));
  assert.ok(res1.translated.length > 5);

  const res2 = Translator.translateSentence('DNS translates domain names into IP addresses.');
  assert.ok(res2.translated.includes('يحول'));
  assert.ok(res2.translated.includes('أسماء'));
});

test('MLKE Knowledge: extracts facts and infers structured comparison answers', () => {
  const kb = new Knowledge.KnowledgeBase();
  const facts = Knowledge.extractFactsFromSentence('TCP provides reliable data transmission.', 'Net.pdf', 5);
  assert.equal(facts.length, 1);
  kb.addFact(facts[0]);

  assert.equal(kb.queryFacts('TCP').length, 1);

  const queryObj = { intent: 'comparison', entities: ['TCP', 'UDP'] };
  const reply = Knowledge.inferAnswer(queryObj, [], kb);
  assert.ok(reply);
  assert.match(reply.text, /مقارنة بين TCP وUDP/);
});
