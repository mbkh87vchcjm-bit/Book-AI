'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../app/src/main/assets/web/engine.js');

const reference = {
  id: 'course', name: 'الفيزياء.pdf', type: 'pdf', pages: [
    {page: 1, text: 'الطاقة هي القدرة على بذل شغل.'},
    {page: 2, text: 'الجاذبية قوة تجذب الأجسام نحو الأرض.'},
  ],
};

test('normalizes Arabic presentation forms, diacritics and digits for local search', () => {
  assert.equal(E.normalize('إِنَّ ٱلْقُوَّةَ ١٢٣'), 'ان القوه 123');
  assert.ok(E.words('ما هي الجاذبية؟').includes('جاذبيه'));
});

test('reassembles fragmented visual-order Arabic PDF glyphs', () => {
  const expected = 'الجاذبية هي قوة تجذب الأجسام نحو الأرض.';
  const items = Array.from(expected).reverse().map((str, i, arr) => ({
    str, dir: 'rtl', transform: [1, 0, 0, 1, i * 8, 0], hasEOL: i === arr.length - 1,
  }));
  assert.equal(E.extractPdfText(items), expected);
  // Normal RTL text items in logical order are not blindly reversed.
  assert.equal(E.extractPdfText([
    {str: 'الطاقة ', dir: 'rtl', transform: [1, 0, 0, 1, 20, 0]},
    {str: 'قدرة', dir: 'rtl', transform: [1, 0, 0, 1, 10, 0], hasEOL: true},
  ]), 'الطاقة قدرة');
});

test('extracts multiple lines and preserves presentation-form normalization', () => {
  assert.equal(E.extractPdfText([
    {str: 'First ', dir: 'ltr'}, {str: 'line', dir: 'ltr', hasEOL: true},
    {str: 'ﻻ', dir: 'rtl', hasEOL: true},
  ]), 'First line\nلا');
});

test('finds the real PDF page and never substitutes an arbitrary page for a miss', () => {
  const hit = E.search([reference], 'ما هي الجاذبية؟');
  assert.equal(hit.references.length, 1);
  assert.equal(hit.references[0].docId, 'course');
  assert.equal(hit.references[0].docName, 'الفيزياء.pdf');
  assert.equal(hit.references[0].page, 2);
  assert.equal(hit.references[0].text, reference.pages[1].text);
  assert.deepEqual(E.search([reference], 'المحيطات الزرقاء').references, []);
  assert.deepEqual(E.search([], 'الجاذبية').references, []);
  // A new one-word topic must not be suppressed by an unrelated previous turn.
  assert.equal(E.search([reference], 'ما هي الجاذبية؟', 3, 'خصائص البراكين').references[0].page, 2);
});

test('overview samples are marked as such and separated by page', () => {
  const result = E.search([reference], 'لخص هذه المراجع');
  assert.equal(result.overview, true);
  assert.deepEqual(result.references.map(r => r.page), [1, 2]);
});

test('long document chunks remain on the source page and overlap', () => {
  const words = Array.from({length: 500}, (_, i) => `word${i}`);
  const doc = {id: 'x', name: 'x.txt', type: 'text', pages: [{page: 1, text: words.join(' ')}]};
  const chunks = E.chunksForDocument(doc, 200, 50);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every(c => c.docId === 'x' && c.page === 1 && doc.pages[0].text.includes(c.text)));
  assert.ok(chunks[1].offset < chunks[0].offset + chunks[0].text.length);
});

test('search carries the OCR origin through to the real page reference', () => {
  const scanned = {id: 's', name: 'scan.pdf', type: 'pdf', pages: [
    {page: 7, text: 'الجاذبية قوة تجذب الأجسام نحو الأرض.', ocr: true},
  ]};
  const [hit] = E.search([scanned], 'ما هي الجاذبية؟').references;
  assert.equal(hit.page, 7);
  assert.equal(hit.ocr, true);
  assert.ok(scanned.pages[0].text.includes(hit.text));
});


test('preserves Arabic originals and adds conservative stem variants', () => {
  const tokens = E.words('البيانات والبرنامج والبرمجيات');
  assert.ok(tokens.includes('البيانات'));
  assert.ok(tokens.includes('بيانات'));
  assert.ok(tokens.includes('بيان'));
  assert.ok(tokens.includes('والبرنامج'));
  assert.ok(tokens.includes('برنامج'));
  assert.ok(!tokens.includes('يانات'));
  assert.ok(!tokens.includes('رنامج'));
});

test('preserves programming and network identifiers as searchable tokens', () => {
  const tokens = E.words('C++ و C# و TCP/IP و 5G و IEEE 802.11ac');
  for (const token of ['c++','c#','tcp/ip','5g','ieee','802.11ac']) {
    assert.ok(tokens.includes(token), 'missing technical token ' + token);
  }
});

test('semantic reranking can retrieve a high-confidence related passage without exact terms', () => {
  const docs = [{id:'semantic',name:'Semantic.pdf',type:'pdf',pages:[
    {page:1,text:'The gateway forwards datagrams through a route table.'},
    {page:2,text:'Bananas grow in tropical orchards.'}
  ]}];
  const model = {similarity: (question, passage) => passage.includes('gateway') ? 0.91 : 0.12};
  const result = E.search(docs,'explain packet forwarding',10,'',null,model);
  assert.ok(result.references.some(ref => ref.page === 1));
  assert.ok(result.semanticUsed);
});
