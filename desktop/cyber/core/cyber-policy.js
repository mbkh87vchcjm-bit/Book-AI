/* Midad Cyber Policy — configurable defensive analysis controls.
 * This module authorizes local, defensive workflows only. It does not execute
 * project code, contact remote targets, or perform exploitation.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MidadCyberPolicy = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var SEVERITY = {info: 0, low: 1, medium: 2, high: 3, critical: 4};
  var ANALYZERS = ['builtin', 'ast', 'semgrep', 'dependency-audit', 'secret-patterns'];
  var MODES = ['disabled', 'education', 'read-only', 'review'];
  var HARD_LIMITS = Object.freeze({
    maxFiles: 25000,
    maxFileBytes: 10 * 1024 * 1024,
    maxTotalBytes: 512 * 1024 * 1024,
    maxFindings: 10000,
    timeoutMs: 10 * 60 * 1000
  });
  var MAX_SCOPE_PATHS = 100;
  var MAX_PATH_LENGTH = 1024;
  var DEFAULTS = {
    version: 1, enabled: true, mode: 'read-only',
    scope: {allowedPaths: ['.'], excludedPaths: ['.git', 'node_modules', 'vendor', 'dist', 'build', '.midad', 'coverage']},
    limits: {maxFiles: 5000, maxFileBytes: 1048576, maxTotalBytes: 104857600, maxFindings: 2000, timeoutMs: 120000},
    analyzers: ['builtin', 'ast'], severityThreshold: 'info',
    capabilities: {staticAnalysis: true, dependencyInventory: true, secretDetection: true,
      remediationSuggestions: true, applyRemediations: false, networkAccess: false, executeProjectCode: false},
    privacy: {redactSecretValues: true, retainSourceSnippets: false, localOnly: true}
  };
  Object.freeze(DEFAULTS.scope.allowedPaths);
  Object.freeze(DEFAULTS.scope.excludedPaths);
  Object.freeze(DEFAULTS.scope);
  Object.freeze(DEFAULTS.limits);
  Object.freeze(DEFAULTS.analyzers);
  Object.freeze(DEFAULTS.capabilities);
  Object.freeze(DEFAULTS.privacy);
  Object.freeze(DEFAULTS);
  var FIXED_DENIALS = Object.freeze([
    'network-scan', 'remote-target-scan', 'exploit-validation', 'credential-access',
    'credential-dumping', 'stealth', 'persistence', 'security-control-bypass', 'execute-code'
  ]);
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj || {}, key); }
  function copyArray(value, fallback, maximum) {
    return Array.isArray(value) ? value.slice(0, maximum || 1000) : fallback.slice();
  }
  function mergeObject(base, overrides, keys) {
    var result = {};
    keys.forEach(function (key) { result[key] = own(overrides, key) ? overrides[key] : base[key]; });
    return result;
  }
  function createPolicy(overrides) {
    var input = overrides && typeof overrides === 'object' ? overrides : {};
    var scope = input.scope && typeof input.scope === 'object' ? input.scope : {};
    var limits = input.limits && typeof input.limits === 'object' ? input.limits : {};
    var capabilities = input.capabilities && typeof input.capabilities === 'object' ? input.capabilities : {};
    var privacy = input.privacy && typeof input.privacy === 'object' ? input.privacy : {};
    var policy = {
      version: 1,
      enabled: own(input, 'enabled') ? input.enabled === true : DEFAULTS.enabled,
      mode: MODES.indexOf(input.mode) >= 0 ? input.mode : DEFAULTS.mode,
      scope: {
        allowedPaths: copyArray(scope.allowedPaths, DEFAULTS.scope.allowedPaths, MAX_SCOPE_PATHS + 1),
        excludedPaths: copyArray(scope.excludedPaths, DEFAULTS.scope.excludedPaths, MAX_SCOPE_PATHS + 1)
      },
      limits: mergeObject(DEFAULTS.limits, limits, ['maxFiles', 'maxFileBytes', 'maxTotalBytes', 'maxFindings', 'timeoutMs']),
      analyzers: copyArray(input.analyzers, DEFAULTS.analyzers, ANALYZERS.length + 1),
      severityThreshold: own(input, 'severityThreshold') ? input.severityThreshold : DEFAULTS.severityThreshold,
      capabilities: mergeObject(DEFAULTS.capabilities, capabilities,
        ['staticAnalysis', 'dependencyInventory', 'secretDetection', 'remediationSuggestions',
         'applyRemediations', 'networkAccess', 'executeProjectCode']),
      privacy: mergeObject(DEFAULTS.privacy, privacy, ['redactSecretValues', 'retainSourceSnippets', 'localOnly'])
    };
    // Platform guardrails are not user preferences.
    policy.capabilities.networkAccess = false;
    policy.capabilities.executeProjectCode = false;
    policy.privacy.localOnly = true;
    policy.privacy.redactSecretValues = true;
    return policy;
  }
  function validatePolicy(policy) {
    var errors = [];
    if (!policy || typeof policy !== 'object') return {valid: false, errors: ['policy-invalid']};
    if (policy.version !== 1) errors.push('version-unsupported');
    if (typeof policy.enabled !== 'boolean') errors.push('enabled-invalid');
    if (MODES.indexOf(policy.mode) < 0) errors.push('mode-invalid');
    var hasValidScopeArrays = policy.scope &&
      Array.isArray(policy.scope.allowedPaths) &&
      Array.isArray(policy.scope.excludedPaths);
    if (!hasValidScopeArrays || policy.scope.allowedPaths.length === 0) {
      errors.push('scope-invalid');
    } else {
      if (policy.scope.allowedPaths.length > MAX_SCOPE_PATHS ||
          policy.scope.excludedPaths.length > MAX_SCOPE_PATHS) errors.push('scope-path-count-exceeded');
      var scopePaths = policy.scope.allowedPaths.concat(policy.scope.excludedPaths);
      if (scopePaths.some(function (entry) {
        return typeof entry !== 'string' || entry.length > MAX_PATH_LENGTH ||
          normalizeRelativePath(entry) === null;
      })) errors.push('scope-path-invalid');
    }
    if (!policy.limits || !Object.keys(HARD_LIMITS).every(function (key) {
      return Number.isSafeInteger(policy.limits[key]) &&
        policy.limits[key] > 0 && policy.limits[key] <= HARD_LIMITS[key];
    })) errors.push('limits-invalid');
    if (!Array.isArray(policy.analyzers) ||
        policy.analyzers.length > ANALYZERS.length ||
        new Set(policy.analyzers).size !== policy.analyzers.length ||
        policy.analyzers.some(function (name) { return ANALYZERS.indexOf(name) < 0; })) errors.push('analyzers-invalid');
    if (!own(SEVERITY, policy.severityThreshold)) errors.push('severity-invalid');
    if (!policy.capabilities || typeof policy.capabilities !== 'object') errors.push('capabilities-invalid');
    else {
      ['staticAnalysis', 'dependencyInventory', 'secretDetection', 'remediationSuggestions', 'applyRemediations', 'networkAccess', 'executeProjectCode'].forEach(function (key) {
        if (typeof policy.capabilities[key] !== 'boolean') errors.push('capability-flag-invalid:' + key);
      });
      if (policy.capabilities.networkAccess !== false) errors.push('network-access-locked');
      if (policy.capabilities.executeProjectCode !== false) errors.push('code-execution-locked');
    }
    if (!policy.privacy || typeof policy.privacy.retainSourceSnippets !== 'boolean' ||
        policy.privacy.localOnly !== true || policy.privacy.redactSecretValues !== true) {
      errors.push('privacy-guardrail-invalid');
    }
    return {valid: errors.length === 0, errors: errors};
  }
  function normalizeRelativePath(input) {
    if (typeof input !== 'string' || !input.trim() || input.length > MAX_PATH_LENGTH) return null;
    var value = input.replace(/\\/g, '/').trim();
    if (value.indexOf('\0') >= 0 || /^([a-zA-Z]:|\/|\/\/)/.test(value)) return null;
    var parts = value.split('/').filter(Boolean);
    if (parts.some(function (part) { return part === '..' || (part === '.' && parts.length > 1); })) return null;
    if (parts.some(function (part) { return part.indexOf(':') >= 0; })) return null;
    return parts.join('/') || '.';
  }
  function isWithin(candidate, rootPath) {
    if (rootPath === '.') return true;
    return candidate === rootPath || candidate.indexOf(rootPath + '/') === 0;
  }
  function pathDecision(filePath, policyInput) {
    var policy = policyInput && policyInput.scope ? policyInput : createPolicy(policyInput);
    var normalized = normalizeRelativePath(filePath);
    if (normalized === null) return {allowed: false, reason: 'path-not-relative-or-traversal', path: null};
    var excluded = policy.scope.excludedPaths.some(function (entry) {
      var normalizedEntry = normalizeRelativePath(entry);
      return normalizedEntry !== null && isWithin(normalized, normalizedEntry);
    });
    if (excluded) return {allowed: false, reason: 'path-excluded', path: normalized};
    var allowed = policy.scope.allowedPaths.some(function (entry) {
      var rootPath = normalizeRelativePath(entry);
      return rootPath !== null && isWithin(normalized, rootPath);
    });
    return {allowed: allowed, reason: allowed ? 'within-scope' : 'outside-scope', path: normalized};
  }
  function fileLimitDecision(fileInfo, policyInput, totals) {
    var policy = policyInput && policyInput.limits ? policyInput : createPolicy(policyInput);
    var info = fileInfo || {};
    var count = totals && totals.fileCount !== undefined ? Number(totals.fileCount) : 0;
    var totalBytes = totals && totals.totalBytes !== undefined ? Number(totals.totalBytes) : 0;
    var size = Number(info.sizeBytes);
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(totalBytes) || totalBytes < 0) {
      return {allowed: false, reason: 'scan-totals-invalid'};
    }
    if (!Number.isSafeInteger(size) || size < 0) return {allowed: false, reason: 'file-size-invalid'};
    if (count >= policy.limits.maxFiles) return {allowed: false, reason: 'max-files-exceeded'};
    if (size > policy.limits.maxFileBytes) return {allowed: false, reason: 'max-file-bytes-exceeded'};
    if (totalBytes + size > policy.limits.maxTotalBytes) return {allowed: false, reason: 'max-total-bytes-exceeded'};
    return {allowed: true, reason: 'within-limits'};
  }
  function findingLimitDecision(currentFindings, policyInput) {
    var policy = policyInput && policyInput.limits ? policyInput : createPolicy(policyInput);
    var count = Number(currentFindings);
    if (!Number.isSafeInteger(count) || count < 0) return {allowed: false, reason: 'finding-count-invalid'};
    if (count >= policy.limits.maxFindings) return {allowed: false, reason: 'max-findings-exceeded'};
    return {allowed: true, reason: 'within-limits'};
  }
  function authorizeAction(action, policyInput, context) {
    var policy = policyInput && policyInput.capabilities ? policyInput : createPolicy(policyInput);
    var ctx = context || {}, validation = validatePolicy(policy);
    if (!validation.valid) return {allowed: false, reason: 'invalid-policy', details: validation.errors};
    if (!policy.enabled || policy.mode === 'disabled') return {allowed: false, reason: 'cyber-module-disabled'};
    if (FIXED_DENIALS.indexOf(action) >= 0) return {allowed: false, reason: 'blocked-by-platform-safety-policy'};
    if (action === 'explain-concept' || action === 'compare-concepts' || action === 'generate-study-questions') {
      return {allowed: true, reason: 'educational-action'};
    }
    if (policy.mode === 'education') return {allowed: false, reason: 'education-mode-only'};
    var capabilityByAction = {
      'read-source': null, 'static-analysis': 'staticAnalysis',
      'dependency-inventory': 'dependencyInventory', 'secret-pattern-scan': 'secretDetection',
      'security-review': 'staticAnalysis', 'generate-report': null,
      'suggest-fix': 'remediationSuggestions', 'apply-fix': 'applyRemediations'
    };
    if (!own(capabilityByAction, action)) return {allowed: false, reason: 'action-not-recognized'};
    var capability = capabilityByAction[action];
    if (capability && policy.capabilities[capability] !== true) {
      return {allowed: false, reason: 'capability-disabled', capability: capability};
    }
    var pathRequired = ['read-source', 'static-analysis', 'dependency-inventory', 'secret-pattern-scan', 'security-review', 'suggest-fix', 'apply-fix'].indexOf(action) >= 0;
    if (pathRequired && !ctx.path) return {allowed: false, reason: 'path-required'};
    if (ctx.path) {
      var pathResult = pathDecision(ctx.path, policy);
      if (!pathResult.allowed) return {allowed: false, reason: pathResult.reason, path: pathResult.path};
    }
    var defaultAnalyzer = {
      'static-analysis': 'builtin', 'security-review': 'builtin',
      'dependency-inventory': 'dependency-audit', 'secret-pattern-scan': 'secret-patterns'
    }[action];
    var selectedAnalyzer = ctx.analyzer || defaultAnalyzer;
    if (selectedAnalyzer && policy.analyzers.indexOf(selectedAnalyzer) < 0) {
      return {allowed: false, reason: 'analyzer-not-enabled', analyzer: selectedAnalyzer};
    }
    if (action === 'apply-fix') {
      if (policy.mode !== 'review') return {allowed: false, reason: 'review-mode-required'};
      if (ctx.userApproved !== true) return {allowed: false, reason: 'explicit-user-approval-required'};
      if (typeof ctx.changeSummary !== 'string' || !ctx.changeSummary.trim()) return {allowed: false, reason: 'change-summary-required'};
    }
    return {allowed: true, reason: 'authorized'};
  }
  function shouldReportSeverity(severity, policyInput) {
    var policy = policyInput && policyInput.severityThreshold ? policyInput : createPolicy(policyInput);
    if (!own(SEVERITY, severity) || !own(SEVERITY, policy.severityThreshold)) return false;
    return SEVERITY[severity] >= SEVERITY[policy.severityThreshold];
  }
  function redactSecret(value) {
    var text = String(value == null ? '' : value);
    if (!text) return '';
    if (text.length <= 8) return '[REDACTED]';
    return '[REDACTED]';
  }
  return {
    DEFAULTS: DEFAULTS, HARD_LIMITS: HARD_LIMITS, MAX_SCOPE_PATHS: MAX_SCOPE_PATHS,
    MODES: MODES.slice(), ANALYZERS: ANALYZERS.slice(), FIXED_DENIALS: FIXED_DENIALS.slice(),
    createPolicy: createPolicy, validatePolicy: validatePolicy, normalizeRelativePath: normalizeRelativePath,
    pathDecision: pathDecision, fileLimitDecision: fileLimitDecision, authorizeAction: authorizeAction,
    findingLimitDecision: findingLimitDecision, shouldReportSeverity: shouldReportSeverity, redactSecret: redactSecret
  };
}));
