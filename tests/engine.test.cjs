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


test('reconstructs Latin word gaps and preserves Arabic PDF spacing', () => {
  assert.equal(E.extractPdfText([
    {str:'Distributed',dir:'ltr',transform:[1,0,0,1,10,100],width:68,height:12},
    {str:'Systems',dir:'ltr',transform:[1,0,0,1,82,100],width:40,height:12,hasEOL:true},
  ]), 'Distributed Systems');

  assert.equal(E.extractPdfText([
    {str:'نظام ',dir:'rtl',transform:[1,0,0,1,100,100],width:22,height:12},
    {str:'التشغيل',dir:'rtl',transform:[1,0,0,1,70,100],width:30,height:12,hasEOL:true},
  ]), 'نظام التشغيل');

  // A large geometric gap alone must not split fragmented Arabic word items.
  assert.equal(E.extractPdfText([
    {str:'ال',dir:'rtl',transform:[1,0,0,1,100,100],width:12,height:12},
    {str:'جاذبية',dir:'rtl',transform:[1,0,0,1,70,100],width:20,height:12,hasEOL:true},
  ]), 'الجاذبية');
});


test('does not split adjacent glyph fragments or add spaces before punctuation', () => {
  assert.equal(E.extractPdfText([
    {str:'Distri',dir:'ltr',transform:[1,0,0,1,10,100],width:30,height:12},
    {str:'buted',dir:'ltr',transform:[1,0,0,1,40,100],width:25,height:12,hasEOL:true},
  ]), 'Distributed');

  assert.equal(E.extractPdfText([
    {str:'Router',dir:'ltr',transform:[1,0,0,1,10,100],width:30,height:12},
    {str:',',dir:'ltr',transform:[1,0,0,1,40,100],width:3,height:12},
    {str:'device',dir:'ltr',transform:[1,0,0,1,47,100],width:30,height:12,hasEOL:true},
  ]), 'Router, device');
});

test('detects a new PDF text line from baseline geometry even without hasEOL', () => {
  assert.equal(E.extractPdfText([
    {str:'First',dir:'ltr',transform:[1,0,0,1,10,100],width:22,height:12},
    {str:'line',dir:'ltr',transform:[1,0,0,1,35,100],width:20,height:12},
    {str:'Second',dir:'ltr',transform:[1,0,0,1,10,82],width:30,height:12},
    {str:'line',dir:'ltr',transform:[1,0,0,1,43,82],width:20,height:12},
  ]), 'First line\nSecond line');
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


test('character TF-IDF retrieves a close Arabic spelling variant when BM25 has no exact token', () => {
  const docs = [{id:'typo',name:'Arabic.pdf',type:'pdf',pages:[
    {page:1,text:'التوجية في الشبكات يساعد على اختيار المسار المناسب.'},
    {page:2,text:'قواعد البيانات تخزن السجلات في جداول مترابطة.'}
  ]}];
  const result = E.search(docs, 'التوجيه', 5);
  assert.equal(result.references[0].page, 1);
  assert.ok(result.retrievalStats.character > 0);
  assert.ok(result.retrievalDiagnostics[0].characterRank > 0);
});

test('ordered phrase matching contributes a distinct retrieval signal', () => {
  const docs = [{id:'phrase',name:'Protocols.pdf',type:'pdf',pages:[
    {page:1,text:'بروتوكول في الشبكات يختار المسار ويعمل على التحكم بمرور البيانات ونقلها.'},
    {page:2,text:'بروتوكول التحكم بالنقل Transmission Control Protocol يوفر نقلًا موثوقًا.'}
  ]}];
  const result = E.search(docs, 'بروتوكول التحكم بالنقل', 5);
  assert.ok(result.retrievalStats.phrase > 0);
  assert.equal(result.references[0].page, 2);
  assert.equal(result.retrievalDiagnostics[0].phraseMatch, true);
});

test('reciprocal rank fusion promotes a result supported by independent retrievers', () => {
  const fused = E.reciprocalRankFusion([
    [{index:0,signal:'bm25'},{index:1,signal:'bm25'}],
    [{index:1,signal:'character'},{index:2,signal:'character'}],
    [{index:1,signal:'phrase'}]
  ]);
  assert.equal(fused[0].index, 1);
  assert.equal(fused[0].ranks.bm25, 2);
  assert.equal(fused[0].ranks.character, 1);
  assert.equal(fused[0].ranks.phrase, 1);
});

test('hybrid retrieval preserves BM25 matches and reports component statistics', () => {
  const result = E.search([reference], 'الجاذبية', 5);
  assert.equal(result.references[0].page, 2);
  assert.ok(result.retrievalStats.bm25 > 0);
  assert.ok(Array.isArray(result.retrievalDiagnostics));
  assert.ok(result.retrievalDiagnostics[0].fusedScore > 0);
});

test('character n-grams do not turn unrelated short references into matches', () => {
  const docs = [{id:'tiny',name:'Tiny.pdf',type:'pdf',pages:[
    {page:1,text:'الفيزياء تدرس الطاقة والحركة والقوة.'},
    {page:2,text:'قواعد البيانات تنظم السجلات والجداول.'}
  ]}];
  assert.deepEqual(E.search(docs, 'zzqxvplm', 5).references, []);
});


test('structure-aware chunks preserve headings, bullets, offsets and page provenance', () => {
  const source = '# Routing\nRouting selects a path for packets.\n\n• Static routing uses fixed routes.\n• Dynamic routing learns routes.';
  const doc = {id:'structured',name:'Networks.pdf',type:'pdf',pages:[{page:9,text:source,ocr:true}]};
  const chunks = E.chunksForDocument(doc, 80, 12);
  assert.ok(chunks.some(c => c.structure === 'heading' && c.text === '# Routing'));
  assert.equal(chunks.filter(c => c.structure === 'bullet').length, 2);
  for (const chunk of chunks) {
    assert.equal(source.slice(chunk.offset, chunk.endOffset), chunk.text);
    assert.equal(chunk.page, 9);
    assert.equal(chunk.docId, 'structured');
    assert.equal(chunk.ocr, true);
  }
});

test('structure-aware chunking splits long paragraphs with overlapping source offsets', () => {
  const source = 'This is sentence one with enough words. This is sentence two with enough words. This is sentence three with enough words.';
  const chunks = E.chunksForDocument({id:'long',name:'long.txt',type:'text',pages:[{page:2,text:source}]}, 55, 15);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => source.slice(c.offset,c.endOffset) === c.text));
  assert.ok(chunks[1].offset < chunks[0].endOffset);
});

