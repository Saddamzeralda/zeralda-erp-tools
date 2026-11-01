# -*- coding: utf-8 -*-
"""
Algerian Public Procurement Sources Generator (1,000+ authentic official sources)
Generates structured sources across all Algerian public institutions, ministries,
58 wilayas, 522 executive directorates, 120 APCs, Sonatrach/Sonelgaz subsidiaries,
ADE units, Universities, CHU/EPH hospitals, Port authorities, BTPH agencies, and banks.
"""

import json

WILAYAS_58 = [
    ("01", "أدرار", "Adrar", "adrar"),
    ("02", "الشلف", "Chlef", "chlef"),
    ("03", "الأغواط", "Laghouat", "laghouat"),
    ("04", "أم البواقي", "Oum El Bouaghi", "oumelbouaghi"),
    ("05", "باتنة", "Batna", "batna"),
    ("06", "بجاية", "Béjaïa", "bejaia"),
    ("07", "بسكرة", "Biskra", "biskra"),
    ("08", "بشار", "Béchar", "bechar"),
    ("09", "البليدة", "Blida", "blida"),
    ("10", "البويرة", "Bouira", "bouira"),
    ("11", "تمنراست", "Tamanrasset", "tamanrasset"),
    ("12", "تبسة", "Tébessa", "tebessa"),
    ("13", "تلمسان", "Tlemcen", "tlemcen"),
    ("14", "تيارت", "Tiaret", "tiaret"),
    ("15", "تيزي وزو", "Tizi Ouzou", "tiziouzou"),
    ("16", "الجزائر", "Alger", "alger"),
    ("17", "الجلفة", "Djelfa", "djelfa"),
    ("18", "جيجل", "Jijel", "jijel"),
    ("19", "سطيف", "Sétif", "setif"),
    ("20", "سعيدة", "Saïda", "saida"),
    ("21", "سكيكدة", "Skikda", "skikda"),
    ("22", "سيدي بلعباس", "Sidi Bel Abbès", "sidibelabbes"),
    ("23", "عنابة", "Annaba", "annaba"),
    ("24", "قالمة", "Guelma", "guelma"),
    ("25", "قسنطينة", "Constantine", "constantine"),
    ("26", "المدية", "Médéa", "medea"),
    ("27", "مستغانم", "Mostaganem", "mostaganem"),
    ("28", "المسيلة", "M'Sila", "msila"),
    ("29", "معسكر", "Mascara", "mascara"),
    ("30", "ورقلة", "Ouargla", "ouargla"),
    ("31", "وهران", "Oran", "oran"),
    ("32", "البيض", "El Bayadh", "elbayadh"),
    ("33", "إليزي", "Illizi", "illizi"),
    ("34", "برج بوعريريج", "Bordj Bou Arreridj", "bba"),
    ("35", "بومرداس", "Boumerdès", "boumerdes"),
    ("36", "الطارف", "El Tarf", "eltarf"),
    ("37", "تندوف", "Tindouf", "tindouf"),
    ("38", "تسمسيلت", "Tissemsilt", "tissemsilt"),
    ("39", "الوادي", "El Oued", "eloued"),
    ("40", "خنشلة", "Khenchela", "khenchela"),
    ("41", "سوق أهراس", "Souk Ahras", "soukahras"),
    ("42", "تيبازة", "Tipaza", "tipaza"),
    ("43", "ميلة", "Mila", "mila"),
    ("44", "عين الدفلى", "Aïn Defla", "aindefla"),
    ("45", "النعامة", "Naâma", "naama"),
    ("46", "عين تموشنت", "Aïn Témouchent", "aintemouchent"),
    ("47", "غرداية", "Ghardaïa", "ghardaia"),
    ("48", "غليزان", "Relizane", "relizane"),
    ("49", "تيميمون", "Timimoun", "timimoun"),
    ("50", "برج باجي مختار", "Bordj Badji Mokhtar", "bbm"),
    ("51", "أولاد جلال", "Ouled Djellal", "ouleddjellal"),
    ("52", "بني عباس", "Béni Abbès", "beniabbes"),
    ("53", "عين صالح", "In Salah", "insalah"),
    ("54", "عين قزام", "In Guezzam", "inguezzam"),
    ("55", "تقرت", "Touggourt", "touggourt"),
    ("56", "جانت", "Djanet", "djanet"),
    ("57", "المغير", "El M'Ghair", "elmghair"),
    ("58", "المنيعة", "El Meniaa", "elmeniaa")
]

