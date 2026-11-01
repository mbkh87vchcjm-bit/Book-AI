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
  assert.match(res.text, /ترجمة معجمية تقريبية/);
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


test('Arabic intent precedence: "ما هي أنواع..." is classification, not definition', () => {
  assert.equal(Query.classifyIntent('ما هي أنواع الشبكات؟'), 'classification');
  assert.equal(Query.classifyIntent('ماهي انواع قواعد البيانات'), 'classification');
});

test('Arabic colloquial question forms are recognized', () => {
  assert.equal(Query.classifyIntent('ايش وظيفة DNS؟'), 'function');
  assert.equal(Query.classifyIntent('وش الفرق بين TCP وUDP؟'), 'comparison');
  assert.equal(Query.classifyIntent('ليش نستخدم HTTPS؟'), 'cause');
  assert.equal(Query.classifyIntent('اشرح لي الذاكرة الافتراضية'), 'explanation');
});

test('Arabic question normalization handles diacritics, alef variants and Arabic-Indic digits', () => {
  assert.equal(Query.normalizeArabic('إِدَارَةُ الشَّبَكَات ١٢'), 'ادارة الشبكات 12');
});

test('Entity extraction prefers recognized multiword concepts and canonical abbreviations', () => {
  const lexicon = new Lexicon();
  assert.deepEqual(Query.extractEntities('ما وظيفة بروتوكول التحكم بالنقل؟', lexicon), ['TCP']);
  assert.deepEqual(Query.extractEntities('قارن بين TCP وUDP', lexicon), ['TCP', 'UDP']);
  assert.deepEqual(Query.extractEntities('ما هي الذاكرة الافتراضية؟', lexicon), ['الذاكرة الافتراضية']);
});

test('Language detection distinguishes Arabic, English, mixed and empty input', () => {
  assert.equal(Query.detectLanguage('ما وظيفة الشبكة؟'), 'ar');
  assert.equal(Query.detectLanguage('What is a network?'), 'en');
  assert.equal(Query.detectLanguage('شبكة Net'), 'mixed');
  assert.equal(Query.detectLanguage(''), 'unknown');
});