test('structure-aware chunking returns no chunks for empty pages', () => {
  assert.deepEqual(E.chunksForDocument({id:'empty',pages:[{page:1,text:'  \n  '}] }), []);
});

const AnswerForMmr = require('../app/src/main/assets/web/local-answer.js');
function mmrItem(text, score, order, page = 1) {
  return {text,score,order,ref:{docId:'doc',docName:'doc.pdf',page}};
}

test('MMR rejects near-duplicate evidence when a relevant distinct passage exists', () => {
  const selected = AnswerForMmr.selectDiverseItems([
    mmrItem('Routing selects the best path for network packets.',10,0),
    mmrItem('Routing selects the best path for network packets efficiently.',9.8,1),
    mmrItem('A router forwards packets between different networks.',8,2)
  ],2,0.72);
  assert.equal(selected.length,2);
  assert.ok(selected.some(x => x.order === 2));
});

test('MMR lambda one preserves pure relevance ranking', () => {
  const selected = AnswerForMmr.selectDiverseItems([
    mmrItem('Database tables store related records.',10,0),
    mmrItem('Database tables store related records in rows.',9,1)
  ],1,1);
  assert.equal(selected[0].order,0);
});

test('MMR handles one candidate and empty results', () => {
  assert.equal(AnswerForMmr.selectDiverseItems([mmrItem('A single useful passage.',3,0)],4).length,1);
  assert.deepEqual(AnswerForMmr.selectDiverseItems([],5),[]);
});

test('MMR lambda zero favors lexical novelty after the first result', () => {
  const selected = AnswerForMmr.selectDiverseItems([
    mmrItem('TCP provides reliable transport between hosts.',10,0),
    mmrItem('TCP provides reliable transport between network hosts.',9,1),
    mmrItem('DNS resolves a domain name to an IP address.',2,2)
  ],2,0);
  assert.equal(selected.length,2);
  assert.equal(selected[1].order,2);
});
