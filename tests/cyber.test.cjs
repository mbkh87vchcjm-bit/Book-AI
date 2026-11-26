'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Policy = require('../desktop/cyber/core/cyber-policy.js');
const Knowledge = require('../desktop/cyber/core/cyber-knowledge.js');

test('default cyber policy is local, read-only, and safe by default', () => {
  const policy = Policy.createPolicy();
  assert.equal(policy.enabled, true);
  assert.equal(policy.mode, 'read-only');
  assert.deepEqual(policy.analyzers, ['builtin', 'ast']);
  assert.equal(policy.capabilities.staticAnalysis, true);
  assert.equal(policy.capabilities.applyRemediations, false);
  assert.equal(policy.capabilities.networkAccess, false);
  assert.equal(policy.capabilities.executeProjectCode, false);
  assert.equal(policy.privacy.localOnly, true);
  assert.equal(policy.privacy.redactSecretValues, true);
  assert.equal(Policy.validatePolicy(policy).valid, true);
});

test('policy hard ceilings reject unsafe resource limits and oversized scopes', () => {
  const oversizedLimit = Policy.createPolicy({
    limits: {maxFileBytes: Policy.HARD_LIMITS.maxFileBytes + 1}
  });
  assert.equal(Policy.validatePolicy(oversizedLimit).valid, false);
  assert.ok(Policy.validatePolicy(oversizedLimit).errors.includes('limits-invalid'));

  const excessiveScope = Policy.createPolicy({
    scope: {allowedPaths: Array.from({length: Policy.MAX_SCOPE_PATHS + 2}, (_, i) => 'src/' + i)}
  });
  assert.equal(Policy.validatePolicy(excessiveScope).valid, false);
  assert.ok(Policy.validatePolicy(excessiveScope).errors.includes('scope-path-count-exceeded'));
  assert.equal(Policy.normalizeRelativePath('a'.repeat(Policy.MAX_PATH_LENGTH + 1)), null);
});

test('policy validation fails safely on malformed scope arrays', () => {
  const malformed = Policy.createPolicy();
  malformed.scope.excludedPaths = null;
  assert.doesNotThrow(() => Policy.validatePolicy(malformed));
  assert.equal(Policy.validatePolicy(malformed).valid, false);
});

test('default policy objects are immutable', () => {
  assert.equal(Object.isFrozen(Policy.DEFAULTS), true);
  assert.equal(Object.isFrozen(Policy.DEFAULTS.limits), true);
  assert.throws(() => { Policy.DEFAULTS.limits.maxFiles = 1; }, TypeError);
});

test('user can configure defensive analysis scope, analyzers, limits, and severity', () => {
  const policy = Policy.createPolicy({
    mode: 'review', scope: {allowedPaths: ['src', 'tests'], excludedPaths: ['src/generated']},
    analyzers: ['builtin', 'ast', 'dependency-audit'], severityThreshold: 'high',
    limits: {maxFiles: 100, maxFileBytes: 500000, maxTotalBytes: 5000000, maxFindings: 50, timeoutMs: 30000},
    capabilities: {remediationSuggestions: true, applyRemediations: true}
  });
  assert.equal(Policy.validatePolicy(policy).valid, true);
  assert.equal(policy.mode, 'review');
  assert.deepEqual(policy.scope.allowedPaths, ['src', 'tests']);
  assert.equal(policy.limits.maxFiles, 100);
  assert.equal(policy.severityThreshold, 'high');
  assert.deepEqual(policy.analyzers, ['builtin', 'ast', 'dependency-audit']);
  assert.equal(policy.capabilities.applyRemediations, false);
});

test('platform guardrails cannot be enabled through user preferences', () => {
  const policy = Policy.createPolicy({
    capabilities: {networkAccess: true, executeProjectCode: true},
    privacy: {localOnly: false, redactSecretValues: false}
  });
  assert.equal(policy.capabilities.networkAccess, false);
  assert.equal(policy.capabilities.executeProjectCode, false);
  assert.equal(policy.privacy.localOnly, true);
  assert.equal(policy.privacy.redactSecretValues, true);
});

test('tampered policy with network or execution enabled is rejected', () => {
  const policy = Policy.createPolicy();
  policy.capabilities.networkAccess = true;
  assert.equal(Policy.validatePolicy(policy).valid, false);
  assert.ok(Policy.validatePolicy(policy).errors.includes('network-access-locked'));
});

test('relative paths are normalized and traversal or absolute paths are rejected', () => {
  assert.equal(Policy.normalizeRelativePath('src\\controllers\\User.php'), 'src/controllers/User.php');
  assert.equal(Policy.normalizeRelativePath('../outside.php'), null);
  assert.equal(Policy.normalizeRelativePath('src/../../secret.txt'), null);
  assert.equal(Policy.normalizeRelativePath('C:\\Users\\me\\file.php'), null);
  assert.equal(Policy.normalizeRelativePath('\\\\server\\share\\file.php'), null);
  assert.equal(Policy.normalizeRelativePath('/etc/passwd'), null);
});

