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


test('preserves original Arabic letters while adding conservative stem variants', () => {
  const data = E.words('البيانات والبرنامج والبرمجيات');
  assert.ok(data.includes('البيانات'));
  assert.ok(data.includes('بيانات'));
  assert.ok(data.includes('بيان'));
  assert.ok(data.includes('والبرنامج'));
  assert.ok(data.includes('برنامج'));
  const definiteProgram = E.words('البرنامج');
  assert.ok(definiteProgram.includes('البرنامج'));
  assert.ok(definiteProgram.includes('برنامج'));
  assert.ok(!data.includes('يانات'));
  assert.ok(!data.includes('رنامج'));
});

test('matches common singular/plural Arabic technical forms without neural models', () => {
  const doc = {id: 'n', name: 'networking.pdf', type: 'pdf', pages: [
    {page: 9, text: 'الشبكة العصبية نظام حسابي يتكون من وحدات مترابطة.'}
  ]};
  const result = E.search([doc], 'اشرح الشبكات العصبية');
  assert.equal(result.references.length, 1);
  assert.equal(result.references[0].page, 9);
});

test('preserves programming languages and network identifiers as searchable tokens', () => {
  const tokens = E.words('C++ و C# و TCP/IP و 5G و IEEE 802.11ac');
  for (const token of ['c++', 'c#', 'tcp/ip', '5g', 'ieee', '802.11ac']) {
    assert.ok(tokens.includes(token), `missing token ${token}`);
  }
  const doc = {id: 'tech', name: 'tech.txt', type: 'text', pages: [
    {page: 4, text: 'The course introduces C++ programming and TCP/IP networking.'}
  ]};
  assert.equal(E.search([doc], 'C++').references[0].page, 4);
  assert.equal(E.search([doc], 'TCP/IP').references[0].page, 4);
});


test('uses BM25 term frequency and document-length normalization', () => {
  const docs = [{id: 'a', name: 'a.txt', type: 'text', pages: [
    {page: 1, text: 'network network network network network'}
  ]}, {id: 'b', name: 'b.txt', type: 'text', pages: [
    {page: 1, text: 'network with several other technical words about computer systems'}
  ]}];
  const result = E.search(docs, 'network', 2);
  assert.equal(result.references.length, 2);
  assert.equal(result.references[0].docId, 'a');
});

test('expands selected Arabic technical phrases to their English equivalents', () => {
  const english = {id: 'ai-en', name: 'ai.pdf', type: 'pdf', pages: [
    {page: 8, text: 'Artificial intelligence systems can learn patterns from data.'}
  ]};
  const result = E.search([english], 'ما هو الذكاء الاصطناعي؟');
  assert.equal(result.references.length, 1);
  assert.equal(result.references[0].page, 8);
  assert.ok(result.queryWords.includes('artificial'));
  assert.ok(result.queryWords.includes('intelligence'));
});

test('does not confuse TCP/IP with the standalone TCP acronym expansion', () => {
  const doc = {id: 'net', name: 'net.txt', type: 'text', pages: [
    {page: 6, text: 'TCP/IP is a protocol suite for internetwork communication.'}
  ]};
  const result = E.search([doc], 'TCP/IP');
  assert.equal(result.references.length, 1);
  assert.deepEqual(result.queryWords, ['tcp/ip']);
});


test('preserves single-digit numeric tokens for versioned and numbered technical references', () => {
  assert.ok(E.words('page 1 and 5G').includes('1'));
  const doc = {id:'num',name:'standards.pdf',type:'pdf',pages:[
    {page:2,text:'The standard is version 1 and applies to this system.'}
  ]};
  assert.equal(E.search([doc],'version 1').references[0].page,2);
});


test('bounded local term feedback changes BM25 ordering without exceeding limits', () => {
  const docs = [
    {id:'security',name:'security.txt',type:'text',pages:[{page:1,text:'security security network'}]},
    {id:'network',name:'network.txt',type:'text',pages:[{page:1,text:'security network network'}]}
  ];
  const networkFavored = E.search(docs,'security network',2,'',{security:0.75,network:1.5});
  const securityFavored = E.search(docs,'security network',2,'',{security:1.5,network:0.75});
  assert.equal(networkFavored.references[0].docId,'network');
  assert.equal(securityFavored.references[0].docId,'security');
  const extreme = E.search(docs,'security network',2,'',{security:99,network:-20});
  assert.equal(extreme.references[0].docId,'security');
});
