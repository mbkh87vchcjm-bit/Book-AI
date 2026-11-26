'use strict';

// Local dependency inventory only. This module never resolves packages, contacts
// registries, evaluates manifests, or treats a version as proof of vulnerability.
const path = require('node:path');

const MAX_PACKAGES_PER_MANIFEST = 5000;

function manifestKind(filePath) {
  const base = path.basename(String(filePath || '')).toLowerCase();
  if (base === 'package.json') return 'npm-manifest';
  if (base === 'package-lock.json' || base === 'npm-shrinkwrap.json') return 'npm-lock';
  if (base === 'yarn.lock') return 'yarn-lock';
  if (base === 'pnpm-lock.yaml') return 'pnpm-lock';
  if (/^requirements(?:[-_.][a-z0-9_-]+)?\.txt$/.test(base)) return 'pip-requirements';
  if (base === 'pyproject.toml') return 'pyproject';
  if (base === 'poetry.lock') return 'poetry-lock';
  if (base === 'composer.json') return 'composer-manifest';
  if (base === 'composer.lock') return 'composer-lock';
  if (base === 'cargo.toml') return 'cargo-manifest';
  if (base === 'cargo.lock') return 'cargo-lock';
  if (base === 'go.mod') return 'go-mod';
  if (base === 'gemfile.lock') return 'gem-lock';
  if (base === 'pom.xml') return 'maven-pom';
  return null;
}

function isManifestFile(filePath) {
  return manifestKind(filePath) !== null;
}

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001f]/g, '').slice(0, 160);
}

