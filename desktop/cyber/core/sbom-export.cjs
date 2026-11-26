'use strict';

const crypto = require('node:crypto');

const MAX_COMPONENTS = 10000;
const MAX_TEXT = 240;
const LOCKFILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml',
  'poetry.lock', 'composer.lock', 'cargo.lock', 'gemfile.lock'
]);

function boundedText(value, limit = MAX_TEXT) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, limit);
}

function isExactVersion(value) {
  return /^v?\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?$/.test(String(value || ''));
}

function isLockfile(manifest) {
  const base = String(manifest || '').split(/[\\/]/).pop().toLowerCase();
  return LOCKFILES.has(base);
}

function knownScope(relationship) {
  const value = String(relationship || '').toLowerCase();
  if (['direct-runtime', 'direct-peer', 'locked-runtime'].includes(value)) return 'required';
  if (['direct-development', 'development-or-test', 'locked-development', 'locked-development-optional'].includes(value)) return 'excluded';
  if (['direct-optional', 'locked-optional'].includes(value)) return 'optional';
  return null;
}

function mergeScope(relationships) {
  const scopes = relationships.map(knownScope).filter(Boolean);
  // Runtime use takes precedence when the same component is declared in more
  // than one group; otherwise preserve dev-only or optional-only evidence.
  if (scopes.includes('required')) return 'required';
  if (scopes.includes('excluded')) return 'excluded';
  if (scopes.includes('optional')) return 'optional';
  return null;
}

function componentRef(pkg, index) {
  const canonical = [
    index,
    pkg.name,
    pkg.version,
    (pkg.relationships || []).join(','),
    (pkg.manifests || []).join(',')
  ].map((value) => String(value || '')).join('\0');
  return 'midad-component-' + crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 24);
}

function addProperty(properties, name, value) {
  const clean = boundedText(value, 500);
  if (!clean) return;
  if (!properties.some((item) => item.name === name && item.value === clean)) {
    properties.push({name, value: clean});
  }
}

function createCycloneDxSbom(report, options = {}) {
  if (!report || report.ok !== true || !report.dependencyInventory ||
      report.dependencyInventory.enabled !== true) {
    throw new TypeError('An enabled dependency inventory is required.');
  }
  const inventory = report.dependencyInventory;
  const rawPackages = Array.isArray(inventory.packages) ? inventory.packages : [];
  if (!rawPackages.length) throw new TypeError('The dependency inventory contains no package entries.');

  const projectName = boundedText(options.projectName || report.project || 'Local Project', 120) || 'Local Project';
  const timestampValue = options.timestamp || new Date().toISOString();
  const timestamp = new Date(timestampValue);
  if (Number.isNaN(timestamp.getTime())) throw new TypeError('A valid timestamp is required.');
  const serial = options.serialNumber || ('urn:uuid:' + crypto.randomUUID());
  if (!/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(serial)) {
    throw new TypeError('The serial number must be a UUID URN.');
  }

  const normalized = rawPackages.slice(0, MAX_COMPONENTS).map((raw) => ({
    name: boundedText(raw && raw.name),
    version: boundedText(raw && raw.version, 120) || 'unspecified',
    relationship: boundedText(raw && raw.relationship, 48) || 'unknown',
    manifest: boundedText(raw && raw.manifest, 240)
  })).filter((item) => item.name);

  const lockGroups = new Map();
  const declarations = [];
  for (const item of normalized) {
    if (isLockfile(item.manifest) && isExactVersion(item.version)) {
      const key = item.name.toLowerCase() + '\0' + item.version;
      let group = lockGroups.get(key);
      if (!group) {
        group = {
          name: item.name,
          version: item.version,
          relationships: [],
          manifests: [],
          constraints: []
        };
        lockGroups.set(key, group);
      }
      if (!group.relationships.includes(item.relationship)) group.relationships.push(item.relationship);
      if (item.manifest && !group.manifests.includes(item.manifest)) group.manifests.push(item.manifest);
    } else {
      declarations.push(item);
    }
  }

  const remaining = [];
  for (const declaration of declarations) {
    const matches = Array.from(lockGroups.values()).filter((group) =>
      group.name.toLowerCase() === declaration.name.toLowerCase()
    );
    const exactMatches = isExactVersion(declaration.version)
      ? matches.filter((group) => group.version === declaration.version.replace(/^v/, ''))
      : [];
    const target = exactMatches.length === 1 ? exactMatches[0] : matches.length === 1 ? matches[0] : null;
    if (target) {
      if (!target.relationships.includes(declaration.relationship)) target.relationships.push(declaration.relationship);
      if (declaration.manifest && !target.manifests.includes(declaration.manifest)) target.manifests.push(declaration.manifest);
      if (declaration.version !== 'unspecified' && !target.constraints.includes(declaration.version)) {
        target.constraints.push(declaration.version);
      }
    } else {
      remaining.push({
        name: declaration.name,
        version: null,
        relationships: [declaration.relationship],
        manifests: declaration.manifest ? [declaration.manifest] : [],
        constraints: declaration.version === 'unspecified' ? [] : [declaration.version],
        resolutionAmbiguous: matches.length > 1
      });
    }
  }

  const componentGroups = Array.from(lockGroups.values()).concat(remaining).slice(0, MAX_COMPONENTS);
  const components = componentGroups.map((group, index) => {
    const relationships = group.relationships.length ? group.relationships : ['unknown'];
    const manifests = group.manifests.slice().sort();
    const properties = [];
    relationships.forEach((relationship) => addProperty(properties, 'midad:relationship', relationship));
    manifests.forEach((manifest) => addProperty(properties, 'midad:source-manifest', manifest));
    group.constraints.forEach((constraint) => addProperty(properties, 'midad:declared-version-constraint', constraint));
    if (group.resolutionAmbiguous) addProperty(properties, 'midad:resolution-status', 'ambiguous-lockfile-version-match');
    if (!isLockfile(manifests[0]) && group.version === null) {
      addProperty(properties, 'midad:version-source', 'manifest-declaration-not-lockfile-resolved');
    }

    const component = {
      type: 'library',
      'bom-ref': componentRef({
        name: group.name,
        version: group.version || group.constraints.join(','),
        relationships,
        manifests
      }, index),
      name: group.name,
      properties
    };
    if (group.version && isExactVersion(group.version) &&
        manifests.some(isLockfile)) component.version = group.version;
    const scope = mergeScope(relationships);
    if (scope) component.scope = scope;
    return component;
  });

  if (!components.length) throw new TypeError('No valid package names were available for the SBOM.');

  return {
    $schema: 'http://cyclonedx.org/schema/bom-1.7.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.7',
    serialNumber: serial,
    version: 1,
    metadata: {
      timestamp: timestamp.toISOString(),
      tools: {
        components: [{
          type: 'application',
          name: 'Midad Cyber Local Inventory'
        }]
      },
      component: {
        type: 'application',
        name: projectName
      },
      lifecycles: [{phase: 'pre-build'}],
      properties: [
        {name: 'midad:completeness', value: 'partial-manifest-inventory'},
        {name: 'midad:network-access', value: 'none'},
        {name: 'midad:dependency-relationships', value: 'not-fully-resolved'},
        {name: 'midad:inventory-entry-count', value: String(inventory.packageCount || normalized.length)},
        {name: 'midad:manifest-count', value: String(inventory.manifestsScanned || 0)}
      ]
    },
    components
  };
}

module.exports = {
  createCycloneDxSbom,
  isExactVersion,
  isLockfile,
  knownScope,
  mergeScope,
  MAX_COMPONENTS
};
