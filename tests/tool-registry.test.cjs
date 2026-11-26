'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Registry=require('../desktop/cyber/core/tool-registry.cjs');

test('tool registry includes 200+ unique names from the supplied inventory',()=>{
  assert.equal(Registry.TOOLS.length,209);
  assert.equal(Registry.CATEGORIES.length,19);
  assert.ok(Registry.TOOLS.every((tool)=>tool.executionEnabled===false));
  assert.ok(Registry.TOOLS.every((tool)=>tool.source==='doctor-provided-inventory'));
  assert.equal(new Set(Registry.TOOLS.map((tool)=>tool.id)).size,Registry.TOOLS.length);
});

test('catalogue normalizes known variants and duplicate names',()=>{
  assert.equal(Registry.getTool('Ghidra Pro').id,'ghidra');
  assert.equal(Registry.getTool('Volatility3').id,'volatility');
  assert.equal(Registry.getTool('ffuf-fuzz').id,'ffuf');
  assert.equal(Registry.getTool('Kube-bench').id,'kube-bench');
  assert.equal(Registry.getTool('Autopsy Pro').id,'autopsy');
});

test('search supports exact names, aliases, Arabic descriptions and category filters',()=>{
  assert.equal(Registry.searchTools('Semgrep').results[0].id,'semgrep');
  assert.ok(Registry.searchTools('تحليل ساكن','code-analysis').results.some((tool)=>tool.id==='semgrep'));
  assert.ok(Registry.searchTools('Ghidra').results.some((tool)=>tool.id==='ghidra'));
  assert.ok(Registry.searchTools('','mobile').results.every((tool)=>tool.categories.includes('mobile')));
});

test('reviewed records explain their use and offline boundaries',()=>{
  const semgrep=Registry.getTool('semgrep');
  assert.equal(semgrep.knowledgeStatus,'reviewed-summary');
  assert.match(semgrep.purpose,/الشيفرة/);
  assert.match(semgrep.offline,/محلياً/);
  assert.equal(semgrep.executionEnabled,false);
});

test('unreviewed records never invent technical properties',()=>{
  const tool=Registry.TOOLS.find((item)=>item.knowledgeStatus==='catalogued-needs-review');
  assert.ok(tool);
  assert.equal(tool.purpose,null);
  assert.match(tool.offline,/غير متحقق/);
  assert.equal(tool.documentation,null);
});

test('knowledge context is bounded and explicitly marks unreviewed data',()=>{
  const context=Registry.buildKnowledgeContext('Nmap',5);
  assert.ok(context.records.length<=5);
  assert.match(context.note,/لا توجد أداة مفعّلة/);
  assert.ok(context.records.every((item)=>item.executionEnabled===false));
});
