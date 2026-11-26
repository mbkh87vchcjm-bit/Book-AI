/* Midad Cyber Knowledge — bilingual cybersecurity concepts and safe disambiguation. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MidadCyberKnowledge = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function normalize(value) {
    var text = String(value || '');
    try { text = text.normalize('NFKC'); } catch (_) {}
    return text.toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}+#./_-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  var CONCEPTS = [
    {id:'SEC-AUTHN-001',term:'Authentication',ar:'المصادقة',domain:'identity-security',
      aliases:['authn','verify identity','التحقق من الهوية','اثبات الهوية'],
      definition:'التحقق من أن المستخدم أو الكيان هو فعلاً من يدّعي أنه هو.',
      distinction:'تجيب عن سؤال: من أنت؟ ولا تحدد وحدها ما الذي يسمح لك بفعله.',
      example:'تسجيل الدخول باستخدام كلمة مرور مع عامل تحقق إضافي.',
      contrastsWith:['SEC-AUTHZ-001'],related:['SEC-MFA-001']},
    {id:'SEC-AUTHZ-001',term:'Authorization',ar:'التفويض وتحديد الصلاحيات',domain:'identity-security',
      aliases:['authz','access control','الصلاحيات','التحكم بالوصول'],
      definition:'تحديد الموارد والعمليات التي يُسمح لهوية موثقة بالوصول إليها.',
      distinction:'تجيب عن سؤال: ما الذي يسمح لك بفعله؟ وهي مختلفة عن إثبات الهوية.',
      example:'السماح لمستخدم بقراءة سجل ومنع مستخدم آخر من تعديله.',
      contrastsWith:['SEC-AUTHN-001'],related:['SEC-RBAC-001']},
    {id:'SEC-ENCRYPT-001',term:'Encryption',ar:'التشفير',domain:'cryptography',
      aliases:['encrypt','التشفير بالمفتاح','cipher'],
      definition:'تحويل بيانات مقروءة إلى صيغة غير مقروءة دون المفتاح المناسب، بهدف حماية السرية.',
      distinction:'عملية قابلة للعكس عند توفر المفتاح وآلية فك التشفير الصحيحة.',
      example:'تشفير ملف لحماية محتواه من القراءة غير المصرح بها.',
      contrastsWith:['SEC-HASH-001','SEC-ENCODING-001'],related:['SEC-KEY-001']},
    {id:'SEC-HASH-001',term:'Hashing',ar:'التجزئة أو البصمة الرقمية',domain:'cryptography',
      aliases:['hash function','digital digest','دالة تجزئة','بصمة رقمية'],
      definition:'حساب قيمة ملخصة ذات طول محدد وفق خوارزمية تجزئة، وتستخدم للمقارنة والتحقق من سلامة البيانات.',
      distinction:'دالة التجزئة التشفيرية المعتادة أحادية الاتجاه وليست بديلاً عن التشفير. تخزين كلمات المرور يحتاج خوارزميات مخصصة بطيئة وملحاً.',
      example:'مقارنة بصمة ملف قبل النقل وبعده للتحقق من عدم تغيره.',
      contrastsWith:['SEC-ENCRYPT-001','SEC-ENCODING-001'],related:['SEC-INTEGRITY-001']},
    {id:'SEC-ENCODING-001',term:'Encoding',ar:'الترميز',domain:'data-representation',
      aliases:['base64','character encoding','ترميز البيانات'],
      definition:'تمثيل البيانات بصيغة محددة لتسهيل التخزين أو النقل أو التوافق بين الأنظمة.',
      distinction:'ليس تشفيراً ولا يوفر السرية؛ غالباً يمكن عكسه دون مفتاح سري.',
      example:'تمثيل بيانات ثنائية بصيغة Base64.',
      contrastsWith:['SEC-ENCRYPT-001','SEC-HASH-001'],related:['SEC-ASCII-001']},
    {id:'SEC-VULN-001',term:'Vulnerability',ar:'ثغرة أو نقطة ضعف',domain:'security-risk',
      aliases:['weakness','security flaw','نقطة ضعف أمنية'],
      definition:'ضعف في نظام أو برنامج أو إعداد قد يمكن أن يؤثر في السرية أو السلامة أو التوافر.',
      distinction:'هي خاصية ضعف موجودة؛ وليست هي نفسها التهديد أو مستوى المخاطر.',
      example:'غياب التحقق المناسب من مدخلات تطبيق.',
      contrastsWith:['SEC-THREAT-001','SEC-RISK-001'],related:['SEC-CWE-001']},
    {id:'SEC-THREAT-001',term:'Threat',ar:'تهديد',domain:'security-risk',
      aliases:['threat actor','مصدر تهديد','تهديد امني'],
      definition:'ظرف أو حدث أو جهة يمكن أن تسبب ضرراً لأصل أو نظام.',
      distinction:'التهديد هو مصدر أو حدث محتمل؛ أما الثغرة فهي ضعف يمكن أن يستفيد منه التهديد.',
      example:'محاولة وصول غير مصرح بها إلى خدمة مهمة.',
      contrastsWith:['SEC-VULN-001','SEC-RISK-001'],related:['SEC-ATTACK-001']},
    {id:'SEC-RISK-001',term:'Risk',ar:'المخاطر',domain:'security-risk',
      aliases:['security risk','مستوى المخاطر','مخاطرة'],
      definition:'تقدير احتمال وقوع حدث ضار وتأثيره في الأصول أو العمليات.',
      distinction:'المخاطر تجمع بين احتمال الحدث وحجم أثره؛ لا تساوي مجرد وجود ثغرة.',
      example:'تقييم أثر توقف قاعدة بيانات واحتمال حدوثه.',
      contrastsWith:['SEC-VULN-001','SEC-THREAT-001'],related:['SEC-CONTROL-001']},
    {id:'SEC-SAST-001',term:'SAST',ar:'الاختبار الأمني الساكن للتطبيقات',domain:'secure-development',
      aliases:['static application security testing','static code analysis','تحليل الكود الساكن'],
      definition:'تحليل الشيفرة أو التمثيل البرمجي دون تشغيل التطبيق للبحث عن أنماط أخطاء ومخاطر.',
      distinction:'لا يتطلب تشغيل التطبيق، لكنه لا يثبت خلو البرنامج من الثغرات.',
      example:'فحص مصدر PHP بحثاً عن أنماط استخدام غير آمنة.',
      contrastsWith:['SEC-DAST-001'],related:['SEC-SEMgrep-001']},
    {id:'SEC-DAST-001',term:'DAST',ar:'الاختبار الأمني الديناميكي للتطبيقات',domain:'secure-development',
      aliases:['dynamic application security testing','dynamic testing','اختبار التطبيق اثناء التشغيل'],
      definition:'تقييم التطبيق أثناء تشغيله من خلال مراقبة سلوكه وواجهاته ضمن بيئة اختبار مصرح بها.',
      distinction:'على خلاف SAST، يتعامل مع تطبيق يعمل. مِداد في مرحلته الحالية لا ينفذ اختبارات نشطة على أهداف شبكية.',
      example:'مراجعة نتائج اختبار تطبيق تجريبي مصرح به داخل بيئة محلية.',
      contrastsWith:['SEC-SAST-001'],related:['SEC-IAST-001']},
    {id:'SEC-SQLI-001',term:'SQL Injection',ar:'حقن SQL',domain:'application-security',
      aliases:['sqli','sql injection vulnerability','حقن استعلامات قواعد البيانات'],
      definition:'فئة من الثغرات تنشأ عندما تؤثر مدخلات غير موثوقة في بنية استعلام SQL بدلاً من التعامل معها كقيم بيانات.',
      distinction:'مفهوم أمني يصف نمط ضعف في بناء الاستعلامات، وليس نمط تصميم Dependency Injection.',
      example:'مراجعة مصدر الاستعلام والتأكد من استخدام parameterized queries.',
      contrastsWith:['SEC-DI-001'],related:['SEC-INPUT-001']},
    {id:'SEC-DI-001',term:'Dependency Injection',ar:'حقن الاعتماديات',domain:'software-design',
      aliases:['di','dependency injection pattern','حقن التبعيات'],
      definition:'نمط تصميم تُمرر فيه الاعتماديات إلى مكوّن بدلاً من أن ينشئها داخلياً بنفسه.',
      distinction:'مفهوم معماري لتنظيم البرمجيات، ولا يعني حقن SQL أو استغلال ثغرة.',
      example:'تمرير واجهة خدمة قاعدة البيانات إلى Controller عبر المُنشئ.',
      contrastsWith:['SEC-SQLI-001'],related:['SEC-Ioc-001']},
    {id:'SEC-API-TOKEN-001',term:'API Access Token',ar:'رمز وصول API',domain:'identity-security',
      aliases:['access token','bearer token','رمز وصول','api token'],
      definition:'قيمة اعتماد تُستخدم لتمثيل صلاحية وصول مفوضة إلى واجهة برمجية وفق آلية النظام.',
      distinction:'في سياق المصادقة والتطبيقات، token هنا قيمة اعتماد، وليس وحدة تقسيم نص في نموذج لغوي.',
      example:'رمز وصول محدود الصلاحيات والمدة لخدمة API.',
      contrastsWith:['AI-TOKEN-001','COMP-TOKEN-001'],related:['SEC-AUTHN-001','SEC-AUTHZ-001']},
    {id:'AI-TOKEN-001',term:'LLM Token',ar:'وحدة نصية في النموذج اللغوي',domain:'ai-language-models',
      aliases:['language model token','tokenization unit','وحدة تجزئة النص'],
      definition:'وحدة نصية يعالجها النموذج اللغوي؛ قد تمثل كلمة أو جزءاً منها أو رمزاً أو مسافة.',
      distinction:'ليست رمز وصول أو كلمة مرور. عدد Tokens يؤثر في طول السياق واستهلاك النموذج.',
      example:'تقسيم جملة إلى وحدات قبل إدخالها إلى نموذج لغوي.',
      contrastsWith:['SEC-API-TOKEN-001','COMP-TOKEN-001'],related:['AI-CONTEXT-001']},
    {id:'COMP-TOKEN-001',term:'Compiler Token',ar:'وحدة معجمية للمترجم',domain:'compiler-design',
      aliases:['lexical token','lexer token','وحدة معجمية','رمز معجمي'],
      definition:'وحدة أساسية ينتجها المحلل المعجمي من مصدر البرنامج، مثل معرف أو كلمة محجوزة أو عامل.',
      distinction:'مصطلح في تحليل وبناء المترجمات، وليس رمز اعتماد للمصادقة أو وحدة سياق لنموذج LLM.',
      example:'تحويل عبارة if (x) إلى كلمات وعوامل ومعرفات.',
      contrastsWith:['SEC-API-TOKEN-001','AI-TOKEN-001'],related:['COMP-AST-001']}
  ];
  function contextTokens(context) {
    return normalize(Array.isArray(context) ? context.join(' ') : context).split(' ').filter(Boolean);
  }
  function contextScore(concept, tokens) {
    if (!tokens.length) return 0;
    var text = normalize([concept.domain, concept.term, concept.ar, concept.definition,
      concept.distinction, (concept.aliases || []).join(' ')].join(' '));
    var matches = tokens.filter(function (token) { return token.length > 1 && text.indexOf(token) >= 0; });
    return matches.length / tokens.length;
  }
  function resolveTerm(input, context) {
    var query = normalize(input);
    if (!query) return {status: 'not-found', matches: []};
    var tokens = contextTokens(context), matches = [];
    CONCEPTS.forEach(function (concept) {
      var names = [concept.term, concept.ar].concat(concept.aliases || []).map(normalize);
      var exact = names.some(function (name) { return name === query; });
      var phrase = names.some(function (name) {
        return name.length >= 3 && (' ' + query + ' ').indexOf(' ' + name + ' ') >= 0;
      });
      if (exact || phrase) matches.push({concept: concept, score: (exact ? 1 : 0.75) + contextScore(concept, tokens)});
    });
    matches.sort(function (a, b) { return b.score - a.score || a.concept.id.localeCompare(b.concept.id); });
    if (!matches.length) return {status: 'not-found', matches: []};
    if (matches.length > 1) {
      var top = matches[0], second = matches[1];
      if (!tokens.length || top.score - second.score < 0.12) {
        return {status: 'ambiguous', matches: matches.map(function (item) { return item.concept; })};
      }
    }
    return {status: 'resolved', concept: matches[0].concept,
      alternatives: matches.slice(1).map(function (item) { return item.concept; })};
  }
  function compareTerms(first, second) {
    var a = resolveTerm(first), b = resolveTerm(second);
    if (a.status !== 'resolved' || b.status !== 'resolved') return {status: 'unresolved', first: a, second: b};
    var left = a.concept, right = b.concept;
    return {
      status: 'compared', first: left, second: right, sameDomain: left.domain === right.domain,
      comparison: {definition: [left.definition, right.definition],
        distinction: [left.distinction, right.distinction], examples: [left.example, right.example]},
      relation: (left.contrastsWith || []).indexOf(right.id) >= 0 ||
        (right.contrastsWith || []).indexOf(left.id) >= 0 ? 'explicit-contrast' : 'related-or-unclassified'
    };
  }
  function listByDomain(domain) {
    return CONCEPTS.filter(function (concept) { return !domain || concept.domain === domain; });
  }
  return {normalize: normalize, concepts: CONCEPTS, resolveTerm: resolveTerm, compareTerms: compareTerms, listByDomain: listByDomain};
}));
