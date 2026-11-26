'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Scanner = require('../desktop/cyber/core/project-scanner.cjs');
const Policy = require('../desktop/cyber/core/cyber-policy.js');

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midad-cyber-test-'));
  await fs.mkdir(path.join(root, 'src'), {recursive: true});
  await fs.writeFile(path.join(root, 'src', 'sample.js'), [
    "const password = 'ghp_abcdefghijklmnopqrstuvwxyz';",
    "const query = 'SELECT * FROM users WHERE name=' + req.query.name;",
    "element.innerHTML = '<b>' + userInput;"
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(root, 'README.md'), '# local project\n', 'utf8');
  await fs.mkdir(path.join(root, 'node_modules', 'pkg'), {recursive: true});
  await fs.writeFile(path.join(root, 'node_modules', 'pkg', 'bad.js'), 'eval(userInput);\n', 'utf8');
  return root;
}

test('scanner reads only allowed source files and returns defensive findings', async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const policy = Policy.createPolicy({
    analyzers: ['builtin', 'secret-patterns'],
    scope: {allowedPaths: ['src'], excludedPaths: ['.git', 'node_modules']}
  });
  const report = await Scanner.scanProject({root, policy});
  assert.equal(report.ok, true);
  assert.equal(report.scannedFiles, 1);
  assert.ok(report.findings.some((item) => item.id === 'CYB-SECRET-001'));
  assert.ok(report.findings.some((item) => item.id === 'CYB-SQL-001'));
  assert.ok(report.findings.some((item) => item.id === 'CYB-XSS-001'));
  assert.ok(report.findings.every((item) => item.file === 'src/sample.js'));
  assert.ok(report.findings.every((item) => item.evidence === null));
  assert.deepEqual(report.execution, {
    localOnly: true, projectCodeExecuted: false, networkAccessUsed: false, filesModified: false
  });
});

test('secret values are redacted even when evidence snippets are enabled', async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const policy = Policy.createPolicy({
    analyzers: ['secret-patterns'],
    scope: {allowedPaths: ['src'], excludedPaths: []},
    privacy: {retainSourceSnippets: true}
  });
  const report = await Scanner.scanProject({root, policy});
  const secret = report.findings.find((item) => item.id === 'CYB-SECRET-001');
  assert.ok(secret);
  assert.match(secret.evidence, /\[REDACTED\]/);
  assert.doesNotMatch(secret.evidence, /ghp_abcdefghijklmnopqrstuvwxyz/);
});

test('scanner respects path scope, exclusions and severity threshold', async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const policy = Policy.createPolicy({
    analyzers: ['builtin', 'secret-patterns'],
    scope: {allowedPaths: ['src'], excludedPaths: ['src/private']},
    severityThreshold: 'high'
  });
  const report = await Scanner.scanProject({root, policy});
  assert.ok(report.findings.every((item) => ['high', 'critical'].includes(item.severity)));
});

test('scanner does not follow symbolic links', async (t) => {
  const root = await fixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'midad-cyber-outside-'));
  t.after(async () => {
    await fs.rm(root, {recursive: true, force: true});
    await fs.rm(outside, {recursive: true, force: true});
  });
  await fs.writeFile(path.join(outside, 'outside.js'), 'eval(userInput);\n', 'utf8');
  try {
    await fs.symlink(outside, path.join(root, 'linked'), 'junction');
  } catch (error) {
    if (process.platform === 'win32') return t.skip('Symlink privileges unavailable on this runner');
    throw error;
  }
  const policy = Policy.createPolicy({analyzers: ['builtin']});
  const report = await Scanner.scanProject({root, policy});
  assert.equal(report.ok, true);
  assert.ok(!report.findings.some((item) => item.file.startsWith('linked/')));
});

test('scanner stops at configured finding limit', async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const policy = Policy.createPolicy({
    analyzers: ['builtin', 'secret-patterns'],
    limits: {maxFindings: 1}
  });
  const report = await Scanner.scanProject({root, policy});
  assert.equal(report.findings.length, 1);
  assert.equal(report.stoppedReason, 'max-findings-exceeded');
});

test('scanner refuses educational mode and invalid root', async () => {
  const education = Policy.createPolicy({mode: 'education'});
  assert.equal((await Scanner.scanProject({root: '.', policy: education})).error, 'scanning-disabled-by-mode');
  const normal = Policy.createPolicy();
  assert.equal((await Scanner.scanProject({root: '', policy: normal})).error, 'project-root-required');
  assert.equal((await Scanner.scanProject({
    root: path.join(os.tmpdir(), 'missing-midad-project'), policy: normal
  })).error, 'project-root-unavailable');
});

test('scanner skips files above the per-file byte cap and continues within the cap', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midad-cyber-size-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.writeFile(path.join(root, 'small.js'), 'eval(input);\n', 'utf8');
  await fs.writeFile(path.join(root, 'large.js'), 'x'.repeat(256), 'utf8');
  const policy = Policy.createPolicy({
    analyzers: ['builtin'],
    limits: {maxFileBytes: 64}
  });
  const report = await Scanner.scanProject({root, policy});
  assert.equal(report.ok, true);
  assert.equal(report.scannedFiles, 1);
  assert.equal(report.skippedFiles, 1);
  assert.ok(report.findings.some((item) => item.id === 'CYB-CODE-001'));
  assert.ok(report.warnings.some((item) => item.code === 'max-file-bytes-exceeded'));
});

test('severity filtering happens before the maximum finding count', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midad-cyber-severity-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.writeFile(path.join(root, 'sample.js'), [
    'eval(userInput);',
    "const query = 'SELECT * FROM users WHERE name=' + req.query.name;"
  ].join('\n'), 'utf8');
  const policy = Policy.createPolicy({
    analyzers: ['builtin'],
    severityThreshold: 'high',
    limits: {maxFindings: 1}
  });
  const report = await Scanner.scanProject({root, policy});
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].severity, 'high');
  assert.equal(report.stoppedReason, 'max-findings-exceeded');
});

test('scanner bounds directory depth before recursing into deeply nested trees', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midad-cyber-depth-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  let nested = root;
  for (let index = 0; index < 70; index += 1) {
    nested = path.join(nested, 'd' + index);
    await fs.mkdir(nested);
  }
  await fs.writeFile(path.join(nested, 'deep.js'), 'eval(userInput);\\n', 'utf8');
  const report = await Scanner.scanProject({
    root,
    policy: Policy.createPolicy({analyzers: ['builtin'], scope: {allowedPaths: ['.'], excludedPaths: []}})
  });
  assert.equal(report.ok, true);
  assert.equal(report.scannedFiles, 0);
  assert.ok(report.warnings.some((item) => item.code === 'max-directory-depth-exceeded'));
});

test('scanner rejects a directory junction that resolves outside the selected root', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midad-cyber-junction-root-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'midad-cyber-junction-outside-'));
  t.after(async () => {
    await fs.rm(root, {recursive: true, force: true});
    await fs.rm(outside, {recursive: true, force: true});
  });
  await fs.writeFile(path.join(outside, 'outside.js'), 'eval(userInput);\\n', 'utf8');
  try {
    await fs.symlink(outside, path.join(root, 'junction'), 'junction');
  } catch (error) {
    if (process.platform === 'win32') return t.skip('Junction creation unavailable on this runner');
    throw error;
  }
  const report = await Scanner.scanProject({
    root,
    policy: Policy.createPolicy({analyzers: ['builtin']})
  });
  assert.equal(report.ok, true);
  assert.equal(report.scannedFiles, 0);
  assert.ok(!report.findings.some((item) => item.file.includes('junction')));
});
