'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Neural = require('../app/src/main/assets/web/neural-semantic.js');

function trainingDocs() {
  const router = 'router packet network routing packet network router address packet route network router packet forwarding network router';
  const fruit = 'banana apple fruit banana fruit apple orchard fruit banana apple fruit orchard banana fruit apple';
  return [
    {id:'network-book',name:'Networks.pdf',type:'pdf',pages:Array.from({length:8},(_,i)=>({page:i+1,text:router+' '+router+' '+router}))},
    {id:'food-book',name:'Food.pdf',type:'pdf',pages:Array.from({length:8},(_,i)=>({page:i+1,text:fruit+' '+fruit+' '+fruit}))}
  ];
}

test('trains a small neural model from supplied local documents only', async () => {
  const model = await Neural.train(trainingDocs(), {maxTokens:12000, maxVocabulary:600, dimension:16});
  assert.ok(model);
  assert.equal(model.algorithm, 'skip-gram-negative-sampling-from-scratch');
  assert.ok(model.vocabularySize >= 12);
  assert.ok(model.trainedTokens > 0);
  assert.ok(model.trainedPairs > 0);
  assert.ok(model.similarity('router packet network', 'routing packet network') >= 0);
});

test('serializes and restores quantized local weights without losing similarity behavior', async () => {
  const model = await Neural.train(trainingDocs(), {maxTokens:12000, maxVocabulary:600, dimension:16});
  const exported = model.exportData();
  const restored = Neural.restore(exported);
  assert.ok(restored);
  assert.equal(restored.vocabularySize, model.vocabularySize);
  const before = model.similarity('router packet network', 'routing packet network');
  const after = restored.similarity('router packet network', 'routing packet network');
  assert.ok(Math.abs(before - after) < 0.015);
});

test('rejects corrupt, oversized and unsupported model data safely', () => {
  assert.equal(Neural.restore(null), null);
  assert.equal(Neural.restore({version:99,algorithm:'other',dimension:16,vocabulary:[],vectors:[]}), null);
  const bad = {version:1,algorithm:'skip-gram-negative-sampling-from-scratch',dimension:16,
    vocabulary:Array.from({length:12},(_,i)=>'w'+i),vectors:Array(12*16).fill(200)};
  assert.equal(Neural.restore(bad), null);
});

test('does not create a neural model when the supplied corpus is too small', async () => {
  const model = await Neural.train([{id:'short',name:'short.txt',pages:[{page:1,text:'A short note.'}]}]);
  assert.equal(model, null);
});


test('uses a restored corpus-trained network inside grounded source answering', async () => {
  const EngineAnswer = require('../app/src/main/assets/web/local-answer.js');
  const docs = [{id:'net',name:'Network Notes.pdf',type:'pdf',pages:[
    {page:2,text:'A router forwards network packets using routing information and address tables. '.repeat(5)},
    {page:3,text:'Network routing selects a path for packets across connected networks. '.repeat(5)}
  ]}];
  const trained = await Neural.train(docs,{maxTokens:5000,maxVocabulary:300,dimension:16});
  assert.ok(trained);
  const restored = Neural.restore(trained.exportData());
  assert.ok(restored);
  const result = EngineAnswer.answer({
    documents:docs,
    question:'اشرح توجيه الشبكات والحزم',
    mode:'strict',
    maxSentences:5,
    semanticModel:restored
  });
  assert.equal(result.origin,'source');
  assert.ok(result.references.length>0);
  assert.ok(result.references.every(ref=>ref.docName==='Network Notes.pdf'&&ref.page>0));
});
