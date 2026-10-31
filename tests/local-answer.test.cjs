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
