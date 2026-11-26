'use strict';

/*
 * Offline cybersecurity tool registry.
 * Names are imported from the researcher-provided inventory. Capability notes
 * are only supplied for reviewed entries; every tool remains non-executable.
 */

const CATEGORIES = Object.freeze([
  {id:'osint',name:'الاستطلاع والمعلومات مفتوحة المصدر',english:'OSINT & Reconnaissance'},
  {id:'network',name:'تحليل الشبكات',english:'Network Analysis'},
  {id:'web-api',name:'أمن الويب وواجهات API',english:'Web & API Security'},
  {id:'passwords',name:'تحليل كلمات المرور والبصمات',english:'Password & Hash Auditing'},
  {id:'wireless',name:'الشبكات اللاسلكية',english:'Wireless Security'},
  {id:'mobile',name:'أمن تطبيقات الهاتف',english:'Mobile Security'},
  {id:'windows-ad',name:'Windows وActive Directory',english:'Windows & Active Directory'},
  {id:'reverse',name:'الهندسة العكسية وتحليل البرمجيات',english:'Reverse Engineering & Malware Analysis'},
  {id:'forensics-hardware',name:'الأدلة الجنائية والعتاد',english:'Digital Forensics & Hardware'},
  {id:'cloud-ai',name:'السحابة والذكاء الاصطناعي',english:'Cloud & AI'},
  {id:'fuzzing',name:'اختبار المتانة وFuzzing',english:'Fuzzing & Robustness Testing'},
  {id:'binary',name:'تحليل البرامج الثنائية',english:'Binary Analysis'},
  {id:'threat-intel',name:'استخبارات التهديدات',english:'Threat Intelligence'},
  {id:'cloud-kubernetes',name:'أمن السحابة وKubernetes',english:'Cloud & Kubernetes Security'},
  {id:'ai-security',name:'أمن أنظمة الذكاء الاصطناعي',english:'AI Security'},
  {id:'radio-hardware',name:'العتاد والراديو',english:'Hardware & Radio'},
  {id:'advanced-network',name:'تحليل الشبكات المتقدم',english:'Advanced Network Research'},
  {id:'analysis',name:'التحليل المتقدم',english:'Advanced Analysis'},
  {id:'code-analysis',name:'تحليل الكود وسلسلة توريد البرمجيات',english:'Code & Software Supply Chain Analysis'}
]);

const GROUPS = {
  osint:['Subfinder','Amass','httpx','Naabu','Nuclei','theHarvester','Shodan','Censys','Recon-ng','SpiderFoot','Photon','Sherlock','Holehe','GHunt','Metagoofil','WhatWeb','DNSRecon','DNSenum','Fierce','dig','Whois','Wappalyzer','Netcraft','Hunter','FOCA'],
  network:['Nmap','Masscan','RustScan','Netcat','Socat','Hping3','tcpdump','TShark','Zeek','Suricata','Snort','Ettercap','Bettercap','arpspoof','dsniff'],
  'web-api':['Burp Suite','OWASP ZAP','Caido','ffuf','Gobuster','Dirsearch','Dirb','Wfuzz','SQLmap','Dalfox','XSStrike','Nikto','WPScan','JoomScan','Commix','SSRFmap','Gopherus','Postman','InQL','Kiterunner','Arjun','JWT Tool','Autorize','Param Miner','GraphQL Voyager'],
  passwords:['Hashcat','John the Ripper','Hydra','Medusa','HashID','Hash-Identifier','CrackMapExec','Impacket','Responder','CeWL'],
  wireless:['Aircrack-ng','Airmon-ng','Airodump-ng','Aireplay-ng','Wifite','Reaver','Bully','Kismet'],
  mobile:['MobSF','Frida','Objection','JADX','APKTool','ADB','APKSigner','AndroGuard','Genymotion','Scrcpy'],
  'windows-ad':['BloodHound','SharpHound','LinPEAS','WinPEAS','Metasploit','PowerSploit / PowerView','Mimikatz','Ntdsutil','Enum4linux','Smbmap','Smbclient','Ldapsearch'],
  reverse:['Ghidra','IDA Pro','Radare2','Rizin','x64dbg','dnSpy','JD-GUI','YARA','Cuckoo','REMnux','Binwalk','Strings'],
  'forensics-hardware':['Autopsy','Sleuth Kit','Volatility','FTK Imager','ExifTool','Foremost','Flashrom','OpenOCD','Firmwalker','ChipWhisperer','PulseView','SageMath'],
  'cloud-ai':['ScoutSuite','Prowler','Trivy','Kube-bench','AWS CLI','Google Cloud CLI','CyberChef','Ollama','LangChain','ChromaDB','FAISS','Hugging Face CLI'],
  fuzzing:['AFL++','libFuzzer','Honggfuzz','Boofuzz','Radamsa','Peach Fuzzer','Syzkaller','TriforceAFL','Wapiti'],
  binary:['pwntools','GDB + GEF','pwndbg','ROPgadget','ropper','one_gadget','checksec','Peda','Exploit-DB / SearchSploit'],
  'threat-intel':['MISP','OpenCTI','TheHive','Cortex','YARA-X','Sigma','Velociraptor','KAPE','GRR','osquery'],
  'cloud-kubernetes':['Pacu','CloudGoat','Kube-hunter','Falco','Checkov','CloudSploit'],
  'ai-security':['Adversarial Robustness Toolbox (ART)','CleverHans','TextAttack','Garak','Promptfoo','PyRIT','Counterfit','MLSecOps'],
  'radio-hardware':['HackRF One','RTL-SDR','GreatFET','Proxmark3','Flipper Zero','Ubertooth','Crazyradio','JTAGulator','Bus Pirate'],
  'advanced-network':['Interactsh','Burp Collaborator','DNSx','Subzy','Katana','Gowitness','Aquatone','Gospider','Waybackurls'],
  analysis:['Bulk Extractor','Binary Ninja'],
  'code-analysis':['Semgrep','Tree-sitter','Gitleaks','OSV-Scanner','Syft','Grype']
};

