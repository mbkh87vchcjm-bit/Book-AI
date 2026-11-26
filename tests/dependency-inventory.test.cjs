'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Inventory = require('../desktop/cyber/core/dependency-inventory.cjs');
const Scanner = require('../desktop/cyber/core/project-scanner.cjs');
const Policy = require('../desktop/cyber/core/cyber-policy.js');

test('recognizes common dependency manifest and lockfile names', () => {
  for (const name of [
    'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'requirements.txt', 'requirements-dev.txt', 'pyproject.toml', 'poetry.lock',
    'composer.json', 'composer.lock', 'Cargo.toml', 'Cargo.lock', 'go.mod',
    'Gemfile.lock', 'pom.xml'
  ]) assert.equal(Inventory.isManifestFile(name), true, name);
  assert.equal(Inventory.isManifestFile('application.js'), false);
});

test('npm manifest and lock inventory exposes names and versions but not registry metadata', () => {
  const manifest = Inventory.parseManifest('package.json', JSON.stringify({
    name: 'sample-project',
    dependencies: {express: '^4.18.0', '@scope/tool': 'workspace:*'},
    devDependencies: {typescript: '^5.0.0'}
  }));
  assert.equal(manifest.manager, 'npm');
  assert.ok(manifest.packages.some((pkg) => pkg.name === 'express' && pkg.relationship === 'direct-runtime'));
  assert.ok(manifest.packages.some((pkg) => pkg.name === 'typescript' && pkg.relationship === 'direct-development'));

  const lock = Inventory.parseManifest('package-lock.json', JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': {name: 'sample-project'},
      'node_modules/express': {version: '4.18.2', resolved: 'https://registry.example/express.tgz', integrity: 'sha512-secret'},
      'node_modules/express/node_modules/cookie': {version: '0.6.0'},
      'node_modules/@scope/tool': {version: '1.2.3'},
      'node_modules/vitest': {version: '2.0.0', dev: true},
      'node_modules/fsevents': {version: '2.0.0', optional: true}
    }
  }));
  assert.ok(lock.packages.some((pkg) => pkg.name === 'express' && pkg.version === '4.18.2'));
  assert.ok(lock.packages.some((pkg) => pkg.name === '@scope/tool'));
  assert.ok(lock.packages.some((pkg) => pkg.name === 'vitest' && pkg.relationship === 'locked-development'));
  assert.ok(lock.packages.some((pkg) => pkg.name === 'fsevents' && pkg.relationship === 'locked-optional'));
  assert.ok(lock.packages.some((pkg) => pkg.name === 'cookie' && pkg.relationship === 'transitive'));
  assert.doesNotMatch(JSON.stringify(lock), /registry\.example|sha512-secret|resolved|integrity/);
});

test('Python requirements and Go module parsers ignore comments and indirect metadata', () => {
  const requirements = Inventory.parseManifest('requirements-dev.txt', [
    '# dependency list',
    'Django>=4.2,<5',
    'requests==2.31.0  # pinned',
    '-r base.txt'
  ].join('\n'));
  assert.equal(requirements.packages.length, 2);
  assert.ok(requirements.packages.some((pkg) => pkg.name === 'requests' && pkg.version === '==2.31.0'));
  assert.ok(requirements.packages.every((pkg) => pkg.relationship === 'direct-development'));

  const go = Inventory.parseManifest('go.mod', [
    'module example.local/app',
    'require (',
    '  example.com/library v1.2.3',
    '  example.com/other v2.0.0 // indirect',
    ')'
  ].join('\n'));
  assert.equal(go.packages.length, 2);
  assert.ok(go.packages.every((pkg) => pkg.name.startsWith('example.com/')));
});

test('scanner inventories dependencies only when dependency-audit is enabled', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'midad-dependency-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    dependencies: {express: '^4.18.0'}
  }), 'utf8');
  await fs.writeFile(path.join(root, 'package-lock.json'), JSON.stringify({
    lockfileVersion: 3,
    packages: {'node_modules/express': {version: '4.18.2'}}
  }), 'utf8');

  const disabled = await Scanner.scanProject({
    root,
    policy: Policy.createPolicy({analyzers: ['builtin']})
  });
  assert.equal(disabled.dependencyInventory.enabled, false);
  assert.equal(disabled.dependencyInventory.packageCount, 0);

  const enabled = await Scanner.scanProject({
    root,
    policy: Policy.createPolicy({analyzers: ['dependency-audit']})
  });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.dependencyInventory.enabled, true);
  assert.equal(enabled.dependencyInventory.manifestsScanned, 2);
  assert.ok(enabled.dependencyInventory.packages.some((pkg) => pkg.name === 'express' && pkg.version === '^4.18.0'));
  assert.ok(enabled.dependencyInventory.packages.some((pkg) => pkg.version === '4.18.2'));
  assert.equal(enabled.execution.networkAccessUsed, false);
  assert.equal(enabled.execution.projectCodeExecuted, false);
});