function cleanVersion(value) {
  if (value === undefined || value === null || value === '') return 'unspecified';
  return String(value)
    .replace(/(?:https?|git\+https?):\/\/[^\s"'<>]+/gi, '[URL OMITTED]')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 120) || 'unspecified';
}

function entry(name, version, relationship, source) {
  const normalizedName = cleanName(name);
  if (!normalizedName) return null;
  return {
    name: normalizedName,
    version: cleanVersion(version),
    relationship: relationship || 'unknown',
    source: source || 'manifest'
  };
}

function uniqueEntries(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item) return false;
    const key = [item.name.toLowerCase(), item.version, item.relationship].join('\0');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseNpmManifest(text) {
  const data = JSON.parse(text);
  const result = [];
  const groups = [
    ['dependencies', 'direct-runtime'],
    ['devDependencies', 'direct-development'],
    ['optionalDependencies', 'direct-optional'],
    ['peerDependencies', 'direct-peer']
  ];
  for (const [field, relationship] of groups) {
    const values = data && data[field];
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
    for (const [name, version] of Object.entries(values)) result.push(entry(name, version, relationship, 'package.json'));
  }
  return result;
}

function npmLockRelationship(pkg, fallback) {
  if (pkg && pkg.dev) return 'locked-development';
  if (pkg && pkg.devOptional) return 'locked-development-optional';
  if (pkg && pkg.optional) return 'locked-optional';
  return fallback;
}

function parseNpmLock(text) {
  const data = JSON.parse(text);
  const result = [];
  if (data && data.packages && typeof data.packages === 'object') {
    for (const [locator, pkg] of Object.entries(data.packages)) {
      if (!locator || !pkg || typeof pkg !== 'object') continue;
      const marker = 'node_modules/';
      const index = locator.lastIndexOf(marker);
      if (index < 0) continue;
      const name = locator.slice(index + marker.length);
      if (!name || name.includes('/node_modules/')) continue;
      const firstIndex = locator.indexOf(marker);
      const fallback = firstIndex === index ? 'direct-or-top-level-lock' : 'transitive';
      result.push(entry(name, pkg.version, npmLockRelationship(pkg, fallback), 'package-lock.json'));
    }
  } else if (data && data.dependencies && typeof data.dependencies === 'object') {
    const visit = (dependencies, depth) => {
      for (const [name, pkg] of Object.entries(dependencies || {})) {
        if (!pkg || typeof pkg !== 'object') continue;
        const fallback = depth === 0 ? 'direct-or-top-level-lock' : 'transitive';
        result.push(entry(name, pkg.version, npmLockRelationship(pkg, fallback), 'package-lock.json'));
        if (pkg.dependencies && typeof pkg.dependencies === 'object') visit(pkg.dependencies, depth + 1);
      }
    };
    visit(data.dependencies, 0);
  }
  return result;
}

function packageNameFromSelector(selector) {
  const value = selector.trim().replace(/^["']|["']$/g, '');
  if (!value) return '';
  if (value.startsWith('@')) {
    const slash = value.indexOf('/');
    const separator = value.indexOf('@', slash + 1);
    return separator > 0 ? value.slice(0, separator) : '';
  }
  const separator = value.lastIndexOf('@');
  return separator > 0 ? value.slice(0, separator) : value;
}

function parseYarnLock(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  let current = null;
  for (const line of lines) {
    if (line && !/^\s/.test(line) && line.endsWith(':')) {
      const selector = line.slice(0, -1).split(',')[0].trim();
      current = {name: packageNameFromSelector(selector), version: null};
      continue;
    }
    if (current && /^\s+version\s+["']([^"']+)["']/.test(line)) {
      current.version = line.match(/^\s+version\s+["']([^"']+)["']/)[1];
      result.push(entry(current.name, current.version, 'locked-unknown-scope', 'yarn.lock'));
      current = null;
    }
  }
  return result;
}

function parsePnpmLock(text) {
  const result = [];
  let inPackages = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) { inPackages = true; continue; }
    if (/^[A-Za-z][A-Za-z0-9_-]*:\s*$/.test(line) && !/^\s/.test(line)) {
      if (line.trim() !== 'packages:') inPackages = false;
    }
    if (!inPackages || !/^\s{2,}['"]?\/?[^:\s]+@[^:\s]+['"]?:\s*$/.test(line)) continue;
    const raw = line.trim().replace(/^['"]|['"]$/g, '').replace(/:$/, '').replace(/^\//, '');
    const separator = raw.lastIndexOf('@');
    if (separator <= 0) continue;
    let version = raw.slice(separator + 1);
    version = version.replace(/\([^)]*\)$/, '');
    result.push(entry(raw.slice(0, separator), version, 'locked-unknown-scope', 'pnpm-lock.yaml'));
  }
  return result;
}

function parseRequirements(text, filePath) {
  const result = [];
  const baseName = path.basename(String(filePath || '')).toLowerCase();
  const developmentFile = /(?:^|[-_.])(?:dev|development|test|testing)(?:[-_.]|$)/.test(baseName);
  const relationship = developmentFile ? 'direct-development' : 'direct-or-declared';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#') || line.startsWith('-') || line.startsWith('git+')) continue;
    const match = line.match(/^([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\[[^\]]+\])?\s*(.*)$/);
    if (!match) continue;
    result.push(entry(match[1], match[2] || 'unspecified', relationship, path.basename(String(filePath || 'requirements.txt'))));
  }
  return result;
}

function parsePyProject(text) {
  const result = [];
  const projectBlock = text.match(/^\s*dependencies\s*=\s*\[([\s\S]*?)\]/m);
  if (projectBlock) {
    const pattern = /["']([^"']+)["']/g;
    let match;
    while ((match = pattern.exec(projectBlock[1]))) {
      const dependency = match[1].match(/^([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\[[^\]]+\])?\s*(.*)$/);
      if (dependency) result.push(entry(dependency[1], dependency[2] || 'unspecified', 'direct-runtime', 'pyproject.toml'));
    }
  }
  const poetryBlock = text.match(/^\[tool\.poetry\.dependencies\]([\s\S]*?)(?=^\[|\s*$)/m);
  if (poetryBlock) {
    for (const line of poetryBlock[1].split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)")/);
      if (match && match[1].toLowerCase() !== 'python') {
        result.push(entry(match[1], match[2] || match[3], 'direct-runtime', 'pyproject.toml'));
      }
    }
  }
  return result;
}

function parsePoetryLock(text) {
  const result = [];
  const blocks = text.split(/^\[\[package\]\]\s*$/m).slice(1);
  for (const block of blocks) {
    const name = block.match(/^\s*name\s*=\s*"([^"]+)"/m);
    const version = block.match(/^\s*version\s*=\s*"([^"]+)"/m);
    if (name) {
      const groups = block.match(/^\s*groups\s*=\s*\[([^\]]*)\]/m);
      const category = block.match(/^\s*category\s*=\s*"([^"]+)"/m);
      const groupText = groups ? groups[1].toLowerCase() : '';
      let relationship = 'locked-unknown-scope';
      if (/\bmain\b/.test(groupText) || (category && category[1].toLowerCase() === 'main')) relationship = 'locked-runtime';
      else if (/\b(dev|test|docs|development)\b/.test(groupText) ||
          (category && /^(dev|test|development)$/.test(category[1].toLowerCase()))) relationship = 'locked-development';
      result.push(entry(name[1], version && version[1], relationship, 'poetry.lock'));
    }
  }
  return result;
}

function parseComposerManifest(text) {
  const data = JSON.parse(text);
  const result = [];
  for (const [field, relationship] of [['require', 'direct-runtime'], ['require-dev', 'direct-development']]) {
    const values = data && data[field];
    if (!values || typeof values !== 'object') continue;
    for (const [name, version] of Object.entries(values)) {
      if (name !== 'php' && name !== 'ext-*') result.push(entry(name, version, relationship, 'composer.json'));
    }
  }
  return result;
}

function parseComposerLock(text) {
  const data = JSON.parse(text);
  const result = [];
  for (const [field, relationship] of [['packages', 'locked-runtime'], ['packages-dev', 'locked-development']]) {
    for (const pkg of Array.isArray(data && data[field]) ? data[field] : []) {
      result.push(entry(pkg.name, pkg.version, relationship, 'composer.lock'));
    }
  }
  return result;
}

