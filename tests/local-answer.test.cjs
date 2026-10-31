'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const A = require('../app/src/main/assets/web/local-answer.js');
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
  assert.match(result.text, /ملخص اقتباسي/);
});

test('recognizes an answer problem from the source instead of guessing the exercise', () => {
  const notEqual = A.answer({documents:[],question:'احسب 2+2=5',mode:'flexible'});
  assert.equal(notEqual.origin,'calculation'); assert.match(notEqual.text,/≠/);
  const source = A.answer({documents:docs,question:'لماذا تسقط الأجسام نحو الأرض؟',mode:'flexible'});
  assert.equal(source.origin,'source');
  assert.equal(source.references[0].page,2);
  assert.match(source.references[0].excerpt,/الأرض/);
});


test('answers an Arabic question from an English source using curated bilingual retrieval', () => {
  const englishDocs = [{id:'ai',name:'Artificial-Intelligence.pdf',type:'pdf',pages:[
    {page:8,text:'Artificial intelligence systems can learn patterns from data.'}
  ]}];
  const result = A.answer({documents:englishDocs,question:'ما هو الذكاء الاصطناعي؟',mode:'strict'});
  assert.equal(result.origin,'source');
  assert.equal(result.references[0].page,8);
  assert.match(result.references[0].excerpt,/Artificial intelligence/);
});

test('answers an English question from an Arabic source using curated bilingual retrieval', () => {
  const arabicDocs = [{id:'nn',name:'Networks.pdf',type:'pdf',pages:[
    {page:5,text:'الشبكة العصبية نظام حسابي يتكون من وحدات مترابطة.'}
  ]}];
  const result = A.answer({documents:arabicDocs,question:'What is a neural network?',mode:'strict'});
  assert.equal(result.origin,'source');
  assert.equal(result.references[0].page,5);
  assert.match(result.references[0].excerpt,/الشبكة العصبية/);
});



test('overview summary samples the beginning, middle and end of long references', () => {
  const pages = Array.from({length:125}, (_, index) => ({
    page:index + 1,
    text:'The chapter on topic ' + (index + 1) + ' explains a useful scientific principle for learners.'
  }));
  const result = A.answer({documents:[{id:'long',name:'LongBook.pdf',type:'pdf',pages}],question:'لخص المرجع',mode:'strict',maxSentences:5});
  assert.equal(result.origin,'source');
  assert.equal(result.references.length,5);
  const pageNumbers = result.references.map(ref=>ref.page);
  assert.equal(pageNumbers[0],1);
  assert.equal(pageNumbers[4],125);
  assert.ok(pageNumbers[2] >= 55 && pageNumbers[2] <= 70);
  assert.equal(new Set(pageNumbers).size,5);
});

test('overview summary represents multiple references instead of only the first book', () => {
  const docs = [
    {id:'a',name:'A.pdf',type:'pdf',pages:Array.from({length:40},(_,i)=>({page:i+1,text:'Document A chapter ' + (i+1) + ' introduces a distinct scientific concept.'}))},
    {id:'b',name:'B.pdf',type:'pdf',pages:[{page:7,text:'Document B explains an important and separate technical concept.'}]}
  ];
  const result = A.answer({documents:docs,question:'لخص المراجع',mode:'strict',maxSentences:5});
  assert.equal(result.origin,'source');
  assert.ok(result.references.some(ref=>ref.docId==='b'));
});


test('source answers expose lexical query terms used for local feedback', () => {
  const docs = [{id:'d',name:'network.pdf',type:'pdf',pages:[{page:4,text:'Internet Protocol (IP) provides addressing for packets across networks.'}]}];
  const result = A.answer({documents:docs,question:'ما هو بروتوكول الانترنت؟',mode:'strict'});
  assert.equal(result.origin,'source');
  assert.ok(Array.isArray(result.queryTerms));
  assert.ok(result.queryTerms.includes('بروتوكول'));
  assert.ok(result.queryTerms.length <= 30);
});


test('answers from reviewed knowledge facts only and preserves source provenance',()=>{
 const KG=require('../app/src/main/assets/web/knowledge-graph.js');
 const facts=KG.extractDocument({id:'graph',name:'Networks.pdf',type:'pdf',pages:[{page:6,text:'The neural network is a computational model of connected units.'}]});
 const question='What is a neural network?';
 const pending=A.answer({documents:[],knowledgeFacts:facts,question,mode:'strict'});
 assert.equal(pending.origin,'miss');
 KG.applyReview(facts,facts[0].id,'user-confirmed');
 const approved=A.answer({documents:[],knowledgeFacts:facts,question,mode:'strict'});
 assert.equal(approved.origin,'source');assert.equal(approved.references[0].docName,'Networks.pdf');
 assert.equal(approved.references[0].page,6);assert.match(approved.references[0].excerpt,/neural network/);
});


