'use strict';

const Registry = require('./tool-registry.cjs');
const Knowledge = require('./cyber-knowledge.js');

const CONCEPT_CUES = Object.freeze([
  {id:'SEC-AUTHN-001',cues:['اثبات الهوية','التحقق من هوية المستخدم','تسجيل الدخول','login','identity verification']},
  {id:'SEC-AUTHZ-001',cues:['صلاحية الوصول','من يحق له الوصول','صلاحيات المستخدم','access permission','who can access']},
  {id:'SEC-ENCRYPT-001',cues:['حماية سرية البيانات','اخفاء محتوى البيانات','تشفير البيانات','data confidentiality','encrypt data']},
  {id:'SEC-HASH-001',cues:['بصمة الملف','بصمة رقمية','التحقق من سلامة الملف','التجزئة','تجزئة البيانات','file fingerprint','file integrity hash']},
  {id:'SEC-VULN-001',cues:['نقطة ضعف امنية','مشكلة امنية في البرنامج','security weakness','software weakness']},
  {id:'SEC-SAST-001',cues:['تحليل ساكن','تحليل الشيفرة دون تشغيل','فحص الكود دون تشغيل','static code analysis','source code review']},
  {id:'SEC-DAST-001',cues:['اختبار التطبيق اثناء التشغيل','فحص التطبيق وهو يعمل','dynamic application testing','runtime web testing']},
  {id:'SEC-SQLI-001',cues:['حقن استعلامات','حقن قواعد البيانات','sql injection','sqli']},
  {id:'SEC-SUPPLY-CHAIN-001',cues:['سلسلة توريد البرمجيات','امن مكونات البرنامج','software supply chain']},
  {id:'SEC-CRYPTO-FAIL-001',cues:['اخطاء التشفير','ضعف التشفير','cryptographic weakness']}
]);

function normalize(value) {
  return Knowledge.normalize(value);
}

function includesPhrase(text, phrase) {
  const target = normalize(phrase);
  if (!target || target.length < 3) return false;
  return (' ' + text + ' ').includes(' ' + target + ' ');
}

function resolveConcepts(question, maximum) {
  const query = normalize(question);
  const found = new Map();
  for (const concept of Knowledge.concepts) {
    const names = [concept.term, concept.ar].concat(concept.aliases || []);
    const matches = names.filter((name) => includesPhrase(query, name));
    if (matches.length) {
      found.set(concept.id, {concept, score: Math.max(...matches.map((item) => normalize(item).length)) + 20});
    }
  }
  for (const rule of CONCEPT_CUES) {
    if (!rule.cues.some((cue) => includesPhrase(query, cue))) continue;
    const concept = Knowledge.concepts.find((item) => item.id === rule.id);
    if (concept) {
      const prior = found.get(concept.id);
      found.set(concept.id, {concept, score: Math.max(prior ? prior.score : 0, 65)});
    }
  }
  return Array.from(found.values())
    .sort((a,b) => b.score-a.score || a.concept.id.localeCompare(b.concept.id))
    .slice(0, Math.max(1, Math.min(Number(maximum)||6, 10)))
    .map(({concept}) => ({
      id:concept.id,term:concept.term,arabic:concept.ar,domain:concept.domain,
      definition:concept.definition,distinction:concept.distinction,
      example:concept.example,references:Knowledge.getReferences(concept)
    }));
}

function buildAssistantContext(question, options) {
  const input = String(question || '').trim().slice(0, 4000);
  const settings = options || {};
  const toolLimit = Number.isSafeInteger(settings.toolLimit)
    ? Math.max(1, Math.min(settings.toolLimit, 10)) : 8;
  const conceptLimit = Number.isSafeInteger(settings.conceptLimit)
    ? Math.max(1, Math.min(settings.conceptLimit, 10)) : 10;
  const toolCatalogue = Registry.buildKnowledgeContext(input, toolLimit);
  const securityConcepts = resolveConcepts(input, conceptLimit);
  return {
    schemaVersion:1,
    toolCatalogue,
    securityConcepts,
    retrieval:{
      method:'expanded-lexical-and-intent-rules',
      matchedToolRecords:toolCatalogue.records.length,
      matchedConceptRecords:securityConcepts.length,
      evidenceCoverage:toolCatalogue.records.length || securityConcepts.length ? 'partial-local-reference-match' : 'no-local-reference-match'
    },
    platformRules:{
      offlineRuntimeOnly:true,toolExecutionEnabled:false,
      networkScanningEnabled:false,projectCodeExecutionEnabled:false,
      note:'الكتالوج مرجع معرفي فقط؛ مِداد لا يشغّل الأدوات ولا يختبر أهدافاً.'
    }
  };
}

module.exports={buildAssistantContext,resolveConcepts};
