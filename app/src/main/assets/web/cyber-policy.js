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
  var ANALYZERS = ['builtin', 'semgrep', 'dependency-audit', 'secret-patterns'];
  var MODES = ['disabled', 'education', 'read-only', 'review'];
  var DEFAULTS = {
    version: 1, enabled: true, mode: 'read-only',
    scope: {allowedPaths: ['.'], excludedPaths: ['.git', 'node_modules', 'vendor', 'dist', 'build', '.midad', 'coverage']},
    limits: {maxFiles: 5000, maxFileBytes: 1048576, maxTotalBytes: 104857600, maxFindings: 2000, timeoutMs: 120000},
    analyzers: ['builtin'], severityThreshold: 'info',
    capabilities: {staticAnalysis: true, dependencyInventory: true, secretDetection: true,
      remediationSuggestions: true, applyRemediations: false, networkAccess: false, executeProjectCode: false},
    privacy: {redactSecretValues: true, retainSourceSnippets: false, localOnly: true}
  };
  var FIXED_DENIALS = Object.freeze([
    'network-scan', 'remote-target-scan', 'exploit-validation', 'credential-access',
    'credential-dumping', 'stealth', 'persistence', 'security-control-bypass', 'execute-code'
  ]);
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj || {}, key); }
  function copyArray(value, fallback) { return Array.isArray(value) ? value.slice() : fallback.slice(); }
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
        allowedPaths: copyArray(scope.allowedPaths, DEFAULTS.scope.allowedPaths),
        excludedPaths: copyArray(scope.excludedPaths, DEFAULTS.scope.excludedPaths)
      },
      limits: mergeObject(DEFAULTS.limits, limits, ['maxFiles', 'maxFileBytes', 'maxTotalBytes', 'maxFindings', 'timeoutMs']),
      analyzers: copyArray(input.analyzers, DEFAULTS.analyzers),
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
    if (!policy.scope || !Array.isArray(policy.scope.allowedPaths) ||
        !Array.isArray(policy.scope.excludedPaths) || !policy.scope.allowedPaths.length) errors.push('scope-invalid');
    if (!policy.limits || !['maxFiles', 'maxFileBytes', 'maxTotalBytes', 'maxFindings', 'timeoutMs'].every(function (key) {
      return Number.isSafeInteger(policy.limits[key]) && policy.limits[key] > 0;
    })) errors.push('limits-invalid');
    if (!Array.isArray(policy.analyzers) ||
        policy.analyzers.some(function (name) { return ANALYZERS.indexOf(name) < 0; })) errors.push('analyzers-invalid');
    if (!own(SEVERITY, policy.severityThreshold)) errors.push('severity-invalid');
    if (!policy.capabilities || typeof policy.capabilities !== 'object') errors.push('capabilities-invalid');
    else {
      if (policy.capabilities.networkAccess !== false) errors.push('network-access-locked');
      if (policy.capabilities.executeProjectCode !== false) errors.push('code-execution-locked');
    }
    if (!policy.privacy || policy.privacy.localOnly !== true || policy.privacy.redactSecretValues !== true) {
      errors.push('privacy-guardrail-invalid');
    }
    return {valid: errors.length === 0, errors: errors};
  }
  function normalizeRelativePath(input) {
    if (typeof input !== 'string' || !input.trim()) return null;
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
    var info = fileInfo || {}, count = Number(totals && totals.fileCount) || 0;
    var totalBytes = Number(totals && totals.totalBytes) || 0, size = Number(info.sizeBytes);
    if (!Number.isSafeInteger(size) || size < 0) return {allowed: false, reason: 'file-size-invalid'};
    if (count >= policy.limits.maxFiles) return {allowed: false, reason: 'max-files-exceeded'};
    if (size > policy.limits.maxFileBytes) return {allowed: false, reason: 'max-file-bytes-exceeded'};
    if (totalBytes + size > policy.limits.maxTotalBytes) return {allowed: false, reason: 'max-total-bytes-exceeded'};
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
    if (ctx.path) {
      var pathResult = pathDecision(ctx.path, policy);
      if (!pathResult.allowed) return {allowed: false, reason: pathResult.reason, path: pathResult.path};
    }
    if (ctx.analyzer && policy.analyzers.indexOf(ctx.analyzer) < 0) return {allowed: false, reason: 'analyzer-not-enabled'};
    if (action === 'apply-fix') {
      if (policy.mode !== 'review') return {allowed: false, reason: 'review-mode-required'};
      if (ctx.userApproved !== true) return {allowed: false, reason: 'explicit-user-approval-required'};
      if (ctx.changeSummary && typeof ctx.changeSummary !== 'string') return {allowed: false, reason: 'change-summary-invalid'};
    }
    if (action === 'suggest-fix' && policy.mode !== 'review') return {allowed: false, reason: 'review-mode-required'};
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
    return text.slice(0, 3) + '…[REDACTED]…' + text.slice(-2);
  }
  return {
    DEFAULTS: DEFAULTS, MODES: MODES.slice(), ANALYZERS: ANALYZERS.slice(), FIXED_DENIALS: FIXED_DENIALS.slice(),
    createPolicy: createPolicy, validatePolicy: validatePolicy, normalizeRelativePath: normalizeRelativePath,
    pathDecision: pathDecision, fileLimitDecision: fileLimitDecision, authorizeAction: authorizeAction,
    shouldReportSeverity: shouldReportSeverity, redactSecret: redactSecret
  };
}));
