'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Builder=require('../desktop/cyber/core/assistant-context.cjs');

test('natural Arabic questions retrieve tool and concept evidence',()=>{
  const context=Builder.buildAssistantContext('أحتاج أداة لمراجعة ملفات المشروع واكتشاف الأنماط البرمجية الخطرة');
  assert.ok(context.toolCatalogue.records.some((tool)=>tool.name==='Semgrep'));
  assert.ok(context.retrieval.matchedToolRecords>0);
  assert.equal(context.platformRules.toolExecutionEnabled,false);
});

test('Arabic paraphrase maps memory dump analysis to Volatility',()=>{
  const context=Builder.buildAssistantContext('كيف أفهم ما حدث في الجهاز من تفريغ الذاكرة أثناء التحقيق؟');
  assert.ok(context.toolCatalogue.records.some((tool)=>tool.name==='Volatility'));
});

test('concept retrieval supports paraphrased cryptography questions',()=>{
  const context=Builder.buildAssistantContext('ما الفرق بين حماية سرية البيانات وبصمة الملف؟');
  const ids=context.securityConcepts.map((item)=>item.id);
  assert.ok(ids.includes('SEC-ENCRYPT-001'));
  assert.ok(ids.includes('SEC-HASH-001'));
});

test('ambiguous Token question returns its distinct meanings rather than picking one',()=>{
  const context=Builder.buildAssistantContext('اشرح لي معنى Token');
  const ids=context.securityConcepts.map((item)=>item.id);
  assert.ok(ids.includes('SEC-API-TOKEN-001'));
  assert.ok(ids.includes('AI-TOKEN-001'));
  assert.ok(ids.includes('COMP-TOKEN-001'));
});

test('unmatched topics are explicitly marked as having no local evidence',()=>{
  const context=Builder.buildAssistantContext('ما أفضل مطعم في صنعاء؟');
  assert.equal(context.retrieval.matchedToolRecords,0);
  assert.equal(context.retrieval.matchedConceptRecords,0);
  assert.equal(context.retrieval.evidenceCoverage,'no-local-reference-match');
});

test('tool context distinguishes unreviewed tool records',()=>{
  const context=Builder.buildAssistantContext('أخبرني عن Sherlock');
  const record=context.toolCatalogue.records.find((tool)=>tool.name==='Sherlock');
  assert.ok(record);
  assert.equal(record.knowledgeStatus,'catalogued-needs-review');
  assert.equal(record.purpose,null);
});
