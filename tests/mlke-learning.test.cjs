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

test('Per-answer feedback is linked, idempotent, reversible, and persistent', () => {
  const store = new LearningStore();
  const experienceId = store.recordExperience({
    messageId: 'message-1', question: 'DNS and routing', answerText: 'A grounded answer'
  });
  const record = store.getExperience(experienceId);
  assert.equal(record.messageId, 'message-1');
  assert.equal(record.userRating, null);

  const positive = store.rateExperience(experienceId, 'positive', ['dns', 'routing', 'dns']);
  assert.equal(positive.changed, true);
  assert.equal(positive.updatedTerms, 2);
  assert.equal(store.getTermWeight('dns'), 1.05);
  assert.equal(store.getTermWeight('routing'), 1.05);

  const repeated = store.rateExperience(experienceId, 'positive', ['dns', 'routing']);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.reason, 'unchanged');
  assert.equal(store.getTermWeight('dns'), 1.05);

  const changed = store.rateExperience(experienceId, 'negative', ['dns', 'routing']);
  assert.equal(changed.changed, true);
  assert.equal(store.getTermWeight('dns'), 0.95);
  assert.equal(record.userRating, 'negative');

  const neutral = store.rateExperience(experienceId, 'neutral', ['dns', 'routing']);
  assert.equal(neutral.changed, true);
  assert.equal(store.getTermWeight('dns'), 1.0);

  const restored = new LearningStore(store.exportData());
  assert.equal(restored.getExperience(experienceId).userRating, 'neutral');
  assert.equal(restored.getExperience(experienceId).messageId, 'message-1');
  assert.equal(restored.getTermWeight('dns'), 1.0);
  assert.equal(restored.exportData().version, 2);
});

test('Feedback rejects invalid and unknown ratings and keeps learned weights bounded', () => {
  const store = new LearningStore();
  const id = store.recordExperience({question: 'security'});
  assert.equal(store.rateExperience(id, 'maybe', ['security']).reason, 'invalid-rating');
  assert.equal(store.rateExperience('missing', 'positive', ['security']).reason, 'not-found');
  assert.equal(store.getTermWeight('security'), 1.0);

  for (let i = 0; i < 50; i++) store.applyFeedback(['security'], true);
  assert.equal(store.getTermWeight('security'), 2.0);
  for (let i = 0; i < 80; i++) store.applyFeedback(['security'], false);
  assert.equal(store.getTermWeight('security'), 0.5);
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
