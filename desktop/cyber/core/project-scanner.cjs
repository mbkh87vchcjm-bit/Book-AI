'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const Policy = require('./cyber-policy.js');

const SOURCE_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cxx', '.h', '.hpp', '.cs', '.java',
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.php', '.py',
  '.rb', '.go', '.rs', '.sql', '.json', '.yaml', '.yml', '.toml',
  '.ini', '.conf', '.xml', '.properties', '.env', '.sh', '.ps1'
]);
const SOURCE_NAMES = new Set(['dockerfile', 'makefile', '.env', '.env.example', '.env.sample']);
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage',
  '.midad', '.next', '.venv', 'venv', 'target', 'bin', 'obj'
]);

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function isSourceFile(filePath) {
  const base = path.basename(filePath).toLowerCase();
  return SOURCE_NAMES.has(base) || SOURCE_EXTENSIONS.has(path.extname(base));
}

function redactLine(line, matchedValue) {
  if (!matchedValue) return 'مقتطف مخفي وفق إعدادات الخصوصية';
  return String(line).replace(matchedValue, '[REDACTED]').slice(0, 240);
}

function makeRules() {
  return [
    {
      id: 'CYB-SECRET-001', analyzer: 'secret-patterns', severity: 'high', confidence: 'medium',
      title: 'قيمة اعتماد مكتوبة مباشرة في المصدر',
      description: 'قد يحتوي السطر على كلمة مرور أو مفتاح أو رمز وصول ثابت.',
      recommendation: 'انقل القيمة إلى مخزن أسرار أو متغير بيئة، وألغِ أي اعتماد حقيقي كُشف سابقاً ثم أنشئ بديلاً.',
      pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|secret)\b\s*[:=]\s*["']([^"']{6,})["']/i,
      reference: 'OWASP Secrets Management Cheat Sheet'
    },
    {
      id: 'CYB-CODE-001', analyzer: 'builtin', severity: 'medium', confidence: 'low',
      title: 'استدعاء دالة تقييم أو تنفيذ ديناميكي',
      description: 'الدوال الديناميكية قد تنفذ نصاً أوامر أو شيفرة غير موثوقة إذا لم تُضبط المدخلات.',
      recommendation: 'تجنب التقييم الديناميكي متى أمكن، واستخدم واجهات محددة ومدخلات مقيدة.',
      pattern: /\beval\s*\(/i,
      reference: 'OWASP Secure Coding Practices'
    },
    {
      id: 'CYB-SQL-001', analyzer: 'builtin', severity: 'high', confidence: 'low',
      title: 'نمط محتمل لبناء استعلام SQL بمدخلات متغيرة',
      description: 'ظهر في السطر استعلام SQL مع تركيب نصي ومدخل يشبه بيانات طلب المستخدم.',
      recommendation: 'راجع مسار البيانات واستخدم الاستعلامات المجهزة والربط بالمعاملات بدلاً من تركيب SQL كنص.',
      pattern: /\b(?:select|insert|update|delete)\b.*(?:\+|\.\s*\$|request\.(?:query|body)|req\.(?:query|body)|\$_(?:GET|POST|REQUEST))/i,
      reference: 'OWASP SQL Injection Prevention Cheat Sheet'
    },
    {
      id: 'CYB-XSS-001', analyzer: 'builtin', severity: 'medium', confidence: 'low',
      title: 'إسناد محتوى متغير إلى innerHTML',
      description: 'قد يؤدي إسناد محتوى غير موثوق إلى innerHTML إلى إدخال HTML غير آمن.',
      recommendation: 'استخدم textContent عند عرض النص، أو Sanitizer موثوقاً عند الحاجة إلى HTML.',
      pattern: /\binnerHTML\s*=\s*.*(?:\+|\$\{)/i,
      reference: 'OWASP Cross Site Scripting Prevention Cheat Sheet'
    }
  ];
}

function isTextBuffer(buffer) {
  if (buffer.includes(0)) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8');
  return !sample.includes('\uFFFD');
}


async function readBufferBounded(filePath, maxBytes, deadline) {
  const handle = await fs.open(filePath, 'r');
  try {
    const current = await handle.stat();
    if (!current.isFile()) return {ok: false, reason: 'not-a-regular-file'};
    if (current.size > maxBytes) return {ok: false, reason: 'max-file-bytes-exceeded'};
    const chunks = [];
    const block = Buffer.alloc(64 * 1024);
    let offset = 0;
    while (offset <= maxBytes) {
      if (Date.now() > deadline) return {ok: false, reason: 'timeout'};
      const requestBytes = Math.min(block.length, maxBytes + 1 - offset);
      if (requestBytes <= 0) break;
      const result = await handle.read(block, 0, requestBytes, offset);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
      if (offset > maxBytes) return {ok: false, reason: 'max-file-bytes-exceeded'};
      chunks.push(Buffer.from(block.subarray(0, result.bytesRead)));
    }
    return {ok: true, buffer: Buffer.concat(chunks, offset)};
  } finally {
    await handle.close();
  }
}

function summarize(findings) {
  const result = {critical: 0, high: 0, medium: 0, low: 0, info: 0};
  findings.forEach((finding) => {
    if (Object.prototype.hasOwnProperty.call(result, finding.severity)) result[finding.severity] += 1;
  });
  return result;
}

async function scanProject(options) {
  const input = options || {};
  const policy = input.policy && input.policy.scope ? input.policy : Policy.createPolicy(input.policy);
  const validation = Policy.validatePolicy(policy);
  if (!validation.valid) return {ok: false, error: 'invalid-policy', details: validation.errors};
  if (!policy.enabled || policy.mode === 'disabled' || policy.mode === 'education') {
    return {ok: false, error: 'scanning-disabled-by-mode'};
  }
  if (!input.root || typeof input.root !== 'string') return {ok: false, error: 'project-root-required'};

  let root;
  try {
    root = await fs.realpath(input.root);
    const rootStat = await fs.stat(root);
    if (!rootStat.isDirectory()) return {ok: false, error: 'project-root-not-directory'};
  } catch (_) {
    return {ok: false, error: 'project-root-unavailable'};
  }

  const startedAt = Date.now();
  const findings = [];
  const warnings = [];
  let scannedFiles = 0;
  let skippedFiles = 0;
  let totalBytes = 0;
  let stoppedReason = null;
  const rules = makeRules();

  async function inspectFile(absolutePath, relativePath) {
    if (Date.now() - startedAt > policy.limits.timeoutMs) {
      stoppedReason = 'timeout';
      return;
    }
    if (!isSourceFile(absolutePath)) {
      skippedFiles += 1;
      return;
    }
    const scope = Policy.pathDecision(relativePath, policy);
    if (!scope.allowed) {
      skippedFiles += 1;
      return;
    }

    let stat;
    let canonical;
    try {
      stat = await fs.lstat(absolutePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        skippedFiles += 1;
        return;
      }
      canonical = await fs.realpath(absolutePath);
    } catch (_) {
      skippedFiles += 1;
      warnings.push({code: 'file-unavailable', path: relativePath});
      return;
    }
    if (!isWithin(root, canonical)) {
      skippedFiles += 1;
      warnings.push({code: 'path-escape-blocked', path: relativePath});
      return;
    }

    const limit = Policy.fileLimitDecision(
      {sizeBytes: stat.size}, policy, {fileCount: scannedFiles, totalBytes: totalBytes}
    );
    if (!limit.allowed) {
      if (limit.reason === 'max-file-bytes-exceeded') {
        skippedFiles += 1;
        warnings.push({code: limit.reason, path: relativePath});
      } else {
        stoppedReason = limit.reason;
      }
      return;
    }

    let readResult;
    try {
      readResult = await readBufferBounded(canonical, policy.limits.maxFileBytes, startedAt + policy.limits.timeoutMs);
    } catch (_) {
      skippedFiles += 1;
      warnings.push({code: 'file-read-failed', path: relativePath});
      return;
    }
    if (!readResult.ok) {
      if (readResult.reason === 'timeout') stoppedReason = 'timeout';
      else {
        skippedFiles += 1;
        warnings.push({code: readResult.reason, path: relativePath});
      }
      return;
    }
    const buffer = readResult.buffer;
    if (!isTextBuffer(buffer)) {
      skippedFiles += 1;
      return;
    }

    const lines = buffer.toString('utf8').split(/\r?\n/);
    scannedFiles += 1;
    totalBytes += buffer.length;

    for (let index = 0; index < lines.length; index += 1) {
      if (Date.now() - startedAt > policy.limits.timeoutMs) {
        stoppedReason = 'timeout';
        return;
      }
      const line = lines[index];
      for (const rule of rules) {
        if (findings.length >= policy.limits.maxFindings) {
          stoppedReason = 'max-findings-exceeded';
          return;
        }
        const action = rule.analyzer === 'secret-patterns' ? 'secret-pattern-scan' : 'static-analysis';
        const authorized = Policy.authorizeAction(action, policy, {
          path: relativePath, analyzer: rule.analyzer
        });
        if (!authorized.allowed) continue;
        if (!Policy.shouldReportSeverity(rule.severity, policy)) continue;

        const match = line.match(rule.pattern);
        if (!match) continue;
        const showEvidence = policy.privacy.retainSourceSnippets === true;
        const secretValue = rule.analyzer === 'secret-patterns' ? match[1] : match[0];
        findings.push({
          id: rule.id,
          analyzer: rule.analyzer,
          severity: rule.severity,
          confidence: rule.confidence,
          title: rule.title,
          description: rule.description,
          recommendation: rule.recommendation,
          file: relativePath,
          line: index + 1,
          evidence: showEvidence ? redactLine(line, secretValue) : null,
          evidenceHidden: !showEvidence,
          reference: rule.reference
        });
        if (findings.length >= policy.limits.maxFindings) {
          stoppedReason = 'max-findings-exceeded';
          return;
        }
      }
    }
  }

  async function walk(directory, relativeDirectory) {
    if (stoppedReason) return;
    if (Date.now() - startedAt > policy.limits.timeoutMs) {
      stoppedReason = 'timeout';
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(directory, {withFileTypes: true});
    } catch (_) {
      warnings.push({code: 'directory-read-failed', path: relativeDirectory || '.'});
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (stoppedReason) return;
      const relativePath = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        skippedFiles += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name.toLowerCase())) {
          skippedFiles += 1;
          continue;
        }
        const excluded = policy.scope.excludedPaths.some((excludedPath) => {
          const normalized = Policy.normalizeRelativePath(excludedPath);
          return normalized !== null &&
            (relativePath === normalized || relativePath.startsWith(normalized + '/'));
        });
        if (!excluded) await walk(absolutePath, relativePath);
        continue;
      }
      if (entry.isFile()) await inspectFile(absolutePath, relativePath);
    }
  }

  await walk(root, '');
  const filtered = findings.filter((finding) => Policy.shouldReportSeverity(finding.severity, policy));
  return {
    ok: true,
    reportVersion: 1,
    project: path.basename(root),
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    scannedFiles,
    skippedFiles,
    totalBytes,
    stoppedReason,
    severitySummary: summarize(filtered),
    findings: filtered,
    warnings: warnings.slice(0, 100),
    execution: {localOnly: true, projectCodeExecuted: false, networkAccessUsed: false, filesModified: false}
  };
}

module.exports = {scanProject, isSourceFile, isWithin, summarize};
