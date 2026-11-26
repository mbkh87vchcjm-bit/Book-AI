'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('local assistant and tool catalogue are wired only through trusted local IPC', () => {
  const main = read('desktop/main.cjs');
  const preload = read('desktop/preload.cjs');
  const renderer = read('desktop/cyber/renderer/app.js');
  const html = read('desktop/cyber/renderer/index.html');
  const localAI = read('desktop/cyber/core/local-ai.cjs');
  const registry = read('desktop/cyber/core/tool-registry.cjs');
  assert.ok(main.includes('isTrustedRenderer'));
  assert.ok(main.includes('webRequest.onBeforeRequest'));
  assert.ok(main.includes('cyber:ask-local-model'));
  assert.ok(main.includes('cyber:search-tools'));
  assert.ok(preload.includes('askLocalModel'));
  assert.ok(preload.includes('searchTools'));
  assert.ok(renderer.includes('api.askLocalModel'));
  assert.ok(renderer.includes('api.searchTools'));
  assert.ok(html.includes('id="tools-page"'));
  assert.ok(html.includes('id="assistant-page"'));
  assert.ok(html.includes('connect-src \'none\''));
  assert.ok(localAI.includes("const LOCAL_OLLAMA_ORIGIN = 'http://127.0.0.1:11434'"));
  assert.ok(localAI.includes('لا تتصل بعناوين أو خدمات خارجية'));
  assert.ok(registry.includes('executionEnabled:false'));
  assert.ok(!renderer.includes('fetch('));
  assert.ok(!renderer.includes('child_process'));
});

test('tool registry marks every entry as non-executable and distinguishes unreviewed records', () => {
  const registry = require('../desktop/cyber/core/tool-registry.cjs');
  assert.ok(registry.TOOLS.length >= 200);
  assert.ok(registry.TOOLS.every((tool) => tool.executionEnabled === false));
  assert.ok(registry.TOOLS.some((tool) => tool.knowledgeStatus === 'catalogued-needs-review'));
  assert.ok(registry.TOOLS.some((tool) => tool.knowledgeStatus === 'reviewed-summary'));
});