test('path scope allowlist and exclusions are enforced', () => {
  const policy = Policy.createPolicy({scope: {allowedPaths: ['src'], excludedPaths: ['src/generated', 'src/vendor']}});
  assert.equal(Policy.pathDecision('src/app.php', policy).allowed, true);
  assert.equal(Policy.pathDecision('src/generated/build.php', policy).reason, 'path-excluded');
  assert.equal(Policy.pathDecision('docs/readme.md', policy).reason, 'outside-scope');
});

test('file resource limits prevent oversized or excessive scans', () => {
  const policy = Policy.createPolicy({limits: {maxFiles: 2, maxFileBytes: 100, maxTotalBytes: 150, maxFindings: 5, timeoutMs: 1000}});
  assert.equal(Policy.fileLimitDecision({sizeBytes: 50}, policy, {fileCount: 1, totalBytes: 50}).allowed, true);
  assert.equal(Policy.fileLimitDecision({sizeBytes: 101}, policy, {}).reason, 'max-file-bytes-exceeded');
  assert.equal(Policy.fileLimitDecision({sizeBytes: 50}, policy, {fileCount: 2}).reason, 'max-files-exceeded');
  assert.equal(Policy.fileLimitDecision({sizeBytes: 60}, policy, {fileCount: 0, totalBytes: 100}).reason, 'max-total-bytes-exceeded');
  assert.equal(Policy.fileLimitDecision({sizeBytes: 1}, policy, {fileCount: -1, totalBytes: 0}).reason, 'scan-totals-invalid');
  assert.equal(Policy.findingLimitDecision(4, policy).allowed, true);
  assert.equal(Policy.findingLimitDecision(5, policy).reason, 'max-findings-exceeded');
});

test('source analysis fails closed until a relative file path is supplied', () => {
  const policy = Policy.createPolicy();
  assert.equal(Policy.authorizeAction('static-analysis', policy).reason, 'path-required');
});

test('local static analysis is authorized only inside selected scope', () => {
  const policy = Policy.createPolicy({scope: {allowedPaths: ['src']}});
  assert.equal(Policy.authorizeAction('static-analysis', policy, {path: 'src/app.php', analyzer: 'builtin'}).allowed, true);
  assert.equal(Policy.authorizeAction('dependency-inventory', policy, {path: 'src/package.json'}).reason, 'analyzer-not-enabled');
  assert.equal(Policy.authorizeAction('static-analysis', policy, {path: 'docs/app.php'}).reason, 'outside-scope');
  assert.equal(Policy.authorizeAction('static-analysis', policy, {path: 'src/app.php', analyzer: 'semgrep'}).reason, 'analyzer-not-enabled');
});

test('education mode only authorizes learning and concept explanations', () => {
  const policy = Policy.createPolicy({mode: 'education'});
  assert.equal(Policy.authorizeAction('explain-concept', policy).allowed, true);
  assert.equal(Policy.authorizeAction('compare-concepts', policy).allowed, true);
  assert.equal(Policy.authorizeAction('static-analysis', policy).reason, 'education-mode-only');
});

test('fix suggestions are non-mutating and file-changing remediation remains disabled', () => {
  const readOnly = Policy.createPolicy({mode: 'read-only'});
  assert.equal(Policy.authorizeAction('suggest-fix', readOnly, {path: 'src/a.php'}).allowed, true);
  const review = Policy.createPolicy({mode: 'review', capabilities: {remediationSuggestions: true, applyRemediations: true}});
  assert.equal(Policy.authorizeAction('suggest-fix', review, {path: 'src/a.php'}).allowed, true);
  assert.equal(review.capabilities.applyRemediations, false);
  assert.equal(Policy.authorizeAction('apply-fix', review, {
    path: 'src/a.php', userApproved: true, changeSummary: 'Use a parameterized query'
  }).reason, 'remediation-application-not-implemented');

  const tampered = Policy.createPolicy();
  tampered.capabilities.applyRemediations = true;
  assert.equal(Policy.validatePolicy(tampered).valid, false);
});

test('dangerous or out-of-scope active actions remain blocked', () => {
  const policy = Policy.createPolicy({mode: 'review', capabilities: {applyRemediations: true}});
  for (const action of Policy.FIXED_DENIALS) {
    assert.equal(Policy.authorizeAction(action, policy, {userApproved: true}).allowed, false, action);
    assert.equal(Policy.authorizeAction(action, policy).reason, 'blocked-by-platform-safety-policy');
  }
});

test('disabled module denies all operations', () => {
  const policy = Policy.createPolicy({enabled: false});
  assert.equal(Policy.authorizeAction('explain-concept', policy).reason, 'cyber-module-disabled');
  assert.equal(Policy.authorizeAction('static-analysis', policy).reason, 'cyber-module-disabled');
});

