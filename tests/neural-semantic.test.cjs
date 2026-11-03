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

function semanticCorpus() {
  const router = 'router forwards packets through network routing table and selects outgoing interface';
  const gateway = 'gateway forwards datagrams through network routing table and selects outgoing interface';
  const fruit = 'banana orchard fruit grows among tropical trees and apple harvest';
  return [
    {id:'network',name:'Network.pdf',type:'pdf',pages:Array.from({length:6},(_,i)=>({
      page:i+1,text:Array.from({length:8},()=>router+'. '+gateway+'.').join(' ')
    }))},
    {id:'food',name:'Food.pdf',type:'pdf',pages:Array.from({length:6},(_,i)=>({
      page:i+1,text:Array.from({length:16},()=>fruit+'.').join(' ')
    }))}
  ];
}

test('trains a sentence-aware neural model from supplied local documents only', async () => {
  const model = await Neural.train(trainingDocs(), {maxTokens:12000, maxVocabulary:600, dimension:16});
  assert.ok(model);
  assert.equal(model.algorithm, Neural.algorithm);
  assert.equal(model.version, 2);
  assert.ok(model.vocabularySize >= 8);
  assert.ok(model.trainingSequences >= 16);
  assert.ok(model.trainedTokens > 0);
  assert.ok(model.trainedPairs > 0);
  const related = model.similarity('router', 'routing');
  const unrelated = model.similarity('router', 'banana');
  assert.ok(related > unrelated + 0.05, 'related context words should rank closer than unrelated-domain words');
  assert.ok(model.similarity('router packet network', 'routing packet network') >= 0);
});

test('sentence boundaries prevent context pairs from leaking into the next sentence', async () => {
  const docs = [{id:'separated',name:'Separated.txt',pages:Array.from({length:8},(_,i)=>({
    page:i+1,
    text:Array.from({length:12},()=>'router forwards packets through networks. banana fruit orchard tropical trees.').join(' ')
  }))}];
  const sequences = Neural.splitSequences('router forwards packets. banana fruit orchard\nnetwork routing table', 64, 2);
  assert.deepEqual(sequences, [
    ['router','forward','packet'],
    ['banana','fruit','orchard'],
    ['network','rout','table']
  ]);
  const model = await Neural.train(docs,{maxTokens:12000,maxVocabulary:300,dimension:16});
  assert.ok(model);
  assert.ok(model.trainingSequences >= 16);
  assert.ok(model.similarity('router', 'packets') > model.similarity('router', 'banana'));
});

test('words with shared contexts receive stronger similarity than unrelated-domain words', async () => {
  const model = await Neural.train(semanticCorpus(), {
    maxTokens:18000, maxVocabulary:500, dimension:24, window:2, epochs:2
  });
  assert.ok(model);
  const synonymContext = model.similarity('router', 'gateway');
  const unrelatedContext = model.similarity('router', 'banana');
  assert.ok(synonymContext > unrelatedContext + 0.05,
    'shared forwarding context should outrank the unrelated fruit domain: ' +
    synonymContext.toFixed(3) + ' vs ' + unrelatedContext.toFixed(3));
});

test('embedding pooling reports vocabulary coverage and rejects unsupported-only text', async () => {
  const model = await Neural.train(trainingDocs(), {maxTokens:12000, maxVocabulary:600, dimension:16});
  assert.ok(model);
  const details = model.embedDetails('router unknownword');
  assert.ok(details);
  assert.equal(details.tokenCount, 2);
  assert.equal(details.knownTokenCount, 1);
  assert.equal(details.coverage, 0.5);
  assert.equal(model.embedDetails('unknownword absenttoken'), null);
  const weak = model.similarityDetails('router unknownword', 'unknownword absenttoken');
  assert.equal(weak.score, 0);
  assert.equal(weak.rightCoverage, 0);
});

test('serializes frequency weights and restores v2 similarity behavior', async () => {
  const model = await Neural.train(trainingDocs(), {maxTokens:12000, maxVocabulary:600, dimension:16});
  const exported = model.exportData();
  assert.equal(exported.version, 2);
  assert.equal(exported.algorithm, Neural.algorithm);
  assert.equal(exported.weights.length, exported.vocabulary.length);
  const restored = Neural.restore(exported);
  assert.ok(restored);
  assert.equal(restored.vocabularySize, model.vocabularySize);
  const before = model.similarity('router packet network', 'routing packet network');
  const after = restored.similarity('router packet network', 'routing packet network');
  assert.ok(Math.abs(before - after) < 0.015);
});

test('training is deterministic for the same local corpus and options', async () => {
  const options = {maxTokens:12000,maxVocabulary:600,dimension:16};
  const a = await Neural.train(trainingDocs(), options);
  const b = await Neural.train(trainingDocs(), options);
  assert.deepEqual(a.exportData(), b.exportData());
});

test('rejects corrupt, oversized, unsupported and legacy model data safely', () => {
  assert.equal(Neural.restore(null), null);
  assert.equal(Neural.restore({version:99,algorithm:'other',dimension:16,vocabulary:[],vectors:[],weights:[]}), null);
  assert.equal(Neural.restore({
    version:1,algorithm:'skip-gram-negative-sampling-from-scratch',dimension:16,
    vocabulary:Array.from({length:12},(_,i)=>'w'+i),vectors:Array(12*16).fill(0),weights:Array(12).fill(1000)
  }), null);
  const badVectors = {version:2,algorithm:Neural.algorithm,dimension:16,
    vocabulary:Array.from({length:12},(_,i)=>'w'+i),vectors:Array(12*16).fill(200),weights:Array(12).fill(1000)};
  assert.equal(Neural.restore(badVectors), null);
  const badWeights = Object.assign({},badVectors,{vectors:Array(12*16).fill(0),weights:Array(12).fill(400)});
  assert.equal(Neural.restore(badWeights), null);
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
