'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Lexicon = require('../app/src/main/assets/web/mlke-lexicon.js');
const Query = require('../app/src/main/assets/web/mlke-query.js');
const Translator = require('../app/src/main/assets/web/mlke-translator.js');
const Knowledge = require('../app/src/main/assets/web/mlke-knowledge.js');
const Answer = require('../app/src/main/assets/web/local-answer.js');

test('MLKE Integration: Arabic question on English PDF passage ("ما وظيفة DNS؟" on page 7)', () => {
  const englishDoc = [{
    id: 'doc1',
    name: 'Networking.pdf',
    type: 'pdf',
    pages: [
      { page: 1, text: 'Introduction to Networking.' },
      { page: 7, text: 'DNS translates domain names into IP addresses.' }
    ]
  }];

  const res = Answer.answer({
    documents: englishDoc,
    question: 'ما وظيفة DNS؟',
    mode: 'strict'
  });

  assert.equal(res.origin, 'source');
  assert.equal(res.references.length, 1);
  assert.equal(res.references[0].docName, 'Networking.pdf');
  assert.equal(res.references[0].page, 7);
  assert.match(res.text, /الترجمة/);
  assert.match(res.text, /DNS translates domain names into IP addresses/);
});

test('MLKE Integration: Arabic multiword phrase ("ما وظيفة بروتوكول التحكم بالنقل؟")', () => {
  const doc = [{
    id: 'doc2',
    name: 'Protocols.pdf',
    type: 'pdf',
    pages: [{ page: 3, text: 'TCP provides reliable data transmission between devices.' }]
  }];

  const res = Answer.answer({
    documents: doc,
    question: 'ما وظيفة بروتوكول التحكم بالنقل؟',
    mode: 'strict'
  });

  assert.equal(res.origin, 'source');
  assert.equal(res.references[0].page, 3);
  assert.match(res.text, /يوفر/);
});

test('MLKE Integration: Side-by-side comparison ("قارن بين TCP وUDP")', () => {
  const doc = [{
    id: 'doc3',
    name: 'Comparison.pdf',
    type: 'pdf',
    pages: [
      { page: 1, text: 'TCP provides reliable data transmission.' },
      { page: 2, text: 'UDP contains fast data transmission.' }
    ]
  }];

  const res = Answer.answer({
    documents: doc,
    question: 'قارن بين TCP وUDP',
    mode: 'strict'
  });

  assert.equal(res.origin, 'source');
  assert.match(res.text, /مقارنة بين TCP وUDP/);
  assert.match(res.text, /الوصف والوظيفة/);
});

test('MLKE Integration: Missing evidence question returns explicit notice', () => {
  const doc = [{ id: 'd', name: 'a.pdf', type: 'pdf', pages: [{ page: 1, text: 'Some unrelated text.' }] }];
  const res = Answer.answer({ documents: doc, question: 'ما عيوب بروتوكول البوتسواني؟', mode: 'strict' });
  assert.equal(res.origin, 'miss');
  assert.match(res.text, /لم أجد معلومات كافية/);
});
