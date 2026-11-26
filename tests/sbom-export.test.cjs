'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Sbom = require('../desktop/cyber/core/sbom-export.cjs');

const report = {
  ok: true,
  project: 'Example Project',
  dependencyInventory: {
    enabled: true,
    manifestsScanned: 3,
    packageCount: 3,
    packages: [
      {name: 'express', version: '4.18.2', relationship: 'direct-or-top-level-lock', manifest: 'package-lock.json'},
      {name: 'typescript', version: '^5.0.0', relationship: 'direct-development', manifest: 'package.json'},
      {name: '@scope/tool', version: '1.2.3', relationship: 'direct-optional', manifest: 'package-lock.json'}
    ]
  }
};

test('exports a CycloneDX 1.7 pre-build SBOM with UUID serial number', () => {
  const bom = Sbom.createCycloneDxSbom(report, {
    projectName: 'Example Project',
    timestamp: '2026-11-26T12:00:00.000Z',
    serialNumber: 'urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79'
  });
  assert.equal(bom.bomFormat, 'CycloneDX');
  assert.equal(bom.specVersion, '1.7');
  assert.match(bom.serialNumber, /^urn:uuid:/);
  assert.equal(bom.metadata.lifecycles[0].phase, 'pre-build');
  assert.equal(bom.metadata.component.name, 'Example Project');
  assert.equal(bom.components.length, 3);
});

test('lockfile versions become versions while manifest constraints remain properties', () => {
  const bom = Sbom.createCycloneDxSbom(report, {
    serialNumber: 'urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79'
  });
  const express = bom.components.find((item) => item.name === 'express');
  const typescript = bom.components.find((item) => item.name === 'typescript');
  assert.equal(express.version, '4.18.2');
  assert.equal(typescript.version, undefined);
  assert.ok(typescript.properties.some((item) =>
    item.name === 'midad:declared-version-constraint' && item.value === '^5.0.0'));
});

test('development and optional dependency scopes are represented distinctly', () => {
  const bom = Sbom.createCycloneDxSbom(report);
  assert.equal(bom.components.find((item) => item.name === 'typescript').scope, 'excluded');
  assert.equal(bom.components.find((item) => item.name === '@scope/tool').scope, 'optional');
  assert.equal(bom.components.find((item) => item.name === 'express').scope, 'required');
});

test('component references are unique and sensitive registry metadata is not emitted', () => {
  const noisy = structuredClone(report);
  noisy.dependencyInventory.packages.push({
    name: 'express', version: '4.18.2', relationship: 'direct-or-top-level-lock',
    manifest: 'package-lock.json', resolved: 'https://registry.example/pkg.tgz',
    integrity: 'sha512-secret'
  });
  const bom = Sbom.createCycloneDxSbom(noisy);
  const refs = bom.components.map((item) => item['bom-ref']);
  assert.equal(new Set(refs).size, refs.length);
  assert.doesNotMatch(JSON.stringify(bom), /registry\.example|sha512-secret|"resolved"\s*:|"integrity"\s*:/i);
});

test('export rejects incomplete or disabled inventory reports', () => {
  assert.throws(() => Sbom.createCycloneDxSbom({ok: true}), /enabled dependency inventory/);
  assert.throws(() => Sbom.createCycloneDxSbom({
    ok: true, dependencyInventory: {enabled: true, packages: []}
  }), /no package entries/);
});

test('invalid versions are not mislabeled as exact package versions', () => {
  assert.equal(Sbom.isExactVersion('4.18.2'), true);
  assert.equal(Sbom.isExactVersion('v1.0.0-beta.1'), true);
  assert.equal(Sbom.isExactVersion('^4.18.0'), false);
  assert.equal(Sbom.isExactVersion('workspace:*'), false);
});
