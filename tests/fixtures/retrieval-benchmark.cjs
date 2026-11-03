'use strict';

// Small, fixed, bilingual gold set for measuring retrieval ranking.
// Each expected pair identifies a source page that contains the answer evidence.
module.exports = {
  k: 5,
  documents: [{
    id: 'network-course',
    name: 'Network Fundamentals.pdf',
    type: 'pdf',
    pages: [
      {
        page: 1,
        text: 'نظام أسماء النطاقات Domain Name System (DNS) يحوّل اسم النطاق domain name المقروء للبشر إلى عنوان بروتوكول الإنترنت IP address. عند الاستعلام، يبحث DNS في سجلات النطاق ويعيد عنوان IP المطابق. DNS resolves domain names to IP addresses.'
      },
      {
        page: 2,
        text: 'بروتوكول DHCP وهو Dynamic Host Configuration Protocol يوزع إعدادات الشبكة تلقائيًا على الأجهزة clients. تشمل الإعدادات عنوان IP وقناع الشبكة subnet mask والبوابة الافتراضية default gateway وخادم DNS. DHCP leases IP configuration to clients automatically.'
      },
      {
        page: 3,
        text: 'يقوم الراوتر Router بتمرير حزم IP packets بين الشبكات. عندما يستقبل حزمة، يفحص جدول التوجيه routing table ويختار القفزة التالية next hop وواجهة الخروج outgoing interface المناسبة للوصول إلى الوجهة. A router forwards packets between networks using its routing table.'
      },
      {
        page: 4,
        text: 'بروتوكول TCP أو Transmission Control Protocol بروتوكول معتمد على الاتصال connection-oriented ويوفر نقلًا موثوقًا ومرتبًا للبيانات. يستخدم أرقام التسلسل sequence numbers ورسائل الإقرار ACK وإعادة الإرسال retransmission والتحكم في التدفق flow control. TCP provides reliable ordered delivery.'
      },
      {
        page: 5,
        text: 'بروتوكول UDP أو User Datagram Protocol لا يعتمد على إنشاء اتصال connectionless ولا يضمن وصول الحزم أو ترتيبها، ولا ينفذ إعادة الإرسال تلقائيًا. يتميز بقلة الحمل overhead ويستخدم في تطبيقات تحتاج إلى سرعة مثل البث المباشر والاستعلامات. UDP does not guarantee delivery or ordering.'
      },
      {
        page: 6,
        text: 'نموذج OSI هو Open Systems Interconnection reference model ويتكون من سبع طبقات layers: Physical الفيزيائية، Data Link ربط البيانات، Network الشبكة، Transport النقل، Session الجلسة، Presentation العرض، وApplication التطبيق. It organizes network communication into seven layers.'
      },
      {
        page: 7,
        text: 'في قاعدة البيانات العلائقية relational database، المفتاح الأساسي Primary Key يعرّف كل سجل row تعريفًا فريدًا. المفتاح الخارجي Foreign Key يشير إلى مفتاح في جدول آخر ويحافظ على التكامل المرجعي referential integrity. A primary key uniquely identifies a row; a foreign key references another table.'
      },
      {
        page: 8,
        text: 'حالة الجمود Deadlock في نظام التشغيل Operating System تحدث عندما تنتظر عمليتان أو أكثر موارد يحتفظ بها بعضها بعضًا، فلا تتقدم أي عملية. تشمل الشروط الأربعة الاستبعاد المتبادل mutual exclusion والاحتفاظ والانتظار hold and wait وعدم نزع الموارد no preemption والانتظار الدائري circular wait.'
      },
      {
        page: 9,
        text: 'بروتوكول HTTP هو Hypertext Transfer Protocol ويعمل في طبقة التطبيق application layer. يرسل العميل client طلب HTTP request إلى الخادم server، ثم يعيد الخادم استجابة HTTP response تتضمن رمز الحالة status code ومحتوى الرسالة. HTTP follows a request-response model.'
      },
      {
        page: 10,
        text: 'دالة التجزئة التشفيرية Cryptographic Hash Function تحول البيانات إلى بصمة digest ثابتة الطول. يمكن مقارنة البصمات لاكتشاف التغيير والتحقق من سلامة البيانات data integrity. A hash supports integrity checking but does not encrypt or hide the original data.'
      }
    ]
  }],
  cases: [
    { id: 'dns-ar', language: 'ar', query: 'ما وظيفة نظام أسماء النطاقات DNS؟', relevant: ['network-course:1'] },
    { id: 'dns-en', language: 'en', query: 'How does DNS map domain names to IP addresses?', relevant: ['network-course:1'] },
    { id: 'dhcp-ar', language: 'ar', query: 'ما المعلومات التي يوزعها DHCP تلقائيًا على الجهاز؟', relevant: ['network-course:2'] },
    { id: 'routing-ar', language: 'ar', query: 'كيف يختار الراوتر القفزة التالية من جدول التوجيه؟', relevant: ['network-course:3'] },
    { id: 'tcp-ar', language: 'ar', query: 'كيف يضمن TCP وصول البيانات بالترتيب باستخدام ACK وإعادة الإرسال؟', relevant: ['network-course:4'] },
    { id: 'udp-ar', language: 'ar', query: 'لماذا لا يضمن UDP وصول الحزم أو ترتيبها؟', relevant: ['network-course:5'] },
    { id: 'tcp-udp-comparison', language: 'ar', query: 'قارن بين TCP وUDP من حيث الاتصال والموثوقية', relevant: ['network-course:4', 'network-course:5'] },
    { id: 'osi-ar', language: 'ar', query: 'ما هي الطبقات السبع لنموذج OSI؟', relevant: ['network-course:6'] },
    { id: 'database-keys-ar', language: 'ar', query: 'ما الفرق بين المفتاح الأساسي والمفتاح الخارجي في قواعد البيانات؟', relevant: ['network-course:7'] },
    { id: 'deadlock-ar', language: 'ar', query: 'ما المقصود بحالة deadlock ولماذا تنتظر العمليات الموارد؟', relevant: ['network-course:8'] },
    { id: 'http-en', language: 'en', query: 'Explain the HTTP request response model and status code.', relevant: ['network-course:9'] },
    { id: 'hash-ar', language: 'ar', query: 'كيف تستخدم دالة hash للتحقق من سلامة البيانات؟', relevant: ['network-course:10'] }
  ]
};
