/* Midad Language & Knowledge Engine (MLKE) — Bilingual Technical Lexicon */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MlkeLexicon = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var INITIAL_ENTRIES = [
    // Computer Networks
    {id: 'network-tcp', domain: 'networking', term_ar: 'بروتوكول التحكم بالنقل', term_en: 'Transmission Control Protocol', abbreviation: 'TCP', aliases_ar: ['بروتوكول TCP', 'التحكم بالنقل'], aliases_en: ['TCP protocol'], definition_ar: 'بروتوكول موجه بالاتصال يوفر نقلًا موثوقًا ومرتبًا للبيانات بين الأجهزة عبر الشبكة.', definition_en: 'A connection-oriented protocol providing reliable and ordered data transmission.', domain_tags: ['networking', 'transport-layer'], verified: true},
    {id: 'network-udp', domain: 'networking', term_ar: 'بروتوكول مخطط بيانات المستخدم', term_en: 'User Datagram Protocol', abbreviation: 'UDP', aliases_ar: ['بروتوكول UDP'], aliases_en: ['UDP protocol'], definition_ar: 'بروتوكول غير موجه بالاتصال يوفر نقلًا سريعًا للبيانات دون ضمان الوصول أو الترتيب.', definition_en: 'A connectionless protocol providing fast data transmission without delivery guarantees.', domain_tags: ['networking', 'transport-layer'], verified: true},
    {id: 'network-ip', domain: 'networking', term_ar: 'بروتوكول الإنترنت', term_en: 'Internet Protocol', abbreviation: 'IP', aliases_ar: ['عنوان IP', 'عنوان انترنت'], aliases_en: ['IP address', 'IP protocol'], definition_ar: 'بروتوكول الطبقة الشبكية المسؤول عن عناوين الأجهزة وتوجيه حزم البيانات عبر الشبكات.', definition_en: 'Network layer protocol responsible for addressing and routing packets across networks.', domain_tags: ['networking', 'network-layer'], verified: true},
    {id: 'network-dns', domain: 'networking', term_ar: 'نظام أسماء النطاقات', term_en: 'Domain Name System', abbreviation: 'DNS', aliases_ar: ['خادم أسماء النطاقات', 'نظام DNS', 'خادم DNS'], aliases_en: ['DNS server', 'DNS system'], definition_ar: 'نظام يحول أسماء النطاقات القابلة للقراءة بشرية إلى عناوين IP رقمية.', definition_en: 'System that translates human-readable domain names into numerical IP addresses.', domain_tags: ['networking', 'application-layer'], verified: true},
    {id: 'network-dhcp', domain: 'networking', term_ar: 'بروتوكول التهيئة الديناميكية للمضيفين', term_en: 'Dynamic Host Configuration Protocol', abbreviation: 'DHCP', aliases_ar: ['بروتوكول DHCP', 'خادم DHCP'], aliases_en: ['DHCP server'], definition_ar: 'بروتوكول يوزع عناوين IP وإعدادات الشبكة تلقائيًا على الأجهزة.', definition_en: 'Protocol that automatically assigns IP addresses and network parameters to devices.', domain_tags: ['networking', 'application-layer'], verified: true},
    {id: 'network-http', domain: 'networking', term_ar: 'بروتوكول نقل النص الفائق', term_en: 'Hypertext Transfer Protocol', abbreviation: 'HTTP', aliases_ar: ['بروتوكول HTTP'], aliases_en: ['HTTP protocol'], definition_ar: 'بروتوكول لنقل صفحات الويب والبيانات عبر شبكة الإنترنت.', definition_en: 'Protocol for transferring web pages and data over the Internet.', domain_tags: ['networking', 'application-layer'], verified: true},
    {id: 'network-https', domain: 'networking', term_ar: 'بروتوكول نقل النص الفائق الآمن', term_en: 'Hypertext Transfer Protocol Secure', abbreviation: 'HTTPS', aliases_ar: ['بروتوكول HTTPS'], aliases_en: ['HTTPS protocol'], definition_ar: 'نسخة مشفرة وآمنة من بروتوكول HTTP تشفر البيانات بين المتصفح والخادم.', definition_en: 'Encrypted version of HTTP that secures communication between browser and server.', domain_tags: ['networking', 'security'], verified: true},
    {id: 'network-ftp', domain: 'networking', term_ar: 'بروتوكول نقل الملفات', term_en: 'File Transfer Protocol', abbreviation: 'FTP', aliases_ar: ['بروتوكول FTP'], aliases_en: ['FTP protocol'], definition_ar: 'بروتوكول لنقل الملفات بين حاسوبين على الشبكة.', definition_en: 'Protocol used for transferring files between computers on a network.', domain_tags: ['networking', 'file-transfer'], verified: true},
    {id: 'network-smtp', domain: 'networking', term_ar: 'بروتوكول نقل البريد البسيط', term_en: 'Simple Mail Transfer Protocol', abbreviation: 'SMTP', aliases_ar: ['بروتوكول SMTP'], aliases_en: ['SMTP protocol'], definition_ar: 'بروتوكول لإرسال البريد الإلكتروني بين الخوادم.', definition_en: 'Protocol for sending email between servers.', domain_tags: ['networking', 'email'], verified: true},
    {id: 'network-lan', domain: 'networking', term_ar: 'شبكة محليّة', term_en: 'Local Area Network', abbreviation: 'LAN', aliases_ar: ['الشبكة المحلية'], aliases_en: ['Local network'], definition_ar: 'شبكة حاسوب تغطي منطقة جغرافية صغيرة كمنزل أو مكتب.', definition_en: 'Computer network covering a small geographical area like a home or office.', domain_tags: ['networking', 'topology'], verified: true},
    {id: 'network-wan', domain: 'networking', term_ar: 'شبكة واسعة', term_en: 'Wide Area Network', abbreviation: 'WAN', aliases_ar: ['الشبكة الموسعة'], aliases_en: ['Wide network'], definition_ar: 'شبكة تغطي مناطق جغرافية واسعة كمدن أو دول.', definition_en: 'Network spanning large geographical regions such as cities or countries.', domain_tags: ['networking', 'topology'], verified: true},
    {id: 'network-routing', domain: 'networking', term_ar: 'التوجيه', term_en: 'Routing', abbreviation: '', aliases_ar: ['توجيه الحزم'], aliases_en: ['Packet routing'], definition_ar: 'عملية اختيار أفضل مسار لنقل الحزم عبر الشبكة.', definition_en: 'Process of selecting the best path for network traffic.', domain_tags: ['networking', 'network-layer'], verified: true},
    {id: 'network-firewall', domain: 'networking', term_ar: 'جدار حماية', term_en: 'Firewall', abbreviation: '', aliases_ar: ['جدار الحماية', 'الجدار الناري'], aliases_en: ['Network firewall'], definition_ar: 'نظام أمان شبكي يفحص حركة المرور الواردة والصادرة ويتحكم بها وفق قواعد آمنة.', definition_en: 'Security system that monitors and controls incoming and outgoing network traffic.', domain_tags: ['networking', 'cybersecurity'], verified: true},

    // Databases
    {id: 'db-database', domain: 'databases', term_ar: 'قاعدة بيانات', term_en: 'Database', abbreviation: 'DB', aliases_ar: ['قواعد البيانات'], aliases_en: ['Databases'], definition_ar: 'مجموعة منظمة من البيانات المخزنة إلكترونيًا لسهولة الوصول إليها وإدارتها.', definition_en: 'An organized collection of data stored electronically for easy access and management.', domain_tags: ['databases', 'storage'], verified: true},
    {id: 'db-table', domain: 'databases', term_ar: 'جدول قاعدة بيانات', term_en: 'Table', abbreviation: '', aliases_ar: ['جدول'], aliases_en: ['Database table'], definition_ar: 'هيكل داخل قاعدة البيانات يتكون من أسطر وأعمدة لتخزين البيانات.', definition_en: 'A collection of related data entries consisting of rows and columns.', domain_tags: ['databases', 'schema'], verified: true},
    {id: 'db-row', domain: 'databases', term_ar: 'صف', term_en: 'Row', abbreviation: '', aliases_ar: ['سجل', 'صفوف', 'سجلات'], aliases_en: ['Record', 'Tuple'], definition_ar: 'سجل فردي داخل جدول قاعدة البيانات يحتوي على بيانات كيان واحد.', definition_en: 'A single data record within a database table.', domain_tags: ['databases', 'record'], verified: true},
    {id: 'db-column', domain: 'databases', term_ar: 'عمود', term_en: 'Column', abbreviation: '', aliases_ar: ['حقل', 'أعمدة', 'حقول'], aliases_en: ['Field', 'Attribute'], definition_ar: 'عنصر في الجدول يمثل خاصية محددة أو نوعًا معينًا من البيانات.', definition_en: 'A set of data values of a particular simple type in a table.', domain_tags: ['databases', 'schema'], verified: true},
    {id: 'db-primary-key', domain: 'databases', term_ar: 'المفتاح الأساسي', term_en: 'Primary Key', abbreviation: 'PK', aliases_ar: ['مفتاح رئيسي', 'مفتاح أولي'], aliases_en: ['Primary key constraint'], definition_ar: 'عمود أو مجموعة أعمدة تحدد كل صف في الجدول بشكل فريد وغير مكرر.', definition_en: 'A column or set of columns that uniquely identifies each row in a table.', domain_tags: ['databases', 'constraints'], verified: true},
    {id: 'db-foreign-key', domain: 'databases', term_ar: 'المفتاح الخارجي', term_en: 'Foreign Key', abbreviation: 'FK', aliases_ar: ['مفتاح أجنبي'], aliases_en: ['Foreign key constraint'], definition_ar: 'حقل في جدول يشير إلى المفتاح الأساسي في جدول آخر لربط البيانات بينهما.', definition_en: 'A column that identifies a row in another table to establish relationships.', domain_tags: ['databases', 'relationships'], verified: true},
    {id: 'db-normalization', domain: 'databases', term_ar: 'تسوية قواعد البيانات', term_en: 'Normalization', abbreviation: '', aliases_ar: ['تطبيع قواعد البيانات', 'التسوية'], aliases_en: ['Database normalization'], definition_ar: 'عملية تنظيم الهيكلية لتقليل التكرار وتحسين سلامة البيانات.', definition_en: 'Process of organizing a database to reduce redundancy and improve data integrity.', domain_tags: ['databases', 'design'], verified: true},
    {id: 'db-sql', domain: 'databases', term_ar: 'لغة الاستعلام المهيكلة', term_en: 'Structured Query Language', abbreviation: 'SQL', aliases_ar: ['لغة SQL'], aliases_en: ['SQL language'], definition_ar: 'لغة قياسية لإدارة واستعلام قواعد البيانات العلاقية.', definition_en: 'Standard language for managing and querying relational databases.', domain_tags: ['databases', 'languages'], verified: true},

    // Operating Systems
    {id: 'os-process', domain: 'operating-systems', term_ar: 'عملية', term_en: 'Process', abbreviation: '', aliases_ar: ['عمليات'], aliases_en: ['Processes'], definition_ar: 'برنامج قيد التنفيذ يمتلك مساحة ذاكرة وموارد خاصة به.', definition_en: 'A program in execution with its own memory space and system resources.', domain_tags: ['operating-systems', 'execution'], verified: true},
    {id: 'os-thread', domain: 'operating-systems', term_ar: 'خيط تنفيذ', term_en: 'Thread', abbreviation: '', aliases_ar: ['خيط', 'خيوط التنفيذ'], aliases_en: ['Lightweight process'], definition_ar: 'أصغر وحدة معالجة يمكن جدولتها داخل العملية وتتشارك الذاكرة مع غيرها.', definition_en: 'Smallest unit of execution that can be scheduled within a process.', domain_tags: ['operating-systems', 'concurrency'], verified: true},
    {id: 'os-kernel', domain: 'operating-systems', term_ar: 'نواة النظام', term_en: 'Kernel', abbreviation: '', aliases_ar: ['النواة'], aliases_en: ['OS Kernel'], definition_ar: 'المكون المركزي لنظام التشغيل الذي يدير الموارد والاتصال بين العتاد والبرامج.', definition_en: 'Core component of an operating system managing system resources and hardware.', domain_tags: ['operating-systems', 'core'], verified: true},
    {id: 'os-virtual-memory', domain: 'operating-systems', term_ar: 'الذاكرة الافتراضية', term_en: 'Virtual Memory', abbreviation: '', aliases_ar: ['ذاكرة افتراضية'], aliases_en: ['Virtual RAM'], definition_ar: 'تقنية إدارة ذاكرة تستخدم القرص الصلب كأنها امتداد للذاكرة العشوائية.', definition_en: 'Memory management capability using disk space as an extension of RAM.', domain_tags: ['operating-systems', 'memory-management'], verified: true},

    // Computer Architecture
    {id: 'arch-cpu', domain: 'architecture', term_ar: 'وحدة المعالجة المركزية', term_en: 'Central Processing Unit', abbreviation: 'CPU', aliases_ar: ['المعالج', 'معالج البيانات'], aliases_en: ['Processor'], definition_ar: 'المكون الرئيسي المكون من وحدة الحساب والمنطق ووحدة التحكم لتنفيذ التعليمات.', definition_en: 'Main component executing instructions consisting of ALU and Control Unit.', domain_tags: ['architecture', 'hardware'], verified: true},
    {id: 'arch-ram', domain: 'architecture', term_ar: 'ذاكرة الوصول العشوائي', term_en: 'Random Access Memory', abbreviation: 'RAM', aliases_ar: ['الذاكرة العشوائية', 'ذاكرة RAM'], aliases_en: ['Main memory'], definition_ar: 'ذاكرة رئيسية مؤقتة قراءة وكتابة تستخدم لتخزين البيانات والبرامج النشطة.', definition_en: 'Main volatile memory used to store active programs and data.', domain_tags: ['architecture', 'memory'], verified: true},
    {id: 'arch-rom', domain: 'architecture', term_ar: 'ذاكرة القراءة فقط', term_en: 'Read-Only Memory', abbreviation: 'ROM', aliases_ar: ['ذاكرة ROM'], aliases_en: ['Non-volatile memory'], definition_ar: 'ذاكرة غير تطايرية تحتفظ بالتعليمات الأساسية للتشغيل حتى عند انقطاع الكهرباء.', definition_en: 'Non-volatile memory used to store permanent boot instructions.', domain_tags: ['architecture', 'memory'], verified: true},

    // Cybersecurity
    {id: 'sec-encryption', domain: 'cybersecurity', term_ar: 'التشفير', term_en: 'Encryption', abbreviation: '', aliases_ar: ['تشفير البيانات'], aliases_en: ['Data encryption'], definition_ar: 'عملية تحويل البيانات من نص واضح إلى نص مشفر لحمايتها من الاطلاع غير المصرح.', definition_en: 'Process of encoding data to prevent unauthorized access.', domain_tags: ['cybersecurity', 'cryptography'], verified: true},
    {id: 'sec-hashing', domain: 'cybersecurity', term_ar: 'التجزئة', term_en: 'Hashing', abbreviation: '', aliases_ar: ['دالة التجزئة', 'دوال الهاش'], aliases_en: ['Hash function'], definition_ar: 'تحويل البيانات إلى سلسلة ثابتة الطول فريدة لا يمكن عكسها بسهولة للتحقق من النزاهة.', definition_en: 'One-way mathematical transformation of data into a fixed-length signature.', domain_tags: ['cybersecurity', 'cryptography'], verified: true}
  ];

  function normalizeText(s) {
    if (!s) return '';
    try { s = String(s).normalize('NFKC'); } catch (_) {}
    return String(s).toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[ؤئ]/g, 'ء').trim();
  }

  var sharedInstance = null;

  function Lexicon(userEntries) {
    this.entries = INITIAL_ENTRIES.slice();
    if (Array.isArray(userEntries)) {
      userEntries.forEach(this.addOrUpdate.bind(this));
    }
  }

  Lexicon.getSharedInstance = function (userEntries) {
    if (!sharedInstance) {
      sharedInstance = new Lexicon(userEntries);
    } else if (Array.isArray(userEntries)) {
      userEntries.forEach(function (e) { sharedInstance.addOrUpdate(e); });
    }
    return sharedInstance;
  };

  Lexicon.prototype.addOrUpdate = function (entry) {
    if (!entry || (!entry.term_ar && !entry.term_en)) return false;
    var id = entry.id || ('user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
    var idx = this.entries.findIndex(function (e) { return e.id === id; });
    var normalized = {
      id: id,
      domain: entry.domain || 'general',
      term_ar: entry.term_ar || '',
      term_en: entry.term_en || '',
      abbreviation: (entry.abbreviation || '').toUpperCase(),
      aliases_ar: Array.isArray(entry.aliases_ar) ? entry.aliases_ar : [],
      aliases_en: Array.isArray(entry.aliases_en) ? entry.aliases_en : [],
      definition_ar: entry.definition_ar || '',
      definition_en: entry.definition_en || '',
      domain_tags: Array.isArray(entry.domain_tags) ? entry.domain_tags : [entry.domain || 'general'],
      verified: !!entry.verified,
      user_created: true
    };
    if (idx >= 0) this.entries[idx] = Object.assign({}, this.entries[idx], normalized);
    else this.entries.push(normalized);
    return true;
  };

  Lexicon.prototype.lookupTerm = function (query, domainHint) {
    var norm = normalizeText(query);
    if (!norm) return null;
    var upper = query.trim().toUpperCase();

    var matches = [];
    for (var i = 0; i < this.entries.length; i++) {
      var e = this.entries[i];
      var score = 0;
      if (e.abbreviation && e.abbreviation === upper) score = 100;
      else if (normalizeText(e.term_ar) === norm || normalizeText(e.term_en) === norm) score = 95;
      else if (e.aliases_ar.some(function (a) { return normalizeText(a) === norm; }) ||
               e.aliases_en.some(function (a) { return normalizeText(a) === norm; })) score = 85;
      else if (norm.length >= 3 && (normalizeText(e.term_ar).indexOf(norm) >= 0 || normalizeText(e.term_en).indexOf(norm) >= 0)) score = 60;

      if (score > 0) {
        if (domainHint && (e.domain === domainHint || e.domain_tags.indexOf(domainHint) >= 0)) score += 10;
        matches.push({entry: e, score: score});
      }
    }
    matches.sort(function (a, b) { return b.score - a.score; });
    return matches.length ? matches[0].entry : null;
  };

  Lexicon.prototype.expandQueryTerms = function (query, domainHint) {
    var norm = normalizeText(query);
    var matchedEntry = this.lookupTerm(query, domainHint);
    if (!matchedEntry) return [query];

    var expansions = new Set();
    expansions.add(query);
    if (matchedEntry.term_ar) expansions.add(matchedEntry.term_ar);
    if (matchedEntry.term_en) expansions.add(matchedEntry.term_en);
    if (matchedEntry.abbreviation) expansions.add(matchedEntry.abbreviation);
    matchedEntry.aliases_ar.forEach(function (a) { expansions.add(a); });
    matchedEntry.aliases_en.forEach(function (a) { expansions.add(a); });

    return Array.from(expansions);
  };

  return Lexicon;
}));