const ALIASES = Object.freeze({
  'ghidra pro':'Ghidra','volatility3':'Volatility','autopsy pro':'Autopsy',
  'sleuth kit pro':'Sleuth Kit','binwalk pro':'Binwalk','frida pro':'Frida',
  'objection pro':'Objection','chipwhisperer pro':'ChipWhisperer',
  'prowler pro':'Prowler','scoutsuite pro':'ScoutSuite','ffuf-fuzz':'ffuf',
  'metasploit-db':'Metasploit','gdb-peda':'Peda','gdb peda':'Peda',
  'gcloud cli':'Google Cloud CLI','vol.py':'Volatility','pulse view':'PulseView',
  'kube-bench run':'Kube-bench','yara x':'YARA-X','hash identifier':'Hash-Identifier'
});

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g,'')
    .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
    .replace(/[^\p{L}\p{N}+#./_-]+/gu,' ').replace(/\s+/g,' ').trim();
}
function slug(value) {
  return normalize(value).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'tool';
}

const DETAILS = {
  'semgrep': {
    summary:'محرك تحليل ساكن للشيفرة يبحث عن أنماط برمجية وأمنية باستخدام قواعد قابلة للمراجعة.',
    purpose:'مراجعة الشيفرة المصدرية واكتشاف أنماط قد تشير إلى أخطاء أمنية أو ممارسات غير آمنة قبل التشغيل.',
    inputs:['مجلد مصدر أو ملفات برمجية','قواعد محلية مراجعة'],
    outputs:['نتائج مرتبطة بالملف والسطر والقاعدة','رسائل تفسير وتوصيات بحسب القاعدة'],
    offline:'يمكن التحليل محلياً بعد تجهيز البرنامج والقواعد محلياً؛ جلب القواعد أو التحديثات منفصل.',
    network:'لا يلزم للتحليل المحلي بقواعد محفوظة؛ قد يلزم للتحديثات الاختيارية.',
    risk:'تحليل ساكن للقراءة فقط في تصميم مِداد.',
    limits:'الجودة تعتمد على القواعد واللغة والسياق؛ النتائج مؤشرات تحتاج إلى مراجعة بشرية.',
    docs:'https://semgrep.dev/docs/'
  },
  'tree-sitter': {
    summary:'مكتبة تحليل نحوي تنتج شجرة تركيبية ملموسة لملفات لغات برمجية متعددة.',
    purpose:'فهم البنية النحوية للكود وتحديد الدوال والاستدعاءات والتعبيرات.',
    inputs:['نص المصدر','Grammar محلية للغة'],
    outputs:['شجرة Syntax Tree ومواقع العقد'],
    offline:'نعم بعد تثبيت المكتبة وملفات Grammar محلياً.',
    network:'لا يلزم أثناء التحليل إذا كانت Grammar متوفرة.',
    risk:'تحليل محلي للقراءة فقط.',
    limits:'التحليل النحوي وحده لا يثبت تدفق البيانات أو وجود ثغرة.',
    docs:'https://tree-sitter.github.io/tree-sitter/'
  },
  'gitleaks': {
    summary:'ماسح للبحث عن أنماط الأسرار والاعتمادات الحساسة داخل الملفات ومستودعات Git.',
    purpose:'اكتشاف مؤشرات مفاتيح أو رموز اعتماد قد تكون كُتبت في المصدر بالخطأ.',
    inputs:['مجلد أو مستودع محلي','قواعد كشف محلية'],
    outputs:['نتائج بأنواع القواعد ومواقع المطابقة مع إخفاء القيم'],
    offline:'يمكن مسح الملفات محلياً بعد تثبيت البرنامج والقواعد.',
    network:'لا يلزم لمسح الملفات المحلية.',
    risk:'فحص محلي للقراءة فقط؛ يجب عدم حفظ القيم الحساسة.',
    limits:'قد ينتج نتائج خاطئة أو يفوّت أنماطاً غير ممثلة في القواعد.',
    docs:'https://github.com/gitleaks/gitleaks'
  },
  'osv-scanner': {
    summary:'أداة لتحليل الاعتماديات ومقارنتها بقاعدة ثغرات OSV.',
    purpose:'تحديد الاعتماديات التي قد تتأثر بثغرات منشورة وفق بيانات المطابقة المتاحة.',
    inputs:['ملفات manifests أو lockfiles أو SBOM','قاعدة بيانات OSV محلية'],
    outputs:['تطابقات اعتماديات ومعرفات ثغرات مرجعية'],
    offline:'يتطلب قاعدة بيانات محلية مجهزة ومحدثة مسبقاً.',
    network:'تحديث بيانات الثغرات أو الاستعلام عن الخدمات قد يحتاج الشبكة.',
    risk:'تحليل اعتماديات محلي للقراءة فقط.',
    limits:'المطابقة لا تثبت قابلية الاستغلال داخل التطبيق.',
    docs:'https://google.github.io/osv-scanner/'
  },
  'syft': {
    summary:'ينشئ قائمة مكونات برمجية SBOM من مصادر مدعومة.',
    purpose:'جرد مكونات البرمجيات وإصداراتها لدعم إدارة سلسلة التوريد.',
    inputs:['مجلد محلي أو صورة حاوية موجودة محلياً'],
    outputs:['SBOM بصيغ منها CycloneDX وSPDX'],
    offline:'يمكن فحص المكونات المتاحة محلياً دون جلب مصدر خارجي.',
    network:'قد يلزم لجلب صور أو مصادر غير موجودة محلياً.',
    risk:'إنشاء جرد للقراءة فقط.',
    limits:'وجود المكون في SBOM لا يعني تحديد ثغراته أو اكتمال الاعتماديات.',
    docs:'https://github.com/anchore/syft'
  },
  'grype': {
    summary:'محرك لمطابقة مكونات البرمجيات مع قواعد بيانات الثغرات المعروفة.',
    purpose:'مراجعة المخاطر المرتبطة بإصدارات مكونات البرمجيات.',
    inputs:['SBOM أو مصدر برمجي محلي','قاعدة ثغرات محلية'],
    outputs:['تطابقات ثغرات ومعلومات مكونات متأثرة'],
    offline:'يتطلب قاعدة بيانات ثغرات محلية مجهزة مسبقاً.',
    network:'تحديث قاعدة البيانات قد يحتاج اتصالاً منفصلاً.',
    risk:'تحليل محلي للقراءة فقط.',
    limits:'التطابق لا يثبت قابلية التأثر في سياق التطبيق.',
    docs:'https://github.com/anchore/grype'
  },
  'trivy': {
    summary:'ماسح أمني لمكونات البرمجيات وصور الحاويات وأنواع متعددة من الأصول.',
    purpose:'دعم تقييم الثغرات والإعدادات والمكونات ضمن سير عمل دفاعي.',
    inputs:['ملفات أو صور محلية','قواعد بيانات محلية'],
    outputs:['نتائج فحص وتوصيف للمكونات والمخاطر'],
    offline:'يمكنه العمل دون شبكة عند توفير قواعد البيانات والمصادر مسبقاً.',
    network:'تحديث قواعد البيانات أو جلب صورة خارجية قد يتطلب الشبكة.',
    risk:'فحص محلي للقراءة فقط عند اختيار مصدر محلي.',
    limits:'النتائج تعتمد على حداثة قاعدة البيانات ونوع الهدف.',
    docs:'https://trivy.dev/latest/'
  },
  'yara': {
    summary:'أداة وقواعد لتصنيف الملفات والعينات الرقمية وفق أنماط محددة.',
    purpose:'البحث عن مؤشرات معروفة داخل ملفات محلية ضمن تحليل دفاعي.',
    inputs:['ملفات محلية','قواعد YARA موثوقة ومراجعة'],
    outputs:['اسم القاعدة والملفات التي طابقت نمطاً'],
    offline:'نعم عند توافر القواعد محلياً.',
    network:'لا يلزم لتحليل الملفات المحلية.',
    risk:'تحليل ساكن للقراءة فقط؛ تعامل مع العينات غير الموثوقة داخل مختبر معزول.',
    limits:'المطابقة مؤشر وليست إثباتاً قاطعاً؛ جودة النتيجة تعتمد على القاعدة.',
    docs:'https://yara.readthedocs.io/'
  },
  'ghidra': {
    summary:'إطار للهندسة العكسية وتحليل الملفات التنفيذية.',
    purpose:'مساعدة الباحث على فهم بنية البرنامج وتعليمة الآلة والوظائف المستخرجة.',
    inputs:['ملف ثنائي محلي'],
    outputs:['تفكيك وتعليمات ومخططات تدفق وعرض شبه برمجي'],
    offline:'نعم بعد تثبيت البرنامج.',
    network:'لا يلزم للتحليل المحلي.',
    risk:'تحليل ساكن؛ لا تشغّل عينة غير موثوقة على النظام الأساسي.',
    limits:'الناتج المستعاد تقريبي وقد يحتاج تفسيراً وخبرة.',
    docs:'https://ghidra-sre.org/'
  },
  'mobsf': {
    summary:'إطار لتحليل أمان تطبيقات الهاتف، مع دعم تحليل ساكن وديناميكي بحسب الإعداد.',
    purpose:'مراجعة خصائص تطبيقات الهاتف ومكوناتها ومؤشرات المخاطر.',
    inputs:['ملف APK أو IPA محلي','بيئة محاكاة عند الحاجة للتحليل الديناميكي'],
    outputs:['تقرير تحليل ونتائج ومعلومات عن التطبيق'],
    offline:'يمكن التحليل الساكن محلياً بعد تثبيت جميع المكونات.',
    network:'التثبيت والتحديث يحتاجان تجهيزاً مسبقاً؛ التشغيل المحلي لا يتطلب خدمة سحابية.',
    risk:'تحليل تطبيقات تملكها أو لديك تصريح بتحليلها فقط.',
    limits:'النتائج مؤشرات وليست بديلاً عن مراجعة مختصة.',
    docs:'https://mobsf.github.io/Mobile-Security-Framework-MobSF/'
  },
  'jadx': {
    summary:'أداة تفكيك تطبيقات Android لعرض شيفرة Java تقريبية من ملفات DEX وAPK.',
    purpose:'مراجعة بنية التطبيق ومنطقه برمجياً.',
    inputs:['APK أو DEX محلي'],
    outputs:['شيفرة تقريبية وموارد وبنية الحزم'],
    offline:'نعم بعد تثبيت البرنامج.',
    network:'لا يلزم للتحليل المحلي.',
    risk:'تحليل ساكن للقراءة فقط.',
    limits:'قد لا تستعيد أسماء وبنية المصدر الأصلية.',
    docs:'https://github.com/skylot/jadx'
  },
  'volatility': {
    summary:'إطار للتحليل الجنائي للذاكرة من تفريغات متوافقة.',
    purpose:'فهم حالة النظام والعمليات وبعض الآثار الرقمية من عينة ذاكرة محفوظة.',
    inputs:['ملف تفريغ ذاكرة','ملفات رموز أو إضافات متوافقة عند الحاجة'],
    outputs:['معلومات نظام وعمليات ونتائج تحليل جنائي'],
    offline:'نعم عند توافر العينة والمتطلبات محلياً.',
    network:'لا يلزم لمعالجة التفريغ المحلي؛ قد تحتاج المتطلبات إلى تنزيل مسبق.',
    risk:'تحليل نسخة جنائية للقراءة فقط مع الحفاظ على الأصل وبصمته.',
    limits:'تختلف النتائج حسب نظام التشغيل والنواة وجودة التفريغ.',
    docs:'https://volatility3.readthedocs.io/'
  },
  'autopsy': {
    summary:'واجهة للتحليل الجنائي الرقمي تعتمد على مكونات Sleuth Kit.',
    purpose:'تنظيم الأدلة الرقمية والبحث في صور الأقراص والملفات والبيانات الوصفية.',
    inputs:['صورة قرص أو مصدر أدلة محلي','بيانات القضية'],
    outputs:['نتائج ملفات وبيانات وصفية وخط زمني'],
    offline:'نعم لتحليل صورة محلية بعد تثبيت المتطلبات.',
    network:'لا يلزم لتحليل صورة محلية في التكوين المعتاد.',
    risk:'تحليل نسخة أدلة؛ يجب الحفاظ على الأصل وسلسلة الحيازة.',
    limits:'لا يعوّض توثيق الإجراءات والتحقق من سلامة الصورة.',
    docs:'https://www.autopsy.com/'
  },
  'zeek': {
    summary:'منصة تحليل حركة الشبكة واستخراج سجلات وصفية عن البروتوكولات والاتصالات.',
    purpose:'تحليل ملفات PCAP التدريبية أو حركة مختبرية دفاعية.',
    inputs:['ملف PCAP محلي أو واجهة شبكة ضمن مختبر مصرح'],
    outputs:['سجلات بروتوكولات وأحداث قابلة للتحليل'],
    offline:'يمكن تحليل ملفات PCAP محلية دون اتصال خارجي.',
    network:'الالتقاط المباشر يتطلب واجهة شبكة؛ تحليل الملف المحلي لا يتطلب ذلك.',
    risk:'تحليل دفاعي؛ استخدم ملفات تدريبية أو مختبرية.',
    limits:'تعتمد النتائج على جودة الالتقاط والمحللات.',
    docs:'https://docs.zeek.org/'
  },
  'suricata': {
    summary:'محرك كشف وتحليل لحركة الشبكة يعتمد على قواعد وتواقيع وأحداث.',
    purpose:'تحليل PCAP أو حركة مختبرية لإظهار تنبيهات ومؤشرات دفاعية.',
    inputs:['ملف PCAP','قواعد محلية وإعدادات المحرك'],
    outputs:['تنبيهات وسجلات أحداث وبيانات تدفق'],
    offline:'يمكن تحليل PCAP محلياً بعد توفير القواعد.',
    network:'لا يلزم لمعالجة ملف محلي؛ الالتقاط الحي يقرأ واجهة الشبكة.',
    risk:'تحليل دفاعي؛ مِداد لا يولد حركة هجومية.',
    limits:'القواعد القديمة قد تزيد الإنذارات الخاطئة أو تفوّت أحداثاً.',
    docs:'https://docs.suricata.io/'
  },
  'owasp-zap': {
    summary:'أداة لمراجعة أمن تطبيقات الويب والطلبات والاستجابات ضمن اختبار مصرح.',
    purpose:'مساعدة الباحث على تحليل تطبيق تجريبي أو محلي ومراجعة النتائج.',
    inputs:['تطبيق مختبري محلي','ملفات طلبات أو تقارير محفوظة'],
    outputs:['تنبيهات وملاحظات وروابط إلى الأدلة'],
    offline:'يمكن تشغيل البرنامج محلياً؛ يجب توفير التطبيق المستهدف داخل المختبر.',
    network:'الاختبار يتصل بالتطبيق المستهدف؛ مِداد في هذه المرحلة يكتفي بتحليل تقاريره المحفوظة.',
    risk:'لا ينفذ مِداد فحوصاً نشطة عبر ZAP في هذه المرحلة.',
    limits:'النتائج تحتاج تحققاً ومراجعة للسياق.',
    docs:'https://www.zaproxy.org/docs/'
  },
  'burp-suite': {
    summary:'منصة لمراجعة طلبات واستجابات تطبيقات الويب وواجهات API.',
    purpose:'مساعدة المختبر على فهم حركة تطبيق مصرح ومراجعة تقارير الاختبار.',
    inputs:['تطبيق اختباري محلي أو تقرير محفوظ','إعدادات المشروع'],
    outputs:['سجل طلبات واستجابات وملاحظات تحليل'],
    offline:'تختلف المزايا حسب الإصدار والترخيص؛ كثير من العمل المحلي ممكن بعد الإعداد.',
    network:'الوصول للهدف يحتاج اتصالاً ضمن المختبر؛ التحديثات والخدمات تتباين حسب النسخة.',
    risk:'مِداد لا يشغّل اختبارات Burp ولا يرسل طلبات للهدف.',
    limits:'النسخة والامتدادات تؤثر في الخصائص المتاحة.',
    docs:'https://portswigger.net/burp/documentation'
  },
  'nmap': {
    summary:'أداة جرد وتحليل للشبكات والخدمات.',
    purpose:'فهم بنية شبكة مصرح بها ضمن اختبار مضبوط أو مراجعة نتائج محفوظة.',
    inputs:['نطاق مختبري مصرح أو تقرير محفوظ'],
    outputs:['معلومات عن المضيفين والمنافذ والخدمات وفق نوع الفحص'],
    offline:'البرنامج محلي؛ يتطلب الهدف متاحاً عبر الشبكة عند إجراء فحص حي.',
    network:'الفحص الحي يتعامل مع شبكة؛ مِداد يفسر التقارير ولا يبدأ عمليات فحص شبكي.',
    risk:'التنفيذ الحي غير مفعّل في مِداد.',
    limits:'النتائج تعتمد على النطاق والإعدادات ومرشحات الشبكة.',
    docs:'https://nmap.org/book/man.html'
  },
  'nuclei': {
    summary:'محرك مطابقة فحوص مع قوالب قابلة للتخصيص.',
    purpose:'تحليل نتائج فحوص محفوظة ومراجعة القوالب والبيانات الوصفية ضمن نطاق مصرح.',
    inputs:['قوالب محلية','تقارير فحص محفوظة أو هدف مصرح في بيئة خارج مِداد'],
    outputs:['مطابقات قوالب ونتائج ذات مراجع'],
    offline:'يمكن تشغيل محرك محلي بقوالب محفوظة؛ التحديثات منفصلة.',
    network:'بعض الاختبارات تتصل بالهدف؛ مِداد لا ينفذها.',
    risk:'لا يشغّل مِداد قوالب Nuclei؛ تحليل التقارير فقط.',
    limits:'المطابقة تحتاج تحققاً من أثرها وحدود القالب.',
    docs:'https://docs.projectdiscovery.io/tools/nuclei/overview'
  },
  'prowler': {
    summary:'أداة تقييم وضبط أمني لخدمات سحابية متعددة.',
    purpose:'مراجعة تقارير تقييم الإعدادات والسجلات ضمن بيئات تملكها المؤسسة.',
    inputs:['تقارير محفوظة','إعدادات حسابات سحابية مصرح بها خارج مِداد'],
    outputs:['نتائج امتثال ومخاطر وتوصيات'],
    offline:'تحليل التقارير محلياً ممكن؛ التقييم المباشر يحتاج أدوات وبيانات البيئة.',
    network:'التقييم المباشر لخدمات السحابة يحتاج وصولاً شبكياً وصلاحيات.',
    risk:'مِداد يفسر التقارير فقط ولا يستخدم بيانات اعتماد سحابية.',
    limits:'تتغير التغطية حسب المزود والإصدار والسياسات.',
    docs:'https://docs.prowler.com/'
  },
  'osquery': {
    summary:'إطار للاستعلام المنظم عن معلومات النظام والعمليات والإعدادات.',
    purpose:'مراجعة نتائج جرد دفاعي للأجهزة وتحويلها إلى بيانات قابلة للبحث.',
    inputs:['نتائج استعلام محفوظة','جهاز مختبري مصرح عند تشغيله خارج مِداد'],
    outputs:['صفوف وحقول منظمة'],
    offline:'يمكن تحليل البيانات المحفوظة محلياً.',
    network:'قراءة الجهاز محلياً لا تتطلب خدمة سحابية؛ الإدارة المركزية قد تتطلب شبكة.',
    risk:'مِداد يفسر نتائج محفوظة فقط.',
    limits:'المخرجات تعكس وقت الجمع وصلاحيات ومصادر البيانات.',
    docs:'https://osquery.io/'
  },
  'promptfoo': {
    summary:'أداة لتقييم جودة وسلامة تطبيقات ونماذج الذكاء الاصطناعي.',
    purpose:'تنظيم اختبارات مقارنة للمدخلات والمخرجات والسياسات.',
    inputs:['حالات اختبار محلية','إعدادات مزود نموذج محلي'],
    outputs:['تقارير تقييم ومقارنات'],
    offline:'يمكن تهيئة اختبارات مع مزود محلي؛ يعتمد ذلك على الإعداد والمكونات.',
    network:'المزود السحابي أو تنزيل الإضافات يحتاج اتصالاً؛ استخدم مزوداً محلياً.',
    risk:'يستخدم في مِداد لتقييم الحماية والجودة على نماذج محلية.',
    limits:'نتيجة التقييم مرتبطة بمجموعة الاختبار ولا تثبت السلامة المطلقة.',
    docs:'https://www.promptfoo.dev/docs/'
  },
  'garak': {
    summary:'إطار لتقييم متانة وسلامة النماذج اللغوية عبر اختبارات معيارية.',
    purpose:'قياس سلوك نموذج محلي تجاه أنماط مدخلات غير موثوقة وسياسات الاستخدام.',
    inputs:['نموذج اختباري محلي','إعدادات ومجموعات اختبارات مراجعة'],
    outputs:['نتائج اختبارات ومؤشرات تقييم'],
    offline:'يمكن تهيئة الاختبار محلياً إذا كانت النماذج والاختبارات متوفرة محلياً.',
    network:'المصادر والنماذج الخارجية قد تتطلب اتصالاً؛ مِداد لا يشغّل هجمات على خدمات خارجية.',
    risk:'يستخدم لتقييم دفاعي داخل نموذج ومختبر محليين فقط.',
    limits:'الاختبارات لا تغطي جميع حالات الاستخدام أو التهديدات.',
    docs:'https://garak.ai/'
  },
  'afl': {
    summary:'إطار Fuzzing لاختبار متانة البرامج بمدخلات مولدة ضمن برنامج اختباري.',
    purpose:'قياس قدرة برنامج تجريبي على التعامل الآمن مع مدخلات غير متوقعة.',
    inputs:['برنامج اختبار مملوك','مدخلات اختبار وبيئة معزولة'],
    outputs:['حالات فشل وتقارير تغطية وسجلات'],
    offline:'يمكن تنفيذ التجارب محلياً داخل مختبر معزول.',
    network:'لا يلزم عادةً للبرنامج المحلي؛ لا يستخدم على خدمات أو أهداف خارج المختبر.',
    risk:'تشغيل تجارب Fuzzing قد يوقف البرنامج التجريبي؛ مِداد لا يشغله آلياً.',
    limits:'يتطلب إعداد harness وبيئة اختبار؛ نتائج التغطية لا تضمن خلو البرنامج من العيوب.',
    docs:'https://aflplus.plus/'
  },
  'misp': {
    summary:'منصة لإدارة ومشاركة مؤشرات استخبارات التهديدات.',
    purpose:'تنظيم المؤشرات والعلاقات والسياق ومراجعة مجموعات البيانات المحلية.',
    inputs:['مجموعات بيانات تهديدات','مؤشرات وأحداث موثقة'],
    outputs:['أحداث ومؤشرات وعلاقات قابلة للتصدير'],
    offline:'يمكن تشغيل نسخة محلية واستخدام بيانات مستوردة مسبقاً.',
    network:'تبادل البيانات أو مزامنتها يتطلب شبكة؛ يمكن تعطيله.',
    risk:'يحتاج حوكمة لتجنب إدخال بيانات شخصية أو مؤشرات غير موثوقة.',
    limits:'المؤشر لا يثبت وحده وجود اختراق؛ يلزم السياق والتحديث.',
    docs:'https://www.misp-project.org/'
  },
  'falco': {
    summary:'محرك مراقبة وتنبيه لسلوك النظام والبيئات الحاوية.',
    purpose:'تحليل الأحداث والتنبيهات المتعلقة بتشغيل الحاويات والأنظمة.',
    inputs:['أحداث النظام','قواعد مراقبة محلية'],
    outputs:['تنبيهات وأحداث مرتبطة بقواعد'],
    offline:'يمكن تشغيله محلياً بعد تجهيز القواعد والمكونات.',
    network:'لا يلزم لمراقبة محلية؛ التجميع المركزي قد يتطلب شبكة.',
    risk:'مراقبة دفاعية؛ يحتاج ضبطاً لتقليل الإنذارات.',
    limits:'يعتمد على مصادر الأحداث والقواعد وبيئة التشغيل.',
    docs:'https://falco.org/docs/'
  },
  'sigma': {
    summary:'صيغة عامة لقواعد كشف الأحداث والسجلات الأمنية.',
    purpose:'توصيف منطق الكشف بصورة قابلة للتحويل إلى منصات تحليل متعددة.',
    inputs:['ملفات قواعد Sigma','سجلات أو منصة هدف للتحليل خارج مِداد'],
    outputs:['قواعد كشف قابلة للتحويل ومراجعتها'],
    offline:'نعم لمراجعة ملفات القواعد محلياً.',
    network:'لا يلزم لتحليل نص القاعدة أو تحويلها بأداة محلية.',
    risk:'مراجعة قواعد دفاعية فقط.',
    limits:'يلزم مواءمة الحقول والمصادر مع المنصة المستهدفة.',
    docs:'https://sigmahq.io/'
  },
  'ollama': {
    summary:'مشغل نماذج لغوية محلي يوفّر API على الجهاز لإدارة النماذج وتشغيلها.',
    purpose:'توفير نقطة تشغيل محلية للنموذج اللغوي الذي يستخدمه مِداد.',
    inputs:['نموذج محلي مثبت','رسائل ومحادثة محلية'],
    outputs:['إجابات مولدة محلياً وقائمة النماذج المثبتة'],
    offline:'نعم بعد تنزيل النموذج ومتطلباته مسبقاً وتعطيل ميزات السحابة.',
    network:'يستخدم loopback محلياً بين مِداد وOllama؛ تنزيل النماذج والتحديثات منفصل.',
    risk:'يجب حصر الخدمة في 127.0.0.1 وتعطيل ميزات السحابة.',
    limits:'جودة الإجابة والسرعة تعتمدان على النموذج والذاكرة والعتاد.',
    docs:'https://ollama.com/'
  }
};

const categoryById = new Map(CATEGORIES.map((item)=>[item.id,item]));
const toolsById = new Map();
for (const categoryId of Object.keys(GROUPS)) {
  const category = categoryById.get(categoryId);
  for (const originalName of GROUPS[categoryId]) {
    const canonicalName = ALIASES[normalize(originalName)] || originalName;
    const id = slug(canonicalName);
    let tool = toolsById.get(id);
    if (!tool) {
      const detail = DETAILS[id] || null;
      tool = {
        id, name:canonicalName, aliases:[], category:categoryId,
        categories:[categoryId], categoryName:category.name, categoryEnglish:category.english,
        knowledgeStatus:detail?'reviewed-summary':'catalogued-needs-review',
        summary:detail?detail.summary:'اسم الأداة وارد في قائمة الباحث؛ لم تكتمل مراجعة توثيقها الفني بعد.',
        purpose:detail?detail.purpose:null,
        inputs:detail?detail.inputs:[], outputs:detail?detail.outputs:[],
        offline:detail?detail.offline:'غير متحقق؛ لا تفترض أن الأداة تعمل دون اتصال.',
        network:detail?detail.network:'غير متحقق؛ راجع طريقة التشغيل والاتصالات قبل اعتمادها.',
        risk:detail?detail.risk:'التنفيذ غير مفعّل. يلزم تقييم المخاطر والتراخيص والتفويض قبل أي دمج.',
        limits:detail?detail.limits:'لم تتم مراجعة الحدود والقيود لهذه الأداة بعد.',
        documentation:detail?detail.docs:null,
        executionEnabled:false, source:'doctor-provided-inventory'
      };
      toolsById.set(id,tool);
    } else if (!tool.categories.includes(categoryId)) {
      tool.categories.push(categoryId);
    }
    if (normalize(originalName)!==normalize(canonicalName) && !tool.aliases.includes(originalName)) tool.aliases.push(originalName);
  }
}
for (const [alias,canonical] of Object.entries(ALIASES)) {
  const tool = toolsById.get(slug(canonical));
  if (tool && !tool.aliases.includes(alias)) tool.aliases.push(alias);
}

const TOOLS = Object.freeze(Array.from(toolsById.values()).map((tool)=>Object.freeze({
  ...tool, aliases:Object.freeze(tool.aliases.slice()), categories:Object.freeze(tool.categories.slice()),
  inputs:Object.freeze(tool.inputs.slice()), outputs:Object.freeze(tool.outputs.slice())
})));
const categoryOrder = new Map(CATEGORIES.map((item,index)=>[item.id,index]));

function publicTool(tool) {
  return {
    id:tool.id,name:tool.name,aliases:tool.aliases.slice(),category:tool.category,
    categories:tool.categories.slice(),categoryName:tool.categoryName,categoryEnglish:tool.categoryEnglish,
    knowledgeStatus:tool.knowledgeStatus,summary:tool.summary,purpose:tool.purpose,
    inputs:tool.inputs.slice(),outputs:tool.outputs.slice(),offline:tool.offline,network:tool.network,
    risk:tool.risk,limits:tool.limits,documentation:tool.documentation,
    executionEnabled:false,source:tool.source
  };
}
function categoryMatches(tool,categoryId) {
  return !categoryId || categoryId==='all' || tool.categories.includes(categoryId);
}
function scoreTool(tool,query) {
  const q=normalize(query);
  if (!q) return 10;
  const name=normalize(tool.name);
  const aliases=tool.aliases.map(normalize);
  const haystack=normalize([tool.name,tool.id,...tool.aliases,tool.categoryName,tool.categoryEnglish,tool.summary,tool.purpose||''].join(' '));
  if (name===q || tool.id===slug(q)) return 100;
  if (aliases.includes(q)) return 95;
  if (name.includes(q) || aliases.some((alias)=>alias.includes(q))) return 85;
  if (haystack.includes(q)) return 65;
  const terms=q.split(' ').filter(Boolean);
  const hits=terms.filter((term)=>haystack.includes(term)).length;
  return hits?Math.round(40*hits/terms.length):0;
}
function searchTools(query,categoryId,limit) {
  const maximum=Number.isSafeInteger(limit)?Math.max(1,Math.min(limit,100)):40;
  const matches=TOOLS.map((tool)=>({tool,score:scoreTool(tool,query)}))
    .filter((item)=>item.score>0&&categoryMatches(item.tool,categoryId))
    .sort((a,b)=>b.score-a.score||categoryOrder.get(a.tool.category)-categoryOrder.get(b.tool.category)||a.tool.name.localeCompare(b.tool.name));
  return {
    query:String(query||'').slice(0,200),category:categoryId||'all',total:matches.length,
    results:matches.slice(0,maximum).map((item)=>publicTool(item.tool))
  };
}
function getTool(idOrName) {
  const key=normalize(idOrName);
  const canonical=ALIASES[key];
  const target=canonical?slug(canonical):slug(key);
  const direct=toolsById.get(target);
  if (direct) return publicTool(direct);
  const found=TOOLS.find((tool)=>normalize(tool.name)===key||tool.aliases.some((alias)=>normalize(alias)===key));
  return found?publicTool(found):null;
}
function buildKnowledgeContext(question,maximum) {
  const result=searchTools(question,'all',maximum||8);
  return {
    query:result.query,totalMatches:result.total,
    records:result.results.map((tool)=>({
      name:tool.name,category:tool.categoryName,knowledgeStatus:tool.knowledgeStatus,
      summary:tool.summary,purpose:tool.purpose,inputs:tool.inputs,outputs:tool.outputs,
      offline:tool.offline,network:tool.network,risk:tool.risk,limits:tool.limits,
      documentation:tool.documentation,executionEnabled:false
    })),
    note:'السجلات غير المكتملة موسومة catalogued-needs-review؛ لا تستنتج منها معلومات غير موثقة. لا توجد أداة مفعّلة للتنفيذ.'
  };
}
function listCategories() {
  return CATEGORIES.map((category)=>({...category,count:TOOLS.filter((tool)=>tool.categories.includes(category.id)).length}));
}
module.exports={CATEGORIES,TOOLS,searchTools,getTool,buildKnowledgeContext,listCategories,normalize};
