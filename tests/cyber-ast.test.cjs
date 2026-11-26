'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const AST = require('../desktop/cyber/core/ast-static-analysis.cjs');
const Scanner = require('../desktop/cyber/core/project-scanner.cjs');
const Policy = require('../desktop/cyber/core/cyber-policy.js');

test('desktop install provides the local Babel parser', () => {
  assert.equal(AST.available, true);
  assert.equal(AST.supportsFile('src/component.tsx'), true);
  assert.equal(AST.supportsFile('src/style.css'), false);
});

test('AST distinguishes syntax nodes from comments and string literals', () => {
  const source = [
    '// eval(userInput);',
    "const label = 'eval(userInput)';",
    'eval(userInput);',
    'node.innerHTML = "<p>" + req.body.name + "</p>";',
    "db.query('SELECT * FROM users WHERE name=' + req.query.name);"
  ].join('\n');
  const result = AST.analyze(source, 'src/app.js');
  assert.equal(result.ok, true);
  assert.ok(result.findings.some((item) => item.id === 'AST-EVAL-001' && item.line === 3));
  assert.ok(result.findings.some((item) => item.id === 'AST-XSS-001' && item.line === 4));
  assert.ok(result.findings.some((item) => item.id === 'AST-SQL-001' && item.line === 5));
  assert.equal(result.findings.length, 3);
});

test('AST does not report static HTML or a static SQL string', () => {
  const source = [
    "const code = 'eval(input)';",
    "node.innerHTML = '<p>constant</p>';",
    "db.query('SELECT * FROM users');"
  ].join('\n');
  const result = AST.analyze(source, 'src/safe.js');
  assert.equal(result.ok, true);
  assert.equal(result.findings.length, 0);
});

test('syntax parse failures do not stop the project scan or expose source text', () => {
  const result = AST.analyze('function broken( {', 'src/broken.js');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'syntax-parse-failed');
  assert.deepEqual(result.findings, []);
});

test('scanner respects the selected AST analyzer and path scope', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midad-ast-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'src'), {recursive: true});
  await fs.mkdir(path.join(root, 'outside'), {recursive: true});
  await fs.writeFile(path.join(root, 'src', 'app.js'), 'eval(userInput);\n', 'utf8');
  await fs.writeFile(path.join(root, 'outside', 'app.js'), 'eval(userInput);\n', 'utf8');
  const report = await Scanner.scanProject({
    root,
    policy: Policy.createPolicy({analyzers: ['ast'], scope: {allowedPaths: ['src'], excludedPaths: []}})
  });
  assert.equal(report.ok, true);
  assert.ok(report.findings.some((item) => item.id === 'AST-EVAL-001' && item.file === 'src/app.js'));
  assert.ok(!report.findings.some((item) => item.file.startsWith('outside/')));
  assert.equal(report.execution.projectCodeExecuted, false);
  assert.equal(report.execution.networkAccessUsed, false);
});

test('AST findings replace overlapping text heuristics when both analyzers are enabled', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midad-ast-dedupe-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.writeFile(path.join(root, 'app.js'), 'eval(userInput);\n', 'utf8');
  const report = await Scanner.scanProject({
    root,
    policy: Policy.createPolicy({analyzers: ['builtin', 'ast']})
  });
  assert.equal(report.ok, true);
  const evalResults = report.findings.filter((item) =>
    ['AST-EVAL-001', 'CYB-CODE-001'].includes(item.id));
  assert.equal(evalResults.length, 1);
  assert.equal(evalResults[0].id, 'AST-EVAL-001');
});
