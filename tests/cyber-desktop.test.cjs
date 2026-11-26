'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
  assert.equal(packageJson.devDependencies['electron-builder'], '26.18.0');
  assert.equal(packageJson.dependencies['@babel/parser'], '7.29.15');
  assert.equal(packageJson.scripts['dist:win'], 'electron-builder --win nsis portable --x64');
  assert.equal(packageJson.build.appId, 'com.midad.cyber');
  assert.equal(packageJson.build.asar, true);
  assert.deepEqual(packageJson.build.win.target.map((item) => item.target), ['nsis', 'portable']);
  assert.equal(packageJson.build.win.signAndEditExecutable, false);
});

test('Electron main process enforces renderer isolation and sandboxing', () => {
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /will-navigate/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /cyber:export-sbom/);
  assert.match(main, /let lastScanReport = null/);
  assert.match(main, /ipcMain\.handle\('cyber:export-report', async \(\) =>/);
  assert.match(main, /ipcMain\.handle\('cyber:export-sbom', async \(\) =>/);
  assert.match(main, /const report = lastScanReport/);
});

test('renderer CSP blocks network connections, frames and plugin objects', () => {
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /cyber-knowledge\.js/);
  assert.match(html, /id="glossary-page"/);
  assert.match(html, /id="concept-term"/);
  assert.match(html, /id="export-sbom"/);
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
  assert.match(preload, /exportSbom/);
  assert.match(preload, /exportReport: \(\) => ipcRenderer\.invoke/);
  assert.match(preload, /exportSbom: \(\) => ipcRenderer\.invoke/);
  assert.doesNotMatch(preload, /export(?:Report|Sbom): \(report\)/);
  assert.doesNotMatch(preload, /require\(['"]node:fs/);
  assert.doesNotMatch(preload, /sendSync|executeJavaScript/);
});

test('renderer has no direct Node, network, or shell capability', () => {
  assert.match(renderer, /window\.midadCyber/);
  assert.match(renderer, /async function exportReport/);
  assert.match(renderer, /async function exportSbom/);
  assert.match(renderer, /api\.exportReport\(\)/);
  assert.match(renderer, /api\.exportSbom\(\)/);
  assert.match(renderer, /MidadCyberKnowledge\.resolveTerm|MidadCyberKnowledge/);
  assert.doesNotMatch(renderer, /\brequire\s*\(/);
  assert.doesNotMatch(renderer, /\bfetch\s*\(/);
  assert.doesNotMatch(renderer, /WebSocket|shell\.openExternal|child_process/);
});

test('control center exposes configurable scope, modes, limits and severity', () => {
  for (const id of [
    'mode', 'allowed-paths', 'excluded-paths', 'analyzer-builtin', 'analyzer-ast',
    'analyzer-secrets', 'analyzer-dependencies', 'max-files', 'max-file-mb', 'max-total-mb',
    'max-findings', 'timeout-sec', 'severity', 'retain-snippets'
  ]) assert.ok(html.includes('id="' + id + '"'), 'Missing control: ' + id);
});


test('Windows CI builds and uploads the x64 desktop package', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /windows-desktop:/);
  assert.match(workflow, /runs-on: windows-2022/);
  assert.match(workflow, /npm run dist:win/);
  assert.match(workflow, /Generate SHA-256 checksums/);
  assert.match(workflow, /SHA256SUMS\.txt/);
  assert.match(workflow, /Midad-Cyber-Windows-x64/);
  assert.match(workflow, /if-no-files-found: error/);
});

test('Electron entry scripts parse without syntax errors', () => {
  for (const [name, source] of [['main', main], ['preload', preload], ['renderer', renderer]]) {
    assert.doesNotThrow(() => new vm.Script(source, {filename: name + '.js'}), name);
  }
});