test('severity threshold is configurable', () => {
  const policy = Policy.createPolicy({severityThreshold: 'high'});
  assert.equal(Policy.shouldReportSeverity('medium', policy), false);
  assert.equal(Policy.shouldReportSeverity('high', policy), true);
  assert.equal(Policy.shouldReportSeverity('critical', policy), true);
});

test('sensitive values are redacted before display or export', () => {
  assert.equal(Policy.redactSecret(''), '');
  assert.equal(Policy.redactSecret('abc'), '[REDACTED]');
  assert.equal(Policy.redactSecret('ghp_abcdefghijklmnopqrstuvwxyz'), '[REDACTED]');
});

test('concept engine distinguishes authentication and authorization', () => {
  const authn = Knowledge.resolveTerm('Authentication');
  const authz = Knowledge.resolveTerm('Authorization');
  assert.equal(authn.status, 'resolved');
  assert.equal(authz.status, 'resolved');
  assert.notEqual(authn.concept.id, authz.concept.id);
  assert.equal(Knowledge.compareTerms('Authentication', 'Authorization').relation, 'explicit-contrast');
});

test('concept engine distinguishes hashing, encryption, and encoding', () => {
  const comparison = Knowledge.compareTerms('Hashing', 'Encryption');
  assert.equal(comparison.status, 'compared');
  assert.equal(comparison.relation, 'explicit-contrast');
  assert.match(comparison.first.distinction, /أحادية الاتجاه/);
  assert.match(Knowledge.resolveTerm('Encoding').concept.distinction, /ليس تشفيراً/);
});

test('ambiguous token term asks for context instead of guessing', () => {
  const noContext = Knowledge.resolveTerm('token');
  assert.equal(noContext.status, 'ambiguous');
  assert.equal(noContext.matches.length, 3);
  const api = Knowledge.resolveTerm('token', 'API authentication and access control');
  assert.equal(api.status, 'resolved');
  assert.equal(api.concept.id, 'SEC-API-TOKEN-001');
  const llm = Knowledge.resolveTerm('token', 'LLM language model context window');
  assert.equal(llm.status, 'resolved');
  assert.equal(llm.concept.id, 'AI-TOKEN-001');
  const compiler = Knowledge.resolveTerm('token', 'compiler lexer parser');
  assert.equal(compiler.status, 'resolved');
  assert.equal(compiler.concept.id, 'COMP-TOKEN-001');
});

test('Arabic aliases resolve to the same canonical security concept', () => {
  const result = Knowledge.resolveTerm('التحقق من الهوية');
  assert.equal(result.status, 'resolved');
  assert.equal(result.concept.id, 'SEC-AUTHN-001');
});

test('concept list can be filtered by knowledge domain', () => {
  assert.ok(Knowledge.listByDomain('cryptography').length >= 2);
  assert.ok(Knowledge.listByDomain('secure-development').length >= 2);
});

test('knowledge catalog includes source-backed OWASP Top 10 and ASVS concepts', () => {
  const accessControl = Knowledge.resolveTerm('Broken Access Control');
  assert.equal(accessControl.status, 'resolved');
  assert.equal(accessControl.concept.id, 'SEC-BAC-001');
  const accessSources = Knowledge.getReferences(accessControl.concept);
  assert.ok(accessSources.some((source) => source.id === 'OWASP-TOP10-2025-A01' && source.version === '2025'));
  assert.ok(accessSources.some((source) => source.id === 'OWASP-ASVS-5.0.0' && source.version === '5.0.0'));

  const asvs = Knowledge.resolveTerm('OWASP ASVS');
  assert.equal(asvs.status, 'resolved');
  assert.equal(Knowledge.getReferences(asvs.concept)[0].version, '5.0.0');

  const sca = Knowledge.resolveTerm('Software Composition Analysis');
  assert.equal(sca.status, 'resolved');
  assert.match(sca.concept.distinction, /ليس SCA كاملًا/);
  assert.ok(Knowledge.listByDomain('vulnerability-management').length >= 3);
  assert.ok(Knowledge.concepts.length >= 30);
});

test('XSS and CSRF remain distinct, source-backed concepts', () => {
  const xss = Knowledge.resolveTerm('XSS');
  const csrf = Knowledge.resolveTerm('CSRF');
  assert.equal(xss.status, 'resolved');
  assert.equal(csrf.status, 'resolved');
  assert.equal(Knowledge.compareTerms('XSS', 'CSRF').relation, 'explicit-contrast');
  assert.ok(Knowledge.getReferences(xss.concept).some((item) => item.id === 'OWASP-XSS-CHEATSHEET'));

  for (const term of ['MFA', 'RBAC', 'Input Validation', 'Session Management']) {
    assert.equal(Knowledge.resolveTerm(term).status, 'resolved', term);
  }
});

test('every knowledge concept with references resolves all referenced source IDs', () => {
  for (const concept of Knowledge.concepts) {
    if (!Array.isArray(concept.sources) || concept.sources.length === 0) continue;
    assert.equal(Knowledge.getReferences(concept).length, concept.sources.length, concept.id);
  }
  assert.ok(Knowledge.concepts.length >= 35);
});
