'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Memory = require('../desktop/cyber/core/conversation-memory.cjs');
const Registry = require('../desktop/cyber/core/tool-registry.cjs');

test('follow-up detection handles natural Arabic and English wording', () => {
  for (const question of ['اشرحها أكثر', 'ما الفرق بينهما؟', 'ماذا عن عيوبها؟', 'كيف ذلك؟', 'Explain more', 'What about it?']) {
    assert.equal(Memory.isFollowUp(question), true, question);
  }
});

test('standalone questions do not inherit an unrelated previous topic', () => {
  const result = Memory.buildRetrievalInput('ما هو التشفير؟', [
    {role: 'user', content: 'كيف أفحص تطبيق Android؟'},
    {role: 'assistant', content: 'يمكن تحليل APK محلياً.'}
  ]);
  assert.equal(result.usedHistory, false);
  assert.equal(result.query, 'ما هو التشفير؟');
});

test('short follow-up inherits the previous question and answer for retrieval', () => {
  const result = Memory.buildRetrievalInput('اشرحها أكثر', [
    {role: 'user', content: 'ما وظيفة Semgrep؟'},
    {role: 'assistant', content: 'أداة تحليل ساكن للشيفرة.'}
  ]);
  assert.equal(result.usedHistory, true);
  assert.match(result.query, /Semgrep/);
  assert.match(result.query, /تحليل ساكن/);
  assert.ok(Registry.searchTools(result.query).results.some((tool) => tool.id === 'semgrep'));
});

test('history stores only bounded user and assistant messages', () => {
  const result = Memory.appendTurn([
    {role: 'system', content: 'not allowed'},
    {role: 'user', content: 'x'.repeat(9000)}
  ], 'السؤال الجديد', 'الإجابة الجديدة');
  assert.ok(result.length <= Memory.MAX_HISTORY_MESSAGES);
  assert.ok(result.every((item) => ['user', 'assistant'].includes(item.role)));
  assert.ok(result.every((item) => item.content.length <= Memory.MAX_MESSAGE_CHARS));
  assert.ok(result.reduce((sum, item) => sum + item.content.length, 0) <= Memory.MAX_HISTORY_CHARS);
});
