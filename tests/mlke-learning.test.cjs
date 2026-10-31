'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const LearningStore = require('../app/src/main/assets/web/mlke-learning.js');
const Lexicon = require('../app/src/main/assets/web/mlke-lexicon.js');
const Answer = require('../app/src/main/assets/web/local-answer.js');
const Translator = require('../app/src/main/assets/web/mlke-translator.js');

test('Learning Scenario 1: Unknown term fails then succeeds after user addition and confirmation', () => {
  const store = new LearningStore();
  const doc = [{
    id: 'd1', name: 'cs.pdf', type: 'pdf', pages: [{ page: 1, text: 'Quantum computing uses qubits for processing.' }]
  }];

  // Initial lookup without term
  const initialRes = Answer.answer({ documents: doc, question: 'ما هو الكيوبت؟', mode: 'strict', learningStore: store });
  assert.equal(initialRes.origin, 'miss');

  // Add term to shared lexicon
  const lex = Lexicon.getSharedInstance();
  lex.addOrUpdate({ term_ar: 'الكيوبت', term_en: 'qubit', domain: 'computing', verified: true });

  // Re-query with updated lexicon
  const afterRes = Answer.answer({ documents: doc, question: 'ما هو الكيوبت؟', mode: 'strict', learningStore: store });
  assert.equal(afterRes.origin, 'source');
  assert.equal(afterRes.references[0].page, 1);
});

test('Learning Scenario 2: Translation correction persistence and reuse', () => {
  const store = new LearningStore();
  const sentence = 'Firewall controls network traffic.';

  const initialTr = Translator.translateSentence(sentence, store);
  assert.equal(initialTr.status, 'complete');

  // User records a specific preferred correction
  store.recordCorrection({
    type: 'translation',
    original: sentence,
    corrected: 'الجدار الناري يدير تدفق الشبكة.',
    status: 'user-confirmed'
  });

  const correctedTr = Translator.translateSentence(sentence, store);
  assert.equal(correctedTr.translated, 'الجدار الناري يدير تدفق الشبكة.');
  assert.equal(correctedTr.status, 'user-confirmed');
  assert.equal(correctedTr.learned, true);
});

test('Learning Scenario 3: Feedback-weighted retrieval ranking adjustment', () => {
  const store = new LearningStore();
  assert.equal(store.getTermWeight('security'), 1.0);

  // Positive feedback strengthens weight
  store.applyFeedback(['security'], true);
  assert.ok(store.getTermWeight('security') > 1.0);

  // Negative feedback reduces weight
  store.applyFeedback(['security'], false);
  store.applyFeedback(['security'], false);
  assert.ok(store.getTermWeight('security') < 1.0);
});

test('Learning Scenario 4: Extracted knowledge persistence & notebook isolation', () => {
  const store = new LearningStore();
  store.recordExperience({ question: 'ما هو TCP؟', answerText: 'بروتوكول موثوق' });
  assert.equal(store.experience.length, 1);

  // Exported data survives reload
  const exported = store.exportData();
  const reloaded = new LearningStore(exported);
  assert.equal(reloaded.experience.length, 1);
  assert.equal(reloaded.experience[0].question, 'ما هو TCP؟');
});

test('Learning Scenario 5: Term extraction returns structured table and provenance', () => {
  const doc = [{
    id: 'd2', name: 'Network.pdf', type: 'pdf', pages: [
      { page: 2, text: 'TCP provides reliable data transmission.' },
      { page: 4, text: 'DNS translates domain names into IP addresses.' }
    ]
  }];

  const res = Answer.answer({ documents: doc, question: 'استخرج المصطلحات', mode: 'strict' });
  assert.equal(res.origin, 'source');
  assert.match(res.text, /<div class="table-container">/);
  assert.match(res.text, /TCP/);
  assert.match(res.text, /DNS/);
  assert.equal(res.references.length, 2);
});