test('overview sampling preserves source-order endpoints when sentence lengths vary', () => {
  const pages = Array.from({length:9}, (_, index) => ({
    page:index + 1,
    text: index === 0
      ? 'The opening page contains a brief defining sentence.'
      : index === 8
        ? 'The final page contains a brief concluding sentence.'
        : 'Page ' + (index + 1) + ' contains a much longer explanation with many additional scientific and technical details that should affect candidate scoring but must not change chronological overview sampling order.'
  }));
  const result = A.answer({documents:[{id:'ordered',name:'Ordered.pdf',type:'pdf',pages}],question:'لخص المرجع',mode:'strict',maxSentences:3});
  assert.equal(result.origin,'source');
  assert.deepEqual(result.references.map(ref=>ref.page),[1,5,9]);
});


test('builds a detailed structured answer from multiple evidence roles and pages', () => {
  const pages = [
    {page:1,text:'A computer network is a group of interconnected devices that exchange data.'},
    {page:2,text:'A network switch forwards frames to the destination device using its address.'},
    {page:3,text:'A router selects a path for packets between different networks.'},
    {page:4,text:'The data transfer process consists of sending, routing, and receiving packets.'},
    {page:5,text:'Each packet carries addressing information so the network can deliver it.'},
    {page:6,text:'For example, a home network connects computers, phones, and printers.'},
    {page:7,text:'Because switches reduce unnecessary traffic, local communication can be more efficient.'},
    {page:8,text:'However, network performance can decline when congestion increases.'}
  ];
  const result = A.answer({
    documents:[{id:'computer-net',name:'Computer Networks.pdf',type:'pdf',pages}],
    question:'اشرح كيف تعمل شبكات الحاسوب؟',
    mode:'strict',
    maxSentences:10
  });
  assert.equal(result.origin,'source');
  assert.equal(result.intent,'how');
  assert.ok(result.evidenceCount>=7,'only '+result.evidenceCount+' evidence sentences selected');
  assert.ok(result.references.length>=6);
  assert.match(result.text,/التعريف والفكرة الأساسية/);
  assert.match(result.text,/آلية العمل والخطوات/);
  assert.match(result.text,/أمثلة وتطبيقات/);
  assert.match(result.text,/الأسباب والنتائج/);
  assert.match(result.text,/القيود والنقاط التي يجب الانتباه لها/);
  assert.match(result.text,/\[1\]/);
  assert.equal(result.references[0].docName,'Computer Networks.pdf');
  assert.ok(result.references.every(ref=>Number.isInteger(ref.page)&&ref.page>0));
});

test('organizes TCP and UDP evidence for comparison without inventing a winner', () => {
  const docs=[{id:'protocols',name:'Transport.pdf',type:'pdf',pages:[
    {page:4,text:'TCP provides reliable, ordered data delivery between communicating hosts.'},
    {page:5,text:'UDP provides connectionless datagram delivery with low overhead.'},
    {page:6,text:'TCP detects lost data and retransmits it when needed.'},
    {page:7,text:'UDP does not guarantee delivery or order at the transport layer.'}
  ]}];
  const result=A.answer({documents:docs,question:'قارن بين TCP وUDP',mode:'strict',maxSentences:8});
  assert.equal(result.origin,'source');
  assert.equal(result.intent,'compare');
  assert.match(result.text,/TCP وUDP/);
  assert.ok(result.references.some(ref=>ref.page===4));
  assert.ok(result.references.some(ref=>ref.page===5));
  assert.ok(result.references.every(ref=>ref.docName==='Transport.pdf'));
});

test('question classification chooses different answer plans for why, how and define', () => {
  assert.equal(A.classifyIntent('لماذا نستخدم قواعد البيانات؟'),'why');
  assert.equal(A.classifyIntent('كيف يعمل التوجيه؟'),'how');
  assert.equal(A.classifyIntent('عرّف نظام التشغيل'),'define');
  assert.equal(A.classifyIntent('قارن بين TCP وUDP'),'compare');
});

test('does not invent an answer or citations when no source evidence exists', () => {
  const result=A.answer({documents:[{id:'d',name:'Unrelated.pdf',type:'pdf',pages:[
    {page:3,text:'Photosynthesis converts light energy into chemical energy.'}
  ]}],question:'ما مكونات بروتوكول BGP؟',mode:'strict'});
  assert.equal(result.origin,'miss');
  assert.deepEqual(result.references,[]);
  assert.match(result.text,/لم أجد أدلة كافية/);
});
