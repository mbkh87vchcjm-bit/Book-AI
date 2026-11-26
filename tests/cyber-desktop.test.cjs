'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'desktop/main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'desktop/preload.cjs'), 'utf8');
const html = fs.readFileSync(path.join(root, 'desktop/cyber/renderer/index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'desktop/cyber/renderer/app.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'desktop/package.json'), 'utf8'));

test('Windows Electron package is pinned and has a start command', () => {
  assert.equal(packageJson.main, 'main.cjs');
  assert.equal(packageJson.scripts.start, 'electron .');
  assert.equal(packageJson.devDependencies.electron, '45.5.0');
});

test('Electron main process enforces renderer isolation and sandboxing', () => {
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /will-navigate/);
  assert.match(main, /setPermissionRequestHandler/);
});

test('renderer CSP blocks network connections, frames and plugin objects', () => {
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /cyber-knowledge\.js/);
  assert.match(html, /id="glossary-page"/);
  assert.match(html, /id="concept-term"/);
  assert.match(html, /frame-src 'none'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
});

test('preload exposes only explicit cyber operations', () => {
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  assert.match(preload, /chooseProject/);
  assert.match(preload, /getPolicy/);
  assert.match(preload, /savePolicy/);
  assert.match(preload, /scanProject/);
  assert.match(preload, /exportReport/);
  assert.doesNotMatch(preload, /require\(['"]node:fs/);
  assert.doesNotMatch(preload, /sendSync|executeJavaScript/);
});

test('renderer has no direct Node, network, or shell capability', () => {
  assert.match(renderer, /window\.midadCyber/);
  assert.match(renderer, /MidadCyberKnowledge\.resolveTerm|MidadCyberKnowledge/);
  assert.doesNotMatch(renderer, /\brequire\s*\(/);
  assert.doesNotMatch(renderer, /\bfetch\s*\(/);
  assert.doesNotMatch(renderer, /WebSocket|shell\.openExternal|child_process/);
});

test('control center exposes configurable scope, modes, limits and severity', () => {
  for (const id of [
    'mode', 'allowed-paths', 'excluded-paths', 'analyzer-builtin',
    'analyzer-secrets', 'max-files', 'max-file-mb', 'max-total-mb',
    'max-findings', 'timeout-sec', 'severity', 'retain-snippets'
  ]) assert.ok(html.includes('id="' + id + '"'), 'Missing control: ' + id);
});
