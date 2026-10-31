'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const KG=require('../app/src/main/assets/web/knowledge-graph.js');

test('extracts Arabic definition candidates with exact page provenance',()=>{
 const doc={id:'arabic',name:'شبكات.pdf',type:'pdf',pages:[{page:4,text:'الشبكة العصبية هي نظام حسابي يتكون من وحدات مترابطة.'}]};
 const facts=KG.extractDocument(doc);assert.equal(facts.length,1);
 assert.equal(facts[0].subject,'الشبكة العصبية');assert.equal(facts[0].predicate,'is_a');
 assert.equal(facts[0].docId,'arabic');assert.equal(facts[0].docName,'شبكات.pdf');
 assert.equal(facts[0].page,4);assert.equal(facts[0].excerpt,doc.pages[0].text);assert.equal(facts[0].status,'candidate');
});

test('extracts English definitions from source sentences',()=>{
 const facts=KG.extractDocument({id:'english',name:'Network.pdf',type:'pdf',pages:[{page:2,text:'DNS is a distributed naming system.'}]});
 assert.equal(facts.length,1);assert.equal(facts[0].subject,'DNS');assert.equal(facts[0].predicate,'is_a');assert.equal(facts[0].page,2);
});

test('does not invent source identity or default page numbers',()=>{
 assert.deepEqual(KG.extractPage({id:'d',name:'x.pdf'},{text:'X is a system.'}),[]);
 assert.deepEqual(KG.extractPage({name:'x.pdf'},{page:1,text:'X is a system.'}),[]);
 assert.deepEqual(KG.extractPage({id:'d',name:'x.pdf'},{page:0,text:'X is a system.'}),[]);
});

test('candidate facts are not searchable until explicitly confirmed',()=>{
 const facts=KG.extractDocument({id:'d',name:'n.pdf',type:'pdf',pages:[{page:8,text:'The neural network is a computational model of connected units.'}]});
 assert.equal(KG.search(facts,'What is a neural network?',5).length,0);
 assert.equal(KG.applyReview(facts,facts[0].id,'user-confirmed'),true);
 const hits=KG.search(facts,'What is a neural network?',5);
 assert.equal(hits.length,1);assert.equal(hits[0].fact.docName,'n.pdf');assert.equal(hits[0].fact.page,8);
});

test('review rejects unknown status and reports accurate counts',()=>{
 const facts=KG.extractDocument({id:'d',name:'n.txt',type:'text',pages:[{page:1,text:'DNS is a naming service.'}]});
 assert.equal(KG.applyReview(facts,facts[0].id,'root'),false);
 assert.equal(KG.applyReview(facts,facts[0].id,'rejected'),true);
 assert.deepEqual(KG.stats(facts),{total:1,candidate:0,confirmed:0,rejected:1});
});
