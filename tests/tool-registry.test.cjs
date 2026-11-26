'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Registry=require('../desktop/cyber/core/tool-registry.cjs');

test('tool registry includes unique source-inventory names and keeps execution disabled',()=>{
  assert.equal(Registry.TOOLS.length,209);
  assert.equal(Registry.CATEGORIES.length,19);
  assert.ok(Registry.TOOLS.every((tool)=>tool.executionEnabled===false));
  assert.equal(new Set(Registry.TOOLS.map((tool)=>tool.id)).size,Registry.TOOLS.length);
});

test('known variants resolve to their canonical registry entry',()=>{
  assert.equal(Registry.getTool('Ghidra Pro').id,'ghidra');
  assert.equal(Registry.getTool('Volatility3').id,'volatility');
  assert.equal(Registry.getTool('ffuf-fuzz').id,'ffuf');
  assert.equal(Registry.getTool('Kube-bench').id,'kube-bench');
  assert.equal(Registry.getTool('Autopsy Pro').id,'autopsy');
});

test('free-form Arabic security questions retrieve code analysis tools without exact tool names',()=>{
  const result=Registry.searchTools('أحتاج أداة لمراجعة ملفات المشروع واكتشاف الأنماط البرمجية الخطرة');
  assert.ok(result.results.some((tool)=>tool.id==='semgrep'));
});

test('Arabic paraphrases retrieve Android analysis tools',()=>{
  const result=Registry.searchTools('ما الوسيلة المناسبة لفحص تطبيق هاتف يعمل بنظام أندرويد؟');
  assert.ok(result.results.some((tool)=>['mobsf','jadx','apktool','androguard'].includes(tool.id)));
});

test('a memory-forensics question retrieves Volatility',()=>{
  const result=Registry.searchTools('أريد فهم ما يمكن استخراجه من تفريغ ذاكرة جهاز ضمن تحقيق رقمي');
  assert.ok(result.results.some((tool)=>tool.id==='volatility'));
});

test('English SBOM question retrieves software inventory tools',()=>{
  const result=Registry.searchTools('Which tool can create a software bill of materials for local dependencies?');
  assert.ok(result.results.some((tool)=>tool.id==='syft'));
});

test('unknown or unrelated questions do not get arbitrary tool matches',()=>{
  const result=Registry.searchTools('ما حالة الطقس في مدينة صنعاء اليوم؟');
  assert.equal(result.total,0);
});

test('reviewed records explain their purpose and offline boundaries',()=>{
  const semgrep=Registry.getTool('semgrep');
  assert.equal(semgrep.knowledgeStatus,'reviewed-summary');
  assert.match(semgrep.purpose,/الشيفرة/);
  assert.match(semgrep.offline,/محلياً/);
});

test('unreviewed records do not invent technical properties',()=>{
  const tool=Registry.TOOLS.find((item)=>item.knowledgeStatus==='catalogued-needs-review');
  assert.ok(tool);
  assert.equal(tool.purpose,null);
  assert.match(tool.offline,/غير متحقق/);
  assert.equal(tool.documentation,null);
});

test('empty search remains useful for browsing within a category',()=>{
  const result=Registry.searchTools('','mobile');
  assert.ok(result.results.length>0);
  assert.ok(result.results.every((tool)=>tool.categories.includes('mobile')));
});

test('knowledge context explains whether the index found any records',()=>{
  const found=Registry.buildKnowledgeContext('Nmap',5);
  assert.ok(found.records.length<=5);
  assert.equal(found.matched,true);
  assert.ok(found.records.every((tool)=>tool.executionEnabled===false));
  const missing=Registry.buildKnowledgeContext('غير مرتبط بأي أداة مسجلة',5);
  assert.equal(missing.matched,false);
  assert.match(missing.note,/لا يخترع/);
});
