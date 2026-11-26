'use strict';

const crypto = require('node:crypto');

const MAX_COMPONENTS = 10000;
const MAX_TEXT = 240;

function boundedText(value, limit = MAX_TEXT) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, limit);
}

function isExactVersion(value) {
  return /^v?\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?$/.test(String(value || ''));
}

function componentScope(relationship) {
  const value = String(relationship || '').toLowerCase();
  if (value.includes('development') || value.includes('test')) return 'excluded';
  if (value.includes('optional')) return 'optional';
  return 'required';
}

function componentRef(pkg, index) {
  const canonical = [
    index,
    pkg.name,
    pkg.version,
    pkg.relationship,
    pkg.manifest
  ].map((value) => String(value || '')).join('\0');
  return 'midad-component-' + crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 24);
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

  const packages = rawPackages.slice(0, MAX_COMPONENTS);
  const components = [];
  const seen = new Set();
  packages.forEach((raw, index) => {
    const name = boundedText(raw && raw.name);
    if (!name) return;
    const version = boundedText(raw && raw.version, 120) || 'unspecified';
    const relationship = boundedText(raw && raw.relationship, 48) || 'unknown';
    const manifest = boundedText(raw && raw.manifest, 240);
    const identity = [name.toLowerCase(), version, relationship, manifest].join('\0');
    if (seen.has(identity)) return;
    seen.add(identity);

    const properties = [
      {name: 'midad:relationship', value: relationship}
    ];
    if (manifest) properties.push({name: 'midad:source-manifest', value: manifest});
    if (version !== 'unspecified' && !isExactVersion(version)) {
      properties.push({name: 'midad:declared-version-constraint', value: version});
    }

    const component = {
      type: 'library',
      'bom-ref': componentRef({name, version, relationship, manifest}, index),
      name,
      scope: componentScope(relationship),
      properties
    };
    if (isExactVersion(version)) component.version = version;
    components.push(component);
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
        {name: 'midad:dependency-relationships', value: 'not-resolved'},
        {name: 'midad:package-entry-count', value: String(inventory.packageCount || components.length)},
        {name: 'midad:manifest-count', value: String(inventory.manifestsScanned || 0)}
      ]
    },
    components
  };
}

module.exports = {
  createCycloneDxSbom,
  isExactVersion,
  componentScope,
  MAX_COMPONENTS
};
