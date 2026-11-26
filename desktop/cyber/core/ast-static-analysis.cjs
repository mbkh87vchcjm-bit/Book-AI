'use strict';

const path = require('node:path');
let parser = null;
try { parser = require('@babel/parser'); } catch (_) {}

const SUPPORTED = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const REQUEST_NAMES = new Set(['req', 'request', 'params', 'query', 'body', 'input', 'userinput', 'formdata']);
const MAX_NODES = 200000;

function supportsFile(filePath) {
  return SUPPORTED.has(path.extname(String(filePath || '')).toLowerCase());
}

function memberName(node) {
  if (!node || node.type !== 'MemberExpression') return null;
  if (!node.computed && node.property && node.property.type === 'Identifier') return node.property.name;
  if (node.computed && node.property &&
      (node.property.type === 'StringLiteral' || node.property.type === 'Literal')) return String(node.property.value);
  return null;
}

function inspectExpression(root) {
  const stack = [root];
  const identifiers = new Set();
  let dynamic = false;
  let visited = 0;
  while (stack.length && visited < 50000) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') continue;
    visited += 1;
    if (node.type === 'Identifier') identifiers.add(node.name.toLowerCase());
    if (node.type === 'BinaryExpression' && node.operator === '+') dynamic = true;
    if (node.type === 'TemplateLiteral' && node.expressions && node.expressions.length) dynamic = true;
    if (node.type === 'ConditionalExpression' || node.type === 'CallExpression') dynamic = true;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child && child.type) stack.push(child);
      } else if (value && value.type) stack.push(value);
    }
  }
  return {
    dynamic,
    hasRequestSource: Array.from(identifiers).some((name) => REQUEST_NAMES.has(name))
  };
}

function isDynamicValue(node) {
  if (!node) return false;
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral'].includes(node.type)) return false;
  if (node.type === 'TemplateLiteral') return Boolean(node.expressions && node.expressions.length);
  return true;
}

function callName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return memberName(node);
  return null;
}

function finding(id, severity, confidence, title, description, recommendation, node) {
  return {id, severity, confidence, title, description, recommendation, line: node.loc && node.loc.start.line || 1};
}

function analyze(source, filePath) {
  if (!parser) return {ok: false, code: 'parser-unavailable', findings: [], nodeCount: 0};
  if (!supportsFile(filePath)) return {ok: true, code: 'unsupported-file-type', findings: [], nodeCount: 0};

  let ast;
  try {
    const extension = path.extname(filePath).toLowerCase();
    const plugins = ['jsx'];
    if (extension === '.ts' || extension === '.tsx') plugins.push('typescript');
    ast = parser.parse(source, {
      sourceType: 'unambiguous', plugins,
      errorRecovery: false, attachComment: false, tokens: false,
      allowAwaitOutsideFunction: true
    });
  } catch (_) {
    return {ok: false, code: 'syntax-parse-failed', findings: [], nodeCount: 0};
  }

  const findings = [];
  const seen = new Set();
  const stack = [ast.program];
  let nodeCount = 0;
  let truncated = false;

  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') continue;
    nodeCount += 1;
    if (nodeCount > MAX_NODES) { truncated = true; break; }
    let result = null;

    if (node.type === 'CallExpression' && node.callee &&
        node.callee.type === 'Identifier' && node.callee.name === 'eval') {
      result = finding('AST-EVAL-001', 'medium', 'high',
        'استدعاء eval مؤكد بنيوياً',
        'تم التعرف على eval كاستدعاء فعلي في شجرة بناء الجملة، وليس كنص أو تعليق.',
        'تجنب التقييم الديناميكي ولا تمرر مدخلات المستخدم إلى منفذ شيفرة.', node);
    } else if (node.type === 'NewExpression' && node.callee &&
        node.callee.type === 'Identifier' && node.callee.name === 'Function') {
      result = finding('AST-FUNCTION-001', 'medium', 'high',
        'إنشاء دالة من نص وقت التشغيل',
        'استخدام منشئ Function يحول نصاً إلى شيفرة قابلة للتنفيذ.',
        'استخدم دوالاً ثابتة محددة بدلاً من إنشاء الشيفرة كنص.', node);
    } else if (node.type === 'AssignmentExpression' && node.left &&
        node.left.type === 'MemberExpression' &&
        ['innerHTML', 'outerHTML'].includes(memberName(node.left)) && isDynamicValue(node.right)) {
      result = finding('AST-XSS-001', 'medium', 'medium',
        'إسناد قيمة ديناميكية إلى واجهة HTML',
        'أُسندت قيمة غير ثابتة إلى innerHTML أو outerHTML؛ سلامتها تعتمد على مصدرها ومعالجتها.',
        'استخدم textContent للنصوص أو تعقيماً مناسباً عند الحاجة إلى HTML.', node);
    } else if (node.type === 'CallExpression' &&
        ['query', 'execute', 'raw', '$queryraw'].includes(String(callName(node.callee) || '').toLowerCase()) &&
        node.arguments && node.arguments.length) {
      const details = inspectExpression(node.arguments[0]);
      if (details.dynamic && details.hasRequestSource) {
        result = finding('AST-SQL-001', 'high', 'medium',
          'تركيب استعلام من مدخل طلب',
          'ظهر تعبير ديناميكي مرتبط بمصدر شائع لمدخلات الطلب داخل وسيط استعلام.',
          'استخدم الاستعلامات المجهزة ومعاملات الربط بدلاً من دمج المدخلات في SQL.', node);
      }
    }

    if (result) {
      const key = result.id + ':' + result.line;
      if (!seen.has(key)) { seen.add(key); findings.push(result); }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child && child.type) stack.push(child);
      } else if (value && value.type) stack.push(value);
    }
  }
  return {ok: true, code: truncated ? 'node-limit-exceeded' : 'analyzed', findings, nodeCount, truncated};
}

module.exports = {available: Boolean(parser), supportsFile, analyze, MAX_NODES};
