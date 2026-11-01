'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const A = require('../app/src/main/assets/web/local-answer.js');
const E = require('../app/src/main/assets/web/engine.js');
const docs = [{id:'book',name:'الفيزياء.pdf',type:'pdf',pages:[
  {page:1,text:'الطاقة هي القدرة على بذل شغل.'},
  {page:2,text:'الجاذبية قوة تجذب الأجسام نحو الأرض. تسقط الأجسام باتجاه الأرض.',ocr:true},
]}];

test('calculates Arabic numerals with operator precedence and safe parser', () => {
  assert.match(A.calculate('احسب ٢ + ٣ × ٤').text, /= 14/);
  assert.match(A.calculate('احسب (2+3)*4').text, /= 20/);
  assert.match(A.calculate('احسب -2^2').text, /= -4/);
  assert.match(A.calculate('احسب 50% * 100').text, /= 50/);
  assert.match(A.calculate('احسب 1 / 0').error, /صفر/);
});

test('solves a basic linear equation but refuses nonlinear math', () => {
  assert.match(A.calculate('حل 2س + 3 = 11').text, /س = 4/);
  assert.match(A.calculate('solve 3(x+2)=15').text, /س = 3/);
  assert.match(A.calculate('حل س*س=4').error, /غير خطية/);
});

test('does not execute code or extract unrelated numbers', () => {
  assert.equal(A.calculate('ما إجابة التمرين 2 في الصفحة 3؟'), null);
  assert.equal(A.calculate('process.exit(1) + 2'), null);
  assert.equal(A.calculate('2; alert(1)'), null);
});

test('answers from real source sentences with page and OCR provenance', () => {
  const result = A.answer({documents:docs,question:'ما هي الجاذبية؟',mode:'strict'});
  assert.equal(result.origin, 'source');
  assert.ok(result.references.length > 0);
  const ref = result.references[0];
  assert.equal(ref.docName, 'الفيزياء.pdf');
  assert.equal(ref.page, 2);
  assert.equal(ref.ocr, true);
  assert.ok(docs[0].pages[1].text.includes(ref.excerpt));
  assert.match(result.text, /الجاذبية/);
});

test('marks independent calculations and never invents a missing reference', () => {
  const calc = A.answer({documents:docs,question:'احسب 5+7',mode:'flexible'});
  assert.equal(calc.origin, 'calculation');
  assert.deepEqual(calc.references, []);
  const miss = A.answer({documents:docs,question:'ما التركيب الكيميائي لزحل؟',mode:'strict'});
  assert.equal(miss.origin, 'miss');
  assert.deepEqual(miss.references, []);
  const denied = A.answer({documents:[],question:'احسب 5+7',mode:'strict'});
  assert.equal(denied.origin, 'miss');
});

test('extractive summaries stay grounded in the actual page text', () => {
  const result = A.answer({documents:docs,question:'لخص المراجع',mode:'strict',maxSentences:2});
  assert.equal(result.origin,'source'); assert.equal(result.references.length,2);
  for (const ref of result.references) assert.ok(docs[0].pages.find(p=>p.page===ref.page).text.includes(ref.excerpt));
  assert.match(result.text, /ملخص مرجعي موسع/);
});

test('recognizes an answer problem from the source instead of guessing the exercise', () => {
  const notEqual = A.answer({documents:[],question:'احسب 2+2=5',mode:'flexible'});
  assert.equal(notEqual.origin,'calculation'); assert.match(notEqual.text,/≠/);
  const source = A.answer({documents:docs,question:'لماذا تسقط الأجسام نحو الأرض؟',mode:'flexible'});
  assert.equal(source.origin,'source');
  assert.equal(source.references[0].page,2);
  assert.match(source.references[0].excerpt,/الأرض/);
});