test('Cargo manifest sections preserve runtime versus development scope hints', () => {
  const cargo = Inventory.parseManifest('Cargo.toml', [
    '[dependencies]',
    'serde = "1.0"',
    '[dev-dependencies]',
    'tempfile = "3.0"',
    '[build-dependencies]',
    'cc = "1.0"'
  ].join('\n'));
  assert.ok(cargo.packages.some((pkg) => pkg.name === 'serde' && pkg.relationship === 'direct-runtime'));
  assert.ok(cargo.packages.some((pkg) => pkg.name === 'tempfile' && pkg.relationship === 'direct-development'));
  assert.ok(cargo.packages.some((pkg) => pkg.name === 'cc' && pkg.relationship === 'direct-development'));
});

test('lockfiles without an explicit runtime classification remain unknown', () => {
  const yarn = Inventory.parseManifest('yarn.lock', [
    '"left-pad@^1.0.0":',
    '  version "1.3.0"'
  ].join('\n'));
  assert.equal(yarn.packages[0].relationship, 'locked-unknown-scope');

  const cargo = Inventory.parseManifest('Cargo.lock', [
    '[[package]]',
    'name = "serde"',
    'version = "1.0.0"'
  ].join('\n'));
  assert.equal(cargo.packages[0].relationship, 'locked-unknown-scope');
});


test('requirements development filenames and unknown lockfile scopes are preserved', () => {
  const requirements = Inventory.parseManifest('requirements-dev.txt', 'pytest==8.0.0');
  assert.equal(requirements.packages[0].relationship, 'direct-development');

  const yarn = Inventory.parseManifest('yarn.lock', [
    '"left-pad@^1.0.0":',
    '  version "1.3.0"'
  ].join('\n'));
  assert.equal(yarn.packages[0].relationship, 'locked-unknown-scope');

  const cargoLock = Inventory.parseManifest('Cargo.lock', [
    '[[package]]',
    'name = "serde"',
    'version = "1.0.0"'
  ].join('\n'));
  assert.equal(cargoLock.packages[0].relationship, 'locked-unknown-scope');
});


test('Maven scopes and Composer lock sections preserve runtime classification evidence', () => {
  const pom = Inventory.parseManifest('pom.xml', [
    '<project><dependencies>',
    '<dependency><groupId>org.example</groupId><artifactId>runtime-lib</artifactId><version>1.2.3</version></dependency>',
    '<dependency><groupId>org.example</groupId><artifactId>test-lib</artifactId><version>2.0.0</version><scope>test</scope></dependency>',
    '<dependency><groupId>org.example</groupId><artifactId>provided-lib</artifactId><version>3.0.0</version><scope>provided</scope></dependency>',
    '<dependency><groupId>org.example</groupId><artifactId>optional-lib</artifactId><version>4.0.0</version><optional>true</optional></dependency>',
    '</dependencies></project>'
  ].join('\n'));
  assert.ok(pom.packages.some((pkg) => pkg.name.endsWith(':runtime-lib') && pkg.relationship === 'direct-runtime'));
  assert.ok(pom.packages.some((pkg) => pkg.name.endsWith(':test-lib') && pkg.relationship === 'development-or-test'));
  assert.ok(pom.packages.some((pkg) => pkg.name.endsWith(':provided-lib') && pkg.relationship === 'development-or-test'));
  assert.ok(pom.packages.some((pkg) => pkg.name.endsWith(':optional-lib') && pkg.relationship === 'direct-optional'));

  const composer = Inventory.parseManifest('composer.lock', JSON.stringify({
    packages: [{name: 'vendor/runtime', version: '1.0.0'}],
    'packages-dev': [{name: 'vendor/test', version: '2.0.0'}]
  }));
  assert.ok(composer.packages.some((pkg) => pkg.name === 'vendor/runtime' && pkg.relationship === 'locked-runtime'));
  assert.ok(composer.packages.some((pkg) => pkg.name === 'vendor/test' && pkg.relationship === 'locked-development'));
});
