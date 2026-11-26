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
      contrastsWith:['SEC-AUTHZ-001'],related:['SEC-MFA-001'],sources:['OWASP-ASVS-5.0.0','OWASP-TOP10-2025-A07']},
    {id:'SEC-AUTHZ-001',term:'Authorization',ar:'التفويض وتحديد الصلاحيات',domain:'identity-security',
      aliases:['authz','access control','الصلاحيات','التحكم بالوصول'],
      definition:'تحديد الموارد والعمليات التي يُسمح لهوية موثقة بالوصول إليها.',
      distinction:'تجيب عن سؤال: ما الذي يسمح لك بفعله؟ وهي مختلفة عن إثبات الهوية.',
      example:'السماح لمستخدم بقراءة سجل ومنع مستخدم آخر من تعديله.',
      contrastsWith:['SEC-AUTHN-001'],related:['SEC-RBAC-001'],sources:['OWASP-ASVS-5.0.0','OWASP-TOP10-2025-A01']},
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
      contrastsWith:['SEC-DI-001'],related:['SEC-INPUT-001'],sources:['OWASP-ASVS-5.0.0','OWASP-SQL-INJECTION-CHEATSHEET']},
    {id:'SEC-DI-001',term:'Dependency Injection',ar:'حقن الاعتماديات',domain:'software-design',
      aliases:['di','dependency injection pattern','حقن التبعيات'],
      definition:'نمط تصميم تُمرر فيه الاعتماديات إلى مكوّن بدلاً من أن ينشئها داخلياً بنفسه.',
      distinction:'مفهوم معماري لتنظيم البرمجيات، ولا يعني حقن SQL أو استغلال ثغرة.',
      example:'تمرير واجهة خدمة قاعدة البيانات إلى Controller عبر المُنشئ.',
      contrastsWith:['SEC-SQLI-001'],related:['SEC-Ioc-001']},
    {id:'SEC-API-TOKEN-001',term:'API Access Token',ar:'رمز وصول API',domain:'identity-security',
      aliases:['token','access token','bearer token','رمز وصول','api token'],
      definition:'قيمة اعتماد تُستخدم لتمثيل صلاحية وصول مفوضة إلى واجهة برمجية وفق آلية النظام.',
      distinction:'في سياق المصادقة والتطبيقات، token هنا قيمة اعتماد، وليس وحدة تقسيم نص في نموذج لغوي.',
      example:'رمز وصول محدود الصلاحيات والمدة لخدمة API.',
      contrastsWith:['AI-TOKEN-001','COMP-TOKEN-001'],related:['SEC-AUTHN-001','SEC-AUTHZ-001']},
    {id:'AI-TOKEN-001',term:'LLM Token',ar:'وحدة نصية في النموذج اللغوي',domain:'ai-language-models',
      aliases:['token','language model token','tokenization unit','وحدة تجزئة النص'],
      definition:'وحدة نصية يعالجها النموذج اللغوي؛ قد تمثل كلمة أو جزءاً منها أو رمزاً أو مسافة.',
      distinction:'ليست رمز وصول أو كلمة مرور. عدد Tokens يؤثر في طول السياق واستهلاك النموذج.',
      example:'تقسيم جملة إلى وحدات قبل إدخالها إلى نموذج لغوي.',
      contrastsWith:['SEC-API-TOKEN-001','COMP-TOKEN-001'],related:['AI-CONTEXT-001']},
    {id:'COMP-TOKEN-001',term:'Compiler Token',ar:'وحدة معجمية للمترجم',domain:'compiler-design',
      aliases:['token','lexical token','lexer token','وحدة معجمية','رمز معجمي'],
      definition:'وحدة أساسية ينتجها المحلل المعجمي من مصدر البرنامج، مثل معرف أو كلمة محجوزة أو عامل.',
      distinction:'مصطلح في تحليل وبناء المترجمات، وليس رمز اعتماد للمصادقة أو وحدة سياق لنموذج LLM.',
      example:'تحويل عبارة if (x) إلى كلمات وعوامل ومعرفات.',
      contrastsWith:['SEC-API-TOKEN-001','AI-TOKEN-001'],related:['COMP-AST-001'],sources:['OWASP-ASVS-5.0.0']},
    {id:'SEC-BAC-001',term:'Broken Access Control',ar:'خلل التحكم بالوصول',domain:'application-security',
      aliases:['access control failure','broken authorization','قصور الصلاحيات'],
      definition:'حالة لا يفرض فيها التطبيق حدود الصلاحيات بصورة صحيحة، فيتمكن مستخدم من الوصول إلى مورد أو عملية خارج ما تسمح به هويته.',
      distinction:'المصادقة تثبت الهوية، أما التحكم بالوصول فيتحقق من صلاحية كل طلب وكل مورد على الخادم.',
      example:'مراجعة أن المستخدم لا يستطيع قراءة سجل مستخدم آخر بتغيير معرّف المورد.',
      contrastsWith:['SEC-AUTHN-001'],related:['SEC-IDOR-001'],sources:['OWASP-TOP10-2025-A01','OWASP-ASVS-5.0.0']},
    {id:'SEC-MISCONFIG-001',term:'Security Misconfiguration',ar:'سوء الإعداد الأمني',domain:'application-security',
      aliases:['misconfiguration','إعداد غير آمن','تهيئة أمنية خاطئة'],
      definition:'إعدادات افتراضية أو غير ملائمة أو غير مكتملة تضعف حماية التطبيق أو الخادم أو مكوّناته.',
      distinction:'قد توجد المشكلة في إعداد البيئة أو الخدمة أو التطبيق حتى لو لم يكن في الشيفرة خطأ برمجي مباشر.',
      example:'مراجعة تعطيل صفحات التشخيص العامة وإزالة الحسابات والإعدادات الافتراضية.',
      contrastsWith:['SEC-INSECURE-DESIGN-001'],related:['SEC-HARDENING-001'],sources:['OWASP-TOP10-2025-A02','OWASP-ASVS-5.0.0']},
    {id:'SEC-SUPPLY-CHAIN-001',term:'Software Supply Chain Security',ar:'أمن سلسلة توريد البرمجيات',domain:'secure-development',
      aliases:['software supply chain','dependency security','أمن التبعيات'],
      definition:'إدارة مخاطر المكونات والأدوات والبناء والتوزيع التي تدخل في إنتاج البرنامج وتحديثه.',
      distinction:'وجود قائمة اعتماديات لا يعني أن الحزم آمنة؛ يلزم التحقق من المصدر والإصدار وسلامة البناء والثغرات المعروفة.',
      example:'مقارنة مكونات SBOM مع مصادر ثغرات موثوقة ومراجعة provenance قبل إصدار نسخة.',
      contrastsWith:['SEC-SCA-001'],related:['SEC-SBOM-001','SEC-CVE-001'],sources:['OWASP-TOP10-2025-A03','OWASP-ASVS-5.0.0']},
    {id:'SEC-CRYPTO-FAIL-001',term:'Cryptographic Failures',ar:'الإخفاقات التشفيرية',domain:'cryptography',
      aliases:['cryptographic weakness','ضعف التشفير','فشل التشفير'],
      definition:'أخطاء في اختيار الخوارزميات أو إدارة المفاتيح أو تخزين البيانات أو نقلها قد تكشف معلومات حساسة.',
      distinction:'استخدام كلمة "تشفير" وحده لا يكفي؛ قوة الحماية تعتمد على الخوارزمية والتنفيذ والمفاتيح والبروتوكول.',
      example:'مراجعة استخدام TLS وإدارة مفاتيح التشفير وعدم تخزين كلمات المرور كنص صريح.',
      contrastsWith:['SEC-ENCODING-001'],related:['SEC-KEY-001','SEC-HASH-001'],sources:['OWASP-TOP10-2025-A04','OWASP-ASVS-5.0.0']},
    {id:'SEC-INJECTION-001',term:'Injection',ar:'حقن المدخلات',domain:'application-security',
      aliases:['injection flaw','حقن أوامر','حقن البيانات'],
      definition:'ضعف يحدث عندما تُفسَّر بيانات غير موثوقة على أنها جزء من أوامر أو استعلامات أو لغة تفسيرية.',
      distinction:'تختلف الأنواع حسب المفسّر مثل SQL وOS command وLDAP؛ المعالجة تكون بفصل البيانات عن البنية واستخدام واجهات آمنة.',
      example:'مراجعة الاستعلامات للتأكد من تمرير القيم كمعاملات بدلاً من دمجها في نص الاستعلام.',
      contrastsWith:['SEC-DI-001'],related:['SEC-SQLI-001','SEC-XSS-001'],sources:['OWASP-TOP10-2025-A05','OWASP-ASVS-5.0.0']},
    {id:'SEC-INSECURE-DESIGN-001',term:'Insecure Design',ar:'التصميم غير الآمن',domain:'secure-development',
      aliases:['security design weakness','قصور التصميم الأمني'],
      definition:'غياب ضوابط أمنية مناسبة على مستوى المتطلبات أو نماذج التهديد أو تدفقات العمل، وليس مجرد خطأ تنفيذ صغير.',
      distinction:'لا يمكن إصلاح كل قصور تصميم بتعديل سطر كود؛ قد يتطلب تغيير نموذج الصلاحيات أو سير العمل أو حدود الثقة.',
      example:'تحليل تهديدات وظيفة تغيير كلمة المرور قبل تنفيذها.',
      contrastsWith:['SEC-MISCONFIG-001'],related:['SEC-THREAT-001','SEC-RISK-001'],sources:['OWASP-TOP10-2025-A06','OWASP-ASVS-5.0.0']},
    {id:'SEC-AUTH-FAIL-001',term:'Authentication Failures',ar:'إخفاقات المصادقة',domain:'identity-security',
      aliases:['authentication weakness','login security failure','ضعف تسجيل الدخول'],
      definition:'مشكلات في التحقق من الهوية أو إدارة الجلسات أو دورة حياة بيانات الاعتماد تؤدي إلى السماح بهوية غير صحيحة أو فقدان السيطرة على الجلسة.',
      distinction:'المصادقة تجيب عن هوية المستخدم؛ أما التفويض فيقرر صلاحياته بعد التحقق.',
      example:'مراجعة حماية الجلسات وإبطالها بعد تسجيل الخروج وتغيير كلمة المرور.',
      contrastsWith:['SEC-AUTHZ-001'],related:['SEC-AUTHN-001','SEC-SESSION-001'],sources:['OWASP-TOP10-2025-A07','OWASP-ASVS-5.0.0']},
    {id:'SEC-INTEGRITY-FAIL-001',term:'Software or Data Integrity Failures',ar:'إخفاقات سلامة البرمجيات أو البيانات',domain:'secure-development',
      aliases:['integrity failure','software integrity','سلامة البيانات'],
      definition:'غياب التحقق المناسب من موثوقية الشيفرة أو التحديثات أو البيانات أو عمليات البناء والنشر.',
      distinction:'سلامة البيانات تعني اكتشاف التغيير غير المصرح به؛ ولا تثبت وحدها سرية البيانات.',
      example:'التحقق من توقيع التحديثات ومصدر الحزم قبل اعتمادها.',
      contrastsWith:['SEC-ENCRYPT-001'],related:['SEC-SUPPLY-CHAIN-001','SEC-SBOM-001'],sources:['OWASP-TOP10-2025-A08','OWASP-ASVS-5.0.0']},
    {id:'SEC-LOGGING-001',term:'Security Logging and Alerting',ar:'التسجيل والتنبيه الأمني',domain:'security-operations',
      aliases:['security logging','audit logging','السجلات الأمنية','التنبيه الأمني'],
      definition:'تسجيل أحداث أمنية مهمة بصورة قابلة للمراجعة والتنبيه عند ظهور مؤشرات تستحق الاستجابة.',
      distinction:'السجل ليس مجرد ملف نصي؛ يجب ضبط الوصول إليه وحمايته من العبث وتجنب حفظ كلمات المرور والرموز السرية فيه.',
      example:'تسجيل محاولات الدخول الفاشلة وتغييرات الصلاحيات دون تسجيل كلمة المرور أو رمز الوصول.',
      contrastsWith:['SEC-SECRET-001'],related:['SEC-INCIDENT-001'],sources:['OWASP-TOP10-2025-A09','OWASP-ASVS-5.0.0']},
    {id:'SEC-EXCEPTION-001',term:'Mishandling of Exceptional Conditions',ar:'سوء معالجة الحالات الاستثنائية',domain:'secure-development',
      aliases:['exception handling weakness','error handling','سوء معالجة الأخطاء'],
      definition:'تعامل غير آمن مع الأخطاء أو الحالات غير المتوقعة، مثل كشف تفاصيل داخلية أو ترك حالة النظام غير متسقة.',
      distinction:'رسالة الخطأ المفيدة للمطور ليست بالضرورة مناسبة للمستخدم النهائي؛ يجب فصل التفاصيل الداخلية عن الرسائل العامة.',
      example:'عرض رسالة عامة للمستخدم مع تسجيل معرف تتبع داخلي دون كشف استعلام قاعدة البيانات أو المسارات المحلية.',
      contrastsWith:['SEC-LOGGING-001'],related:['SEC-LOGGING-001'],sources:['OWASP-TOP10-2025-A10','OWASP-ASVS-5.0.0']},
    {id:'SEC-CSRF-001',term:'Cross-Site Request Forgery',ar:'تزوير الطلبات عبر المواقع',domain:'application-security',
      aliases:['csrf','xsrf','تزوير الطلبات'],
      definition:'ضعف يستغل ثقة التطبيق في متصفح مستخدم مسجل الدخول لتمرير طلب غير مقصود ضمن صلاحيات جلسته.',
      distinction:'يختلف عن XSS؛ CSRF يتعلق بإرسال طلب نيابة عن جلسة موثقة، بينما XSS يتعلق بتنفيذ محتوى نشط داخل سياق الصفحة.',
      example:'التحقق من رمز CSRF في العمليات الحساسة واستخدام خصائص ملفات تعريف الارتباط المناسبة.',
      contrastsWith:['SEC-XSS-001'],related:['SEC-AUTHN-001','SEC-SESSION-001'],sources:['OWASP-ASVS-5.0.0']},
    {id:'SEC-IDOR-001',term:'IDOR / BOLA',ar:'الوصول إلى كائنات دون تفويض صحيح',domain:'application-security',
      aliases:['insecure direct object reference','broken object level authorization','idor','bola'],
      definition:'قصور في التحقق من صلاحية المستخدم على كائن محدد، مثل سجل أو ملف، حتى لو كان المستخدم قد سجل الدخول بنجاح.',
      distinction:'إخفاء أو تخمين المعرف ليس ضابطًا كافيًا؛ يجب التحقق من صلاحية الوصول إلى الكائن في كل طلب على الخادم.',
      example:'اختبار مراجعة الصلاحيات على سجلات يملكها مستخدمون مختلفون باستخدام حسابات اختبار مصرح بها.',
      contrastsWith:['SEC-AUTHN-001'],related:['SEC-BAC-001','SEC-AUTHZ-001'],sources:['OWASP-TOP10-2025-A01','OWASP-ASVS-5.0.0']},
    {id:'SEC-SSRF-001',term:'Server-Side Request Forgery',ar:'تزوير الطلبات من جهة الخادم',domain:'application-security',
      aliases:['ssrf','server side request forgery','تزوير طلبات الخادم'],
      definition:'ضعف يجعل التطبيق يرسل طلبات إلى وجهات يحددها مستخدم دون التحقق الكافي من الوجهة والسياق المسموح.',
      distinction:'تنفيذ الطلب يتم من بيئة الخادم، ولذلك تختلف حدود الثقة والمخاطر عن طلب يرسله متصفح المستخدم مباشرة.',
      example:'مراجعة أي ميزة تستقبل عنوان URL والتأكد من تقييد الوجهات والتحقق من التحويلات وعناوين الشبكة وفق سياسة واضحة.',
      contrastsWith:['SEC-CSRF-001'],related:['SEC-MISCONFIG-001'],sources:['OWASP-ASVS-5.0.0']},
    {id:'SEC-CVE-001',term:'CVE',ar:'معرّف الثغرة العامة',domain:'vulnerability-management',
      aliases:['common vulnerabilities and exposures','معرف ثغرة','رقم CVE'],
      definition:'معرّف قياسي لسجل ثغرة أو تعرض معروف يتيح الإشارة إلى الحالة نفسها بين قواعد البيانات والمنتجات.',
      distinction:'CVE يعرّف الحالة ولا يمثل وحده درجة الخطورة أو دليل أن نظامك متأثر؛ يلزم مطابقة المنتج والإصدار والظروف.',
      example:'استخدام رقم CVE عند مراجعة نشرة أمنية لحزمة وإصدار محددين.',
      contrastsWith:['SEC-CWE-001','SEC-CVSS-001'],related:['SEC-SCA-001'],sources:['OWASP-TOP10-2025-A03']},
    {id:'SEC-CWE-001',term:'CWE',ar:'تصنيف أنواع نقاط الضعف',domain:'vulnerability-management',
      aliases:['common weakness enumeration','نوع الضعف','رقم CWE'],
      definition:'تصنيف لأنواع الأخطاء والضعف البرمجية أو التصميمية الشائعة بهدف وصف السبب أو الفئة.',
      distinction:'CWE يصف نوع الضعف؛ CVE يحدد حالة ضعف معروفة بعينها في منتج أو سياق.',
      example:'تصنيف استخدام غير آمن لمدخلات المستخدم ضمن فئة ضعف مناسبة.',
      contrastsWith:['SEC-CVE-001'],related:['SEC-SAST-001'],sources:['OWASP-ASVS-5.0.0']},
    {id:'SEC-CVSS-001',term:'CVSS',ar:'نظام تقييم شدة الثغرات',domain:'vulnerability-management',
      aliases:['common vulnerability scoring system','درجة CVSS','تقييم شدة الثغرة'],
      definition:'إطار لتقدير شدة ثغرة أمنية وفق مجموعة خصائص ومعايير محددة.',
      distinction:'درجة CVSS ليست احتمال استغلال مؤكدًا ولا تغني عن تقييم سياق الأصل والتعرض والأثر في بيئتك.',
      example:'مراجعة درجة الثغرة مع سياق الخدمة المتأثرة وأهميتها ووجود تحديث مناسب.',
      contrastsWith:['SEC-CVE-001'],related:['SEC-RISK-001'],sources:['OWASP-TOP10-2025-A03']},
    {id:'SEC-SBOM-001',term:'SBOM',ar:'قائمة مكونات البرمجيات',domain:'software-supply-chain',
      aliases:['software bill of materials','قائمة مكونات البرنامج'],
      definition:'سجل منظم لمكونات البرمجيات التي تدخل في منتج، وقد يتضمن أسماء الحزم وإصداراتها وعلاقاتها.',
      distinction:'SBOM يوفر رؤية للمكونات ولا يثبت أن كل مكون آمن أو خالٍ من الثغرات.',
      example:'إنشاء قائمة بالمكتبات المباشرة وغير المباشرة المستخدمة في التطبيق.',
      contrastsWith:['SEC-SCA-001'],related:['SEC-SUPPLY-CHAIN-001','SEC-CVE-001'],sources:['OWASP-TOP10-2025-A03']},
    {id:'SEC-SCA-001',term:'Software Composition Analysis',ar:'تحليل مكونات البرمجيات',domain:'software-supply-chain',
      aliases:['sca','dependency vulnerability analysis','تحليل الاعتماديات'],
      definition:'تحليل المكونات الخارجية واعتماديات المشروع لتحديد الإصدارات والتراخيص والثغرات المعروفة ومخاطر سلسلة التوريد.',
      distinction:'جرد الأسماء والإصدارات وحده ليس SCA كاملًا؛ يحتاج مطابقة موثوقة ومحدثة لقواعد الثغرات والتراخيص.',
      example:'مطابقة اعتماديات ملف القفل مع قاعدة بيانات ثغرات موثقة وتسجيل تاريخ تحديث البيانات.',
      contrastsWith:['SEC-SBOM-001'],related:['SEC-SUPPLY-CHAIN-001','SEC-CVE-001'],sources:['OWASP-TOP10-2025-A03']},
    {id:'SEC-ASVS-001',term:'OWASP ASVS',ar:'معيار التحقق الأمني لتطبيقات الويب',domain:'secure-development',
      aliases:['application security verification standard','ASVS','معيار التحقق الأمني'],
      definition:'معيار يحدد متطلبات وضوابط تقنية يمكن استخدامها لتصميم تطبيقات الويب واختبار مستوى أمنها.',
      distinction:'ASVS معيار تحقق مفصل، بينما OWASP Top 10 وثيقة توعوية مختصرة للمخاطر الأكثر أهمية.',
      example:'تحويل المتطلبات الأمنية إلى قائمة تحقق مرتبطة بإصدار ASVS محدد قبل الإصدار.',
      contrastsWith:['SEC-OWASP-TOP10-001'],related:['SEC-SAST-001','SEC-DAST-001'],sources:['OWASP-ASVS-5.0.0']},
    {id:'SEC-OWASP-TOP10-001',term:'OWASP Top 10',ar:'قائمة OWASP لأهم عشرة مخاطر',domain:'secure-development',
      aliases:['owasp top ten','top 10 web risks','أهم مخاطر تطبيقات الويب'],
      definition:'وثيقة توعوية تصنف مجموعة من أهم مخاطر تطبيقات الويب وتساعد فرق التطوير على توجيه جهود الحماية.',
      distinction:'ليست معيار اختبار تفصيليًا ولا شهادة بأن التطبيق آمن؛ لا تغني عن متطلبات تحقق شاملة.',
      example:'استخدام فئات OWASP Top 10:2025 لتنظيم جلسة مراجعة مخاطر التصميم والكود.',
      contrastsWith:['SEC-ASVS-001'],related:['SEC-BAC-001','SEC-SUPPLY-CHAIN-001'],sources:['OWASP-TOP10-2025']}
  ];
  var SOURCES = {
    'OWASP-TOP10-2025-A01': {title:'OWASP Top 10:2025 A01 — Broken Access Control',version:'2025',url:'https://top10.owasp.org/2025/'},
    'OWASP-TOP10-2025-A02': {title:'OWASP Top 10:2025 A02 — Security Misconfiguration',version:'2025',url:'https://top10.owasp.org/2025/'},
    'OWASP-TOP10-2025-A03': {title:'OWASP Top 10:2025 A03 — Software Supply Chain Failures',version:'2025',url:'https://top10.owasp.org/2025/'},
    'OWASP-TOP10-2025-A04': {title:'OWASP Top 10:2025 A04 — Cryptographic Failures',version:'2025',url:'https://top10.owasp.org/2025/'},
    'OWASP-TOP10-2025-A05': {title:'OWASP Top 10:2025 A05 — Injection',version:'2025',url:'https://top10.owasp.org/2025/'},
    'OWASP-TOP10-2025-A06': {title:'OWASP Top 10:2025 A06 — Insecure Design',version:'2025',url:'https://top10.owasp.org/2025/'},
    'OWASP-TOP10-2025-A07': {title:'OWASP Top 10:2025 A07 — Authentication Failures',version:'2025',url:'https://top10.owasp.org/2025/'},
    'OWASP-TOP10-2025-A08': {title:'OWASP Top 10:2025 A08 — Software or Data Integrity Failures',version:'2025',url:'https://top10.owasp.org/2025/'},
    'OWASP-TOP10-2025-A09': {title:'OWASP Top 10:2025 A09 — Security Logging and Alerting Failures',version:'2025',url:'https://top10.owasp.org/2025/'},
    'OWASP-TOP10-2025-A10': {title:'OWASP Top 10:2025 A10 — Mishandling of Exceptional Conditions',version:'2025',url:'https://top10.owasp.org/2025/'},
    'OWASP-TOP10-2025': {title:'OWASP Top 10',version:'2025',url:'https://top10.owasp.org/2025/'},
    'OWASP-ASVS-5.0.0': {title:'OWASP Application Security Verification Standard',version:'5.0.0',url:'https://asvs.owasp.org/'},
    'OWASP-CHEATSHEETS': {title:'OWASP Cheat Sheet Series',version:'online edition',url:'https://cheatsheetseries.owasp.org/'},
    'OWASP-SQL-INJECTION-CHEATSHEET': {title:'SQL Injection Prevention Cheat Sheet',version:'online edition',url:'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html'},
    'OWASP-XSS-CHEATSHEET': {title:'Cross Site Scripting Prevention Cheat Sheet',version:'online edition',url:'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html'}
  };

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
      if (exact || phrase) matches.push({concept: concept, exact: exact, score: (exact ? 1 : 0.75) + contextScore(concept, tokens)});
    });
    matches.sort(function (a, b) { return b.score - a.score || a.concept.id.localeCompare(b.concept.id); });
    if (!matches.length) return {status: 'not-found', matches: []};
    if (matches.length > 1) {
      var top = matches[0], second = matches[1];
      if ((!tokens.length && !(top.exact && !second.exact)) || top.score - second.score < 0.12) {
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
  function getReferences(concept) {
    return (concept && Array.isArray(concept.sources) ? concept.sources : []).map(function (id) {
      return SOURCES[id] ? {id:id,title:SOURCES[id].title,version:SOURCES[id].version,url:SOURCES[id].url} : null;
    }).filter(Boolean);
  }
  return {normalize: normalize, concepts: CONCEPTS, sources: SOURCES, getReferences:getReferences, resolveTerm: resolveTerm, compareTerms: compareTerms, listByDomain: listByDomain};
}));