test('generates interactive study tools (quiz/MCQ and concept explanation)', () => {
  const mcq = A.answer({documents:docs,question:'أنشئ لي اسئلة اختبار مع خيارات صح ام خطا',mode:'strict'});
  assert.equal(mcq.origin, 'source');
  assert.match(mcq.text, /عبارة صحيحة أم خاطئة/);
  assert.ok(mcq.references.length > 0);

  const explain = A.answer({documents:docs,question:'اشرح لي مفهوم الطاقة والجاذبية',mode:'strict'});
  assert.equal(explain.origin, 'source');
  assert.match(explain.text, /إجابة مرجعية موسعة|شرح مرجعي موسع/);
  assert.ok(explain.evidenceCount >= 1);
  assert.ok(explain.references.length > 0);
});


test('detailed answer can retrieve a page-like body from sufficient evidence across many pages', () => {
  const pages = Array.from({length:30}, (_, i) => ({
    page: i + 1,
    text: 'Network routing selects paths for packets across connected networks. ' +
      'Router routing information directs packets to destination segment ' + (i + 1) + '.'
  }));
  const result = A.answer({
    documents: [{id:'routing-book',name:'Routing.pdf',type:'pdf',pages}],
    question: 'اشرح network routing بالتفصيل',
    mode: 'strict',
    maxSentences: 24
  });
  assert.equal(result.origin, 'source');
  assert.ok(result.evidenceCount > 5);
  assert.ok(result.references.length > 5);
  assert.ok(result.text.length > 1500);
});

test('Arabic-English retrieval does not discard passages found through BM25 expansion', () => {
  const docs = [{id:'dns',name:'DNS.pdf',type:'pdf',pages:[
    {page:7,text:'The Domain Name System (DNS) translates domain names into IP addresses. DNS helps users locate services by human-readable names.'}
  ]}];
  const result = A.answer({
    documents: docs,
    question: 'ما وظيفة نظام أسماء النطاقات DNS؟',
    mode: 'strict',
    maxSentences: 12
  });
  assert.equal(result.origin, 'source');
  assert.ok(result.references.some(ref => ref.page === 7));
  assert.match(result.text, /Domain Name System|DNS/);
});

test('comparison searches both terms independently and avoids false missing-reference claims', () => {
  const docs = [{id:'transport',name:'Transport.pdf',type:'pdf',pages:[
    {page:4,text:'TCP provides reliable and ordered data transmission between communicating hosts.'},
    {page:5,text:'UDP provides connectionless datagram delivery with low overhead.'},
    {page:6,text:'TCP detects lost data and retransmits it when necessary.'},
    {page:7,text:'UDP does not guarantee delivery or packet order at the transport layer.'}
  ]}];
  const result = A.answer({
    documents: docs,
    question: 'قارن بين TCP وUDP',
    mode: 'strict',
    maxSentences: 24
  });
  assert.equal(result.origin, 'source');
  assert.equal(result.intent, 'comparison');
  assert.match(result.text, /TCP/);
  assert.match(result.text, /UDP/);
  assert.doesNotMatch(result.text, /غير متوفر في المرجع/);
  assert.ok(result.references.some(ref => ref.page === 4));
  assert.ok(result.references.some(ref => ref.page === 5));
});


test('semantic evidence can enter a detailed answer without exact lexical overlap', () => {
  const docs = [{id:'semantic',name:'Semantic.pdf',type:'pdf',pages:[
    {page:1,text:'The gateway forwards datagrams through a route table.'},
    {page:2,text:'Bananas grow in tropical orchards.'}
  ]}];
  const model = {similarity: (question, passage) => passage.includes('gateway') ? 0.91 : 0.12};
  const result = A.answer({
    documents: docs, question: 'اشرح packet forwarding', mode: 'strict',
    maxSentences: 12, semanticModel: model
  });
  assert.equal(result.origin,'source');
  assert.ok(result.references.some(ref=>ref.page===1));
  assert.equal(result.semanticUsed,true);
});

test('groups detailed answer evidence under descriptive role headings', () => {
  const docs = [{id:'router',name:'Router.pdf',type:'pdf',pages:[
    {page:1,text:'A router is a network device that connects different networks.'},
    {page:2,text:'A router provides packet forwarding based on destination addresses.'},
    {page:3,text:'First, the router checks its routing table before sending a packet.'},
    {page:4,text:'For example, a router connects a local network to the Internet.'}
  ]}];
  const result = A.answer({
    documents:docs, question:'اشرح وظيفة router وكيف يعمل',
    mode:'strict', maxSentences:24
  });
  assert.equal(result.origin,'source');
  assert.match(result.text,/التعريف والفكرة الأساسية/);
  assert.match(result.text,/الوظيفة والاستخدام/);
  assert.match(result.text,/آلية العمل والخطوات/);
});