function parseCargoManifest(text) {
  const result = [];
  let relationship = null;
  for (const line of text.split(/\r?\n/)) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) {
      const name = section[1];
      if (name === 'dependencies') relationship = 'direct-runtime';
      else if (name === 'dev-dependencies' || name === 'build-dependencies') relationship = 'direct-development';
      else relationship = null;
      continue;
    }
    if (!relationship) continue;
    const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)")/);
    if (match) result.push(entry(match[1], match[2] || match[3], relationship, 'Cargo.toml'));
  }
  return result;
}

function parseCargoLock(text) {
  const result = [];
  const blocks = text.split(/^\[\[package\]\]\s*$/m).slice(1);
  for (const block of blocks) {
    const name = block.match(/^\s*name\s*=\s*"([^"]+)"/m);
    const version = block.match(/^\s*version\s*=\s*"([^"]+)"/m);
    if (name) result.push(entry(name[1], version && version[1], 'locked-unknown-scope', 'Cargo.lock'));
  }
  return result;
}

function parseGoMod(text) {
  const result = [];
  let inRequire = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    if (line === 'require (') { inRequire = true; continue; }
    if (line === ')') { inRequire = false; continue; }
    const match = line.match(/^(?:require\s+)?([A-Za-z0-9./_-]+)\s+(v[0-9][^\s]*)/);
    if (match && (inRequire || line.startsWith('require '))) {
      result.push(entry(match[1], match[2], 'direct-or-declared', 'go.mod'));
    }
  }
  return result;
}

function parseGemLock(text) {
  const result = [];
  let inSpecs = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^    [^\s].*\s\([^)]*\)\s*$/.test(line) && inSpecs) {
      const match = line.match(/^    ([^\s]+)\s+\(([^)]+)\)/);
      if (match) result.push(entry(match[1], match[2], 'locked-unknown-scope', 'Gemfile.lock'));
    }
    if (/^DEPENDENCIES\s*$/.test(line)) inSpecs = false;
    if (/^  specs\s*$/.test(line)) inSpecs = true;
  }
  return result;
}

function parseMavenPom(text) {
  const result = [];
  const blocks = text.match(/<dependency\b[\s\S]*?<\/dependency>/g) || [];
  for (const block of blocks) {
    const readTag = (tag) => {
      const found = block.match(new RegExp('<' + tag + '>\\s*([^<]+)\\s*</' + tag + '>'));
      return found ? found[1].trim() : '';
    };
    const group = readTag('groupId');
    const artifact = readTag('artifactId');
    const version = readTag('version');
    const scope = readTag('scope').toLowerCase();
    const optional = readTag('optional').toLowerCase() === 'true';
    let relationship = 'direct-runtime';
    if (['test', 'provided', 'system'].includes(scope)) relationship = 'development-or-test';
    else if (optional) relationship = 'direct-optional';
    if (group && artifact) result.push(entry(group + ':' + artifact, version, relationship, 'pom.xml'));
  }
  return result;
}

function parseManifest(filePath, text) {
  const kind = manifestKind(filePath);
  if (!kind) return {recognized: false, manager: null, packages: [], packageCount: 0, truncated: false};
  let packages;
  let manager;
  switch (kind) {
    case 'npm-manifest': manager = 'npm'; packages = parseNpmManifest(text); break;
    case 'npm-lock': manager = 'npm'; packages = parseNpmLock(text); break;
    case 'yarn-lock': manager = 'yarn'; packages = parseYarnLock(text); break;
    case 'pnpm-lock': manager = 'pnpm'; packages = parsePnpmLock(text); break;
    case 'pip-requirements': manager = 'pip'; packages = parseRequirements(text, filePath); break;
    case 'pyproject': manager = 'python'; packages = parsePyProject(text); break;
    case 'poetry-lock': manager = 'poetry'; packages = parsePoetryLock(text); break;
    case 'composer-manifest': manager = 'composer'; packages = parseComposerManifest(text); break;
    case 'composer-lock': manager = 'composer'; packages = parseComposerLock(text); break;
    case 'cargo-manifest': manager = 'cargo'; packages = parseCargoManifest(text); break;
    case 'cargo-lock': manager = 'cargo'; packages = parseCargoLock(text); break;
    case 'go-mod': manager = 'go-modules'; packages = parseGoMod(text); break;
    case 'gem-lock': manager = 'bundler'; packages = parseGemLock(text); break;
    case 'maven-pom': manager = 'maven'; packages = parseMavenPom(text); break;
    default: return {recognized: false, manager: null, packages: [], packageCount: 0, truncated: false};
  }
  packages = uniqueEntries(packages);
  const packageCount = packages.length;
  return {
    recognized: true,
    manager,
    kind,
    packages: packages.slice(0, MAX_PACKAGES_PER_MANIFEST),
    packageCount,
    truncated: packageCount > MAX_PACKAGES_PER_MANIFEST
  };
}

module.exports = {manifestKind, isManifestFile, parseManifest, MAX_PACKAGES_PER_MANIFEST};