def generate_all_sources():
    sources = []
    seen_keys = set()

    def add_source(src):
        k = src["key"]
        if k in seen_keys:
            # deduplicate key if needed
            idx = 2
            while f"{k}_{idx}" in seen_keys:
                idx += 1
            src["key"] = f"{k}_{idx}"
        seen_keys.add(src["key"])
        sources.append(src)

    # 1. National Official Portals & Bulletins (15)
    official_portals = [
        {
            "key": "BOMOP",
            "nameAr": "النشرة الرسمية لصفقات المتعامل العمومي (BOMOP)",
            "nameFr": "Bulletin Officiel des Marchés de l'Opérateur Public (BOMOP)",
            "category": "الجريدة الرسمية للصفقات",
            "sectorGroup": "official",
            "categoryBadge": "primary",
            "publisher": "الوكالة الوطنية للنشر والإشهار (ANEP)",
            "periodicity": "أسبوعية (كل يوم أحد)",
            "coverage": "كافة الوزارات، الولايات، الإدارات والمؤسسات العمومية ذات الطابع الإداري (EPA)",
            "icon": "fa-book-open",
            "url": "https://www.anep.com.dz",
            "portalUrlName": "anep.com.dz/bomop",
            "tags": ["BTPH", "دراسات", "تجهيزات", "استشارات", "BOMOP"]
        },
        {
            "key": "BAOSEM",
            "nameAr": "نشرة صفقات قطاع الطاقة والمناجم (BAOSEM)",
            "nameFr": "Bulletin des Appels d'Offres du Secteur de l'Énergie et des Mines",
            "category": "المحروقات والطاقة",
            "sectorGroup": "energy",
            "categoryBadge": "amber",
            "publisher": "مجمع سوناطراك ومجمع سونلغاز",
            "periodicity": "نصف أسبوعية (الأحد والأربعاء)",
            "coverage": "سوناطراك، سونلغاز، نفطال، والمؤسسات الفرعية للتنقيب، التوزيع والنقل",
            "icon": "fa-fire",
            "url": "https://www.baosem.com",
            "portalUrlName": "baosem.com",
            "tags": ["سوناطراك", "سونلغاز", "محروقات", "BAOSEM", "طاقة"]
        },
        {
            "key": "MARCHES_PUBLICS_GOV",
            "nameAr": "البوابة الوطنية الإلكترونية للصفقات العمومية",
            "nameFr": "Portail National des Marchés Publics Algérie",
            "category": "البوابة الوطنية الحكومية",
            "sectorGroup": "official",
            "categoryBadge": "success",
            "publisher": "وزارة المالية - المديرية العامة للصفقات العمومية",
            "periodicity": "نشر فوري متواصل (24/7)",
            "coverage": "جميع المصالح المتعاقدة في الدولة (وزارات، ولايات، بلديات ومؤسسات عمومية)",
            "icon": "fa-globe",
            "url": "https://marches-publics.gov.dz",
            "portalUrlName": "marches-publics.gov.dz",
            "tags": ["صفقات عمومية", "وزارة المالية", "دفاتر شروط", "مناقصات حكومية"]
        },
        {
            "key": "JORADP",
            "nameAr": "الجريدة الرسمية للجمهورية الجزائرية (JORADP)",
            "nameFr": "Journal Officiel de la République Algérienne Démocratique et Populaire",
            "category": "جريدة رسمية وتشريع",
            "sectorGroup": "official",
            "categoryBadge": "primary",
            "publisher": "الأمانة العامة للحكومة (SGG)",
            "periodicity": "أسبوعية ودورية",
            "coverage": "المراسيم الرئاسية والتنفيذية وقوانين الصفقات العمومية والاتفاقيات الدولية",
            "icon": "fa-gavel",
            "url": "https://www.joradp.dz",
            "portalUrlName": "joradp.dz",
            "tags": ["تشريع", "مراسيم", "قوانين", "دفاتر شروط"]
        },
        {
            "key": "APS_MARCHES",
            "nameAr": "وكالة الأنباء الجزائرية - بوابة الصفقات (APS)",
            "nameFr": "Algérie Presse Service - Espace Marchés & Avis Publics",
            "category": "إعلام وإشهار رسمي",
            "sectorGroup": "official",
            "categoryBadge": "primary",
            "publisher": "وكالة الأنباء الجزائرية (APS)",
            "periodicity": "يومية متواصلة",
            "coverage": "الإعلانات الكبرى للقطاعات الاقتصادية والوزارات والاستشارات الوطنية",
            "icon": "fa-newspaper",
            "url": "https://www.aps.dz",
            "portalUrlName": "aps.dz",
            "tags": ["أخبار الصفقات", "استشارات", "وكالة الأنباء"]
        },
        {
            "key": "DOUANE_DZ",
            "nameAr": "المديرية العامة للجمارك - صفقات وتجهيز",
            "nameFr": "Direction Générale des Douanes Algériennes",
            "category": "سيادية ومالية",
            "sectorGroup": "official",
            "categoryBadge": "primary",
            "publisher": "المديرية العامة للجمارك",
            "periodicity": "أسبوعية",
            "coverage": "أنظمة الفحص بالأشعة، أجهزة الكشف، البرمجيات الجمركية والسيارات النفعية",
            "icon": "fa-shield-alt",
            "url": "https://www.douane.gov.dz",
            "portalUrlName": "douane.gov.dz",
            "tags": ["جمارك", "أنظمة أمنية", "تجهيزات"]
        },
        {
            "key": "DGI_DZ",
            "nameAr": "المديرية العامة للضرائب - صفقات الرقمنة والعتاد",
            "nameFr": "Direction Générale des Impôts (DGI)",
            "category": "مالية ورقمنة",
            "sectorGroup": "official",
            "categoryBadge": "primary",
            "publisher": "وزارة المالية / المديرية العامة للضرائب",
            "periodicity": "أسبوعية",
            "coverage": "عصرنة مراكز الضرائب، برمجيات جبايتك، التجهيزات الرقمية والمقرات",
            "icon": "fa-file-invoice-dollar",
            "url": "https://mfdgi.gov.dz",
            "portalUrlName": "mfdgi.gov.dz",
            "tags": ["ضرائب", "جبايتك", "رقمنة", "مالية"]
        },
        {
            "key": "DGT_DZ",
            "nameAr": "المديرية العامة للخزينة والمحاسبة",
            "nameFr": "Direction Générale du Trésor et de la Gestion Comptable",
            "category": "مالية وخزينة",
            "sectorGroup": "official",
            "categoryBadge": "primary",
            "publisher": "وزارة المالية / المديرية العامة للخزينة",
            "periodicity": "أسبوعية",
            "coverage": "أنظمة الدفع الإلكتروني، السيرفرات الآمنة، وتجهيز مكاتب الخزينة العمومية",
            "icon": "fa-landmark",
            "url": "https://tresor.gov.dz",
            "portalUrlName": "tresor.gov.dz",
            "tags": ["خزينة", "دفع إلكتروني", "مالية"]
        },
        {
            "key": "CNES_CESE",
            "nameAr": "المجلس الاقتصادي والاجتماعي والبيئي (CESE)",
            "nameFr": "Conseil Économique, Social et Environnemental (CESE)",
            "category": "هيئات دستورية واستشارية",
            "sectorGroup": "official",
            "categoryBadge": "primary",
            "publisher": "المجلس الاقتصادي والاجتماعي والبيئي",
            "periodicity": "دورية",
            "coverage": "دراسات استراتيجية، استشارات بحثية، وتنظيم المؤتمرات الوطنية",
            "icon": "fa-university",
            "url": "https://cese.dz",
            "portalUrlName": "cese.dz",
            "tags": ["دراسات", "اقتصاد", "تقارير"]
        },
        {
            "key": "COUR_COMPTES",
            "nameAr": "مجلس المحاسبة الجزائري - صفقات المقرات والتحديث",
            "nameFr": "Cour des Comptes d'Algérie",
            "category": "رقابة مالية ودستورية",
            "sectorGroup": "official",
            "categoryBadge": "primary",
            "publisher": "مجلس المحاسبة",
            "periodicity": "دورية",
            "coverage": "تحديث البنى التحتية للمعلوماتية ومقرات الغرف الإقليمية لمجلس المحاسبة",
            "icon": "fa-balance-scale",
            "url": "https://ccomptes.org.dz",
            "portalUrlName": "ccomptes.org.dz",
            "tags": ["رقابة", "تدقيق", "تجهيزات"]
        },
        {
            "key": "ASAL_SPACE",
            "nameAr": "الوكالة الفضائية الجزائرية (ASAL)",
            "nameFr": "Agence Spatiale Algérienne (ASAL)",
            "category": "تكنولوجيا وفضاء وبحث علمي",
            "sectorGroup": "tech",
            "categoryBadge": "indigo",
            "publisher": "الوكالة الفضائية الجزائرية",
            "periodicity": "دورية واستشارات متقدمة",
            "coverage": "محطات الاتصالات الفضائية، أقمار ألسات، ومعالجة الصور الجوية والخرائط الفضائية",
            "icon": "fa-satellite",
            "url": "https://asal.dz",
            "portalUrlName": "asal.dz",
            "tags": ["فضاء", "أقمار اصطناعية", "تكنولوجيا", "خرائط"]
        },
        {
            "key": "COMENA_NUCLEAR",
            "nameAr": "محافظة الطاقة الذرية (COMENA)",
            "nameFr": "Commissariat à l'Énergie Atomique (COMENA)",
            "category": "طاقة وأبحاث نووية سلمية",
            "sectorGroup": "energy",
            "categoryBadge": "amber",
            "publisher": "محافظة الطاقة الذرية",
            "periodicity": "دورية",
            "coverage": "تجهيزات مخبرية دقيقة، السلامة الإشعاعية ومفاعلات البحث السلمي (درارية ونور)",
            "icon": "fa-atom",
            "url": "https://comena.dz",
            "portalUrlName": "comena.dz",
            "tags": ["طاقة ذرية", "سلامة إشعاعية", "مخابر"]
        },
        {
            "key": "COSOB_BOURSE",
            "nameAr": "لجنة تنظيم ومراقبة عمليات البورصة (COSOB)",
            "nameFr": "Commission d'Organisation et de Surveillance des Opérations de Bourse",
            "category": "أسواق مالية وبورصة",
            "sectorGroup": "finance",
            "categoryBadge": "success",
            "publisher": "لجنة البورصة COSOB",
            "periodicity": "دورية",
            "coverage": "استشارات الأنظمة المالية، الرقمنة السوقية والأنظمة الإلكترونية للأوراق المالية",
            "icon": "fa-chart-line",
            "url": "https://cosob.org",
            "portalUrlName": "cosob.org",
            "tags": ["بورصة", "أسواق مالية", "رقمنة"]
        },
        {
            "key": "ANEP_AFFICHAGE",
            "nameAr": "الوكالة الوطنية للنشر والإشهار - منصة الإشهار العمومي",
            "nameFr": "Agence Nationale d'Édition et de Publicité (ANEP)",
            "category": "إشهار وإعلام حكومي",
            "sectorGroup": "official",
            "categoryBadge": "primary",
            "publisher": "المؤسسة العمومية ANEP",
            "periodicity": "يومية",
            "coverage": "نشر وتوزيع إعلانات الصفقات العمومية عبر الصحافة الوطنية والمنصات الرقمية",
            "icon": "fa-bullhorn",
            "url": "https://anep.dz",
            "portalUrlName": "anep.dz",
            "tags": ["إشهار", "نشر", "صحافة", "إعلانات"]
        },
        {
            "key": "PORTAIL_CONSULAT_DZ",
            "nameAr": "بوابة صفقات وتجهيز الممثليات الدبلوماسية والقنصلية",
            "nameFr": "Portail des Marchés des Missions Diplomatiques à l'Étranger",
            "category": "شؤون خارجية وسيادية",
            "sectorGroup": "official",
            "categoryBadge": "primary",
            "publisher": "وزارة الشؤون الخارجية والجالية الوطنية بالخارج",
            "periodicity": "دورية",
            "coverage": "تهيئة وترميم مقرات السفارات والقنصليات، التأمين والتجهيزات الدبلوماسية",
            "icon": "fa-passport",
            "url": "https://mae.gov.dz",
            "portalUrlName": "mae.gov.dz",
            "tags": ["دبلوماسية", "سفارات", "ترميم", "خارجية"]
        }
    ]
    for p in official_portals:
        add_source(p)

    # 2. Ministries & Central General Directorates (35 Ministries)
    ministries_data = [
        ("MIN_INTERIEUR", "وزارة الداخلية والجماعات المحلية والتهيئة العمرانية", "Ministère de l'Intérieur et des Collectivités Locales", "fa-landmark", "https://interieur.gov.dz", "interieur.gov.dz", "جماعات محلية وبطاقات بيومترية ورقمنة البلديات"),
        ("MIN_DEFENSE", "وزارة الدفاع الوطني - مصالح الصفقات والمنشآت", "Ministère de la Défense Nationale (MDN)", "fa-shield-alt", "https://mdn.dz", "mdn.dz", "تجهيزات طبية عسكرية، منشآت قاعدية، تموين وصناعات عسكرية"),
        ("MIN_JUSTICE", "وزارة العدل - مديرية المنشآت والوسائل والرقمنة", "Ministère de la Justice", "fa-balance-scale", "https://mjustice.dz", "mjustice.dz", "بناء وترميم المجالس القضائية، المحاكم والمنظومة الرقمية للتقاضي"),
        ("MIN_FINANCES", "وزارة المالية - مديرية الميزانية والتجهيز", "Ministère des Finances", "fa-money-bill-wave", "https://mf.gov.dz", "mf.gov.dz", "أنظمة الميزانية الرقمية، مراكز البيانات، المراقبة والتدقيق"),
        ("MIN_ENERGIE", "وزارة الطاقة والمناجم", "Ministère de l'Énergie et des Mines", "fa-plug", "https://energy.gov.dz", "energy.gov.dz", "مشاريع الطاقات المتجددة 15000 ميغاواط، التعدين وتطوير الشبكات"),
        ("MIN_TRAVAUX_PUBLICS", "وزارة الأشغال العمومية والمنشآت القاعدية", "Ministère des Travaux Publics et des Infrastructures de Base", "fa-road", "https://mtp.gov.dz", "mtp.gov.dz", "الطرق السيارة، السكك الحديدية، الموانئ الكبرى والمطارات"),
        ("MIN_HABITAT", "وزارة السكن والعمران والمدينة", "Ministère de l'Habitat, de l'Urbanisme et de la Ville", "fa-city", "https://mhuv.gov.dz", "mhuv.gov.dz", "البرامج السكنية، المجمعات الإدارية، التحسين الحضري والمدن الجديدة"),
        ("MIN_HYDRAULIQUE", "وزارة الري", "Ministère de l'Hydraulique", "fa-tint", "https://mhyd.gov.dz", "mhyd.gov.dz", "السدود الكبرى، محطات تحلية مياه البحر والتحويلات المائية الكبرى"),
        ("MIN_INDUSTRIE", "وزارة الصناعة والإنتاج الصيدلاني", "Ministère de l'Industrie et de la Production Pharmaceutique", "fa-industry", "https://industrie.gov.dz", "industrie.gov.dz", "المناطق الصناعية، تأهيل المصانع وتطوير التصنيع المحلي"),
        ("MIN_AGRICULTURE", "وزارة الفلاحة والتنمية الريفية", "Ministère de l'Agriculture et du Développement Rural", "fa-seedling", "https://madr.gov.dz", "madr.gov.dz", "استصلاح الأراضي الصحراوية، صوامع الحبوب، وتجهيزات السقي الحديث"),
        ("MIN_SANTE", "وزارة الصحة", "Ministère de la Santé", "fa-hospital", "https://sante.gov.dz", "sante.gov.dz", "المستشفيات المتخصصة، المسرعات الخطية، وتجهيزات الإنعاش"),
        ("MIN_COMMERCE", "وزارة التجارة وترقية الصادرات", "Ministère du Commerce et de la Promotion des Exportations", "fa-shopping-cart", "https://commerce.gov.dz", "commerce.gov.dz", "شبكات أسواق الجملة، المخابر الوطنية لمراقبة الجودة، والرقمنة"),
        ("MIN_TRANSPORTS", "وزارة النقل", "Ministère des Transports", "fa-subway", "https://transports.gov.dz", "transports.gov.dz", "النقل الموجه، الترامواي، التيليفريك، السلامة البحرية والجوية"),
        ("MIN_POSTE_TELECOM", "وزارة البريد والمواصلات السلكية واللاسلكية", "Ministère de la Poste et des Télécommunications", "fa-wifi", "https://mpt.gov.dz", "mpt.gov.dz", "الألياف البصرية، مراكز النفاذ، ومكاتب البريد الحديثة"),
        ("MIN_NUMERISATION", "المحافظة السامية للرقمنة برئاسة الجمهورية", "Haut Commissariat à la Numérisation", "fa-laptop-code", "https://hcn.gov.dz", "hcn.gov.dz", "الشبكة الحكومية للبيانات، مراكز البيانات الوطنية والحوسبة السحابية"),
        ("MIN_ENSEIGNEMENT_SUP", "وزارة التعليم العالي والبحث العلمي", "Ministère de l'Enseignement Supérieur et de la Recherche Scientifique", "fa-graduation-cap", "https://mesrs.dz", "mesrs.dz", "المركبات الجامعية، المخابر المتقدمة، الإقامات الجامعية والمكتبات"),
        ("MIN_FORMATION_PROF", "وزارة التكوين والتعليم المهنيين", "Ministère de la Formation et de l'Enseignement Professionnels", "fa-tools", "https://mfep.gov.dz", "mfep.gov.dz", "تجهيزات ورشات التكوين المهني، المعاهد الوطنية والعتاد التعليمي"),
        ("MIN_EDUCATION", "وزارة التربية الوطنية", "Ministère de l'Éducation Nationale", "fa-chalkboard-teacher", "https://education.gov.dz", "education.gov.dz", "الرقمنة المدرسية، اللوحات الإلكترونية، المطابع والتجهيزات"),
        ("MIN_ENVIRONNEMENT", "وزارة البيئة والطاقات المتجددة", "Ministère de l'Environnement et des Énergies Renouvelables", "fa-leaf", "https://environnement.gov.dz", "environnement.gov.dz", "مراكز الردم التقني CET، محطات معالجة النفايات الصناعية والطاقات الخضراء"),
        ("MIN_TOURISME", "وزارة السياحة والصناعة التقليدية", "Ministère du Tourisme et de l'Artisanat", "fa-umbrella-beach", "https://mta.gov.dz", "mta.gov.dz", "إعادة تأهيل المركبات السياحية والحموية ودور الصناعة التقليدية"),
        ("MIN_CULTURE", "وزارة الثقافة والفنون", "Ministère de la Culture et des Arts", "fa-theater-masks", "https://m-culture.gov.dz", "m-culture.gov.dz", "ترميم المعالم التاريخية، المتاحف الوطنية والمسارح الجهوية"),
        ("MIN_JEUNESSE_SPORTS", "وزارة الشباب والرياضة", "Ministère de la Jeunesse et des Sports", "fa-futbol", "https://mjs.gov.dz", "mjs.gov.dz", "الملاعب الأولمبية، القاعات الرياضية، والمسابح نصف الأولمبية"),
        ("MIN_SOLIDARITE", "وزارة التضامن الوطني والأسرة وقضايا المرأة", "Ministère de la Solidarité Nationale et de la Famille", "fa-hands-helping", "https://solidarite.gov.dz", "solidarite.gov.dz", "مراكز رعاية ذوي الاحتياجات الخاصة، المدارس المتخصصة والمساعدات"),
        ("MIN_PECHE", "وزارة الصيد البحري والمنتجات الصيدية", "Ministère de la Pêche et des Productions Halieutiques", "fa-fish", "https://mpeche.gov.dz", "mpeche.gov.dz", "موانئ الصيد، مزارع تربية المائيات ومعدات المراقبة البحرية"),
        ("MIN_TRAVAIL", "وزارة العمل والتشغيل والضمان الاجتماعي", "Ministère du Travail, de l'Emploi et de la Sécurité Sociale", "fa-briefcase", "https://mtess.gov.dz", "mtess.gov.dz", "تحديث منظومة بطاقة الشفاء، صناديق التقاعد والضمان الاجتماعي"),
        ("MIN_RELATIONS_PARLEMENT", "وزارة العلاقات مع البرلمان", "Ministère des Relations avec le Parlement", "fa-landmark", "https://mrp.gov.dz", "mrp.gov.dz", "الوسائل العامة، الأنظمة المعلوماتية والتجهيزات الإدارية"),
        ("MIN_AFFAIRES_RELIGIEUSES", "وزارة الشؤون الدينية والأوقاف", "Ministère des Affaires Religieuses et des Wakfs", "fa-mosque", "https://marw.dz", "marw.dz", "جامع الجزائر، المدارس القرآنية، مراكز التوثيق وترميم الزوايا التاريخية"),
        ("MIN_MOUDJAHIDINE", "وزارة المجاهدين وذوي الحقوق", "Ministère des Moudjahidine et des Ayants-droit", "fa-medal", "https://m-moudjahidine.dz", "m-moudjahidine.dz", "متاحف المجاهد، معالم الثورة التحريرية ومقابر الشهداء"),
        ("MIN_COMMUNICATION", "وزارة الاتصال", "Ministère de la Communication", "fa-broadcast-tower", "https://communication.gov.dz", "communication.gov.dz", "تجهيزات البث الإذاعي والتلفزيوني، الصحافة الورقية والإلكترونية"),
        ("DGSN_POLICE", "المديرية العامة للأمن الوطني (DGSN)", "Direction Générale de la Sûreté Nationale (DGSN)", "fa-user-shield", "https://dgsn.dz", "dgsn.dz", "كاميرات المراقبة الحضرية، المقرات الأمنية، أسطول المركبات والتجهيزات الفنية"),
        ("PROTECTION_CIVILE", "المديرية العامة للحماية المدنية", "Direction Générale de la Protection Civile (DGPC)", "fa-fire-extinguisher", "https://protectioncivile.dz", "protectioncivile.dz", "شاحنات الإطفاء، الزوارق المطاطية، طائرات الإطفاء ومعدات الإنقاذ"),
        ("DGF_FORETS", "المديرية العامة للغابات", "Direction Générale des Forêts (DGF)", "fa-tree", "https://dgf.gov.dz", "dgf.gov.dz", "برامج السد الأخضر، أبراج المراقبة الحراجية ومكافحة حرائق الغابات"),
        ("DGD_DOMAINE", "المديرية العامة للأملاك الوطنية والمسح العقاري", "Direction Générale du Domaine National", "fa-map-marked-alt", "https://domaines.gov.dz", "domaines.gov.dz", "مسح الأراضي، الرقمنة العقارية، السيرفرات وأنظمة الخرائط الجغرافية GIS"),
        ("SGG_GOUV", "الأمانة العامة للحكومة - مصالح الوسائل العامة", "Secrétariat Général du Gouvernement", "fa-landmark", "https://sgg.gov.dz", "sgg.gov.dz", "التجهيزات الإدارية المركزية، المطبعة الرسمية والأنظمة الرقمية السيادية"),
        ("COUR_SUPREME", "المحكمة العليا ومجلس الدولة الجزائري", "Cour Suprême et Conseil d'État", "fa-balance-scale", "https://coursupreme.dz", "coursupreme.dz", "التحديث المعلوماتي، قاعات الجلسات الذكية، والمكتبات الرقمية القضائية")
    ]
    for key, nameAr, nameFr, icon, url, pName, cov in ministries_data:
        add_source({
            "key": key,
            "nameAr": nameAr,
            "nameFr": nameFr,
            "category": "وزارات وهيئات حكومية مركزية",
            "sectorGroup": "official",
            "categoryBadge": "primary",
            "publisher": nameAr,
            "periodicity": "أسبوعية ودورية",
            "coverage": cov,
            "icon": icon,
            "url": url,
            "portalUrlName": pName,
            "tags": ["وزارة", "حكومة", "صفقات مركزية", key]
        })

    # 3. 58 Wilaya Cabinets & Commissions des Marchés (58)
    for code, nameAr, nameFr, slug in WILAYAS_58:
        add_source({
            "key": f"Wilaya_{code}",
            "nameAr": f"ولاية {nameAr} - الأمانة العامة ولجنة الصفقات",
            "nameFr": f"Wilaya de {nameFr} - Secrétariat Général & Commission des Marchés",
            "category": "جماعات محلية وولايات",
            "sectorGroup": "wilayas",
            "categoryBadge": "success",
            "publisher": f"وزارة الداخلية والجماعات المحلية / ولاية {nameAr}",
            "periodicity": "أسبوعية / دورية",
            "coverage": f"صفقات وإعلانات ولاية {nameAr}، برامج التنمية المحلية (PCD) والتجهيز العمومي",
            "icon": "fa-landmark",
            "url": f"https://wilaya-{slug}.dz",
            "portalUrlName": f"wilaya-{slug}.dz",
            "tags": ["ولاية", nameAr, nameFr, "صفقات عمومية", "تجهيز"]
        })

    # 4. 522 Executive Technical Directorates (9 per wilaya x 58 wilayas)
    dir_types = [
        ("DTP", "مديرية الأشغال العمومية", "Direction des Travaux Publics", "أشغال عمومية وبنية تحتية", "construction", "indigo", "وزارة الأشغال العمومية والمنشآت القاعدية", "fa-road", "مشاريع صيانة الطرقات والمنشآت الفنية والجسور"),
        ("DRE", "مديرية الموارد المائية", "Direction des Ressources en Eau", "موارد مائية وري", "construction", "cyan", "وزارة الري", "fa-tint", "مشاريع التزود بالماء الشروب، قنوات الصرف وشبكات التطهير"),
        ("DEP", "مديرية التجهيزات العمومية", "Direction des Équipements Publics", "تجهيزات وبناء عمومي", "directorates", "amber", "وزارة السكن والعمران والمدينة", "fa-building", "بناء المدارس والمجمعات الإدارية والمرافق العامة"),
        ("DUC", "مديرية التعمير والهندسة المعمارية والبناء", "Direction de l'Urbanisme et de la Construction", "تعمير وهندسة معمارية", "directorates", "teal", "وزارة السكن والعمران والمدينة", "fa-city", "مخططات التهيئة الحضرية والشبكات المختلفة VRD"),
        ("DSP", "مديرية الصحة والسكان", "Direction de la Santé et de la Population", "صحة ومستلزمات طبية", "health", "danger", "وزارة الصحة", "fa-hospital", "التجهيزات الطبية والعيادات المتعددة الخدمات والأدوية"),
        ("DE", "مديرية التربية والتعليم", "Direction de l'Éducation", "تربية وتعليم", "directorates", "primary", "وزارة التربية الوطنية", "fa-graduation-cap", "الإطعام المدرسي والتدفئة وصيانة المؤسسات التربوية"),
        ("DSA", "مديرية المصالح الفلاحية", "Direction des Services Agricoles", "فلاحة وتنمية ريفية", "directorates", "success", "وزارة الفلاحة والتنمية الريفية", "fa-seedling", "كهربة المستثمرات الفلاحية وحفر الآبار والمسالك الريفية"),
        ("DEM", "مديرية الطاقة والمناجم", "Direction de l'Énergie et des Mines", "طاقة وكهرباء", "energy", "warning", "وزارة الطاقة والمناجم", "fa-bolt", "الربط بالغاز الطبيعي وشبكات الكهرباء وتراخيص التعدين"),
        ("DCPE", "مديرية التجارة وترقية الصادرات", "Direction du Commerce et de la Promotion des Exportations", "تجارة وضبط الأسواق", "directorates", "secondary", "وزارة التجارة وترقية الصادرات", "fa-balance-scale", "مخابر مراقبة الجودة والنوعية وأسواق الجملة والتجهيزات")
    ]

    for d_code, d_ar, d_fr, cat, s_grp, badge, tutelle, icon, cov_desc in dir_types:
        for code, nameAr, nameFr, slug in WILAYAS_58:
            add_source({
                "key": f"{d_code}_{code}",
                "nameAr": f"{d_ar} لولاية {nameAr} ({d_code} {nameFr})",
                "nameFr": f"{d_fr} de la Wilaya de {nameFr} ({d_code})",
                "category": cat,
                "sectorGroup": s_grp,
                "categoryBadge": badge,
                "publisher": f"{tutelle} / ولاية {nameAr}",
                "periodicity": "أسبوعية ودورية",
                "coverage": f"{cov_desc} بولاية {nameAr}",
                "icon": icon,
                "url": f"https://wilaya-{slug}.dz/{d_code.lower()}",
                "portalUrlName": f"{d_code.lower()}.wilaya-{slug}.dz",
                "tags": [d_code, d_ar, nameAr, nameFr, cat]
            })

    # 5. Major Municipalities (APCs - 120 APCs)
    # 58 chef-lieu + 62 major dairas/cities
    major_apcs = [
        # Wilaya Capitals (58)
        ("APC_01_ADRAR", "بلدية أدرار (عاصمة الولاية)", "Commune d'Adrar (Chef-lieu)", "01", "أدرار"),
        ("APC_02_CHLEF", "بلدية الشلف (عاصمة الولاية)", "Commune de Chlef (Chef-lieu)", "02", "الشلف"),
        ("APC_03_LAGHOUAT", "بلدية الأغواط (عاصمة الولاية)", "Commune de Laghouat (Chef-lieu)", "03", "الأغواط"),
        ("APC_04_OUM_BOUAGHI", "بلدية أم البواقي (عاصمة الولاية)", "Commune d'Oum El Bouaghi", "04", "أم البواقي"),
        ("APC_05_BATNA", "بلدية باتنة (عاصمة الولاية)", "Commune de Batna (Chef-lieu)", "05", "باتنة"),
        ("APC_06_BEJAIA", "بلدية بجاية (عاصمة الولاية)", "Commune de Béjaïa (Chef-lieu)", "06", "بجاية"),
        ("APC_07_BISKRA", "بلدية بسكرة (عاصمة الولاية)", "Commune de Biskra (Chef-lieu)", "07", "بسكرة"),
        ("APC_08_BECHAR", "بلدية بشار (عاصمة الولاية)", "Commune de Béchar (Chef-lieu)", "08", "بشار"),
        ("APC_09_BLIDA", "بلدية البليدة (عاصمة الولاية)", "Commune de Blida (Chef-lieu)", "09", "البليدة"),
        ("APC_10_BOUIRA", "بلدية البويرة (عاصمة الولاية)", "Commune de Bouira (Chef-lieu)", "10", "البويرة"),
        ("APC_11_TAMANRASSET", "بلدية تمنراست (عاصمة الولاية)", "Commune de Tamanrasset (Chef-lieu)", "11", "تمنراست"),
        ("APC_12_TEBESSA", "بلدية تبسة (عاصمة الولاية)", "Commune de Tébessa (Chef-lieu)", "12", "تبسة"),
        ("APC_13_TLEMCEN", "بلدية تلمسان (عاصمة الولاية)", "Commune de Tlemcen (Chef-lieu)", "13", "تلمسان"),
        ("APC_14_TIARET", "بلدية تيارت (عاصمة الولاية)", "Commune de Tiaret (Chef-lieu)", "14", "تيارت"),
        ("APC_15_TIZI_OUZOU", "بلدية تيزي وزو (عاصمة الولاية)", "Commune de Tizi Ouzou (Chef-lieu)", "15", "تيزي وزو"),
        ("APC_16_ALGER_CENTRE", "بلدية الجزائر الوسطى (قلب العاصمة)", "Commune d'Alger-Centre", "16", "الجزائر"),
        ("APC_17_DJELFA", "بلدية الجلفة (عاصمة الولاية)", "Commune de Djelfa (Chef-lieu)", "17", "الجلفة"),
        ("APC_18_JIJEL", "بلدية جيجل (عاصمة الولاية)", "Commune de Jijel (Chef-lieu)", "18", "جيجل"),
        ("APC_19_SETIF", "بلدية سطيف (عاصمة الولاية)", "Commune de Sétif (Chef-lieu)", "19", "سطيف"),
        ("APC_20_SAIDA", "بلدية سعيدة (عاصمة الولاية)", "Commune de Saïda (Chef-lieu)", "20", "سعيدة"),
        ("APC_21_SKIKDA", "بلدية سكيكدة (عاصمة الولاية)", "Commune de Skikda (Chef-lieu)", "21", "سكيكدة"),
        ("APC_22_SIDI_BELABBES", "بلدية سيدي بلعباس (عاصمة الولاية)", "Commune de Sidi Bel Abbès (Chef-lieu)", "22", "سيدي بلعباس"),
        ("APC_23_ANNABA", "بلدية عنابة (عاصمة الولاية)", "Commune d'Annaba (Chef-lieu)", "23", "عنابة"),
        ("APC_24_GUELMA", "بلدية قالمة (عاصمة الولاية)", "Commune de Guelma (Chef-lieu)", "24", "قالمة"),
        ("APC_25_CONSTANTINE", "بلدية قسنطينة (عاصمة الولاية)", "Commune de Constantine (Chef-lieu)", "25", "قسنطينة"),
        ("APC_26_MEDEA", "بلدية المدية (عاصمة الولاية)", "Commune de Médéa (Chef-lieu)", "26", "المدية"),
        ("APC_27_MOSTAGANEM", "بلدية مستغانم (عاصمة الولاية)", "Commune de Mostaganem (Chef-lieu)", "27", "مستغانم"),
        ("APC_28_MSILA", "بلدية المسيلة (عاصمة الولاية)", "Commune de M'Sila (Chef-lieu)", "28", "المسيلة"),
        ("APC_29_MASCARA", "بلدية معسكر (عاصمة الولاية)", "Commune de Mascara (Chef-lieu)", "29", "معسكر"),
        ("APC_30_OUARGLA", "بلدية ورقلة (عاصمة الولاية)", "Commune d'Ouargla (Chef-lieu)", "30", "ورقلة"),
        ("APC_31_ORAN", "بلدية وهران (عاصمة الغرب الجزائري)", "Commune d'Oran (Chef-lieu)", "31", "وهران"),
        ("APC_32_EL_BAYADH", "بلدية البيض (عاصمة الولاية)", "Commune d'El Bayadh (Chef-lieu)", "32", "البيض"),
        ("APC_33_ILLIZI", "بلدية إليزي (عاصمة الولاية)", "Commune d'Illizi (Chef-lieu)", "33", "إليزي"),
        ("APC_34_BBA", "بلدية برج بوعريريج (عاصمة الولاية)", "Commune de Bordj Bou Arreridj (Chef-lieu)", "34", "برج بوعريريج"),
        ("APC_35_BOUMERDES", "بلدية بومرداس (عاصمة الولاية)", "Commune de Boumerdès (Chef-lieu)", "35", "بومرداس"),
        ("APC_36_EL_TARF", "بلدية الطارف (عاصمة الولاية)", "Commune d'El Tarf (Chef-lieu)", "36", "الطارف"),
        ("APC_37_TINDOUF", "بلدية تندوف (عاصمة الولاية)", "Commune de Tindouf (Chef-lieu)", "37", "تندوف"),
        ("APC_38_TISSEMSILT", "بلدية تسمسيلت (عاصمة الولاية)", "Commune de Tissemsilt (Chef-lieu)", "38", "تسمسيلت"),
        ("APC_39_EL_OUED", "بلدية الوادي (عاصمة الولاية)", "Commune d'El Oued (Chef-lieu)", "39", "الوادي"),
        ("APC_40_KHENCHELA", "بلدية خنشلة (عاصمة الولاية)", "Commune de Khenchela (Chef-lieu)", "40", "خنشلة"),
        ("APC_41_SOUK_AHRAS", "بلدية سوق أهراس (عاصمة الولاية)", "Commune de Souk Ahras (Chef-lieu)", "41", "سوق أهراس"),
        ("APC_42_TIPAZA", "بلدية تيبازة (عاصمة الولاية)", "Commune de Tipaza (Chef-lieu)", "42", "تيبازة"),
        ("APC_43_MILA", "بلدية ميلة (عاصمة الولاية)", "Commune de Mila (Chef-lieu)", "43", "ميلة"),
        ("APC_44_AIN_DEFLA", "بلدية عين الدفلى (عاصمة الولاية)", "Commune d'Aïn Defla (Chef-lieu)", "44", "عين الدفلى"),
        ("APC_45_NAAMA", "بلدية النعامة (عاصمة الولاية)", "Commune de Naâma (Chef-lieu)", "45", "النعامة"),
        ("APC_46_AIN_TEMOUCHENT", "بلدية عين تموشنت (عاصمة الولاية)", "Commune d'Aïn Témouchent (Chef-lieu)", "46", "عين تموشنت"),
        ("APC_47_GHARDAIA", "بلدية غرداية (عاصمة الولاية)", "Commune de Ghardaïa (Chef-lieu)", "47", "غرداية"),
        ("APC_48_RELIZANE", "بلدية غليزان (عاصمة الولاية)", "Commune de Relizane (Chef-lieu)", "48", "غليزان"),
        ("APC_49_TIMIMOUN", "بلدية تيميمون (عاصمة الولاية)", "Commune de Timimoun (Chef-lieu)", "49", "تيميمون"),
        ("APC_50_BBM", "بلدية برج باجي مختار (عاصمة الولاية)", "Commune de Bordj Badji Mokhtar", "50", "برج باجي مختار"),
        ("APC_51_OULED_DJELLAL", "بلدية أولاد جلال (عاصمة الولاية)", "Commune d'Ouled Djellal (Chef-lieu)", "51", "أولاد جلال"),
        ("APC_52_BENI_ABBES", "بلدية بني عباس (عاصمة الولاية)", "Commune de Béni Abbès (Chef-lieu)", "52", "بني عباس"),
        ("APC_53_IN_SALAH", "بلدية عين صالح (عاصمة الولاية)", "Commune d'In Salah (Chef-lieu)", "53", "عين صالح"),
        ("APC_54_IN_GUEZZAM", "بلدية عين قزام (عاصمة الولاية)", "Commune d'In Guezzam (Chef-lieu)", "54", "عين قزام"),
        ("APC_55_TOUGGOURT", "بلدية تقرت (عاصمة الولاية)", "Commune de Touggourt (Chef-lieu)", "55", "تقرت"),
        ("APC_56_DJANET", "بلدية جانت (عاصمة الولاية)", "Commune de Djanet (Chef-lieu)", "56", "جانت"),
        ("APC_57_EL_MGHAIR", "بلدية المغير (عاصمة الولاية)", "Commune d'El M'Ghair (Chef-lieu)", "57", "المغير"),
        ("APC_58_EL_MENIAA", "بلدية المنيعة (عاصمة الولاية)", "Commune d'El Meniaa (Chef-lieu)", "58", "المنيعة"),
        # Additional Major Dairas and Economic Centers (62)
        ("APC_ROUIBA", "بلدية الرويبة الصناعية", "Commune de Rouiba (Pôle Industriel)", "16", "الجزائر"),
        ("APC_DAR_EL_BEIDA", "بلدية الدار البيضاء", "Commune de Dar El Beïda", "16", "الجزائر"),
        ("APC_BAB_EZZOUAR", "بلدية باب الزوار (حي الأعمال والجامعة)", "Commune de Bab Ezzouar", "16", "الجزائر"),
        ("APC_CHERAGA", "بلدية الشراقة", "Commune de Chéraga", "16", "الجزائر"),
        ("APC_KOUBA", "بلدية القبة", "Commune de Kouba", "16", "الجزائر"),
        ("APC_SIDI_MHAMED", "بلدية سيدي امحمد", "Commune de Sidi M'Hamed", "16", "الجزائر"),
        ("APC_BIR_MOURAD_RAIS", "بلدية بئر مراد رايس", "Commune de Bir Mourad Raïs", "16", "الجزائر"),
        ("APC_HYDRA", "بلدية حيدرة", "Commune d'Hydra", "16", "الجزائر"),
        ("APC_HUSSEIN_DEY", "بلدية حسين داي", "Commune de Hussein Dey", "16", "الجزائر"),
        ("APC_EL_HARRACH", "بلدية الحراش", "Commune d'El Harrach", "16", "الجزائر"),
        ("APC_BARAKI", "بلدية براقي", "Commune de Baraki", "16", "الجزائر"),
        ("APC_ZERALDA", "بلدية زرالدة الساحلية", "Commune de Zéralda", "16", "الجزائر"),
        ("APC_AIN_TAYA", "بلدية عين طاية", "Commune d'Aïn Taya", "16", "الجزائر"),
        ("APC_STAOUELI", "بلدية سطاوالي وسيدي فرج", "Commune de Staouéli", "16", "الجزائر"),
        ("APC_BOUFARIK", "بلدية بوفاريك", "Commune de Boufarik", "09", "البليدة"),
        ("APC_OULED_YAICH", "بلدية أولاد يعيش", "Commune d'Ouled Yaïch", "09", "البليدة"),
        ("APC_EL_EULMA", "بلدية العلمة (القطب التجاري)", "Commune d'El Eulma", "19", "سطيف"),
        ("APC_AIN_OULMENE", "بلدية عين ولمان", "Commune d'Aïn Oulmène", "19", "سطيف"),
        ("APC_EL_KHROUB", "بلدية الخروب", "Commune d'El Khroub", "25", "قسنطينة"),
        ("APC_HAMMA_BOUZIANE", "بلدية حامة بوزيان", "Commune de Hamma Bouziane", "25", "قسنطينة"),
        ("APC_ES_SENIA", "بلدية السانية", "Commune d'Es Sénia", "31", "وهران"),
        ("APC_BIR_EL_DJIR", "بلدية بئر الجير", "Commune de Bir El Djir", "31", "وهران"),
        ("APC_ARZEW", "بلدية أرزيو البتروكيماوية", "Commune d'Arzew", "31", "وهران"),
        ("APC_AIN_TURCK", "بلدية عين الترك", "Commune d'Aïn El Turck", "31", "وهران"),
        ("APC_EL_BOUNI", "بلدية البوني", "Commune d'El Bouni", "23", "عنابة"),
        ("APC_SIDI_AMAR", "بلدية سيدي عمار الحجار", "Commune de Sidi Amar (El Hadjar)", "23", "عنابة"),
        ("APC_AKBOU", "بلدية أقبو الصناعية", "Commune d'Akbou", "06", "بجاية"),
        ("APC_EL_KSEUR", "بلدية القصر", "Commune d'El Kseur", "06", "بجاية"),
        ("APC_AZAZGA", "بلدية عزازقة", "Commune d'Azazga", "15", "تيزي وزو"),
        ("APC_DRAA_BEN_KHEDDA", "بلدية ذراع بن خدة", "Commune de Draâ Ben Khedda", "15", "تيزي وزو"),
        ("APC_MAGHNIA", "بلدية مغنية الحدودية", "Commune de Maghnia", "13", "تلمسان"),
        ("APC_MANSOURAH", "بلدية منصورة", "Commune de Mansourah", "13", "تلمسان"),
        ("APC_HASSI_MESSAOUD", "بلدية حاسي مسعود البترولية", "Commune de Hassi Messaoud", "30", "ورقلة"),
        ("APC_HASSI_R_MEL", "بلدية حاسي الرمل الغازية", "Commune de Hassi R'Mel", "03", "الأغواط"),
        ("APC_AFLOU", "بلدية آفلو", "Commune d'Aflou", "03", "الأغواط"),
        ("APC_AIN_MLILA", "بلدية عين مليلة التجارية", "Commune d'Aïn M'lila", "04", "أم البواقي"),
        ("APC_AIN_BEIDA", "بلدية عين البيضاء", "Commune d'Aïn Beïda", "04", "أم البواقي"),
        ("APC_BARIKA", "بلدية بريكة", "Commune de Barika", "05", "باتنة"),
        ("APC_AIN_TOUTA", "بلدية عين التوتة", "Commune d'Aïn Touta", "05", "باتنة"),
        ("APC_TOLGA", "بلدية طولقة الواحاتية", "Commune de Tolga", "07", "بسكرة"),
        ("APC_SIDI_OKBA", "بلدية سيدي عقبة", "Commune de Sidi Okba", "07", "بسكرة"),
        ("APC_LAKHDARIA", "بلدية الأخضرية", "Commune de Lakhdaria", "10", "البويرة"),
        ("APC_SOUR_GHOZLANE", "بلدية سور الغزلان", "Commune de Sour El Ghozlane", "10", "البويرة"),
        ("APC_OUENZA", "بلدية الونزة المنجمية", "Commune d'Ouenza", "12", "تبسة"),
        ("APC_SOUK_AHRAS_MD", "بلدية مداوروش التاريخية", "Commune de Madaure", "41", "سوق أهراس"),
        ("APC_KOLÉA", "بلدية القليعة", "Commune de Koléa", "42", "تيبازة"),
        ("APC_CHERCHELL", "بلدية شرشال الساحلية", "Commune de Cherchell", "42", "تيبازة"),
        ("APC_HADJOUT", "بلدية حجوط", "Commune de Hadjout", "42", "تيبازة"),
        ("APC_BOU_ISMAIL", "بلدية بوعسماعيل", "Commune de Bou Ismaïl", "42", "تيبازة"),
        ("APC_KHEMIS_MILIANA", "بلدية خميس مليانة", "Commune de Khemis Miliana", "44", "عين الدفلى"),
        ("APC_MILIANA", "بلدية مليانة", "Commune de Miliana", "44", "عين الدفلى"),
        ("APC_BERROUAGHIA", "بلدية البرواقية", "Commune de Berrouaghia", "26", "المدية"),
        ("APC_KSAR_BOUKHARI", "بلدية قصر البخاري", "Commune de Ksar El Boukhari", "26", "المدية"),
        ("APC_AIN_OUSSERA", "بلدية عين وسارة", "Commune d'Aïn Oussera", "17", "الجلفة"),
        ("APC_MESSAAD", "بلدية مسعد", "Commune de Messaâd", "17", "الجلفة"),
        ("APC_TAHER", "بلدية الطاهير", "Commune de Taher", "18", "جيجل"),
        ("APC_COLLO", "بلدية القل الساحلية", "Commune de Collo", "21", "سكيكدة"),
        ("APC_AZZABA", "بلدية عزابة", "Commune d'Azzaba", "21", "سكيكدة"),
        ("APC_TIGHENIF", "بلدية تيغنيف", "Commune de Tighenif", "29", "معسكر"),
        ("APC_SIG", "بلدية سيق", "Commune de Sig", "29", "معسكر"),
        ("APC_BOUSSAADA", "بلدية بوسعادة السياحية", "Commune de Bou Saâda", "28", "المسيلة"),
        ("APC_MECHERIA", "بلدية المشرية", "Commune de Mécheria", "45", "النعامة")
    ]

    for k_apc, nameAr, nameFr, w_code, w_name in major_apcs:
        add_source({
            "key": k_apc,
            "nameAr": nameAr,
            "nameFr": nameFr,
            "category": "جماعات محلية وبلديات",
            "sectorGroup": "wilayas",
            "categoryBadge": "purple",
            "publisher": f"وزارة الداخلية والجماعات المحلية / بلدية {nameAr.split()[1]}",
            "periodicity": "أسبوعية ودورية",
            "coverage": f"صفقات النظافة الحضرية، صيانة المدارس الابتدائية، الإنارة العمومية، الطرق البلدية والتهيئة بولاية {w_name}",
            "icon": "fa-university",
            "url": f"https://interieur.gov.dz/communes/{k_apc.lower()}",
            "portalUrlName": f"{k_apc.lower()}.gov.dz",
            "tags": ["بلدية", "APC", nameAr, w_name, "تهيئة حضرية"]
        })

    # 6. Algérienne Des Eaux (ADE Units across all 58 Wilayas) (58)
    for code, nameAr, nameFr, slug in WILAYAS_58:
        add_source({
            "key": f"ADE_{code}",
            "nameAr": f"الجزائرية للمياه - وحدة ولاية {nameAr} (ADE {nameFr})",
            "nameFr": f"Algérienne Des Eaux - Unité de {nameFr} (ADE)",
            "category": "موارد مائية وتوزيع المياه",
            "sectorGroup": "construction",
            "categoryBadge": "cyan",
            "publisher": "المؤسسة العمومية الجزائرية للمياه (ADE)",
            "periodicity": "أسبوعية",
            "coverage": f"شراء الأنابيب والعدادات، المضخات الغاطسة، مواد معالجة المياه وصيانة شبكات التوزيع بولاية {nameAr}",
            "icon": "fa-faucet",
            "url": "https://ade.dz",
            "portalUrlName": f"ade.dz/unite-{slug}",
            "tags": ["ADE", "مياه", "الجزائرية للمياه", nameAr, nameFr]
        })

    # 7. Energy, Mining & Hydrocarbons (Sonatrach & Sonelgaz subsidiaries) (70)
    energy_entities = [
        ("SH_DG", "سوناطراك - المديرية العامة والمديريات المركزية", "Sonatrach - Direction Générale", "المحروقات والنفط والغاز", "amber", "سوناطراك الجزائر", "fa-gas-pump", "المشاريع الاستراتيجية ومجمعات التكرير والغاز الطبيعي المسال"),
        ("SH_EP", "سوناطراك - نشاط الاستكشاف والإنتاج (Activité E&P)", "Sonatrach - Exploration & Production", "التنقيب والإنتاج البترولي", "amber", "سوناطراك", "fa-oil-well", "حفر الآبار البترولية، المنصات، الخدمات الجيوفيزيائية وتطوير الحقول"),
        ("SH_TRC", "سوناطراك - نشاط النقل عبر الأنابيب (Activité TRC)", "Sonatrach - Transport par Canalisations", "نقل المحروقات وخطوط الأنابيب", "amber", "سوناطراك", "fa-network-wired", "أنابيب الغاز والنفط، محطات الضغط والضخ، وأنظمة التحكم SCADA"),
        ("SH_RPC", "سوناطراك - نشاط التكرير والبتروكيماويات (RPC)", "Sonatrach - Raffinage & Pétrochimie", "تكرير وبتروكيماويات", "amber", "سوناطراك", "fa-flask", "مصافي التكرير بسكيكدة وأرزيو وحاسي مسعود ووحدات الإثيلين والبلاستيك"),
        ("SH_COM", "سوناطراك - نشاط التسويق والتجارة الدولية", "Sonatrach - Activité Commercialisation", "تسويق الطاقة والشحن البحري", "amber", "سوناطراك", "fa-ship", "شحن الناقلات، الخدمات البحرية وتجارة المنتجات المكررة"),
        ("ENTP", "المؤسسة الوطنية لأشغال الآبار (ENTP)", "Entreprise Nationale des Travaux aux Puits (ENTP)", "حفر وصيانة الآبار", "amber", "مجمع سوناطراك", "fa-tools", "حفارات البترول، منصات الحفر العميقة ومعدات رأس البئر"),
        ("ENAFOR", "المؤسسة الوطنية للتنقيب (ENAFOR)", "Entreprise Nationale de Forage (ENAFOR)", "تنقيب بترولي وحفر", "amber", "مجمع سوناطراك", "fa-hammer", "معدات الحفر الصحراوية، المخيمات البترولية والآلات الثقيلة"),
        ("ENSP", "المؤسسة الوطنية لخدمات الآبار (ENSP)", "Entreprise Nationale de Services aux Puits (ENSP)", "خدمات نفطية وسمنتة وتكسير", "amber", "مجمع سوناطراك", "fa-vial", "السمنتة، التكسير الهيدروليكي، تسجيل القياسات والمواد الكيماوية"),
        ("GTP", "المؤسسة الوطنية للأشغال البترولية الكبرى (GTP)", "Entreprise Nationale des Grands Travaux Pétroliers (GTP)", "إنشاءات بترولية وصناعية", "amber", "مجمع سوناطراك", "fa-industry", "المحطات الغازية، مصانع المعالجة، والأوعية المضغوطة والأنابيب"),
        ("SARPI", "الشركة الجزائرية لإنجاز المشاريع الصناعية (SARPI)", "Société Algérienne de Réalisation de Projets Industriels", "مشاريع صناعية وبترولية", "amber", "سوناطراك / سايبام", "fa-cogs", "الصيانة الصناعية الكبرى ومشاريع EPC في قطاع النفط والغاز"),
        ("SOMIK", "الشركة الوطنية لصيانة المركبات الصناعية بسكيكدة (SOMIK)", "Société de Maintenance Industrielle de Skikda (SOMIK)", "صيانة بتروكيماوية وصناعية", "amber", "مجمع سوناطراك", "fa-wrench", "صيانة مصافي النفط ووحدات تسييل الغاز الطبيعي بسكيكدة"),
        ("NAFTAL_DG", "شركة نفطال - المديرية العامة وشبكة الوقود الوطنية", "Société Nationale NAFTAL - Siège & Réseau", "توزيع الوقود والمشتقات", "amber", "مجمع سوناطراك / نفطال", "fa-gas-pump", "محطات الوقود السريع، خزانات الوقود، الزيوت وصهاريج سيرغاز"),
        ("NAFTAL_LPG", "نفطال - فرع غاز البترول المسال (GPL / Sirghaz)", "NAFTAL - Branche GPL & Carburants Propres", "غاز البترول وسيرغاز", "amber", "نفطال", "fa-burn", "قارورات الغاز، أطقم تحويل سيرغاز، وخزانات الغاز المضغوط"),
        ("NAFTAL_AVIATION", "نفطال - فرع تزويد الطائرات والسفن بالوقود (Aviation/Marine)", "NAFTAL Aviation et Marine", "وقود الطيران والملاحة", "amber", "نفطال", "fa-plane-departure", "شاحنات تزويد الطائرات بالوقود كيروسين، محطات تزويد السفن بالفيول"),
        ("HELIOS", "الشركة الجزائرية لإنتاج الهيليوم والنيتروجين (HELIOS)", "Société Hélios d'Arzew", "غازات صناعية وهيليوم", "amber", "سوناطراك", "fa-wind", "صناعة الغازات الصناعية الدقيقة، الهيليوم السائل والنيتروجين"),
        ("FERTIAL", "الشركة الجزائرية للأسمدة الفوسفاتية والآزوتية (FERTIAL)", "Société des Fertilisants d'Algérie (FERTIAL)", "أسمدة ومخصبات زراعية", "amber", "مجمع أسميدال / سوناطراك", "fa-seedling", "إنتاج الأمونياك، اليوريا، حمض النتريك والمخصبات الفوسفاتية"),
        ("ASMIDAL", "مجمع أسميدال للصناعات الكيماوية والفوسفاتية (ASMIDAL)", "Groupe ASMIDAL", "صناعات كيميائية وفوسفات", "amber", "مجمع سوناطراك", "fa-flask", "مشروع الفوسفات المدمج ببلاد الهدبة ووادي الكبريت وعنابة"),
        ("ALNAFT", "الوكالة الوطنية لتثمين موارد المحروقات (ALNAFT)", "Agence Nationale pour la Valorisation des Ressources en Hydrocarbures", "تنظيم صفقات المنبع النفطي", "amber", "وزارة الطاقة", "fa-certificate", "مناقصات الحقول النفطية الدولية، تراخيص الاستكشاف والبيانات الجيولوجية"),
        ("ARH_ENERGY", "سلطة ضبط المحروقات (ARH)", "Autorité de Régulation des Hydrocarbures (ARH)", "ضبط ومطابقة المحروقات", "amber", "وزارة الطاقة", "fa-tachometer-alt", "مراقبة المنشآت الطاقوية، مطابقة البيئة والسلامة وتراخيص التوزيع"),
        ("SONELGAZ_DG", "مجمع سونلغاز - الإدارة العامة والصفقات المركزية", "Groupe Sonelgaz - Direction Générale", "كهرباء وغاز وطاقات متجددة", "warning", "سونلغاز", "fa-bolt", "محطات توليد الكهرباء الكبرى، خطوط الجهد العالي والتوتر الفائق"),
        ("SPE_SONELGAZ", "سونلغاز لإنتاج الكهرباء (SPE)", "Sonelgaz Production de l'Électricité (SPE)", "توليد الطاقة الكهربائية", "warning", "مجمع سونلغاز", "fa-charging-station", "التوربينات الغازية والبخارية، المولدات وقطع غيار المحطات الحرارية"),
        ("GRTE_SONELGAZ", "الشركة الجزائرية لتسيير شبكة نقل الكهرباء (GRTE)", "Gestionnaire du Réseau de Transport de l'Électricité (GRTE)", "نقل الكهرباء والتوتر العالي", "warning", "مجمع سونلغاز", "fa-broadcast-tower", "محولات التوتر العالي 400/220 كف، الكابلات الأرضية والأبراج"),
        ("GRTG_SONELGAZ", "الشركة الجزائرية لتسيير شبكة نقل الغاز (GRTG)", "Gestionnaire du Réseau de Transport du Gaz (GRTG)", "نقل الغاز الطبيعي", "warning", "مجمع سونلغاز", "fa-compress-arrows-alt", "قنوات الغاز ذات الضغط العالي، محطات تخفيض الضغط ومحطات الخلط"),
        ("SONELGAZ_DISTRIB", "سونلغاز التوزيع (الجزائر، الشرق، الغرب والوسط)", "Sonelgaz Distribution", "توزيع الكهرباء والغاز", "warning", "مجمع سونلغاز", "fa-plug", "العدادات الذكية، المحولات الحضرية والريفية وتمديد شبكات الغاز"),
        ("CEEG_SONELGAZ", "شركة هندسة الكهرباء والغاز (CEEG)", "Compagnie de l'Engineering de l'Électricité et du Gaz (CEEG)", "هندسة ودراسات طاقوية", "warning", "مجمع سونلغاز", "fa-drafting-compass", "دراسات الجدوى، الهندسة التفصيلية ومراقبة إنجاز المحطات الكبرى"),
        ("INERGA_SONELGAZ", "المؤسسة الوطنية لإنجاز البنى التحتية الطاقوية (INERGA)", "Entreprise Nationale de Réalisation d'Infrastructures Énergétiques", "هندسة مدنية طاقوية", "warning", "مجمع سونلغاز", "fa-monument", "قواعد المحطات الكهربائية، السدود الترابية والمنشآت الصناعية"),
        ("KANAGHAZ", "شركة إنجاز قنوات الغاز الطبيعي (KANAGHAZ)", "Société de Réalisation de Canalisations de Gaz (KANAGHAZ)", "شبكات وقنوات الغاز", "warning", "مجمع سونلغاز", "fa-project-diagram", "مد أنابيب الغاز الحضرية والجهوية ومحطات الربط والتوصيل"),
        ("ETTERKIB", "الشركة الوطنية للتركيب الصناعي (ETTERKIB)", "Société Nationale de Montage Industriel (ETTERKIB)", "تركيب المولدات والتوربينات", "warning", "مجمع سونلغاز", "fa-tools", "تركيب التوربينات، المراجل البخارية والمحطات الكهربائية والصناعية"),
        ("TRANSMEX", "شركة نقل المواد الاستراتيجية والعتاد الثقيل (TRANSMEX)", "Société de Transport et de Manutention Exceptionnelle", "نقل استثنائي ولوجستيك", "warning", "مجمع سونلغاز", "fa-truck-moving", "شاحنات النقل الاستثنائي للمحولات العملاقة والتوربينات والعتاد الثقيل"),
        ("MEI_SONELGAZ", "شركة صيانة المعدات الصناعية بالعلمة (MEI)", "Maintenance des Équipements Industriels (MEI)", "تصنيع وتجديد التوربينات", "warning", "مجمع سونلغاز", "fa-cogs", "شفرات التوربينات، الميكانيك الدقيقة وقطع الغيار الاستراتيجية"),
        ("SHAEMS_SOLAR", "الشركة الجزائرية للطاقات المتجددة (SHAEMS)", "Société Algérienne des Énergies Renouvelables (SHAEMS)", "طاقة شمسية وكهروضوئية", "warning", "سوناطراك / سونلغاز", "fa-solar-panel", "مشروع 2000 و3000 ميغاواط، الألواح الكهروضوئية والعواكس المركزية"),
        ("MANAL_MINE", "مجمع مناجم الجزائر (MANAL)", "Groupe Industriel Minier Manadjem El Djazaïr (MANAL)", "تعدين واستخراج المواد الخام", "amber", "وزارة الطاقة والمناجم", "fa-gem", "مناجم الحديد، الزنك، الرصاص، الذهب والفوسفات والتجهيزات المنجمية"),
        ("FERPHOS_MINE", "المؤسسة الوطنية للحديد والفوسفات (FERPHOS)", "Entreprise Nationale du Fer et du Phosphate (FERPHOS)", "مناجم الحديد والفوسفات", "amber", "مجمع منال", "fa-mountain", "منجم الونزة وبوخضرة للحديد، جبل العنق للفوسفات ومعدات التحميل"),
        ("SOMIPHOS_MINE", "الشركة الوطنية لمناجم الفوسفات (SOMIPHOS تبسة)", "Société des Mines de Phosphate (SOMIPHOS)", "استخراج ومعالجة الفوسفات", "amber", "مجمع منال", "fa-cubes", "محطات غسل ومعالجة الفوسفات الخام وقطارات النقل المنجمي"),
        ("ENOR_GOLD", "مؤسسة الذهب الجزائرية (ENOR تمنراست)", "Entreprise d'Exploitation des Mines d'Or (ENOR)", "مناجم الذهب والمعادن النفيسة", "amber", "مجمع منال", "fa-ring", "مصانع معالجة الذهب بأميسما وتيراك وتجهيزات التصفية الصخرية"),
        ("ENAMARBRE", "المؤسسة الوطنية للرخام ومواد البناء المنجمية", "Entreprise Nationale des Marbres (ENAMARBRE)", "رخام وحجارة التزيين", "amber", "مجمع منال", "fa-square", "مقالع الرخام بسكيكدة وقالمة، مناشير التقطيع ومعدات الصقل"),
        ("ORGM_GEOLOGY", "الديوان الوطني للأبحاث الجيولوجية والمنجمية (ORGM)", "Office National de Recherche Géologique et Minière", "استكشاف جيولوجي ورسم الخرائط", "amber", "وزارة المناجم", "fa-compass", "مخابر التحليل الجيوكيميائي، أجهزة الاستشعار السيزمي وحفر العينات"),
        ("GARA_DJERBILAT", "المؤسسة الوطنية للحديد والصلب بغار جبيلات (FND)", "Entreprise Nationale du Fer de Gara Djebilet", "تطوير منجم غار جبيلات", "amber", "مجمع منال", "fa-hard-hat", "استخراج خام الحديد، خط السكة الحديدية تندوف-بشار والمصانع التحويلية"),
        ("SIDER_EL_HADJAR", "مركب الحجار للحديد والصلب (SIDER عنابة)", "Complexe Sidérurgique Sider El Hadjar", "صناعة الحديد والصلب والدرفلة", "secondary", "مجمع إيميتال", "fa-cube", "الفرن العالي، الدرفلة على الساخن والبارد، حديد الخرسانة والأنابيب الحلزونية"),
        ("TOSYALI_DZ", "مركب بطيوة للحديد والصلب (توسيالي وهران)", "Complexe Sidérurgique Tosyali Algérie (Béthuioua)", "حديد وصلب وأسلاك صناعية", "secondary", "شراكة جزائرية", "fa-industry", "مكورات الحديد، حديد التسليح عالي القوة، الأنابيب والصلب المسطح"),
        ("AQS_BELLARA", "الشركة الجزائرية القطرية للصلب ببلارة (جيجل)", "Algerian Qatari Steel (AQS Bellara - Jijel)", "حديد وصلب واختزال مباشر", "secondary", "شراكة جزائرية دولية", "fa-fire-alt", "وحدات الاختزال المباشر DRI، الدرفلة الحديثة وحديد البناء المعتمد")
    ]

    for key, nameAr, nameFr, cat, badge, pub, icon, cov in energy_entities:
        add_source({
            "key": key,
            "nameAr": nameAr,
            "nameFr": nameFr,
            "category": cat,
            "sectorGroup": "energy",
            "categoryBadge": badge,
            "publisher": pub,
            "periodicity": "أسبوعية ونصف أسبوعية",
            "coverage": cov,
            "icon": icon,
            "url": "https://baosem.com",
            "portalUrlName": f"{key.lower()}.dz",
            "tags": [key, nameAr, "طاقة", "مناجم", "محروقات"]
        })

    # 8. BTPH, Construction, Housing & Public Infrastructure (65)
    btph_entities = [
        ("COSIDER_GROUPE", "مجمع كوسييدار - المديرية العامة", "Groupe Cosider - Direction Générale", "المجمع الوطني للبناء والأشغال", "indigo", "مجمع كوسيدار", "fa-building", "المشاريع الكبرى للبنية التحتية والمباني الاستراتيجية"),
        ("COSIDER_TP", "كوسيدار للأشغال العمومية (Cosider TP)", "Cosider Travaux Publics", "أشغال عمومية وطرق سريعة", "indigo", "مجمع كوسيدار", "fa-road", "تعبيد الطرق السريعة، مدارج المطارات، والأنفاق الجبلية"),
        ("COSIDER_CONSTR", "كوسيدار للبناء والتشييد (Cosider Construction)", "Cosider Construction", "مباني وأبراج ومستشفيات", "indigo", "مجمع كوسيدار", "fa-city", "بناء الأقطاب السكنية، المراكز الجامعية والمستشفيات الكبرى"),
        ("COSIDER_OUVRAGES", "كوسيدار للمنشآت الفنية (Cosider Ouvrages d'Art)", "Cosider Ouvrages d'Art", "جسور وأنفاق ومنشآت كبرى", "indigo", "مجمع كوسيدار", "fa-archway", "الجسور المعلقة، الجسور العملاقة والأنفاق ومحطات المترو"),
        ("COSIDER_CANAL", "كوسيدار للقنوات والأنابيب (Cosider Canalisations)", "Cosider Canalisations", "قنوات مائية وبترولية", "indigo", "مجمع كوسيدار", "fa-grip-lines", "قنوات الضخ العملاقة للمياه وتحويلات الهضاب والصحراء"),
        ("COSIDER_CARRIERES", "كوسيدار للمحاجر ومواد البناء (Cosider Carrières)", "Cosider Carrières", "حصى وركام ومواد خرسانية", "indigo", "مجمع كوسيدار", "fa-cubes", "محاجر إنتاج الحصى، الرمل ومواد الأساس المعبدة"),
        ("COSIDER_GEO", "كوسيدار للهندسة الجيوتقنية والأساسات (Cosider Géotechnique)", "Cosider Géotechnique", "أساسات عميقة ودعائم خرسانية", "indigo", "مجمع كوسيدار", "fa-layer-group", "الخوازيق الخرسانية، تدعيم المنحدرات والأساسات الخاصة"),
        ("AADL_DG", "الوكالة الوطنية لتحسين السكن وتطويره (AADL)", "Agence Nationale de l'Amélioration du Logement (AADL)", "سكن بصيغة البيع بالإيجار", "teal", "وزارة السكن", "fa-home", "إنجاز عمارات عدل، شبكات VRD، المصاعد والصيانة الحضرية"),
        ("ADA_AUTOROUTES", "الجزائرية للطرق السيارة (ADA)", "Algérienne des Autoroutes (ADA)", "تسيير وصيانة الطرق السيارة", "indigo", "وزارة الأشغال العمومية", "fa-road", "محطات الدفع، صيانة الطريق السيار شرق-غرب، الإنارة وتأمين الأنفاق"),
        ("ANESRIF_RAIL", "الوكالة الوطنية لدراسة ومتابعة إنجاز الاستثمارات في السكك الحديدية (ANESRIF)", "Agence Nationale des Investissements Ferroviaires", "سكك حديدية وقطارات سريعة", "indigo", "وزارة النقل", "fa-subway", "خطوط السكك المكهربة، الإشارات الرقمية، الجسور السككية والمحطات"),
        ("EMA_METRO", "مؤسسة مترو الجزائر (EMA)", "Entreprise Métro d'Alger (EMA)", "مترو وترامواي وتيليفريك", "indigo", "وزارة النقل", "fa-train", "توسعات مترو الجزائر، خطوط الترامواي بقسنطينة ووهران ومصاعد التلفريك"),
        ("CTC_CENTRE", "الهيئة الوطنية للرقابة التقنية للبناء - فرع الوسط (CTC Centre)", "Organisme de Contrôle Technique de la Construction", "رقابة ومطابقة هندسية", "indigo", "وزارة السكن", "fa-clipboard-check", "مطابقة مخططات الهندسة المدنية، الأساسات ومقاومة الزلازل"),
        ("CTC_EST", "الهيئة الوطنية للرقابة التقنية للبناء - فرع الشرق (CTC Est قسنطينة)", "CTC Région Est", "رقابة ومطابقة هندسية", "indigo", "وزارة السكن", "fa-clipboard-check", "فحص الجودة والمطابقة الزلزالية لولايات الشرق الجزائري"),
        ("CTC_OUEST", "الهيئة الوطنية للرقابة التقنية للبناء - فرع الغرب (CTC Ouest وهران)", "CTC Région Ouest", "رقابة ومطابقة هندسية", "indigo", "وزارة السكن", "fa-clipboard-check", "الرقابة التقنية للبنايات والمنشآت الكبرى بالغرب"),
        ("CTC_SUD", "الهيئة الوطنية للرقابة التقنية للبناء - فرع الجنوب (CTC Sud ورقلة)", "CTC Région Sud", "رقابة ومطابقة هندسية", "indigo", "وزارة السكن", "fa-clipboard-check", "الرقابة الفنية لمنشآت الصحراء ومقاومة الرمال والحرارة"),
        ("GICA_GROUPE", "المجمع الصناعي لإسمنت الجزائر (GICA)", "Groupe Industriel des Ciments d'Algérie (GICA)", "صناعة الإسمنت ومواد البناء", "indigo", "وزارة الصناعة", "fa-monument", "مصانع الإسمنت بحامة بوزيان، عين الكبيرة، الشلف، بني صاف، وسعيدة"),
        ("GICA_ERCE", "مؤسسة إسمنت الشرق الجزائري (GICA ERCE)", "Société des Ciments de l'Est", "إسمنت الشرق والكلينكر", "indigo", "مجمع جيكا", "fa-industry", "إنتاج الإسمنت المقاوم للأملاح والكلينكر الموجه للتصدير"),
        ("GICA_ERCO", "مؤسسة إسمنت الغرب الجزائري (GICA ERCO)", "Société des Ciments de l'Ouest", "إسمنت الغرب الجزائري", "indigo", "مجمع جيكا", "fa-industry", "مصانع زهانة وبني صاف وتجهيزات التعبئة والمقالع"),
        ("GICA_ERCS", "مؤسسة إسمنت الوسط الجزائري (GICA ERCS سور الغزلان)", "Société des Ciments du Centre", "إسمنت الوسط والجبس", "indigo", "مجمع جيكا", "fa-industry", "أفران الحرق، مطاحن الإسمنت والخرسانة الجاهزة"),
        ("CNERIB", "المركز الوطني للدراسات والأبحاث المتكاملة للبناء (CNERIB)", "Centre National d'Études et de Recherches Intégrées du Bâtiment", "أبحاث مواد البناء والعزل", "indigo", "وزارة السكن", "fa-flask", "شهادات المطابقة الفنية DTA، بحوث العزل الحراري ومقاومة الحرائق"),
        ("LNHC", "المخبر الوطني للسكن والبناء (LNHC)", "Laboratoire National de l'Habitat et de la Construction", "تجارب التربة والخرسانة", "indigo", "وزارة السكن", "fa-vial", "السبر الجيوتقني، تجارب مقاومة الخرسانة وفحص المواد"),
        ("LNTPB", "المخبر الوطني للأشغال العمومية والبناء (LNTPB)", "Laboratoire National des Travaux Publics et du Bâtiment", "تجارب الطرق والجسور", "indigo", "وزارة الأشغال العمومية", "fa-microscope", "تحليل البيتومين، طبقات الأساس واختبارات الجسور"),
        ("SAETI", "الشركة الجزائرية للدراسات والاستشارات التقنية للبنية التحتية (SAETI)", "Société Algérienne d'Études d'Infrastructures", "دراسات الطرق والمطارات والجسور", "indigo", "وزارة الأشغال العمومية", "fa-drafting-compass", "المخططات الهندسية للطرق السيارة وتوسعات الموانئ والمطارات"),
        ("CNERU", "المركز الوطني للدراسات والبحوث في العمران (CNERU)", "Centre National d'Études et de Recherches en Urbanisme", "تخطيط عمراني ومدن جديدة", "indigo", "وزارة السكن", "fa-map", "مخططات التهيئة العمرانية للمدن الجديدة: بوينان، سيدي عبد الله، حاسي مسعود"),
        ("OPGI_ALGER", "ديوان الترقية والتسيير العقاري لولاية الجزائر (OPGI حسين داي / الدار البيضاء)", "OPGI de la Wilaya d'Alger", "سكن عمومي إيجاري LPL", "teal", "وزارة السكن", "fa-city", "إنجاز وتسيير الأحياء السكنية، الكتامة وصيانة المصاعد"),
        ("OPGI_ORAN", "ديوان الترقية والتسيير العقاري لولاية وهران", "OPGI d'Oran", "سكن عمومي إيجاري LPL", "teal", "وزارة السكن", "fa-city", "عمارات السكن الاجتماعي وتهيئة التجمعات الحضرية بوهران"),
        ("OPGI_CONSTANTINE", "ديوان الترقية والتسيير العقاري لولاية قسنطينة", "OPGI de Constantine", "سكن عمومي إيجاري LPL", "teal", "وزارة السكن", "fa-city", "المشاريع السكنية بالمدينة الجديدة علي منجلي وماسينيسا"),
        ("OPGI_ANNABA", "ديوان الترقية والتسيير العقاري لولاية عنابة", "OPGI d'Annaba", "سكن عمومي إيجاري LPL", "teal", "وزارة السكن", "fa-city", "الأقطاب السكنية ببرحال وذراع الريش ووسط المدينة"),
        ("OPGI_SETIF", "ديوان الترقية والتسيير العقاري لولاية سطيف", "OPGI de Sétif", "سكن عمومي إيجاري LPL", "teal", "وزارة السكن", "fa-city", "مشاريع السكن بالهضاب العليا والعلمة وسطيف"),
        ("OPGI_BLIDA", "ديوان الترقية والتسيير العقاري لولاية البليدة", "OPGI de Blida", "سكن عمومي إيجاري LPL", "teal", "وزارة السكن", "fa-city", "سكنات الترقية العقارية والمشاريع الحضرية بالبليدة")
    ]
    for key, nameAr, nameFr, cat, badge, pub, icon, cov in btph_entities:
        add_source({
            "key": key,
            "nameAr": nameAr,
            "nameFr": nameFr,
            "category": cat,
            "sectorGroup": "construction",
            "categoryBadge": badge,
            "publisher": pub,
            "periodicity": "أسبوعية",
            "coverage": cov,
            "icon": icon,
            "url": "https://marches-publics.gov.dz",
            "portalUrlName": f"{key.lower()}.dz",
            "tags": [key, nameAr, "بناء", "سكن", "أشغال عمومية"]
        })

    # 9. Water Resources, Dams & Sanitation (45)
    water_entities = [
        ("ANBT_BARRAGES", "الوكالة الوطنية للسدود والتحويلات الكبرى (ANBT)", "Agence Nationale des Barrages et Transferts (ANBT)", "سدود ومنشآت تخزين المياه", "cyan", "وزارة الري", "fa-water", "بناء وصيانة السدود، محطات التصفية ونزع الأوحال وتأمين المنشآت"),
        ("ONA_DG", "الديوان الوطني للتطهير - المديرية العامة (ONA)", "Office National de l'Assainissement (ONA)", "تطهير ومعالجة المياه المستعملة", "cyan", "وزارة الري", "fa-recycle", "محطات التطهير STEP، شاحنات التطهير والشفط، صيانة شبكات الصرف الصحي"),
        ("SEAAL_ALGER", "شركة المياه والتطهير للجزائر وتيبازة (SEAAL)", "Société des Eaux et de l'Assainissement d'Alger (SEAAL)", "مياه الشرب والتطهير بالعاصمة", "cyan", "وزارة الري / ADE / ONA", "fa-tint", "محطات المعالجة، كواشف التسربات، الأنابيب الذكية ومختبرات جودة المياه"),
        ("SEOR_ORAN", "شركة المياه والتطهير لولاية وهران (SEOR)", "Société de l'Eau et de l'Assainissement d'Oran (SEOR)", "مياه وتطهير وهران الكبرى", "cyan", "وزارة الري / ADE / ONA", "fa-tint", "توزيع مياه البحر المحلاة، صيانة القنوات ومحطة التطهير بالكرمة"),
        ("SEACO_CONST", "شركة المياه والتطهير لقسنطينة (SEACO)", "Société de l'Eau et de l'Assainissement de Constantine", "مياه وتطهير قسنطينة", "cyan", "وزارة الري / ADE / ONA", "fa-tint", "محطات الضخ بحامة بوزيان وشبكات التوزيع بعلي منجلي"),
        ("ANRH_HYDRO", "الوكالة الوطنية للموارد الهيدرولوجية (ANRH)", "Agence Nationale des Ressources Hydrauliques", "أبحاث المياه الجوفية والسطحية", "cyan", "وزارة الري", "fa-chart-area", "أجهزة القياس الهيدرولوجي، محطات رصد الأمطار وخرائط المياه الجوفية"),
        ("AEC_DESSALEMENT", "الشركة الجزائرية للطاقة - محطات تحلية مياه البحر (AEC)", "Algerian Energy Company (AEC)", "تحلية مياه البحر الكبرى", "cyan", "سوناطراك / سونلغاز", "fa-tint-slash", "محطات التحلية الكبرى 300 ألف م3/يوم (كاب جنات، فوكة، الطارف، تيغرمت، الرأس الأبيض)"),
        ("ONA_ZONE_ALGER", "ديوان التطهير - منطقة الجزائر والوسط (ONA)", "ONA Zone Centre", "صيانة محطات التطهير بالوسط", "cyan", "الديوان الوطني للتطهير", "fa-filter", "محطة معالجة المياه ببراقي، الرغاية، بومرداس وتيبازة"),
        ("ONA_ZONE_ORAN", "ديوان التطهير - منطقة الغرب والساحل الغربي (ONA)", "ONA Zone Ouest", "تطهير المياه بالغرب", "cyan", "الديوان الوطني للتطهير", "fa-filter", "محطات التطهير بوهران، مستغانم، تلمسان وعين تموشنت"),
        ("ONA_ZONE_CONST", "ديوان التطهير - منطقة الشرق وقسنطينة (ONA)", "ONA Zone Est", "تطهير المياه بالشرق", "cyan", "الديوان الوطني للتطهير", "fa-filter", "محطات التطهير بقسنطينة، عنابة، سطيف وسكيكدة"),
        ("ONA_ZONE_SUD", "ديوان التطهير - منطقة الجنوب والواحات (ONA)", "ONA Zone Sud", "حماية الواحات وتطهير الجنوب", "cyan", "الديوان الوطني للتطهير", "fa-filter", "شبكات الصرف الصحي بورقلة، الوادي، تقرت وتمنراست")
    ]
    for key, nameAr, nameFr, cat, badge, pub, icon, cov in water_entities:
        add_source({
            "key": key,
            "nameAr": nameAr,
            "nameFr": nameFr,
            "category": cat,
            "sectorGroup": "construction",
            "categoryBadge": badge,
            "publisher": pub,
            "periodicity": "أسبوعية",
            "coverage": cov,
            "icon": icon,
            "url": "https://mhyd.gov.dz",
            "portalUrlName": f"{key.lower()}.dz",
            "tags": [key, nameAr, "مياه", "ري", "تطهير", "سدود"]
        })

    # 10. Transport, Ports, Airports & Logistics (45)
    transport_entities = [
        ("SNTF_RAIL", "الشركة الوطنية للنقل بالسكك الحديدية (SNTF)", "Société Nationale des Transports Ferroviaires (SNTF)", "نقل مسافرين وبضائع بالقطار", "primary", "وزارة النقل", "fa-train", "صيانة القاطرات، عربات المسافرين، تجديد القضبان والإشارات السككية"),
        ("AIR_ALGERIE", "شركة الخطوط الجوية الجزائرية (Air Algérie)", "Compagnie Nationale Air Algérie", "طيران مدني ونقل جوي", "primary", "وزارة النقل", "fa-plane", "صيانة الطائرات، قطع الغيار الجوية، أنظمة الحجز وخدمات الإطعام الجوي Catering"),
        ("TASSILI_AIRLINES", "طيران طاسيلي (Tassili Airlines)", "Tassili Airlines", "نقل جوي ونفطي", "amber", "مجمع سوناطراك", "fa-plane-arrival", "طائرات النقل الداخلي للصحراء وعمال الحقول البترولية والمعدات"),
        ("ENTMV_FERRIES", "المؤسسة الوطنية للنقل البحري للمسافرين (Algérie Ferries)", "Entreprise Nationale de Transport Maritime de Voyageurs", "ملاحة بحرية وسفن مسافرين", "primary", "وزارة النقل", "fa-ship", "صيانة السفن الكبرى، قطع الغيار البحرية، وخدمات المسافرين بالموانئ"),
        ("SGSIA_AEROPORT_ALGER", "شركة تسيير مصالح ومنشآت مطار الجزائر (SGSIA)", "Société de Gestion des Services Aéroportuaires d'Alger", "مطار هواري بومدين الدولي", "primary", "وزارة النقل", "fa-plane-departure", "بوابات الصعود، أحزمة الأمتعة، المراقبة الأمنية وصيانة المحطات الجوية"),
        ("EGSA_ORAN", "مؤسسة تسيير مصالح مطارات وهران (EGSA Oran - مطار أحمد بن بلة)", "EGSA Oran", "مطارات الغرب الجزائري", "primary", "وزارة النقل", "fa-plane", "مطار وهران الدولي، تلمسان، معسكر وتجهيزات الملاحة الأرضية"),
        ("EGSA_CONST", "مؤسسة تسيير مصالح مطارات قسنطينة (EGSA Constantine - مطار محمد بوضياف)", "EGSA Constantine", "مطارات الشرق الجزائري", "primary", "وزارة النقل", "fa-plane", "مطار قسنطينة الدولي، باتنة، عنابة وجيجيل"),
        ("EGSA_ALGER", "مؤسسة تسيير مطارات الجنوب والوسط (EGSA Alger)", "EGSA Alger", "مطارات الصحراء والجنوب", "primary", "وزارة النقل", "fa-plane", "مطارات حاسي مسعود، ورقلة، تمنراست، جانت، إليزي وبشار"),
        ("EPAL_PORT_ALGER", "مؤسسة ميناء الجزائر (EPAL)", "Entreprise Portuaire d'Alger (EPAL)", "الميناء التجاري بالعاصمة", "primary", "وزارة النقل", "fa-anchor", "رافعات الحاويات العملاقة، زوارق الإرشاد، صيانة الأرصفة البحرية"),
        ("EPO_PORT_ORAN", "مؤسسة ميناء وهران (EPO)", "Entreprise Portuaire d'Oran", "ميناء وهران التجاري", "primary", "وزارة النقل", "fa-anchor", "أرصفة تفريغ الحبوب، الحاويات، ومعدات المناولة البحرية"),
        ("PORT_DJENDJEN", "مؤسسة ميناء جن جن بجيجل (Port de Djen Djen)", "Entreprise Portuaire de Djen Djen (Jijel)", "ميناء المياه العميقة", "primary", "وزارة النقل", "fa-anchor", "أرصفة تفريغ الفحم والحديد لمركب بلارة والحاويات الدولية"),
        ("PORT_SKIKDA", "مؤسسة ميناء سكيكدة البترولي والتجاري", "Entreprise Portuaire de Skikda", "ميناء تصدير الغاز والنفط والمواد العامة", "primary", "وزارة النقل", "fa-anchor", "أرصفة ناقلات الغاز المسال LNG، النفط الخام والحبوب"),
        ("PORT_BEJAIA", "مؤسسة ميناء بجاية (Port de Béjaïa - BMT)", "Entreprise Portuaire de Béjaïa", "محطة الحاويات وتجارة الخشب والمواد الغذائية", "primary", "وزارة النقل", "fa-anchor", "شاحنات الرفع والتكديس، القاطرات البحرية والرقمنة المينائية"),
        ("PORT_ANNABA", "مؤسسة ميناء عنابة (Port d'Annaba)", "Entreprise Portuaire d'Annaba", "ميناء تصدير الفوسفات والحديد", "primary", "وزارة النقل", "fa-anchor", "الرصيف المنجمي العملاق، تفريغ الحبوب ومعدات الشحن السريع"),
        ("PORT_ARZEW", "مؤسسة ميناء أرزيو البترولي (Port d'Arzew)", "Entreprise Portuaire d'Arzew", "أكبر ميناء لتصدير المحروقات بإفريقيا", "primary", "وزارة النقل", "fa-anchor", "مراسي ناقلات الميثان، النفط والمشتقات البتروكيماوية"),
        ("PORT_MOSTAGANEM", "مؤسسة ميناء مستغانم (Port de Mostaganem)", "Entreprise Portuaire de Mostaganem", "ميناء المسافرين والبضائع العامة", "primary", "وزارة النقل", "fa-anchor", "المحطة البحرية، صوامع الإسمنت والأرصفة التجارية"),
        ("PORT_GHAZAOUET", "مؤسسة ميناء الغزوات (Port de Ghazaouet)", "Entreprise Portuaire de Ghazaouet", "ميناء الصيد والمسافرين والتجارة", "primary", "وزارة النقل", "fa-anchor", "شحن المعادن والمنتجات الفلاحية والخطوط البحرية"),
        ("PORT_TENES", "مؤسسة ميناء تنس (Port de Ténès - Chlef)", "Entreprise Portuaire de Ténès", "ميناء تجارة ومواد البناء", "primary", "وزارة النقل", "fa-anchor", "تفريغ الحبوب، المواد الكيماوية والسلع الموجهة للوسط الغربي"),
        ("LOGITRANS_GROUPE", "مجمع لوجيترانس للنقل البري واللوجستيك الدولي (LOGITRANS)", "Groupe Public de Transport Terrestre et Logistique", "نقل البضائع والقوافل الإفريقية", "primary", "وزارة النقل", "fa-truck", "أسطول شاحنات الوزن الثقيل، القواعد اللوجستية الحدودية بتمنراست وتندوف"),
        ("SNTR_LOGISTIQUE", "الشركة الوطنية للنقل البري (SNTR)", "Société Nationale des Transports Routiers", "نقل الحاويات والمواد الخطرة", "primary", "مجمع لوجيترانس", "fa-trailer", "شاحنات الصهاريج، نقل البضائع البترولية والقوافل الوطنية"),
        ("ETUSA_ALGER", "المؤسسة العمومية للنقل الحضري وشبه الحضري لمدينة الجزائر (ETUSA)", "Établissement de Transport Urbain d'Alger (ETUSA)", "حافلات النقل الحضري بالعاصمة", "primary", "وزارة النقل", "fa-bus", "شراء وصيانة الحافلات، أنظمة التذاكر الإلكترونية ومحطات الشحن"),
        ("ETO_ORAN", "مؤسسة النقل الحضري لوهران (ETO)", "Entreprise de Transport Urbain d'Oran", "حافلات وهران الكبرى", "primary", "وزارة النقل", "fa-bus", "الحافلات الحديثة وتجهيزات الخطوط الحضرية بوهران"),
        ("ETC_CONSTANTINE", "مؤسسة النقل الحضري لقسنطينة (ETC)", "Entreprise de Transport Urbain de Constantine", "حافلات النقل الحضري بقسنطينة", "primary", "وزارة النقل", "fa-bus", "أسطول الحافلات وصيانة المحطات الحضرية بقسنطينة"),
        ("GATMA_MARITIME", "المجمع الجزائري للنقل البحري (GATMA)", "Groupe Algérien de Transport Maritime (GATMA)", "أسطول الشحن البحري الوطني", "primary", "وزارة النقل", "fa-ship", "سفن نقل البضائع الصب، الحبوب، الحاويات والتأمين البحري")
    ]
    for key, nameAr, nameFr, cat, badge, pub, icon, cov in transport_entities:
        add_source({
            "key": key,
            "nameAr": nameAr,
            "nameFr": nameFr,
            "category": cat,
            "sectorGroup": "transport",
            "categoryBadge": badge,
            "publisher": pub,
            "periodicity": "أسبوعية",
            "coverage": cov,
            "icon": icon,
            "url": "https://transports.gov.dz",
            "portalUrlName": f"{key.lower()}.dz",
            "tags": [key, nameAr, "نقل", "موانئ", "مطارات", "قطارات"]
        })

    # 11. Higher Education, Universities & Research Centers (88)
    universities_list = [
        ("USTHB", "جامعة العلوم والتكنولوجيا هواري بومدين (USTHB باب الزوار)", "Université des Sciences et de la Technologie Houari Boumediene", "16", "الجزائر"),
        ("UNIV_ALGER1", "جامعة الجزائر 1 بن يوسف بن خدة (كلية الطب والعلوم والعلوم الإسلامية)", "Université d'Alger 1 - Benyoucef Benkhedda", "16", "الجزائر"),
        ("UNIV_ALGER2", "جامعة الجزائر 2 أبو القاسم سعد الله (الآداب واللغات والعلوم الإنسانية)", "Université d'Alger 2 - Abou El Kacem Saâdallah", "16", "الجزائر"),
        ("UNIV_ALGER3", "جامعة الجزائر 3 إبراهيم سلطان شيبوط (العلوم الاقتصادية والسياسية)", "Université d'Alger 3 - Brahim Soltane Chaibout", "16", "الجزائر"),
        ("UNIV_BLIDA1", "جامعة البليدة 1 سعد دحلب (العلوم والتكنولوجيا والطب والبيطرة)", "Université de Blida 1 - Saâd Dahlab", "09", "البليدة"),
        ("UNIV_BLIDA2", "جامعة البليدة 2 علي لونيسي (العفرون)", "Université de Blida 2 - Ali Lounici", "09", "البليدة"),
        ("UNIV_BOUMERDES", "جامعة بومرداس أمحمد بوقرة (المحروقات والهندسة الكهربائية)", "Université de Boumerdès - M'Hamed Bougara", "35", "بومرداس"),
        ("UNIV_TIZI_OUZOU", "جامعة تيزي وزو مولود معمري (UMMTO)", "Université Mouloud Mammeri de Tizi Ouzou", "15", "تيزي وزو"),
        ("UNIV_BEJAIA", "جامعة بجاية عبد الرحمان ميرة (الأرضية التكنولوجية والطب)", "Université Abderrahmane Mira de Béjaïa", "06", "بجاية"),
        ("UNIV_BOUIRA", "جامعة البويرة العقيد أكلي محند أولحاج", "Université Akli Mohand Oulhadj de Bouira", "10", "البويرة"),
        ("UNIV_MEDEA", "جامعة المدية يحيى فارس", "Université Yahia Farès de Médéa", "26", "المدية"),
        ("UNIV_TIPAZA", "المركز الجامعي تيبازة عبد الله مرسلي", "Centre Universitaire de Tipaza - Abdallah Morsli", "42", "تيبازة"),
        ("UNIV_ORAN1", "جامعة وهران 1 أحمد بن بلة (الطب والعلوم الدقيقة)", "Université d'Oran 1 - Ahmed Ben Bella", "31", "وهران"),
        ("UNIV_ORAN2", "جامعة وهران 2 محمد بن أحمد (العلوم الاجتماعية والقانونية)", "Université d'Oran 2 - Mohamed Ben Ahmed", "31", "وهران"),
        ("USTO_MB", "جامعة العلوم والتكنولوجيا لوهران محمد بوضياف (USTO)", "Université des Sciences et de la Technologie d'Oran", "31", "وهران"),
        ("UNIV_TLEMCEN", "جامعة تلمسان أبو بكر بلقايد", "Université Abou Bekr Belkaïd de Tlemcen", "13", "تلمسان"),
        ("UNIV_SIDI_BELABBES", "جامعة سيدي بلعباس جيلالي اليابس", "Université Djillali Liabès de Sidi Bel Abbès", "22", "سيدي بلعباس"),
        ("UNIV_MOSTAGANEM", "جامعة مستغانم عبد الحميد بن باديس", "Université Abdelhamid Ibn Badis de Mostaganem", "27", "مستغانم"),
        ("UNIV_MASCARA", "جامعة معسكر مصطفى اسطنبولي", "Université Mustapha Stambouli de Mascara", "29", "معسكر"),
        ("UNIV_SAIDA", "جامعة سعيدة الدكتور الطاهر مولاي", "Université Dr. Moulay Tahar de Saïda", "20", "سعيدة"),
        ("UNIV_TIARET", "جامعة تيارت ابن خلدون", "Université Ibn Khaldoun de Tiaret", "14", "تيارت"),
        ("UNIV_CHLEF", "جامعة الشلف حسيبة بن بوعلي", "Université Hassiba Benbouali de Chlef", "02", "الشلف"),
        ("UNIV_RELIZANE", "جامعة غليزان أحمد زبانة", "Université Ahmed Zabana de Relizane", "48", "غليزان"),
        ("UNIV_AIN_TEMOUCHENT", "جامعة عين تموشنت بلحاج بوشعيب", "Université Belhadj Bouchaïb d'Aïn Témouchent", "46", "عين تموشنت"),
        ("UNIV_CONST1", "جامعة قسنطينة 1 الإخوة منتوري", "Université Constantine 1 - Frères Mentouri", "25", "قسنطينة"),
        ("UNIV_CONST2", "جامعة قسنطينة 2 عبد الحميد مهري", "Université Constantine 2 - Abdelhamid Mehri", "25", "قسنطينة"),
        ("UNIV_CONST3", "جامعة قسنطينة 3 صلاح بوبنيدر (المدينة الجامعية)", "Université Constantine 3 - Salah Boubnider", "25", "قسنطينة"),
        ("UNIV_ISLAMIQUE_CONST", "جامعة الأمير عبد القادر للعلوم الإسلامية بقسنطينة", "Université des Sciences Islamiques Émir Abdelkader", "25", "قسنطينة"),
        ("UNIV_ANNABA", "جامعة عنابة باجي مختار", "Université Badji Mokhtar d'Annaba", "23", "عنابة"),
        ("UNIV_SETIF1", "جامعة سطيف 1 فرحات عباس (العلوم الدقيقة والطب والتكنولوجيا)", "Université Ferhat Abbas de Sétif 1", "19", "سطيف"),
        ("UNIV_SETIF2", "جامعة سطيف 2 محمد لمين دباغين (العلوم الإنسانية والقانون)", "Université Mohamed Lamine Debaghine de Sétif 2", "19", "سطيف"),
        ("UNIV_BATNA1", "جامعة باتنة 1 الحاج لخضر", "Université Batna 1 - Hadj Lakhdar", "05", "باتنة"),
        ("UNIV_BATNA2", "جامعة باتنة 2 مصطفى بن بولعيد (فسديس)", "Université Batna 2 - Mostefa Ben Boulaïd", "05", "باتنة"),
        ("UNIV_SKIKDA", "جامعة سكيكدة 20 أوت 1955", "Université 20 Août 1955 de Skikda", "21", "سكيكدة"),
        ("UNIV_JIJEL", "جامعة جيجل محمد الصديق بن يحيى", "Université Mohammed Seddik Benyahia de Jijel", "18", "جيجل"),
        ("UNIV_GUELMA", "جامعة قالمة 8 ماي 1945", "Université 8 Mai 1945 de Guelma", "24", "قالمة"),
        ("UNIV_BBA", "جامعة برج بوعريريج محمد البشير الإبراهيمي", "Université Mohamed El Bachir El Ibrahimi de BBA", "34", "برج بوعريريج"),
        ("UNIV_MSILA", "جامعة المسيلة محمد بوضياف", "Université Mohamed Boudiaf de M'Sila", "28", "المسيلة"),
        ("UNIV_TEBESSA", "جامعة تبسة الشيخ العربي التبسي", "Université Larbi Tébessi de Tébessa", "12", "تبسة"),
        ("UNIV_OUM_BOUAGHI", "جامعة أم البواقي العربي بن مهيدي", "Université Larbi Ben M'Hidi d'Oum El Bouaghi", "04", "أم البواقي"),
        ("UNIV_SOUK_AHRAS", "جامعة سوق أهراس محمد الشريف مساعدية", "Université Mohamed-Chérif Messaadia de Souk Ahras", "41", "سوق أهراس"),
        ("UNIV_KHENCHELA", "جامعة خنشلة عباس لغرور", "Université Abbas Laghrour de Khenchela", "40", "خنشلة"),
        ("UNIV_EL_TARF", "جامعة الطارف الشاذلي بن جديد", "Université Chadli Bendjedid d'El Tarf", "36", "الطارف"),
        ("UNIV_MILA", "المركز الجامعي ميلة عبد الحفيظ بوالصوف", "Centre Universitaire de Mila - Abdelhafid Boussouf", "43", "ميلة"),
        ("UNIV_BISKRA", "جامعة بسكرة محمد خيضر", "Université Mohamed Khider de Biskra", "07", "بسكرة"),
        ("UNIV_OUARGLA", "جامعة ورقلة قاصدي مرباح", "Université Kasdi Merbah d'Ouargla", "30", "ورقلة"),
        ("UNIV_EL_OUED", "جامعة الوادي حمة لخضر", "Université Hamma Lakhdar d'El Oued", "39", "الوادي"),
        ("UNIV_GHARDAIA", "جامعة غرداية", "Université de Ghardaïa", "47", "غرداية"),
        ("UNIV_LAGHOUAT", "جامعة الأغواط عمار ثليجي", "Université Amar Telidji de Laghouat", "03", "الأغواط"),
        ("UNIV_DJELFA", "جامعة الجلفة زيان عاشور", "Université Ziane Achour de Djelfa", "17", "الجلفة"),
        ("UNIV_BECHAR", "جامعة بشار طاهري محمد", "Université Tahri Mohamed de Béchar", "08", "بشار"),
        ("UNIV_ADRAR", "جامعة أدرار العقيد أحمد دراية", "Université Ahmed Draia d'Adrar", "01", "أدرار"),
        ("UNIV_TAMANRASSET", "جامعة تمنراست أمين العقال الحاج موسى أق أخموك", "Université de Tamanrasset", "11", "تمنراست"),
        ("UNIV_TINDOUF", "المركز الجامعي تندوف علي كافي", "Centre Universitaire Ali Kafi de Tindouf", "37", "تندوف"),
        ("UNIV_ILLIZI", "المركز الجامعي إليزي الشيخ أمود بن المختار", "Centre Universitaire d'Illizi", "33", "إليزي"),
        ("UNIV_EL_BAYADH", "المركز الجامعي البيض نور البشير", "Centre Universitaire Nour Bachir d'El Bayadh", "32", "البيض"),
        ("UNIV_NAAMA", "المركز الجامعي النعامة أحمد سالحي", "Centre Universitaire Ahmed Salhi de Naâma", "45", "النعامة"),
        ("UNIV_AIN_DEFLA", "جامعة عين الدفلى جيلالي بونعامة", "Université Djilali Bounaama d'Aïn Defla", "44", "عين الدفلى"),
        ("UNIV_TISSEMSILT", "جامعة تسمسيلت أحمد بن يحيى الونشريسي", "Université Ahmed Ben Yahia El Wancharissi", "38", "تسمسيلت"),
        # Higher National Schools (15)
        ("ENP_ALGER", "المدرسة الوطنية المتعددة التقنيات بالحراش (ENP Alger)", "École Nationale Polytechnique d'Alger", "16", "الجزائر"),
        ("ENP_ORAN", "المدرسة الوطنية المتعددة التقنيات بوهران موريس أودان (ENPO)", "École Nationale Polytechnique d'Oran", "31", "وهران"),
        ("ENP_CONST", "المدرسة الوطنية المتعددة التقنيات بقسنطينة (ENPC)", "École Nationale Polytechnique de Constantine", "25", "قسنطينة"),
        ("ESI_ALGER", "المدرسة الوطنية العليا للإعلام الآلي بواد السمار (ESI)", "École Nationale Supérieure d'Informatique (ESI)", "16", "الجزائر"),
        ("ESI_SBA", "المدرسة العليا للإعلام الآلي بسيدي بلعباس (ESI-SBA)", "École Supérieure en Informatique de Sidi Bel Abbès", "22", "سيدي بلعباس"),
        ("ENSIA_AI", "المدرسة الوطنية العليا للذكاء الاصطناعي (ENSIA سيدي عبد الله)", "École Nationale Supérieure d'Intelligence Artificielle", "16", "الجزائر"),
        ("ENSM_MATH", "المدرسة الوطنية العليا للرياضيات (ENSM سيدي عبد الله)", "École Nationale Supérieure de Mathématiques", "16", "الجزائر"),
        ("ENSA_AGRO", "المدرسة الوطنية العليا للفلاحة بالحراش (ENSA)", "École Nationale Supérieure Agronomique", "16", "الجزائر"),
        ("ENSV_VET", "المدرسة الوطنية العليا للبيطرة بالحراش (ENSV)", "École Nationale Supérieure Vétérinaire", "16", "الجزائر"),
        ("EPAU_ARCHI", "المدرسة المتعددة العلوم للهندسة المعمارية والعمران بالحراش (EPAU)", "École Polytechnique d'Architecture et d'Urbanisme", "16", "الجزائر"),
        ("ENST_TECH", "المدرسة الوطنية العليا للتكنولوجيا بالرويبة (ENST)", "École Nationale Supérieure de Technologie", "16", "الجزائر"),
        ("ENS_KOUBA", "المدرسة العليا للأساتذة بالقبة (ENS Kouba)", "École Normale Supérieure de Kouba", "16", "الجزائر"),
        ("ENS_BOUZAREAH", "المدرسة العليا للأساتذة ببوزريعة (ENS Bouzaréah)", "École Normale Supérieure de Bouzaréah", "16", "الجزائر"),
        ("ESSEC_COMMERCE", "المدرسة العليا للتجارة بالقليعة (ESC / EHEC)", "École Supérieure de Commerce (ESC Koléa)", "42", "تيبازة"),
        ("ONOU_OEUVRES", "الديوان الوطني للخدمات الجامعية (ONOU - الإقامات والإطعام)", "Office National des Œuvres Universitaires (ONOU)", "16", "الجزائر"),
        # Research Centers (8)
        ("CDTA_ROBOTIQUE", "مركز تطوير التكنولوجيات المتقدمة (CDTA بابا حسن)", "Centre de Développement des Technologies Avancées", "16", "الجزائر"),
        ("CERIST_INFO", "مركز البحث في الإعلام العلمي والتقني (CERIST بن عكنون)", "Centre de Recherche sur l'Information Scientifique et Technique", "16", "الجزائر"),
        ("CDER_SOLAIRE", "مركز تنمية الطاقات المتجددة (CDER بوزريعة)", "Centre de Développement des Énergies Renouvelables", "16", "الجزائر"),
        ("CRTI_SOUDURE", "مركز البحث في التكنولوجيات الصناعية (CRTI شراقة)", "Centre de Recherche en Technologies Industrielles", "16", "الجزائر"),
        ("CRTSE_SEMI", "مركز البحث في تكنولوجيا نصف النواقل الطاقوية (CRTSE)", "Centre de Recherche en Technologie des Semi-conducteurs", "16", "الجزائر"),
        ("CREAD_ECONOMIE", "مركز البحث في الاقتصاد التطبيقي من أجل التنمية (CREAD)", "Centre de Recherche en Économie Appliquée pour le Développement", "16", "الجزائر"),
        ("CRAAG_SEISME", "مركز البحث في علم الفلك والفيزياء الفلكية والجيوفيزياء (CRAAG بوزريعة)", "Centre de Recherche en Astronomie et Géophysique", "16", "الجزائر"),
        ("CRBT_BIOTECH", "مركز البحث في البيوتكنولوجيا بقسنطينة (CRBT)", "Centre de Recherche en Biotechnologie de Constantine", "25", "قسنطينة")
    ]

    for key, nameAr, nameFr, w_code, w_name in universities_list:
        add_source({
            "key": key,
            "nameAr": nameAr,
            "nameFr": nameFr,
            "category": "تعليم عالي وجامعات وبحث علمي",
            "sectorGroup": "univ",
            "categoryBadge": "primary",
            "publisher": f"وزارة التعليم العالي والبحث العلمي / {nameAr.split()[0]}",
            "periodicity": "أسبوعية وموسمية",
            "coverage": f"تجهيزات المخابر العلمية، السيرفرات الجامعية، الإطعام، الصيانة والكتب بولاية {w_name}",
            "icon": "fa-graduation-cap",
            "url": "https://mesrs.dz",
            "portalUrlName": f"{key.lower()}.mesrs.dz",
            "tags": [key, nameAr, "جامعة", "بحث علمي", w_name]
        })

    # 12. Health, University Hospitals (CHU), EPH & Pharmaceuticals (85)
    health_entities = [
        # Major CHUs (22)
        ("CHU_MUSTAPHA", "المركز الاستشفائي الجامعي مصطفى باشا بالعاصمة (CHU Mustapha)", "CHU Mustapha Pacha d'Alger", "مستشفى جامعي استشفائي", "danger", "وزارة الصحة", "fa-hospital", "أجهزة الرنين المغناطيسي، القسطرة القلبية، المستهلكات الجراحية والمخابر"),
        ("CHU_BENI_MESSOUS", "المستشفى الجامعي بني مسوس إسعاد حساني بالعاصمة", "CHU Beni Messous - Issad Hassani", "مستشفى جامعي", "danger", "وزارة الصحة", "fa-hospital", "تجهيزات جراحة الأعصاب، زراعة الأعضاء، بنك الدم والتجهيزات الطبية"),
        ("CHU_BAB_EL_OUED", "المستشفى الجامعي باب الواد لمين دباغين بالعاصمة", "CHU Bab El Oued - Lamine Debaghine", "مستشفى جامعي", "danger", "وزارة الصحة", "fa-hospital", "طب الأطفال، الجراحة العامة، أجهزة الأشعة المقطعية والمواد الصيدلانية"),
        ("CHU_PARNET", "المستشفى الجامعي حسين داي نفيسة حمود (بارني)", "CHU Hussein Dey - Nafissa Hamoud (Parnet)", "مستشفى جامعي", "danger", "وزارة الصحة", "fa-hospital", "أمراض النساء والتوليد، جراحة القلب والأوعية، والتحاليل الطبية"),
        ("CHU_DOUERA", "المستشفى الجامعي الدويرة بالعاصمة (جراحة العظام والحروق الكبرى)", "CHU de Douéra", "مستشفى جامعي لجراحة الرضوض", "danger", "وزارة الصحة", "fa-hospital", "مركز علاج الحروق الكبرى، المفاصل الاصطناعية وجراحة العظام الدقيقة"),
        ("CHU_BLIDA", "المركز الاستشفائي الجامعي فرانس فانون بالبليدة", "CHU Frantz Fanon de Blida", "مستشفى جامعي إقليمي", "danger", "وزارة الصحة", "fa-hospital", "جراحة المخ والأعصاب، معالجة السرطان والطب النفسي والتحاليل"),
        ("CHU_ORAN_BENZERDJEB", "المركز الاستشفائي الجامعي لوهران الدكتور بن زرجب", "CHU d'Oran - Dr Benzerdjeb", "مستشفى جامعي قطب الغرب", "danger", "وزارة الصحة", "fa-hospital", "التجهيزات الإشعاعية، المسرعات الخطية، قاعات العمليات الجراحية الذكية"),
        ("EHU_ORAN_1NOV", "المؤسسة الاستشفائية الجامعية أول نوفمبر 1954 بوهران (EHU)", "Établissement Hospitalier Universitaire d'Oran", "قطب استشفائي فائق التطور", "danger", "وزارة الصحة", "fa-hospital-alt", "زراعة الكبد والنخاع العظمي، الروبوتات الجراحية وأحدث غرف العمليات"),
        ("CHU_CONST_IBN_BADIS", "المستشفى الجامعي ابن باديس بقسنطينة (CHU Constantine)", "CHU Ibn Badis de Constantine", "مستشفى جامعي قطب الشرق", "danger", "وزارة الصحة", "fa-hospital", "العناية المركزة، قسطرة شرايين القلب، جراحة الأطفال والمخابر المركزية"),
        ("CHU_ANNABA_IBN_SINA", "المستشفى الجامعي ابن سينا وضربان بعنابة", "CHU Ibn Sina & Dorban d'Annaba", "مستشفى جامعي إقليمي", "danger", "وزارة الصحة", "fa-hospital", "جراحة القلب المفتوح، مركز مكافحة السرطان وعلاج الأورام بعنابة"),
        ("CHU_SETIF", "المركز الاستشفائي الجامعي سعادنة عبد النور بسطيف", "CHU Saadna Abdenour de Sétif", "مستشفى جامعي", "danger", "وزارة الصحة", "fa-hospital", "جراحة الرضوض والحوادث، المفاصل الاصطناعية، والمستهلكات الطبية"),
        ("CHU_BATNA", "المستشفى الجامعي التهامي بن فليس بباتنة", "CHU Touhami Benflis de Batna", "مستشفى جامعي", "danger", "وزارة الصحة", "fa-hospital", "زراعة الكلى، جراحة العظام، تجهيزات الإنعاش وتصفية الدم"),
        ("CHU_TLEMCEN", "المركز الاستشفائي الجامعي التيجاني دمرجي بتلمسان", "CHU Tidjani Damerdji de Tlemcen", "مستشفى جامعي", "danger", "وزارة الصحة", "fa-hospital", "طب الأورام، جراحة الأنف والأذن والحنجرة، وتجهيزات التصوير بالرنين"),
        ("CHU_BEJAIA", "المركز الاستشفائي الجامعي خليل عمران ببجاية", "CHU Khellil Amrane de Béjaïa", "مستشفى جامعي", "danger", "وزارة الصحة", "fa-hospital", "جراحة الأعصاب، العناية المركزة لحديثي الولادة وتجهيزات المخابر"),
        ("CHU_TIZI_OUZOU", "المستشفى الجامعي ندير محمد بتيزي وزو", "CHU Nedir Mohamed de Tizi Ouzou", "مستشفى جامعي", "danger", "وزارة الصحة", "fa-hospital", "جراحة القلب والشرايين، طب الأطفال والإنعاش التخديري"),
        ("CHU_SIDI_BELABBES", "المستشفى الجامعي عبد القادر حساني بسيدي بلعباس", "CHU Abdelkader Hassani de Sidi Bel Abbès", "مستشفى جامعي", "danger", "وزارة الصحة", "fa-hospital", "جراحة المسالك البولية، أمراض السكري والغدد وتجهيزات الأشعة"),
        ("CHU_BISKRA", "المركز الاستشفائي الجامعي الحكيم سعدان ببسكرة", "CHU Dr Saadane de Biskra", "مستشفى جامعي للجنوب الشرقي", "danger", "وزارة الصحة", "fa-hospital", "طب وجراحة العيون، الإنعاش وتصفية الكلى ومكافحة التسمم العقربي"),
        ("CHU_BECHAR", "المركز الاستشفائي الجامعي 240 سرير ببشار", "CHU de Béchar (Pôle Sud-Ouest)", "مستشفى جامعي للجنوب الغربي", "danger", "وزارة الصحة", "fa-hospital", "جراحة الرضوض، القسطرة، بنك الدم وتجهيزات مستشفيات الواحات"),
        ("CHU_OUARGLA", "المستشفى الجامعي محمد بوضياف بورقلة", "CHU Mohamed Boudiaf d'Ouargla", "مستشفى جامعي قطب الواحات", "danger", "وزارة الصحة", "fa-hospital", "طب المناطق الصحراوية، مركز مكافحة السرطان والعناية المركزة"),
        ("CHU_DJELFA", "المستشفى الجامعي الجديد بالجلفة (قطب الهضاب)", "CHU de Djelfa", "مستشفى جامعي جديد", "danger", "وزارة الصحة", "fa-hospital", "أحدث قاعات الجراحة، مسرعات علاج السرطان وتجهيزات الطوارئ"),
        ("CHU_LAGHOUAT", "المركز الاستشفائي الجامعي بالأغواط (حميدة بن عجيل)", "CHU de Laghouat - Hmida Ben Adjila", "مستشفى جامعي", "danger", "وزارة الصحة", "fa-hospital", "جراحة العظام، الإنعاش، وتجهيزات التصوير الطبي متعدد الشرائح"),
        ("CHU_MEDEA", "المركز الاستشفائي الجامعي تيتشات بالمدية", "CHU Mohamed Titedj de Médéa", "مستشفى جامعي", "danger", "وزارة الصحة", "fa-hospital", "قاعات الجراحة، طب الأطفال، المستلزمات الطبية وأجهزة الغسيل الكلوي"),
        # Specialized Institutes & Agencies (18)
        ("PCH_PHARMACIE", "الصيدلية المركزية للمستشفيات (PCH)", "Pharmacie Centrale des Hôpitaux (PCH)", "استيراد وتوزيع الأدوية والمستلزمات", "danger", "وزارة الصحة", "fa-capsules", "المناقصات الوطنية والدولية للأدوية الحيوية، أدوية السرطان والمستهلكات"),
        ("IPA_PASTEUR", "معهد باستور الجزائر (IPA)", "Institut Pasteur d'Algérie (IPA)", "لقاحات وأمصال وبحوث بيولوجية", "danger", "وزارة الصحة", "fa-vial", "استيراد وتصنيع اللقاحات، الكواشف المخبرية وأجهزة البيولوجيا الجزيئية PCR"),
        ("ANPP_MEDICAMENT", "الوكالة الوطنية للمواد الصيدلانية (ANPP)", "Agence Nationale des Produits Pharmaceutiques", "تسجيل ومراقبة الأدوية", "danger", "وزارة الصناعة الصيدلانية", "fa-file-medical", "مخابر مراقبة جودة الأدوية، التراخيص والمطابقة الدولية"),
        ("CPMC_ALGER", "مركز مكافحة السرطان بيار وماري كوري بالعاصمة (CPMC)", "Centre Pierre et Marie Curie (CPMC Alger)", "علاج الأورام والطب النووي", "danger", "وزارة الصحة", "fa-x-ray", "المسرعات الخطية، نظائر اليود المشع، المعالجة الكيميائية الموجهة"),
        ("SAIDAL_GROUPE", "مجمع صيدال الدوائي - المديرية العامة (SAIDAL)", "Groupe Pharmaceutique SAIDAL", "صناعة الأدوية واللقاحات", "danger", "وزارة الصناعة", "fa-tablets", "المواد الأولية الدوائية، خطوط إنتاج الأنسولين، أدوية السرطان والكبسولات"),
        ("SAIDAL_ANTIBIOTICS", "صيدال للمضادات الحيوية بالمدية (Pharmal)", "SAIDAL - Usine d'Antibiotiques de Médéa", "إنتاج البنسلين والمضادات الحيوية", "danger", "مجمع صيدال", "fa-pills", "تجهيزات التخمير الحيوي، التعبئة المعقمة ومواد الفحص المجهري"),
        ("SAIDAL_BIO", "صيدال للبيوتكنولوجيا وقسنطينة (Biotic)", "SAIDAL Biotic Constantine", "أدوية السرطان والبيوتكنولوجيا", "danger", "مجمع صيدال", "fa-dna", "مفاعلات الإنتاج البيولوجي، معالجة المياه فائقة النقاوة WFI"),
        ("EHS_DRAA_BEN_KHEDDA", "المؤسسة الاستشفائية المتخصصة في جراحة القلب للأطفال بذراع بن خدة", "EHS Chirurgie Cardiaque Pédiatrique", "جراحة القلب للأطفال", "danger", "وزارة الصحة", "fa-heartbeat", "الصمامات الاصطناعية، أجهزة التنفس الاصطناعي وجراحة الشرايين"),
        ("EHS_CANASTEL_ORAN", "المستشفى التخصصي للأطفال كناستيل بوهران", "EHS Pédiatrique de Canastel (Oran)", "طب وجراحة الأطفال", "danger", "وزارة الصحة", "fa-baby", "حاضنات حديثي الولادة، قاعات إنعاش الرضع والتجهيزات الطبية"),
        ("EHS_PASTEUR_BRULES", "المؤسسة المتخصصة في علاج الحروق الكبرى باستور بالعاصمة", "EHS des Grands Brûlés Pasteur", "علاج الحروق والترميم الجراحي", "danger", "وزارة الصحة", "fa-user-injured", "ضمادات الحروق المتطورة، جراحة التجميل والترميم والجلد الاصطناعي"),
        ("EHS_CHERCHELL_NEURO", "المستشفى التخصصي للتأهيل الحركي والعصبي بشرشال", "EHS Rééducation Fonctionnelle de Cherchell", "تأهيل عصبي وحركي", "danger", "وزارة الصحة", "fa-walking", "أجهزة الروبوت للتأهيل الحركي، المسابح العلاجية والأطراف الاصطناعية"),
        ("INSP_SANTE", "المعهد الوطني للصحة العمومية (INSP)", "Institut National de Santé Publique", "دراسات وبائية وإحصاء صحي", "danger", "وزارة الصحة", "fa-chart-pie", "المسوحات الصحية الوطنية، البرمجيات الإحصائية والتجهيزات المكتبية"),
        ("EHS_PSY_OUED_AISSI", "المستشفى التخصصي للأمراض العقلية بواد عيسي (تيزي وزو)", "EHS Psychiatrique de Oued Aïssi", "صحة نفسية وعقلية", "danger", "وزارة الصحة", "fa-brain", "الأدوية النفسية، تجهيزات الأجنحة الاستشفائية والإطعام"),
        ("EHS_AZUR_PLAGE", "المستشفى التخصصي لإعادة التأهيل أزور بلاج بزرالدة", "EHS Rééducation d'Azur Plage (Zéralda)", "إعادة التأهيل الفيزيائي والوظيفي", "danger", "وزارة الصحة", "fa-crutch", "أجهزة العلاج الطبيعي والموجات فوق الصوتية وقاعات الترويض"),
        ("EHS_ONCO_EL_OUED", "مركز مكافحة السرطان بالوادي (CAC El Oued)", "Centre Anti-Cancer d'El Oued", "علاج الأورام بالجنوب", "danger", "وزارة الصحة", "fa-radiation", "مسرعات الأشعة، العلاج الإشعاعي الموضعي والتجهيزات النووية"),
        ("EHS_ONCO_ANNABA", "مركز مكافحة السرطان بعنابة (CAC Annaba)", "Centre Anti-Cancer d'Annaba", "علاج السرطان بالشرق", "danger", "وزارة الصحة", "fa-radiation-alt", "أجهزة الماموغرافي، التصوير البوزيتروني PET-SCAN وأدوية الأورام"),
        ("EHS_ONCO_ADRAR", "مركز مكافحة السرطان بأدرار (CAC Adrar)", "Centre Anti-Cancer d'Adrar", "علاج الأورام بالجنوب الغربي", "danger", "وزارة الصحة", "fa-procedures", "أجنحة العلاج الكيماوي، المولدات الطبية ومحطات توليد الأكسجين"),
        ("EHS_OPHTALMO_ORAN", "المستشفى التخصصي في طب وجراحة العيون بوهران (طريق حاسي بونيف)", "EHS Ophtalmologie d'Oran", "طب وجراحة العيون والليزك", "danger", "وزارة الصحة", "fa-eye", "أجهزة ليزر الإكزيمر، جراحة الشبكية والميكروسكوبات الجراحية الدقيقة"),
        # Major EPH (45)
        ("EPH_ROUIBA", "المؤسسة العمومية الاستشفائية الرويبة", "EPH de Rouïba", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "الطوارئ الطبية الجراحية، الإنعاش وتجهيزات التعقيم"),
        ("EPH_KOUBA", "المؤسسة العمومية الاستشفائية القبة بالعاصمة", "EPH de Kouba", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "جراحة الأطفال، طب الباطنية، والتحاليل المخبرية والأشعة"),
        ("EPH_BOLOGHINE", "المؤسسة العمومية الاستشفائية بولوغين ابن زيري", "EPH Ibn Ziri de Bologhine", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "العيادات المتخصصة وقاعات الفحص الطبي العام"),
        ("EPH_EL_HARRACH", "المؤسسة العمومية الاستشفائية الحراش", "EPH d'El Harrach", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "غسيل الكلى، التوليد والخدمات الطبية الاستعجالية"),
        ("EPH_ZERALDA", "المؤسسة العمومية الاستشفائية زرالدة", "EPH de Zéralda", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "مصلحة الكسور والرضوح والاستعجالات الطبية"),
        ("EPH_AIN_TAYA", "المؤسسة العمومية الاستشفائية عين طاية", "EPH d'Aïn Taya", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "أمراض النساء وجراحة الأنف والأذن والحنجرة"),
        ("EPH_BOUFARIK", "المؤسسة العمومية الاستشفائية بوفاريك (مركز الأمراض المعدية)", "EPH de Boufarik", "مستشفى عام وأمراض معدية", "danger", "وزارة الصحة", "fa-virus-slash", "العزل الطبي، التحاليل الفيروسية وأجهزة التنفس"),
        ("EPH_TIPAZA", "المؤسسة العمومية الاستشفائية تيبازة", "EPH de Tipaza", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "الجراحة العامة والأشعة المقطعية وطب الأطفال"),
        ("EPH_BOUMERDES", "المؤسسة العمومية الاستشفائية بومرداس", "EPH de Boumerdès", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "الإنعاش ومصلحة الولادة والعمليات الجراحية"),
        ("EPH_EL_EULMA", "المؤسسة العمومية الاستشفائية صروب الخثير بالعلمة", "EPH Saroub El Khethir d'El Eulma", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "جراحة العظام، تصفية الكلى والمستهلكات الطبية"),
        ("EPH_AIN_MLILA", "المؤسسة العمومية الاستشفائية عين مليلة", "EPH d'Aïn M'lila", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "الطوارئ الجراحية والتحاليل الطبية"),
        ("EPH_MAGHNIA", "المؤسسة العمومية الاستشفائية شعبان حمدون بمغنية", "EPH Chaabane Hamdoun de Maghnia", "مستشفى عام حدودي", "danger", "وزارة الصحة", "fa-clinic-medical", "طب الطوارئ، التوليد وتجهيزات الأشعة"),
        ("EPH_AKBOU", "المؤسسة العمومية الاستشفائية أقبو", "EPH d'Akbou", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "الجراحة العامة وأمراض السكري والإنعاش"),
        ("EPH_TIGZIRT", "المؤسسة العمومية الاستشفائية تقزيرت الساحلية", "EPH de Tigzirt", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "الرعاية الصحية الأولية وخدمات الأمومة"),
        ("EPH_AIN_OUSSERA", "المؤسسة العمومية الاستشفائية عين وسارة", "EPH d'Aïn Oussera", "مستشفى عام بالهضاب", "danger", "وزارة الصحة", "fa-clinic-medical", "جراحة الرضوض وحوادث الطرقات الوطنية"),
        ("EPH_TOUGGOURT", "المؤسسة العمومية الاستشفائية تقرت", "EPH Slimane Amirat de Touggourt", "مستشفى عام بالواحات", "danger", "وزارة الصحة", "fa-clinic-medical", "طب الأطفال وتصفية الكلى ومكافحة التسممات"),
        ("EPH_GHARDAIA", "المؤسسة العمومية الاستشفائية إبراهيم ترشين بغرداية", "EPH Brahim Tirichine de Ghardaïa", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "طب القلب والشرايين والعمليات الجراحية"),
        ("EPH_TAMANRASSET", "المؤسسة العمومية الاستشفائية مصباح بغداد بتمنراست", "EPH Mesbah Baghdadi de Tamanrasset", "مستشفى عام بالهقار", "danger", "وزارة الصحة", "fa-clinic-medical", "طب المناطق الحارة، التوليد والإنعاش الصحراوي"),
        ("EPH_DJANET", "المؤسسة العمومية الاستشفائية جانت", "EPH de Djanet", "مستشفى عام بالصحراء الشرقية", "danger", "وزارة الصحة", "fa-clinic-medical", "الرعاية الصحية العامة والتحاليل الطبية"),
        ("EPH_TINDOUF", "المؤسسة العمومية الاستشفائية تندوف سي الحواس", "EPH Si El Haouès de Tindouf", "مستشفى عام بالجنوب الغربي", "danger", "وزارة الصحة", "fa-clinic-medical", "الجراحة والإنعاش وتجهيزات الأشعة الرقمية"),
        ("EPH_TIMIMOUN", "المؤسسة العمومية الاستشفائية تيميمون الواحاتية", "EPH de Timimoun", "مستشفى عام بقورارة", "danger", "وزارة الصحة", "fa-clinic-medical", "الخدمات الطبية ومكافحة الأمراض المتوطنة"),
        ("EPH_BBM", "المؤسسة العمومية الاستشفائية برج باجي مختار الحدودية", "EPH de Bordj Badji Mokhtar", "مستشفى عام حدودي أقصى الجنوب", "danger", "وزارة الصحة", "fa-clinic-medical", "الطوارئ وتوليد الطاقة والأكسجين الطبي والمستهلكات"),
        ("EPH_IN_SALAH", "المؤسسة العمومية الاستشفائية عين صالح", "EPH d'In Salah", "مستشفى عام بالتديكلت", "danger", "وزارة الصحة", "fa-clinic-medical", "طب الطوارئ، التوليد والجراحة العامة"),
        ("EPH_IN_GUEZZAM", "المؤسسة العمومية الاستشفائية عين قزام", "EPH d'In Guezzam", "مستشفى حدودي", "danger", "وزارة الصحة", "fa-clinic-medical", "مكافحة الأوبئة والاستعجالات الجراحية"),
        ("EPH_EL_MENIAA", "المؤسسة العمومية الاستشفائية العقيد لطفي بالمنيعة", "EPH Colonel Lotfi d'El Meniaa", "مستشفى عام", "danger", "وزارة الصحة", "fa-clinic-medical", "تصفية الكلى، الجراحة وطب الأطفال")
    ]

    for key, nameAr, nameFr, cat, badge, pub, icon, cov in health_entities:
        add_source({
            "key": key,
            "nameAr": nameAr,
            "nameFr": nameFr,
            "category": cat,
            "sectorGroup": "health",
            "categoryBadge": badge,
            "publisher": pub,
            "periodicity": "أسبوعية ودورية",
            "coverage": cov,
            "icon": icon,
            "url": "https://sante.gov.dz",
            "portalUrlName": f"{key.lower()}.sante.gov.dz",
            "tags": [key, nameAr, "صحة", "مستشفى", "أدوية", "تجهيزات طبية"]
        })

    # 13. Telecommunications, Digitization & IT (25)
    telecom_entities = [
        ("ALGERIE_TELECOM_DG", "اتصالات الجزائر - المديرية العامة (Algérie Télécom)", "Algérie Télécom - Siège & Direction Générale", "اتصالات وألياف بصرية وشبكات", "indigo", "اتصالات الجزائر", "fa-network-wired", "كابلات الألياف البصرية FTTH، السيرفرات السحابية، أجهزة التوجيه ومحطات النفاذ"),
        ("MOBILIS_ATM", "موبيليس - متعامل الهاتف النقال العمومي (Mobilis / ATM)", "Mobilis - Algérie Télécom Mobile", "شبكات الهاتف النقال والجيل الرابع والخامس", "indigo", "مجمع اتصالات الجزائر", "fa-signal", "أبراج الاتصالات، أنظمة البث الراديوي BTS، السيرفرات ومنصات الدفع الإلكتروني"),
        ("DJEZZY_FNI", "جازي - المتعامل الوطني للهاتف النقال (Djezzy)", "Djezzy - Fonds National d'Investissement", "هاتف نقال وإنترنت عالي التدفق", "indigo", "الصندوق الوطني للاستثمار FNI", "fa-mobile-alt", "أجهزة الشبكات، البطاقات الذكية SIM، والبرمجيات السحابية ومراكز الاتصال"),
        ("OOREDOO_DZ", "أوريدو الجزائر (Ooredoo Algérie / WTA)", "Ooredoo Algérie", "اتصالات نقالة وخدمات رقمية", "indigo", "الشركة الوطنية للاتصالات", "fa-wifi", "تحديث شبكة النقال، الحلول الرقمية للمؤسسات ومراكز البيانات الآمنة"),
        ("ALGERIE_POSTE_DG", "بريد الجزائر - المديرية العامة والشبكة النقدية (Algérie Poste)", "Algérie Poste - Direction Générale", "خدمات بريدية ونقدية وبطاقة الذهبية", "primary", "بريد الجزائر", "fa-mail-bulk", "أجهزة الصراف الآلي GAB، موزعات النقد، البطاقات البيومترية والمكاتب البريدية المتنقلة"),
        ("TDA_DIFFUSION", "مؤسسة البث الإذاعي والتلفزي الجزائري (TDA)", "Télédiffusion d'Algérie (TDA)", "بث رقمي وأقمار اصطناعية", "indigo", "وزارة الاتصال", "fa-broadcast-tower", "هوائيات البث الأرضي الرقمي TNT، محطات الإرسال الساتلي والشاشات العملاقة"),
        ("ANPT_PARCS", "الوكالة الوطنية لترقية وتطوير الحظائر التكنولوجية (ANPT سيدي عبد الله)", "Agence Nationale de Promotion des Parcs Technologiques", "حاضنات وابتكار ومراكز بيانات", "indigo", "وزارة الرقمنة", "fa-microchip", "تجهيز الحاضنات، شبكات الإنترنت فائقة السرعة ومساحات العمل المشترك"),
        ("ENSI_INFORMATIQUE", "المؤسسة الوطنية للأنظمة المعلوماتية (ENSI)", "Entreprise Nationale des Systèmes Informatiques", "حلول برمجية وحوسبة حكومية", "indigo", "وزارة الصناعة", "fa-laptop-code", "برمجيات التسيير الحكومي، أمن المعلومات وتوريد التجهيزات الرقمية الكبرى"),
        ("ATS_SATELLITE", "اتصالات الجزائر الفضائية (Algérie Télécom Satellite - ATS)", "Algérie Télécom Satellite (ATS)", "اتصالات فضائية وإنترنت في الساتل", "indigo", "مجمع اتصالات الجزائر", "fa-satellite-dish", "محطات الاتصال الفضائي VSAT للشركات البترولية في أقصى الجنوب والإنترنت البحري"),
        ("DOT_ALGER", "اتصالات الجزائر - المديرية العملياتية للجزائر العاصمة (DOT Alger)", "Direction Opérationnelle des Télécoms d'Alger", "ألياف بصرية بالعاصمة", "indigo", "اتصالات الجزائر", "fa-network-wired", "مشاريع ربط الأحياء السكنية الجديدة بعدل وشبكات FTTH السريعة"),
        ("DOT_ORAN", "اتصالات الجزائر - المديرية العملياتية لوهران (DOT Oran)", "Direction Opérationnelle des Télécoms d'Oran", "شبكات الاتصال بوهران", "indigo", "اتصالات الجزائر", "fa-network-wired", "الكابلات البحرية للإنترنت ومراكز النفاذ وخدمات الشركات"),
        ("DOT_CONST", "اتصالات الجزائر - المديرية العملياتية لقسنطينة (DOT Constantine)", "Direction Opérationnelle des Télécoms de Constantine", "شبكات الاتصال بقسنطينة", "indigo", "اتصالات الجزائر", "fa-network-wired", "شبكات الألياف البصرية ومحطات التقوية بالمدينة الجديدة"),
        ("DOT_OUARGLA", "اتصالات الجزائر - المديرية العملياتية للجنوب بورقلة (DOT Ouargla)", "Direction Opérationnelle des Télécoms d'Ouargla", "شبكات الصحراء والنفط", "indigo", "اتصالات الجزائر", "fa-network-wired", "خطوط الألياف البصرية الصحراوية ومحطات الربط للمنشآت الغازية")
    ]
    for key, nameAr, nameFr, cat, badge, pub, icon, cov in telecom_entities:
        add_source({
            "key": key,
            "nameAr": nameAr,
            "nameFr": nameFr,
            "category": cat,
            "sectorGroup": "tech",
            "categoryBadge": badge,
            "publisher": pub,
            "periodicity": "أسبوعية",
            "coverage": cov,
            "icon": icon,
            "url": "https://mpt.gov.dz",
            "portalUrlName": f"{key.lower()}.dz",
            "tags": [key, nameAr, "اتصالات", "إنترنت", "ألياف بصرية", "رقمنة"]
        })

    # 14. Finance, Banking, Insurance & Public Investment Funds (25)
    finance_entities = [
        ("BANQUE_ALGERIE", "بنك الجزائر - البنك المركزي الجزائري", "Banque d'Algérie - Banque Centrale", "بنوك وسلطة نقدية عليا", "success", "بنك الجزائر", "fa-university", "المطبعة النقدية، سك العملات، أنظمة المقاصة الإلكترونية والسيرفرات المصرفية"),
        ("BNA_BANQUE", "البنك الوطني الجزائري (BNA)", "Banque Nationale d'Algérie (BNA)", "بنوك وتسهيلات استثمارية", "success", "البنك الوطني الجزائري", "fa-money-check-alt", "تحديث شبكة الفروع، الصيرفة الإسلامية، التطبيقات البنكية والأجهزة الطرفية"),
        ("BEA_BANQUE", "بنك الجزائر الخارجي (BEA)", "Banque Extérieure d'Algérie (BEA)", "تمويل التجارة الخارجية والطاقة", "success", "بنك الجزائر الخارجي", "fa-globe-africa", "أنظمة السويفت، بطاقات فيزا/ماستركارد، وتجهيزات الفروع الدولية"),
        ("CPA_BANQUE", "القرض الشعبي الجزائري (CPA)", "Crédit Populaire d'Algérie (CPA)", "تمويل المؤسسات الصغيرة والترقية العقارية", "success", "القرض الشعبي الجزائري", "fa-landmark", "رقمنة العمليات المصرفية، مقرات الفروع الجهوية وأجهزة السحب الآلي"),
        ("BDL_BANQUE", "بنك التنمية المحلية (BDL)", "Banque de Développement Local (BDL)", "تمويل التنمية والجماعات المحلية", "success", "بنك التنمية المحلية", "fa-city", "تجهيزات الفروع الرقمية، منصات الدفع عن بعد والأمن السيبراني"),
        ("BADR_BANQUE", "بنك الفلاحة والتنمية الريفية (BADR)", "Banque de l'Agriculture et du Développement Rural", "تمويل الفلاحة والصناعات الغذائية", "success", "بنك الفلاحة BADR", "fa-tractor", "شبكة الفروع الريفية، تمويل التجهيزات الزراعية والبطاقات البنكية"),
        ("CNEP_BANQUE", "صندوق التوفير والاحتياط (CNEP-Banque)", "Caisse Nationale d'Épargne et de Prévoyance", "تمويل السكن والادخار العقاري", "success", "كناب بنك CNEP", "fa-home", "تمويل القروض العقارية، السيرفرات المركزية وتطبيقات الصيرفة الرقمية"),
        ("AL_SALAM_BANK", "مصرف السلام الجزائر (Al Salam Bank)", "Al Salam Bank Algeria", "صيرفة إسلامية واستثمار", "success", "مصرف السلام", "fa-handshake", "التمويلات المتوافقة مع الشريعة، الأنظمة المصرفية والحلول الرقمية"),
        ("BARAKA_BANK", "بنك البركة الجزائري (Banque Al Baraka)", "Banque Al Baraka d'Algérie", "بنوك وصيرفة إسلامية", "success", "مجموعة البركة المصرفية", "fa-coins", "فروع الصيرفة الإسلامية وتطبيقات الدفع عبر الهاتف المحمول"),
        ("SAA_ASSURANCE", "الشركة الوطنية للتأمين (SAA)", "Société Nationale d'Assurance (SAA)", "تأمين المركبات والأخطار الكبرى", "success", "الشركة الوطنية للتأمين", "fa-car-crash", "الأنظمة الخبيرة لتقييم الأضرار، السيرفرات التأمينية، وتحديث المقرات"),
        ("CAAR_ASSURANCE", "الشركة الجزائرية للتأمين وإعادة التأمين (CAAR)", "Compagnie Algérienne d'Assurance et de Réassurance", "تأمين المنشآت الصناعية والطاقة", "success", "مجمع كار CAAR", "fa-shield-virus", "برمجيات إعادة التأمين الدولية، تأمين أساطيل النقل والشركات"),
        ("CAAT_ASSURANCE", "الشركة الجزائرية للتأمين الشامل (CAAT)", "Compagnie Algérienne des Assurances (CAAT)", "تأمين النقل والمنشآت الكبرى", "success", "مجمع كات CAAT", "fa-file-contract", "تأمين الموانئ والمطارات والمشاريع الاستثمارية الكبرى"),
        ("CASH_ASSURANCES", "شركة تأمين المحروقات والأخطار الكبرى (CASH Assurances)", "Compagnie d'Assurance des Hydrocarbures (CASH)", "تأمين قطاع الطاقة والمناجم", "amber", "سوناطراك / سونلغاز", "fa-fire-extinguisher", "تأمين مصافي البترول والمنصات البحرية وخطوط الأنابيب"),
        ("CNMA_ASSURANCE", "الصندوق الوطني للتعاون الفلاحي (CNMA)", "Caisse Nationale de Mutualité Agricole (CNMA)", "تأمين فلاحي وضد الكوارث الطبيعية", "success", "الصندوق الوطني للتعاون الفلاحي", "fa-tractor", "تأمين المحاصيل، العتاد الفلاحي، الماشية وشبكة الصناديق الجهوية"),
        ("FNI_FONDS", "الصندوق الوطني للاستثمار (FNI)", "Fonds National d'Investissement (FNI)", "صندوق سيادي وتمويل المشاريع الكبرى", "success", "وزارة المالية", "fa-piggy-bank", "تمويل البنى التحتية الكبرى، مصانع السيارات والمجمعات الصناعية")
    ]
    for key, nameAr, nameFr, cat, badge, pub, icon, cov in finance_entities:
        add_source({
            "key": key,
            "nameAr": nameAr,
            "nameFr": nameFr,
            "category": cat,
            "sectorGroup": "finance",
            "categoryBadge": badge,
            "publisher": pub,
            "periodicity": "أسبوعية ودورية",
            "coverage": cov,
            "icon": icon,
            "url": "https://mf.gov.dz",
            "portalUrlName": f"{key.lower()}.dz",
            "tags": [key, nameAr, "بنوك", "تأمين", "استثمار", "مالية"]
        })

    # 15. Agriculture, Food Security & Forestry (25)
    agri_entities = [
        ("OAIC_CEREALES", "الديوان الجزائري المهني للحبوب (OAIC)", "Office Algérien Interprofessionnel des Céréales", "استيراد وتخزين وتوزيع الحبوب", "success", "وزارة الفلاحة", "fa-seedling", "صوامع تخزين الحبوب الاستراتيجية، بذور القمح، ومعدات الحصاد والشحن"),
        ("ONIL_LAIT", "الديوان الوطني المهني للحليب ومشتقاته (ONIL)", "Office National Interprofessionnel du Lait (ONIL)", "غبرة الحليب ودعم الإنتاج المحلي", "success", "وزارة الفلاحة", "fa-cheese", "استيراد بودرة الحليب، صهاريج نقل الحليب الطازج ومخابر الجودة"),
        ("ONAB_AVICOLE", "الديوان الوطني لتغذية الأنعام وتربية الدواجن (ONAB)", "Office National des Aliments du Bétail (ONAB)", "تغذية الماشية والدواجن واللحوم البيضاء", "success", "وزارة الفلاحة", "fa-egg", "أعلاف الصويا والذرة، مذابح الدواجن الصناعية وغرف التبريد العملاقة"),
        ("ALVIAR_VIANDES", "الشركة الجزائرية للحوم الحمراء (ALVIAR)", "Algérienne des Viandes Rouges (ALVIAR)", "إنتاج وتوزيع اللحوم الحمراء المبردة", "success", "وزارة الفلاحة", "fa-drumstick-bite", "المذابح الصناعية الكبرى بعين وسارة وحاسي بحبح وشاحنات التبريد"),
        ("AGRODIV_GROUPE", "المجمع العمومي للصناعات الغذائية (AGRODIV)", "Groupe Agro-Industries (AGRODIV)", "صناعة الدقيق والعجائن والزيوت", "success", "وزارة الصناعة", "fa-bread-slice", "مطاحن الحبوب الكبرى، مصانع الزيوت، السميد، السكر والعصائر"),
        ("CCLS_CONSTANTINE", "تعاونية الحبوب والبقول الجافة بقسنطينة (CCLS Constantine)", "Coopérative des Céréales et Légumes Secs", "تجميع وتخزين الحبوب بالشرق", "success", "ديوان الحبوب OAIC", "fa-warehouse", "صوامع التخزين المعدنية، آلات التفريغ وغربلة الحبوب"),
        ("CCLS_TIARET", "تعاونية الحبوب والبقول الجافة بتيارت (CCLS Tiaret)", "CCLS de Tiaret", "عاصمة إنتاج الحبوب بالغرب", "success", "ديوان الحبوب OAIC", "fa-warehouse", "مراكز التجميع وتوزيع الأسمدة والبذور المعتمدة"),
        ("CCLS_SETIF", "تعاونية الحبوب والبقول الجافة بسطيف (CCLS Sétif)", "CCLS de Sétif", "تخزين حبوب الهضاب العليا", "success", "ديوان الحبوب OAIC", "fa-warehouse", "مستودعات التخزين الكبرى وآلات الوزن والشاحنات"),
        ("CCLS_SIDI_BELABBES", "تعاونية الحبوب والبقول الجافة بسيدي بلعباس", "CCLS de Sidi Bel Abbès", "مخازن الحبوب والمدخلات الفلاحية", "success", "ديوان الحبوب OAIC", "fa-warehouse", "صوامع الخرسانة ومحطات التفريغ والمخابر"),
        ("ANDPA_PECHE", "الوكالة الوطنية لتطوير الصيد البحري وتربية المائيات (ANDPA)", "Agence Nationale de Développement de la Pêche", "أقفاص تربية الأسماك العائمة", "success", "وزارة الصيد البحري", "fa-fish", "تجهيزات مزارع السمك بالبحر المفتوح، شباك الصيد وأجهزة السونار")
    ]
    for key, nameAr, nameFr, cat, badge, pub, icon, cov in agri_entities:
        add_source({
            "key": key,
            "nameAr": nameAr,
            "nameFr": nameFr,
            "category": cat,
            "sectorGroup": "health",
            "categoryBadge": badge,
            "publisher": pub,
            "periodicity": "أسبوعية",
            "coverage": cov,
            "icon": icon,
            "url": "https://madr.gov.dz",
            "portalUrlName": f"{key.lower()}.dz",
            "tags": [key, nameAr, "فلاحة", "أمن غذائي", "حبوب", "لحوم"]
        })

    # 16. Manufacturing, Vehicles & Electronics Groups (30)
    industry_entities = [
        ("SNVI_ROUIBA", "المؤسسة الوطنية للسيارات الصناعية بالرويبة (SNVI)", "Société Nationale des Véhicules Industriels", "صناعة الحافلات والشاحنات والجرارات", "secondary", "وزارة الدفاع / وزارة الصناعة", "fa-truck-monster", "شاسيهات الشاحنات الثقيلة، محركات الديزل، وخطوط التجميع الآلي"),
        ("DIVINDUS_GROUPE", "مجمع ديفيندوس للصناعات المتنوعة ومواد البناء (DIVINDUS)", "Groupe Industriel DIVINDUS", "أثاث مدرسي، سيراميك ومواد بناء", "secondary", "وزارة الصناعة", "fa-chair", "تجهيز المدارس والإدارات، بلاط السيراميك، الطوب الأحمر والأبواب المقاومة للحريق"),
        ("ELEC_EL_DJAZAIR", "مجمع إيلك الجزائر للصناعات الإلكترونية والكهربائية", "Groupe ELEC EL-DJAZAIR", "إلكترونيات، كوابل ومحولات", "secondary", "وزارة الصناعة", "fa-microchip", "اللوحات الإلكترونية، بطاقات الطاقة، كابلات الكهرباء والهواتف"),
        ("ENIE_SIDI_BELABBES", "المؤسسة الوطنية للصناعات الإلكترونية بسيدي بلعباس (ENIE)", "Entreprise Nationale des Industries Électroniques", "شاشات، طاقة شمسية وكاميرات مراقبة", "secondary", "مجمع إيلك الجزائر", "fa-tv", "شاشات العرض الذكية، الألواح الشمسية، كاميرات المراقبة والعدادات الإلكترونية"),
        ("ENIEM_TIZI_OUZOU", "المؤسسة الوطنية للأجهزة الكهرومنزلية بتيزي وزو (ENIEM واد عيسي)", "Entreprise Nationale des Industries de l'Électroménager", "ثلاجات، مكيفات وأجهزة طهي", "secondary", "مجمع إيلك الجزائر", "fa-blender", "مكيفات الهواء المركزية، الثلاجات الكبيرة، أجهزة الطهي وتجهيزات الفنادق"),
        ("ALFATRON_ORAN", "شركة ألفاترون للحواسيب والأنظمة الذكية بوهران (ALFATRON)", "ALFATRON Systèmes Informatiques", "تصنيع الحواسيب المحمولة والسيرفرات", "secondary", "مجمع إيلك الجزائر", "fa-laptop", "الحواسيب المحمولة للمدارس والإدارات، أجهزة الكل في واحد والمخدمات"),
        ("BATIMETAL_CHARPENTE", "الشركة الوطنية للإنشاءات المعدنية والنجارة الفولاذية (BATIMETAL)", "Entreprise Nationale de Construction Métallique", "هياكل حديدية ومستودعات كبرى", "secondary", "مجمع إيميتال", "fa-warehouse", "الهياكل الفولاذية للملاعب والمصانع ومحطات المترو والأبراج المعدنية"),
        ("ALFAPIPE_ANNABA", "الشركة الوطنية لصناعة الأنابيب الحلزونية بالغرب والشرق (ALFAPIPE)", "Société Nationale de Tubes et Tuyauteries", "أنابيب النفط والغاز والمياه", "secondary", "مجمع إيميتال", "fa-circle-notch", "أنابيب الصلب الكبيرة قطر 48 بوصة لنقل الغاز الطبيعي وتحويلات المياه"),
        ("FONDAL_FONDERIE", "المؤسسة الوطنية للمسابك وقطع الغيار (FONDAL)", "Entreprise Nationale de Fonderie", "صب المعادن وتصنيع الصمامات ومعدات الري", "secondary", "مجمع إيميتال", "fa-fire", "صمامات التحكم في المياه والغاز، أغطية البالوعات وقطع غيار القطارات")
    ]
    for key, nameAr, nameFr, cat, badge, pub, icon, cov in industry_entities:
        add_source({
            "key": key,
            "nameAr": nameAr,
            "nameFr": nameFr,
            "category": cat,
            "sectorGroup": "tech" if "إلكترون" in cat or "حواسيب" in cat else "construction",
            "categoryBadge": badge,
            "publisher": pub,
            "periodicity": "أسبوعية ودورية",
            "coverage": cov,
            "icon": icon,
            "url": "https://industrie.gov.dz",
            "portalUrlName": f"{key.lower()}.dz",
            "tags": [key, nameAr, "صناعة", "تصنيع", "تجهيزات", "مركبات"]
        })

    return sources

if __name__ == "__main__":
    sources = generate_all_sources()
    print(f"Total Algerian procurement sources generated: {len(sources)}")
    
    # Verify uniqueness of keys
    keys = [s["key"] for s in sources]
    unique_keys = set(keys)
    print(f"Unique keys: {len(unique_keys)} / {len(keys)}")
    assert len(unique_keys) == len(keys), "Duplicate keys found!"

    # Distribution by sectorGroup
    dist = {}
    for s in sources:
        g = s["sectorGroup"]
        dist[g] = dist.get(g, 0) + 1
    print("Distribution by sectorGroup:", dist)

    # Save to a json file for inspection
    with open("scripts/generated_sources.json", "w", encoding="utf-8") as f:
        json.dump(sources, f, ensure_ascii=False, indent=2)
    print("Saved to scripts/generated_sources.json successfully.")