test('rejoins wrapped PDF visual lines into complete sentences', () => {
  const wrapped = 'A router forwards packets through\nits routing table to the correct\nnetwork destination. It then selects\nan outgoing interface.';
  const rebuilt = A.joinWrappedLines(wrapped);
  assert.match(rebuilt, /through its routing table to the correct network destination/);
  const parts = A.sentences(wrapped);
  assert.equal(parts.length, 2);
  assert.match(parts[0], /network destination/);
  assert.match(parts[1], /outgoing interface/);
});

test('main ideas summary samples later pages and more than one sentence per page', () => {
  const pages = Array.from({length:12}, (_, i) => ({
    page: i + 1,
    text: 'Topic ' + (i + 1) + ' explains the central mechanism and its important purpose. ' +
      'The same topic also describes practical use and a key limitation in the system.'
  }));
  const result = A.answer({
    documents:[{id:'ideas',name:'Ideas.pdf',type:'pdf',pages}],
    question:'ما أهم الأفكار في هذه المراجع؟',
    mode:'strict',
    maxSentences:8
  });
  assert.equal(result.origin,'source');
  assert.ok(result.references.some(ref=>ref.page >= 10), 'summary should include later document pages');
  assert.ok(result.evidenceCount >= 8, 'summary should collect multiple evidence sentences');
  assert.match(result.text,/Topic 12|Topic 11|Topic 10/);
});

test('retrieves relevant later chunks within a long single PDF page', () => {
  const filler = Array.from({length:90}, (_, i) =>
    'General networking information describes connected devices and communication services. ').join('');
  const lateText = 'The quasar gateway performs packet forwarding using a destination route table. ' +
    'This quasar mechanism selects the correct outgoing network interface for each datagram.';
  const result = A.answer({
    documents:[{id:'one-page',name:'LongPage.pdf',type:'pdf',pages:[{page:3,text:filler + lateText}]}],
    question:'اشرح quasar gateway packet forwarding بالتفصيل',
    mode:'strict',
    maxSentences:12
  });
  assert.equal(result.origin,'source');
  assert.match(result.text,/quasar gateway|quasar mechanism/);
  assert.ok(result.evidenceCount >= 1);
});

test('compares arbitrary Arabic topics even when they are absent from the built-in lexicon', () => {
  const docs=[{id:'concepts',name:'Concepts.pdf',type:'pdf',pages:[
    {page:4,text:'التخزين المؤقت يحتفظ بالبيانات المستخدمة كثيرًا لتقليل زمن الوصول.'},
    {page:5,text:'الذاكرة الافتراضية تسمح للبرامج باستخدام مساحة عناوين أكبر من الذاكرة الفعلية.'}
  ]}];
  const result=A.answer({
    documents:docs,
    question:'قارن بين التخزين المؤقت والذاكرة الافتراضية بالتفصيل',
    mode:'strict',
    maxSentences:24
  });
  assert.equal(result.origin,'source');
  assert.equal(result.intent,'comparison');
  assert.match(result.text,/التخزين المؤقت/);
  assert.match(result.text,/الذاكرة الافتراضية/);
  assert.ok(result.references.some(ref=>ref.page===4));
  assert.ok(result.references.some(ref=>ref.page===5));
});

test('retrieval failure is not presented as proof that a fact is absent from the document', () => {
  const result=A.answer({
    documents:[{id:'weak',name:'Weak.pdf',type:'pdf',pages:[{page:1,text:'The document contains only a short unrelated introduction.'}]}],
    question:'ما هو بروتوكول zentrix؟',
    mode:'strict'
  });
  assert.equal(result.origin,'miss');
  assert.match(result.text,/هذا لا يثبت أن المعلومة غير موجودة/);
});
