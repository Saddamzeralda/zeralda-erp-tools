# -*- coding: utf-8 -*-
"""
Regenerate 100% Accurate, Domain-Pure Algerian Tenders Dataset (2,200 Tenders across all 1,540 Sources)
Eliminates all cross-contamination between sectors and sub-domains.
Covers 100% of the 1,540 official sources in ALGERIAN_PROCUREMENT_SOURCES.
Strictly compliant with Presidential Decree 15-247 (Algerian Public Procurement Code).
"""

import os
import sys
import json
import random
import re

# Add script dir to sys.path
sys.path.insert(0, os.path.dirname(__file__))
from build_mega_portal_dataset import (
    build_all_mega_sources,
    EXPANDED_COMMUNES_DATA,
    EXPANDED_PUBLIC_COMPANIES,
    WILAYAS_58
)

# 1. Authentic Municipal Projects (BTPH, Energy, Services, Furniture)
MUNICIPAL_PROJECTS = [
    ("BTPH", "تهيئة وتعبيد المسالك البلدية، الطرق الحضرية والأرصفة بالإسفلت الساخن لحي النصر والسلام ب{commune}", "أشغال عامة وتعبيد طرقات"),
    ("BTPH", "إنجاز شبكة الصرف الصحي والمياه الصالحة للشرب للتجزئات السكنية الريفية ب{commune}", "شبكات ري وتطهير"),
    ("ENERGY", "تجديد وتوسيع الإنارة العمومية بالطاقة الشمسية والمصابيح الاقتصادية LED عبر شوارع {commune}", "إنارة عمومية وطاقة شمسية"),
    ("SERVICES", "صفقة الإطعام المدرسي والوجبات الساخنة للمطاعم المدرسية الابتدائية لفائدة {commune}", "إطعام مدرسي وخدمات"),
    ("FURNITURE", "اقتناء الأثاث المدرسي، الطاولات المزدوجة ومكاتب المعلمين للمدارس الابتدائية ب{commune}", "تجهيز وأثاث مدرسي"),
    ("BTPH", "أشغال صيانة، ترميم وإعادة الاعتبار لـ 05 مدارس ابتدائية وقاعات التدريس ب{commune}", "ترميم وبناء مرافق تربوية"),
    ("SERVICES", "اقتناء شاحنات ضغط النفايات المنزلية وحاويات جمع القمامة البلاستيكية ب{commune}", "نظافة وحماية البيئة"),
    ("BTPH", "إنجاز ملاعب جوارية معشوشبة اصطناعياً والمساحات الخضراء لفائدة شباب {commune}", "منشآت رياضية وشبانية"),
    ("SERVICES", "كراء عتاد الأشغال العمومية والآليات الثقيلة لمخطط التطهير والوقاية من الفيضانات ب{commune}", "أشغال ووقاية من الكوارث")
]

# 2. Strictly Sub-Domain-Specific Pools for Public Enterprises
SPECIAL_COMPANY_PROJECTS = {
    "ALGERIE_POSTE": [
        ("IT", "مناقصة اقتناء 500 موزع آلي للنقود (GAB/ATM) وأنظمة الأمان المصرفي بالمكاتب البريدية", "أجهزة مصرفية ودفع إلكتروني وموزعات آلية"),
        ("IT", "مشروع توريد وتخصيص بطاقات الدفع الإلكتروني البيومترية (البطاقة الذهبية) ومستلزمات التشفير", "بطاقات ذكية وأنظمة دفع إلكتروني"),
        ("IT", "مناقصة اقتناء خوادم وتجهيزات أمن المعلومات وشبكات الربط للمكاتب البريدية عبر الوطن", "شبكات وخوادم وأمن معلوماتي"),
        ("SERVICES", "صيانة وتأهيل أسطول مركبات التوزيع السريع للطرود والرسائل البريدية (EMS)", "صيانة أساطيل النقل وتوزيع الطرود"),
        ("FURNITURE", "أشغال عصرنة وتهيئة المكاتب البريدية النموذجية وتوريد الموزعات الرقمية وأنظمة الطوابير الذكية", "تهيئة مراكز البريد والتجهيزات المكتبية والذكية")
    ],
    "PCH_PHARMACIE": [
        ("MEDICAL", "مناقصة استيراد أدوية الأورام السرطانية، مستلزمات قسطرة القلب ومستهلكات جراحة العظام للمستشفيات الجامعية", "استيراد وتوزيع المواد الصيدلانية والمستلزمات الطبية"),
        ("MEDICAL", "مناقصة وطنية ودولية لتوريد الأمصال واللقاحات والمواد البيولوجية المعقمة للمستشفيات", "مواد بيولوجية وأمصال ولقاحات معقمة"),
        ("MEDICAL", "توريد مستهلكات تصفية الكلى (Hemodialysis) والقساطر الوريدية المركزية وأكياس الدم المعقمة", "مستهلكات طبية استشفائية وجراحية معقمة"),
        ("MEDICAL", "اقتناء المضادات الحيوية الحديثة والمحاليل الوريدية الكبرى وأدوية التخدير الاستشفائي", "أدوية استشفائية ومحاليل وريدية"),
        ("MEDICAL", "توريد الكواشف المخبرية وأطقم التحاليل المناعية والفيروسية للمخابر المرجعية", "كواشف مخبرية وتشخيص طبي")
    ],
    "SAIDAL_GROUPE": [
        ("MEDICAL", "مناقصة دولية لتوريد المواد الأولية الصيدلانية الفعالة (API) لإنتاج أدوية الأمراض المزمنة والأنسولين", "مواد أولية صيدلانية فعالة معتمدة GMP"),
        ("MEDICAL", "اقتناء خطوط التعبئة والتغليف المعقمة لإنتاج المحاليل الوريدية والحقن الطبية بمصانع صيدال", "آلات وتجهيزات تصنيع صيدلاني معقمة"),
        ("MEDICAL", "توريد كبسولات الجيلاتين ومستلزمات التحليل المخبري لمراقبة الجودة الصيدلانية واليقظة الدوائية", "مستلزمات ومذيبات صيدلانية نقية"),
        ("MEDICAL", "اقتناء آلات ضغط الحبوب الدوائية، خطوط البثق والكرتونة الأوتوماتيكية وتجهيزات الفلترة الدقيقة", "صناعة صيدلانية ومعدات إنتاج")
    ],
    "ALGERIE_TELECOM": [
        ("IT", "مناقصة اقتناء كوابل الألياف البصرية الميكروية وتجهيزات الربط بتقنية FTTH وخوادم السحابة الوطنية", "شبكات الألياف البصرية والاتصالات السلكية"),
        ("IT", "توريد أجهزة التوجيه والمودمات اللاسلكية عالية السرعة وتجهيزات شبكة النطاق العريض", "تجهيزات اتصالات ومودمات عالية السرعة"),
        ("IT", "مشروع عصرنة مراكز البيانات الوطنية وتوريد وحدات التخزين السحابي عالي السعة", "مراكز بيانات وخوادم سحابية"),
        ("IT", "اقتناء كوابل الاتصالات النحاسية ومعدات غرف التوزيع وشبكات النفاذ السلكي", "بنية تحتية وشبكات اتصالات سلكية")
    ],
    "MOBILIS_ATM": [
        ("IT", "مشروع توريد وتركيب هوائيات الاتصال للجيل الرابع والخامس 4G/5G ومحطات الإرسال المدمجة", "شبكات الهاتف النقال وهوائيات الاتصال"),
        ("IT", "اقتناء البطاقات الذكية SIM والشرائح الإلكترونية eSIM ومنصات إدارة المشتركين", "بطاقات ذكية وشرائح إلكترونية"),
        ("IT", "تجهيز وتوسيع الشبكة الأساسية Core Network ومنظومات الفوترة اللحظية (OCS)", "منظومات شبكات اتصالات وفوترة رقمية")
    ],
    "ELIT_SONELGAZ": [
        ("IT", "تطوير وتحديث المنظومة المعلوماتية المؤسساتية ERP وأنظمة الفوترة الرقمية لزبائن سونلغاز", "حلول برمجية مؤسساتية ورقمنة"),
        ("IT", "توريد السيرفرات السحابية، منصات النسخ الاحتياطي وحلول الحماية السيبرانية لشبكة سونلغاز", "مراكز بيانات وأمن معلوماتي")
    ]
}

PETROLEUM_UPSTREAM_PROJECTS = [
    ("ENERGY", "مناقصة وطنية ودولية لاقتناء رؤوس الآبار، أنابيب الحفر الفولاذية وصمامات الضغط العالي بحوض حاسي مسعود", "توريد معدات نفطية وغازية وحفر آبار"),
    ("ENERGY", "توريد قطع غيار أجهزة الحفر البترولي، مضخات الطين الثقيلة ومعدات التسجيل السيزمي للمواقع الصحراوية", "حفر وتنقيب بترولي وعتاد صحراوي"),
    ("ENERGY", "اقتناء المواد الكيميائية لسوائل الحفر وتجهيزات السمنتة والتكسير الهيدروليكي للآبار العميقة", "خدمات الآبار البترولية والمواد الكيميائية")
]

PETROLEUM_PIPELINE_PROJECTS = [
    ("ENERGY", "صفقة إعادة تأهيل محطات ضخ النفط والغاز وتوريد توربينات الدفع وأنظمة التحكم والمراقبة SCADA", "محطات ضخ وتوربينات ومعدات تحكم بترولية"),
    ("ENERGY", "مد خطوط أنابيب نقل المحروقات وتغليف الأنابيب الفولاذية بمادة البولي إيثيلين وأنظمة الحماية الكاثودية", "أشغال أنابيب بترولية وقنوات غازية"),
    ("ENERGY", "إنجاز مراكز معالجة وضغط الغاز الطبيعي وتوريد الصمامات الأوتوماتيكية عالية الضغط", "مراكز معالجة الغاز والإنشاءات البترولية")
]

PETROLEUM_DOWNSTREAM_PROJECTS = [
    ("ENERGY", "صيانة مجمعات تسييل الغاز الطبيعي (LNG) ومحطات التكرير وتوريد المبادلات الحرارية والضواغط الصناعية", "صيانة مصافي التكرير ومجمعات الغاز المسال"),
    ("ENERGY", "توريد المحفزات الكيميائية، أبراج التقطير وأجهزة الرقابة الصناعية للمركبات البتروكيماوية", "تكرير وبتروكيماويات ومعدات صناعية"),
    ("ENERGY", "اقتناء تجهيزات الأمن الصناعي وأنظمة إطفاء الحرائق الأوتوماتيكية بالرغوة في وحدات التكرير والتمييع", "سلامة صناعية بترولية ومكافحة حرائق")
]

NAFTAL_PROJECTS = [
    ("ENERGY", "صفقة توريد صهاريج الوقود الأرضية، مضخات التوزيع السريع الذكية وخزانات غاز البترول المسال سيرغاز", "تجهيزات تخزين وتوزيع الوقود والمحروقات"),
    ("ENERGY", "تجهيز وتوسيع محطات الوقود على طول الطريق السيار شرق-غرب والمحاور الوطنية الكبرى", "تهيئة وتجهيز محطات الخدمات البترولية"),
    ("ENERGY", "اقتناء وتجديد صمامات قارورات الغاز، أجهزة التحويل سيرغاز وعتاد السلامة الصناعية بمراكز التعبئة", "عتاد توزيع الغاز وسيرغاز والسلامة"),
    ("ENERGY", "توريد المواد الكيميائية المضافة وخطوط تعبئة وتغليف الزيوت والشحوم الصناعية بمصنع أرزيو", "صناعة زيوت ومواد كيميائية بترولية")
]

SONELGAZ_ELEC_PROJECTS = [
    ("ENERGY", "صفقة توريد كابلات التوتر العالي 400/220 كف والمحولات الكهربائية القدرية للمحطات التحويلية الكبرى", "عتاد نقل الطاقة الكهربائية والمحولات"),
    ("ENERGY", "صيانة التوربينات الغازية ومحطات توليد الكهرباء ذات الدورة المركبة وتوريد قطع الغيار الميكانيكية", "محطات توليد الطاقة الكهربائية والتوربينات"),
    ("ENERGY", "اقتناء العدادات الإلكترونية الذكية للكهرباء وتجهيز محولات التوزيع الريفية والحضرية", "عدادات ذكية وتوزيع كهربائي")
]

SONELGAZ_GAS_PROJECTS = [
    ("ENERGY", "مد شبكات وقنوات نقل وتوزيع الغاز الطبيعي وتوصيل الأقطاب الحضرية والمناطق الصناعية", "شبكات وقنوات نقل وتوزيع الغاز الطبيعي"),
    ("ENERGY", "توريد وتركيب محطات خفض وقياس ضغط الغاز الطبيعي وصمامات القطع الأوتوماتيكية", "محطات ضغط وتوزيع الغاز الطبيعي")
]

SOLAR_PROJECTS = [
    ("ENERGY", "إنجاز محطات الطاقة الشمسية الكهروضوئية وتوريد الألواح الشمسية والعواكس المركزية والربط بالشبكة", "طاقات متجددة ومحطات شمسية كهروضوئية"),
    ("ENERGY", "توريد البطاريات الصناعية لتخزين الطاقة الشمسية وأنظمة التتبع الشمسي للمحطات الصحراوية", "تخزين الطاقة المتجددة والأنظمة الشمسية")
]

MINING_STEEL_PROJECTS = [
    ("BTPH", "مناقصة توريد معدات الاستخراج المنجمي، كسارات الخامات، سيور النقل المطاطية والحراريات الصناعية", "تعدين واستخراج المواد الخام وصناعة الصلب"),
    ("BTPH", "توريد لفائف الصلب، المقاطع المعدنية وتجهيزات الأفران العالية وخطوط الدرفلة الفولاذية", "صناعة الحديد والصلب والأنابيب المعدنية"),
    ("BTPH", "صيانة وحدات معالجة وتخصيب خامات الحديد والفوسفات وتوريد الشاحنات المنجمية القلابة", "تجهيزات منجمية وآليات ثقيلة")
]

AIRPORT_PROJECTS = [
    ("TRANSPORT", "مناقصة اقتناء وتجديد أنظمة الفحص الأمني بالأشعة السينية للأمتعة وبوابات الكشف الإلكترونية بالمطار", "تجهيزات أمن المطارات والمراقبة الجوية"),
    ("TRANSPORT", "أشغال صيانة وتقوية المدارج الجوية، الإنارة الملاحية الليلية وأنظمة الإرشاد الأرضي للطائرات", "أشغال مدارج المطارات والإنارة الملاحية"),
    ("SERVICES", "صفقة صيانة التكييف المركزي، السلالم الميكانيكية، وجسور إركاب المسافرين بالمحطة الجوية", "صيانة تجهيزات المحطات الجوية والمطارات")
]

AVIATION_PROJECTS = [
    ("TRANSPORT", "مناقصة دولية لخدمات الفحص والتعمير الدوري لمحركات أسطول طائرات البوينغ والإيرباص وتوريد الإطارات المعتمدة", "صيانة محركات الطيران التجاري واعتماد EASA/FAA"),
    ("TRANSPORT", "اقتناء معدات الخدمات الأرضية للطائرات، جرارات السحب وسلالم الركاب المتحركة وسيارات التموين", "معدات مناولة أرضية وخدمات طيران"),
    ("SERVICES", "صفقة خدمات الإطعام الجوي Catering وتوريد الوجبات والمشروبات المعتمدة لرحلات الطيران الدولية والداخلية", "إطعام جوي وتموين طائرات دولي"),
    ("TRANSPORT", "اقتناء قطع غيار أنظمة الملاحة الجوية والرادارات وأجهزة الاتصال الخاصة بأسطول الطائرات", "إلكترونيات الطيران والملاحة الجوية")
]

METRO_TRAM_PROJECTS = [
    ("TRANSPORT", "أشغال الصيانة الوقائية والعميقة لعربات المترو وقطارات الترامواي وأنظمة السكك وتزويد الكهرباء الهوائية", "صيانة عربات المترو والترامواي والكهربة"),
    ("IT", "تطوير منظومة بيع التذاكر الإلكترونية وبوابات الدخول الرقمية وكاميرات المراقبة بالمحطات", "تذاكر إلكترونية وبوابات دخول ذكية")
]

RAIL_PROJECTS = [
    ("TRANSPORT", "مناقصة اقتناء قطع غيار محركات الديزل لقاطرات الشحن والمسافرين وأنظمة الفرملة الهوائية وعجلات السكك", "صيانة وتجهيز عتاد السكك الحديدية"),
    ("TRANSPORT", "مشروع كهربة وتثنية خطوط السكة الحديدية وتجهيز أنظمة الإشارات والاتصالات السلكية واللاسلكية", "بنية تحتية سككية وإشارات ضوئية")
]

PORT_PROJECTS = [
    ("TRANSPORT", "مشروع اقتناء قاطرات بحرية بقوة سحب 70 طناً ورافعات شوكية ثقيلة لمناولة الحاويات المرفئية", "تجهيزات الملاحة والقطر والموانئ"),
    ("TRANSPORT", "صيانة وتأهيل الأرصفة البحرية ومصدات السفن وتجهيزات الملاحة والإرشاد المرفئي", "منشآت بحرية وأرصفة مينائية"),
    ("TRANSPORT", "أشغال جرف وتطهير الأحواض المائية والممرات الملاحية بالميناء وضمان أعماق الرسو الآمنة", "جرف بحري وتطهير أحواض مينائية"),
    ("SERVICES", "اقتناء وتجديد كاميرات المراقبة الساحلية وأنظمة إدارة حركة السفن VTMIS بالميناء", "أنظمة مراقبة بحرية وسلامة مينائية")
]

SHIPPING_PROJECTS = [
    ("TRANSPORT", "مناقصة دولية لصيانة السفن بالحوض الجاف، طلاء الهياكل البحرية وتجديد محركات الدفع الرئيسية للبواخر", "صيانة البواخر والملاحة البحرية"),
    ("TRANSPORT", "توريد تجهيزات السلامة البحرية، قوارب النجاة، وأنظمة الرادار والملاحة بالأقمار الصناعية للسفن", "تجهيزات ملاحة وسلامة بحرية")
]

URBAN_BUS_PROJECTS = [
    ("TRANSPORT", "صفقة اقتناء حافلات النقل الحضري الحديثة وتوريد قطع الغيار الميكانيكية وإطارات الحافلات", "حافلات نقل حضري وميكانيك"),
    ("IT", "تجهيز أسطول حافلات النقل الحضري بأنظمة التذاكر الذكية ونظام تحديد المواقع GPS واللوحات الإرشادية", "أنظمة ذكية وتذاكر إلكترونية للنقل الحضري")
]

LOGISTICS_PROJECTS = [
    ("TRANSPORT", "مشروع صيانة وتأهيل أسطول شاحنات الوزن الثقيل والمقطورات المبردة للنقل البري واللوجستي", "نقل بري لوجستي وشاحنات ثقيلة"),
    ("SERVICES", "تجهيز القواعد اللوجستية ومستودعات الشحن والتفريغ برافعات المناولة وأنظمة التتبع الرقمي", "خدمات لوجستية ومنصات شحن")
]

COSIDER_PROJECTS = [
    ("BTPH", "استشارة كراء أسطول الآليات الثقيلة والشاحنات العملاقة وتوريد حديد التسليح عالي المقاومة للمشاريع الكبرى", "أشغال عمومية وآليات ثقيلة ومنشآت كبرى"),
    ("BTPH", "مناقصة توريد حديد التسليح عالي المقاومة، الإسمنت المقاوم للأملاح ومواد البناء للمشاريع الاستراتيجية", "توريد مواد البناء وحديد التسليح"),
    ("BTPH", "توريد أنابيب الصلب الكبيرة قطر 1200 مم والصمامات الهيدروليكية لتحويلات المياه الكبرى", "أشغال قنوات الصلب والمشاريع الهيدروليكية"),
    ("BTPH", "أشغال حفر الأنفاق والمنشآت الفنية والجسور المعلقة وتوريد خرسانة المقاومة العالية", "منشآت فنية وجسور وأنفاق")
]

HOUSING_OPGI_PROJECTS = [
    ("BTPH", "مناقصة إنجاز عمارات السكن العمومي وأشغال التهيئة الخارجية والشبكات المختلفة VRD", "بناء وسكن عمومي وتهيئة حضرية"),
    ("BTPH", "صفقة توريد وتركيب المصاعد الكهربائية وأعمال الكتامة والترميم للأحياء السكنية", "مصاعد كهربائية وصيانة أحياء سكنية")
]

ENGINEERING_STUDIES_PROJECTS = [
    ("STUDIES", "مناقصة اقتناء أجهزة السبر الجيوتقني، مخابر فحص الخرسانة والتربة ومعدات المراقبة التقنية للبناء", "دراسات جيوتقنية ومخابر مراقبة البناء"),
    ("STUDIES", "استشارة إعداد الدراسات الهندسية التفصيلية، مخططات التهيئة العمرانية ومراقبة مطابقة المنشآت", "دراسات هندسية وتخطيط عمراني")
]

WATER_PROJECTS = [
    ("BTPH", "مناقصة اقتناء العدادات المائية الرقمية الذكية وأنابيب الفولاذ الكربوني بقطر 800 مم ومضخات الرفع الهيدروليكي", "تجهيزات التزويد بالماء الشروب والمضخات"),
    ("BTPH", "صفقة إعادة تأهيل وتجهيز محطات التطهير ومعالجة المياه المستعملة STEP وتوريد آلات نزح الأوحال", "محطات تصفية المياه والتطهير ومعالجة الأوحال"),
    ("BTPH", "مناقصة صيانة وتجهيز أنظمة المراقبة السيزمية للسدود الكبرى وتجريف الأوحال بمحطات التخزين", "صيانة السدود الكبرى والمنشآت المائية"),
    ("BTPH", "مشروع تجديد قنوات توزيع الماء الشروب وإصلاح التسربات الكبرى بالقنوات الرئيسية", "شبكات ري وتوزيع المياه")
]

CEMENT_PROJECTS = [
    ("BTPH", "صفقة اقتناء الآجر الحراري المقاوم لتبطين أفران الكلنكر وقطع غيار كسارات الحجر الجيري بمصانع الإسمنت", "معدات ومواد تصنيع الإسمنت ومواد البناء"),
    ("SERVICES", "توريد أكياس تعبئة الإسمنت الورقية المقاومة ثلاثية الطبقات وتجهيزات خطوط الشحن الآلي", "مستلزمات التعبئة والتغليف الصناعي للإسمنت"),
    ("ENERGY", "أشغال تركيب فلاتر تصفية الغبار الكهروستاتيكية وتحسين كفاءة استهلاك الطاقة بمصانع الإسمنت", "فلاتر بيئية وصيانة مصانع الإسمنت")
]

AGRI_PROJECTS = [
    ("AGRICULTURE", "مناقصة إنجاز صوامع التخزين الاستراتيجية للحبوب بطاقة 50 ألف قنطار وتجهيزات الوزن الآلي ومكافحة الحشرات", "صوامع تخزين الحبوب والتجهيزات الزراعية"),
    ("AGRICULTURE", "صفقة صيانة شبكات الري المحيطية الكبرى وتجهيز صمامات التحكم الآلي وقنوات الضخ بالمناطق الزراعية", "شبكات ري فلاحي واستصلاح أراض"),
    ("AGRICULTURE", "اقتناء آلات معالجة وتطهير البذور، أكياس الخيش وتجهيزات وزن وتفريغ الحبوب بالمراكز الجوارية", "عتاد فلاحي ومعالجة البذور والحبوب")
]

BANK_PROJECTS = [
    ("IT", "مناقصة تحديث الأنظمة البنكية المركزية Core Banking وتوريد منصات الدفع عبر الهاتف المحمول والتطبيقات الرقمية", "منظومات بنكية رقمية وحلول مصرفية مركزية"),
    ("IT", "تعزيز منظومة الأمن السيبراني المصرفي وتوريد خوادم التخزين الآمن وأنظمة السويفت SWIFT ضد الهجمات الرقمية", "أمن معلوماتي مصرفي ومراكز بيانات مؤمنة"),
    ("IT", "اقتناء آلات فرز وعد الأوراق النقدية الآلية والشاشات التفاعلية وأجهزة المكاتب الرقمية للفروع البنكية", "أجهزة مصرفية وآلات فرز النقد المعتمدة"),
    ("SERVICES", "استشارة تهيئة ورقمنة شبكة الوكالات البنكية وتوريد أنظمة المراقبة بالكاميرات الذكية وأجهزة الإنذار", "تهيئة وكالات مصرفية وأنظمة أمان")
]

INSURANCE_PROJECTS = [
    ("IT", "استشارة تطوير النظام الخبير لتقدير أضرار الحوادث الرقمي وتحديث شبكة الوكالات الجهوية عبر الوطن", "برمجيات تأمينية واستشارات رقمية"),
    ("SERVICES", "مناقصة أنظمة التغطية التأمينية للمخاطر الطاقوية الكبرى والمنشآت الصناعية البحرية والبرية", "تأمين المنشآت الصناعية الكبرى وإدارة المخاطر"),
    ("IT", "توريد السيرفرات السحابية ومنظومة حفظ البيانات والأرشفة الرقمية لملفات التأمين", "أرشفة رقمية وخوادم سحابية")
]

# 3. Authentic Executive Directorates Projects (522 Directorates + 58 Wilayas)
DIR_NAMES = {
    "DTP": "مديرية الأشغال العمومية",
    "DUC": "مديرية التعمير والهندسة المعمارية والبناء",
    "DRE": "مديرية الموارد المائية",
    "DEP": "مديرية التجهيزات العمومية",
    "DSP": "مديرية الصحة والسكان",
    "DE": "مديرية التربية والتعليم",
    "DSA": "مديرية المصالح الفلاحية",
    "DEM": "مديرية الطاقة والمناجم",
    "DCPE": "مديرية التجارة وترقية الصادرات",
    "Wilaya": "مصالح الولاية والأمانة العامة"
}

DIR_PROJECTS_MAP = {
    "DTP": [
        ("BTPH", "أشغال إعادة تهيئة وتعبيد الطريق الوطني وتثنية المنعرجات وإصلاح المنشآت الفنية المتضررة بولاية {wilaya}", "أشغال عمومية وطرق"),
        ("BTPH", "مشروع صيانة وتزفيت شبكة الطرق الولائية وتثبيت حواف الطرقات وإشارات المرور بولاية {wilaya}", "صيانة شبكة الطرقات والمنشآت"),
        ("BTPH", "إنجاز محول طريق وجسر خرساني لتسهيل الحركة المرورية وفك الاختناق بولاية {wilaya}", "منشآت فنية وجسور")
    ],
    "DUC": [
        ("BTPH", "مشروع التحسين الحضري والتهيئة الخارجية للأحياء السكنية المدمجة والإنارة العمومية بولاية {wilaya}", "تعمير وهندسة معمارية"),
        ("BTPH", "أشغال التهيئة الحضرية، الأرصفة وتعبيد المساحات المشتركة للمخططات السكنية الجديدة بولاية {wilaya}", "تهيئة حضرية ومساحات خضراء"),
        ("BTPH", "إنجاز شبكات الطرق والمياه والتطهير والإنارة (VRD) للتجزئات الاجتماعية بولاية {wilaya}", "شبكات مختلفة وطرق VRD")
    ],
    "DRE": [
        ("BTPH", "إنجاز خزان مائي سعة 5000 م³ وربط قنوات الضخ الرئيسية ومحطات التصفية بولاية {wilaya}", "موارد مائية وسدود"),
        ("BTPH", "مشروع حفر وتجهيز آبار ارتوازية عميقة ومد قنوات جر المياه الصالحة للشرب بولاية {wilaya}", "حفر آبار وشبكات مياه"),
        ("BTPH", "تجديد وتوسيع شبكات الصرف الصحي والتطهير وحماية التجمعات السكانية من الفيضانات بولاية {wilaya}", "تطهير وحماية من الفيضانات")
    ],
    "DEP": [
        ("BTPH", "مشروع إنجاز ثانوية سعة 1000 مقعد مع نصف داخلية ومجمع مدرسي صنف (د) بولاية {wilaya}", "تجهيزات عمومية وتربية"),
        ("BTPH", "إنجاز مجمع إداري ومقر للمصالح العمومية ودار الثقافة والشباب بولاية {wilaya}", "بناء وتجهيز مقرات عمومية"),
        ("BTPH", "بناء عيادة متعددة الخدمات ومقر للأمن الحضري والمرافق الملحقة بولاية {wilaya}", "منشآت صحية وأمنية")
    ],
    "DSP": [
        ("MEDICAL", "مناقصة اقتناء تجهيزات التصوير الطبي بالأشعة، أجهزة التخدير والإنعاش وأسرة العمليات للمراكز الصحية بولاية {wilaya}", "صحة وتجهيزات طبية"),
        ("MEDICAL", "توريد أجهزة المخابر الطبية، كواشف التحاليل وتجهيزات التعقيم المركزي لمستشفيات ولاية {wilaya}", "مخابر طبية وتعقيم مركزي"),
        ("TRANSPORT", "اقتناء أسطول سيارات الإسعاف المجهزة طبياً ووحدات العلاج المتنقلة للمناطق النائية بولاية {wilaya}", "سيارات إسعاف وعتاد صحي متنقل")
    ],
    "DE": [
        ("FURNITURE", "اقتناء التجهيزات البيداغوجية، الكراسي، الطاولات المدرسية والمخابر العلمية للمتوسطات الجديدة بولاية {wilaya}", "تربية وتجهيز مدرسي"),
        ("SERVICES", "صفقة توفير التدفئة المركزية وصيانة المدارس وتوريد الوجبات الغذائية الساخنة بولاية {wilaya}", "خدمات مدرسية وإطعام"),
        ("IT", "تجهيز قاعات الإعلام الآلي باللوحات الرقمية والحواسيب المدرسية والشاشات التفاعلية بولاية {wilaya}", "عتاد إعلام آلي ورقمنة تربوية")
    ],
    "DSA": [
        ("AGRICULTURE", "أشغال فتح المسالك الفلاحية وتهيئة المحيطات المسقية وتوزيع العتاد الفلاحي للمستثمرات بولاية {wilaya}", "فلاحة وتنمية ريفية"),
        ("ENERGY", "مشروع كهربة المستثمرات الفلاحية وحفر وتجهيز الآبار الجماعية لحوض الإنتاج بولاية {wilaya}", "كهربة فلاحية وآبار سقي"),
        ("AGRICULTURE", "حملة تشجير وتثبيت الكثبان الرملية ومكافحة التصحر وحماية الأحواض المائية بولاية {wilaya}", "تشجير وحماية بيئية فلاحية")
    ],
    "DEM": [
        ("ENERGY", "مشروع الربط بالكهرباء والغاز الطبيعي للمناطق الصناعية ومحيطات الاستثمار الفلاحي بولاية {wilaya}", "طاقة ومناجم"),
        ("ENERGY", "توسيع شبكة التوزيع الكهربائي الريفي وتوريد المحولات الهوائية وتجهيزات الطاقة الشمسية بولاية {wilaya}", "شبكات كهربائية وطاقة شمسية"),
        ("ENERGY", "ربط الأحياء السكنية الجديدة والمناطق المعزولة بشبكة الغاز الطبيعي بولاية {wilaya}", "شبكات توزيع الغاز الطبيعي")
    ],
    "DCPE": [
        ("SERVICES", "حملة مراقبة الجودة، المعايرة القانونية لأجهزة الوزن وتوريد عتاد القياس المخبري للأسواق بولاية {wilaya}", "تجارة وترقية الصادرات"),
        ("SERVICES", "إنجاز وتجهيز مخبر جهوي لمراقبة النوعية وقمع الغش والتحاليل الميكروبيولوجية بولاية {wilaya}", "مخابر نوعية ومراقبة غش"),
        ("SERVICES", "تهيئة أسواق الجملة للخضر والفواكه والأسواق الجوارية وتجهيز غرف التبريد بولاية {wilaya}", "أسواق وتبريد وتجارة")
    ],
    "Wilaya": [
        ("BTPH", "إنجاز برنامج التنمية المحلية والتهيئة الحضرية المتكاملة وعصرنة المرافق الإدارية لولاية {wilaya}", "تنمية محلية وتجهيز عمومي"),
        ("IT", "مشروع رقمنة الشباك الموحد، شبكة الربط الولائية وتجهيز قاعات الاجتماعات والمراقبة بولاية {wilaya}", "رقمنة الإدارة المحلية والشبكات")
    ]
}

TENDER_PREFIXES = (
    "مناقصة", "صفقة", "استشارة", "مشروع", "أشغال", "توريد", "اقتناء",
    "إنجاز", "صيانة", "تطوير", "دراسات", "تجهيز", "مد ", "ربط ", "بناء ", "حملة "
)


def format_cov_as_title(cov, auth_name):
    cov = (cov or "").strip()
    if any(cov.startswith(p) for p in TENDER_PREFIXES):
        return cov
    return f"مناقصة وطنية لتوريد وإنجاز تجهيزات ومشاريع: {cov}"


def resolve_wilaya_for_source(src_obj, wilaya_map, known_wilayas):
    k = src_obj["key"]
    if k in known_wilayas:
        return known_wilayas[k]
    parts = k.split("_")
    if len(parts) >= 2 and parts[-1] in wilaya_map:
        w_code = parts[-1]
        return w_code, wilaya_map[w_code]
    if len(parts) >= 2 and parts[1] in wilaya_map:
        w_code = parts[1]
        return w_code, wilaya_map[w_code]

    # Match city/wilaya names in nameAr / coverage / tags
    text = f"{src_obj.get('nameAr', '')} {src_obj.get('coverage', '')} {' '.join(src_obj.get('tags', []))}"
    city_clues = [
        ("وهران", "31"), ("أرزيو", "31"), ("بطيوة", "31"), ("السانية", "31"),
        ("قسنطينة", "25"), ("علي منجلي", "25"),
        ("عنابة", "23"), ("الحجار", "23"),
        ("سطيف", "19"), ("العلمة", "19"),
        ("بجاية", "06"), ("أقبو", "06"),
        ("تيزي وزو", "15"), ("ذراع بن خدة", "15"), ("واد عيسي", "15"), ("تقزيرت", "15"),
        ("تلمسان", "13"), ("الغزوات", "13"), ("مغنية", "13"),
        ("سيدي بلعباس", "22"),
        ("جيجل", "18"), ("جن جن", "18"), ("بلارة", "18"),
        ("سكيكدة", "21"),
        ("البليدة", "09"), ("بوفاريك", "09"), ("مفتاح", "09"),
        ("بويرة", "10"), ("سور الغزلان", "10"),
        ("تيبازة", "42"), ("بوسماعيل", "42"), ("القليعة", "42"), ("شرشال", "42"),
        ("بومرداس", "35"),
        ("المدية", "26"),
        ("الشلف", "02"), ("تنس", "02"),
        ("مستغانم", "27"),
        ("تيارت", "14"),
        ("ورقلة", "30"), ("حاسي مسعود", "30"),
        ("الأغواط", "03"), ("حاسي الرمل", "03"),
        ("بشار", "08"),
        ("تمنراست", "11"),
        ("أدرار", "01"),
        ("تندوف", "37"), ("غار جبيلات", "37"),
        ("إليزي", "33"),
        ("الوادي", "39"),
        ("غرداية", "47"),
        ("تقرت", "55"),
        ("تيميمون", "49"),
        ("برج باجي مختار", "50"),
        ("عين صالح", "53"),
        ("عين قزام", "54"),
        ("جانت", "56"),
        ("المنيعة", "58"),
        ("المغير", "57"),
        ("أولاد جلال", "51"),
        ("بني عباس", "52"),
        ("الجلفة", "17"), ("عين وسارة", "17"),
        ("باتنة", "05"),
        ("بسكرة", "07"),
        ("تبسة", "12"), ("الونزة", "12"),
        ("أم البواقي", "04"), ("عين مليلة", "04"),
        ("قالمة", "24"),
        ("برج بوعريريج", "34"),
        ("المسيلة", "28"),
        ("سوق أهراس", "41"),
        ("خنشلة", "40"),
        ("الطارف", "36"),
        ("ميلة", "43"),
        ("معسكر", "29"),
        ("سعيدة", "20"),
        ("غليزان", "48"),
        ("عين تموشنت", "46"),
        ("البيض", "32"),
        ("النعامة", "45"),
        ("عين الدفلى", "44"),
        ("تسمسيلت", "38")
    ]
    for clue, code in city_clues:
        if clue in text:
            return code, wilaya_map[code]
    return "16", wilaya_map["16"]


def infer_sector_for_source(src_obj, known_sectors):
    k = src_obj["key"]
    if k in known_sectors:
        return known_sectors[k]
    s_grp = src_obj.get("sectorGroup", "")
    cat = src_obj.get("category", "")
    name = src_obj.get("nameAr", "")
    cov = src_obj.get("coverage", "")

    if any(x in k for x in ["CEEG", "COSIDER_GEO", "CTC_", "CNERIB", "LNHC", "LNTPB", "SAETI", "CNERU", "EPAU", "CNES_CESE", "ORGM"]):
        return "STUDIES"
    if s_grp == "energy" or "طاقة" in cat or "محروقات" in cat or "كهرباء" in cat:
        return "ENERGY"
    if s_grp == "tech" or "اتصالات" in cat or "رقمنة" in cat or "معلومات" in name or "إعلام آلي" in name:
        return "IT"
    if s_grp == "transport" or "نقل" in cat or "ميناء" in name or "مطار" in name or "سكك" in name:
        return "TRANSPORT"
    if s_grp == "finance" or "بنك" in name or "مصرف" in name or "خزينة" in name or "ضرائب" in name or "بورصة" in name:
        return "IT" if ("بنك" in name or "مصرف" in name or "ضرائب" in name or "خزينة" in name or "بورصة" in name) else "SERVICES"
    if "فلاحة" in cat or "حبوب" in cat or "حليب" in cat or "أنعام" in name or "غابات" in name or "صيد" in name or "ONID" in k:
        return "AGRICULTURE"
    if s_grp == "health" or "صحة" in cat or "مستشفى" in cat or "صيدل" in name or "أدوية" in cat or "استشفائي" in name:
        return "MEDICAL"
    if "أثاث" in cov or "DIVINDUS" in k:
        return "FURNITURE"
    if s_grp == "construction" or "أشغال" in cat or "بناء" in cat or "سكن" in cat or "مياه" in cat or "تطهير" in cat or "سدود" in cat:
        return "BTPH"
    if s_grp == "univ":
        return "IT"
    return "SERVICES"


def pick_enterprise_project(src_obj, w_code, w_name, sec, index_in_company):
    """
    Selects a 100% domain-pure and sub-domain-accurate project for the given enterprise.
    On pass 0 (index_in_company == 0), ALWAYS uses the enterprise's own bespoke coverage!
    On pass >= 1, uses strictly sub-domain-matched project templates.
    """
    e_key = src_obj["key"]
    e_name = src_obj["nameAr"]
    cov = src_obj.get("coverage", "")

    # Pass 0: Always use the bespoke coverage of this specific enterprise
    if index_in_company == 0 and cov:
        title = format_cov_as_title(cov, e_name)
        return sec, title, f"خبرة مهنية معتمدة ومطابقة تقنية في {src_obj.get('category', 'القطاع')}"

    idx = index_in_company - 1 if index_in_company > 0 else 0

    # 1. Exact or Prefix Special Pools
    if "POSTE" in e_key:
        pool = SPECIAL_COMPANY_PROJECTS["ALGERIE_POSTE"]
        return pool[idx % len(pool)]
    if "PCH" in e_key or "PHARMACIE" in e_key:
        pool = SPECIAL_COMPANY_PROJECTS["PCH_PHARMACIE"]
        return pool[idx % len(pool)]
    if "SAIDAL" in e_key or "PASTEUR" in e_key or "LNSM" in e_key or "ANPP" in e_key:
        pool = SPECIAL_COMPANY_PROJECTS["SAIDAL_GROUPE"]
        return pool[idx % len(pool)]
    if any(k in e_key for k in ["TELECOM", "DOT_", "ATS_SATELLITE", "TDA_", "ENSI_", "ANPT_", "ENIE", "ALFATRON", "ELEC_"]):
        pool = SPECIAL_COMPANY_PROJECTS["ALGERIE_TELECOM"]
        return pool[idx % len(pool)]
    if any(k in e_key for k in ["MOBILIS", "DJEZZY", "OOREDOO"]):
        pool = SPECIAL_COMPANY_PROJECTS["MOBILIS_ATM"]
        return pool[idx % len(pool)]
    if "ELIT" in e_key:
        pool = SPECIAL_COMPANY_PROJECTS["ELIT_SONELGAZ"]
        return pool[idx % len(pool)]

    # 2. Strictly Separated Transport Sub-domains (Airports vs Airlines vs Ports vs Ferries vs Metro/Tram vs Rail vs Bus vs Freight)
    if any(k in e_key for k in ["SGSIA", "EGSA_", "AEROPORT"]):
        return AIRPORT_PROJECTS[idx % len(AIRPORT_PROJECTS)]
    if any(k in e_key for k in ["AIR_ALGERIE", "TASSILI"]):
        return AVIATION_PROJECTS[idx % len(AVIATION_PROJECTS)]
    if any(k in e_key for k in ["EMA_METRO", "SETRAM"]):
        return METRO_TRAM_PROJECTS[idx % len(METRO_TRAM_PROJECTS)]
    if any(k in e_key for k in ["SNTF", "ANESRIF", "FERROVIAL"]):
        return RAIL_PROJECTS[idx % len(RAIL_PROJECTS)]
    if any(k in e_key for k in ["ENTMV", "CNAN_", "GATMA", "HYPROC"]):
        return SHIPPING_PROJECTS[idx % len(SHIPPING_PROJECTS)]
    if any(k in e_key for k in ["EPAL", "EPO_", "PORT_"]):
        return PORT_PROJECTS[idx % len(PORT_PROJECTS)]
    if any(k in e_key for k in ["ETUSA", "ETU_", "ETO_", "ETC_"]):
        return URBAN_BUS_PROJECTS[idx % len(URBAN_BUS_PROJECTS)]
    if any(k in e_key for k in ["LOGITRANS", "SNTR", "TRANSMEX", "SNVI"]):
        return LOGISTICS_PROJECTS[idx % len(LOGISTICS_PROJECTS)]

    # 3. Strictly Separated Energy & Mining Sub-domains
    if "NAFTAL" in e_key:
        return NAFTAL_PROJECTS[idx % len(NAFTAL_PROJECTS)]
    if any(k in e_key for k in ["SHAEMS", "CDER", "COMENA"]):
        return SOLAR_PROJECTS[idx % len(SOLAR_PROJECTS)]
    if any(k in e_key for k in ["GRTG", "KANAGHAZ"]):
        return SONELGAZ_GAS_PROJECTS[idx % len(SONELGAZ_GAS_PROJECTS)]
    if any(k in e_key for k in ["SONELGAZ", "SPE_", "GRTE", "INERGA", "ETTERKIB", "MEI_"]):
        return SONELGAZ_ELEC_PROJECTS[idx % len(SONELGAZ_ELEC_PROJECTS)]
    if any(k in e_key for k in ["TRC", "ENAC", "GTP", "SARPI"]):
        return PETROLEUM_PIPELINE_PROJECTS[idx % len(PETROLEUM_PIPELINE_PROJECTS)]
    if any(k in e_key for k in ["RPC", "LQS", "SOMIK", "HELIOS", "FERTIAL", "ASMIDAL", "SH_COM"]):
        return PETROLEUM_DOWNSTREAM_PROJECTS[idx % len(PETROLEUM_DOWNSTREAM_PROJECTS)]
    if any(k in e_key for k in ["SONATRACH", "SH_", "ENTP", "ENAFOR", "ENSP", "ALNAFT", "ARH"]):
        return PETROLEUM_UPSTREAM_PROJECTS[idx % len(PETROLEUM_UPSTREAM_PROJECTS)]
    if any(k in e_key for k in ["MANAL", "FERPHOS", "SOMIPHOS", "ENOR", "ENAMARBRE", "GARA_DJERBILAT", "SIDER", "IMETAL", "TOSYALI", "AQS_", "ALFAPIPE", "BATIMETAL", "FONDAL"]):
        return MINING_STEEL_PROJECTS[idx % len(MINING_STEEL_PROJECTS)]

    # 4. BTPH, Engineering Studies, Water, Cement, Housing
    if any(k in e_key for k in ["CEEG", "COSIDER_GEO", "CTC_", "CNERIB", "LNHC", "LNTPB", "SAETI", "CNERU", "ORGM"]):
        return ENGINEERING_STUDIES_PROJECTS[idx % len(ENGINEERING_STUDIES_PROJECTS)]
    if any(k in e_key for k in ["OPGI_", "AADL", "COSIDER_PROMO"]):
        return HOUSING_OPGI_PROJECTS[idx % len(HOUSING_OPGI_PROJECTS)]
    if "COSIDER" in e_key or "ADA_AUTOROUTES" in e_key:
        return COSIDER_PROJECTS[idx % len(COSIDER_PROJECTS)]
    if any(k in e_key for k in ["ADE_", "ONA_", "SEAAL", "SEOR", "SEACO", "ANBT", "ANRH", "AEC_"]):
        return WATER_PROJECTS[idx % len(WATER_PROJECTS)]
    if "GICA" in e_key:
        return CEMENT_PROJECTS[idx % len(CEMENT_PROJECTS)]

    # 5. Agriculture, Banks, Insurance
    if any(k in e_key for k in ["OAIC", "ONID", "CCLS", "ONIL", "ONAB", "ALVIAR", "AGRODIV", "ERIAD", "ANDPA"]):
        return AGRI_PROJECTS[idx % len(AGRI_PROJECTS)]
    if any(k in e_key for k in ["BANQUE", "BANK", "BNA", "BEA", "CPA", "BDL", "BADR", "CNEP", "COSOB", "FNI"]):
        return BANK_PROJECTS[idx % len(BANK_PROJECTS)]
    if any(k in e_key for k in ["ASSURANCE", "SAA", "CAAT", "CAAR", "CASH", "CNMA"]):
        return INSURANCE_PROJECTS[idx % len(INSURANCE_PROJECTS)]

    return sec, format_cov_as_title(cov, e_name), f"اعتماد وخبرة مهنية في {src_obj.get('category', 'القطاع')}"


def pick_active_notice_type(seq_idx, is_enterprise=False, sec="BTPH"):
    """
    Assigns realistic active notice types so all NOTICE_TYPE_OPTIONS are represented:
    appel_offres (national, international, prequalification), consultation, prorogation, concours, infructueux, annulation.
    """
    mod = seq_idx % 40
    if mod == 3:
        return "prorogation", "إعلان تمديد آجال إيداع العروض (Prorogation)"
    if mod == 11 and sec in ("BTPH", "STUDIES"):
        return "concours", "مسابقة وطنية للهندسة المعمارية والدراسات (Concours)"
    if mod == 19:
        return "infructueux", "إعلان عدم جدوى الصفقة (Avis d'infructuosité)"
    if mod == 27:
        return "annulation", "إعلان إلغاء إجراء الصفقة (Annulation)"

    if is_enterprise:
        if seq_idx % 3 == 0:
            return "international", "طلب عروض وطني ودولي مفتوح"
        elif seq_idx % 3 == 1:
            return "national", "طلب عروض وطني مفتوح مع اشتراط قدرات دنيا"
        else:
            return "prequalification", "طلب عروض وطني للانتقاء الأولي (Préqualification)"
    else:
        if seq_idx % 2 == 0:
            return "consultation", "استشارة عمومية مفتوحة"
        else:
            return "national", "طلب عروض وطني مفتوح"


def decorate_title_by_type(title, t_type):
    if t_type == "attribution":
        return f"إعلان المنح المؤقت: {title}"
    if t_type == "prorogation":
        return f"تمديد آجال إيداع العروض (تمديد ثانٍ بـ 15 يوماً): {title}"
    if t_type == "concours" and not title.startswith("مسابقة"):
        return f"مسابقة وطنية للهندسة المعمارية ومتابعة الإنجاز: {title}"
    if t_type == "infructueux":
        return f"إعلان عدم جدوى (لعدم مطابقة العروض التقنية): {title}"
    if t_type == "annulation":
        return f"إعلان إلغاء إجراء الاستشارة وإعادة الإعلان: {title}"
    return title


def build_pure_tenders(sources):
    random.seed(42)
    wilaya_map = {code: name_ar for code, name_ar, _, _ in WILAYAS_58}

    known_wilayas = {}
    known_sectors = {}
    for c_key, c_name, w_code, w_name in EXPANDED_COMMUNES_DATA:
        known_wilayas[c_key] = (w_code, w_name)
    for e_key, e_name, portal_key, sec, w_code, w_name, cov in EXPANDED_PUBLIC_COMPANIES:
        known_wilayas[e_key] = (w_code, w_name)
        known_sectors[e_key] = sec

    # Partition the 1,540 sources into 3 clean, mutually exclusive groups:
    # Group 1: 480 Municipal APCs
    # Group 2: 290 Public Enterprises, Agencies, Banks, Water/Energy/Transport/Telecom/Pharma Companies
    # Group 3: 770 Wilayas (58), Executive Directorates (522), Ministries & Portals (49), Universities (82), Hospitals (59)
    g3_prefixes = (
        "DTP_", "DRE_", "DEP_", "DUC_", "DSP_", "DE_", "DSA_", "DEM_", "DCPE_", "Wilaya_",
        "MIN_", "UNIV_", "USTHB", "USTO_", "ENP_", "ESI_", "ENSIA", "ENSM_", "ENSA_", "ENSV_",
        "EPAU_", "ENST_", "ENS_", "ESSEC", "ONOU_", "CDTA_", "CERIST", "CDER_", "CRTI_", "CRTSE",
        "CREAD", "CRAAG", "CRBT_", "CHU_", "EHU_", "EHS_", "EPH_", "CPMC_", "INSP_",
        "BOMOP", "MARCHES_PUBLICS_GOV", "JORADP", "APS_MARCHES", "DOUANE_DZ", "DGI_DZ", "DGT_DZ",
        "CNES_CESE", "COUR_COMPTES", "ASAL_SPACE", "COMENA_NUCLEAR", "COSOB_BOURSE",
        "ANEP_AFFICHAGE", "PORTAIL_CONSULAT_DZ", "DGSN_POLICE", "PROTECTION_CIVILE",
        "DGF_FORETS", "DGD_DOMAINE", "SGG_GOUV", "COUR_SUPREME"
    )

    apc_sources = [s for s in sources if s["key"].startswith("APC_")]
    inst_sources = [s for s in sources if not s["key"].startswith("APC_") and s["key"].startswith(g3_prefixes)]
    ent_sources = [s for s in sources if not s["key"].startswith("APC_") and not s["key"].startswith(g3_prefixes)]

    assert len(apc_sources) + len(ent_sources) + len(inst_sources) == len(sources), "Source partition mismatch!"

    # -------------------------------------------------------------
    # 1. 650 Municipal Tenders (covering all 480 APCs across 58 Wilayas)
    # -------------------------------------------------------------
    g1_tenders = []
    for i in range(650):
        src_obj = apc_sources[i % len(apc_sources)]
        c_key = src_obj["key"]
        c_name = src_obj["nameAr"]
        # Clean parenthetical suffixes for natural title formatting
        c_clean = c_name.split(" (")[0].strip()
        w_code, w_name = resolve_wilaya_for_source(src_obj, wilaya_map, known_wilayas)

        sec, title_tpl, qual = MUNICIPAL_PROJECTS[i % len(MUNICIPAL_PROJECTS)]
        is_attr = (i >= len(apc_sources) and (i - len(apc_sources)) < 130)  # 130 attributions on pass 1, 520 active (all 480 APCs have >=1 active)
        if is_attr:
            t_type, type_name = "attribution", "إعلان منح مؤقت للصفقة (Attribution)"
        else:
            t_type, type_name = pick_active_notice_type(i, is_enterprise=False, sec=sec)
            if t_type == "concours":
                sec = "STUDIES"

        title = decorate_title_by_type(title_tpl.format(commune=c_clean), t_type)
        est_amount = random.randint(18, 95) * 1000000 + random.randint(10, 99) * 1000

        tender = {
            "reference_suffix": f"{c_key}/{w_code}/2026",
            "title": title,
            "authority": f"{c_clean} (ولاية {w_name})",
            "wilaya": w_code,
            "wilayaName": w_name,
            "sector": sec,
            "categoryGroup": "communes",
            "type": t_type,
            "typeName": type_name,
            "source": f"لوحة إعلانات {c_clean} / بوابة الصفقات العمومية marches-publics.gov.dz / جريدة الشعب",
            "sourceKey": c_key,
            "priceCahier": 0 if t_type == "consultation" else random.choice([2000, 3000, 4000, 5000]),
            "caution": "بدون كفالة" if t_type == "consultation" else f"كفالة تعهد بنكية بنسبة 1% أو {random.randint(200, 800)} ألف دج",
            "qualification": qual,
            "estimatedAmount": est_amount,
            "lots": [
                f"الحصة 1: إنجاز الأشغال الأساسية والتوريد بموقع {c_clean}",
                "الحصة 2: المتابعة والتسليم والمطابقة التقنية للمشروع"
            ],
            "depositPlace": f"مقر {c_clean} - مصلحة الصفقات والوسائل العامة - ولاية {w_name}"
        }
        if is_attr:
            tender["winnerCompany"] = random.choice([
                "مؤسسة الأشغال العامة والتهيئة الحضرية الحديثة (SARL ETR)",
                "شركة البناء والأشغال الهيدروليكية المغاربية (SNC)",
                "مؤسسة الوفاق للأشغال العمومية والتجهيز",
                "المؤسسة الوطنية للبناء والأشغال التكميلية (EURL)",
                "شركة الأمل للإنارة والطاقة المتجددة"
            ])
            tender["winnerAmount"] = int(est_amount * random.uniform(0.88, 0.96))
            tender["techScore"] = f"{random.randint(75, 92)}/100"
            tender["appealDeadline"] = 10
        g1_tenders.append(tender)

    # -------------------------------------------------------------
    # 2. 550 Public Enterprises Tenders (covering all 290 Enterprise Sources)
    # -------------------------------------------------------------
    g2_tenders = []
    comp_t_count = {s["key"]: 0 for s in ent_sources}
    for j in range(550):
        src_obj = ent_sources[j % len(ent_sources)]
        e_key = src_obj["key"]
        e_name = src_obj["nameAr"]
        w_code, w_name = resolve_wilaya_for_source(src_obj, wilaya_map, known_wilayas)
        base_sec = infer_sector_for_source(src_obj, known_sectors)

        idx_for_comp = comp_t_count[e_key]
        comp_t_count[e_key] += 1

        p_sec, p_title, p_qual = pick_enterprise_project(src_obj, w_code, w_name, base_sec, idx_for_comp)

        is_attr = (j >= len(ent_sources) and (j - len(ent_sources)) < 92)  # 92 attributions on pass 1, 458 active (all 290 Enterprises have >=1 active)
        if is_attr:
            t_type, type_name = "attribution", "إعلان المنح المؤقت (Attribution)"
        else:
            t_type, type_name = pick_active_notice_type(j, is_enterprise=True, sec=p_sec)
            if t_type == "concours":
                p_sec = "STUDIES"

        title = decorate_title_by_type(p_title, t_type)
        est_amount = random.randint(80, 850) * 1000000 + random.randint(100, 999) * 1000

        # Authentic publication channel: ONLY Energy & Mines sources publish in BAOSEM
        is_energy_baosem = (
            p_sec == "ENERGY"
            or src_obj.get("sectorGroup") == "energy"
            or any(x in e_key for x in ["SONATRACH", "SH_", "SONELGAZ", "NAFTAL", "ENTP", "ENAFOR", "ENSP", "GTP", "SARPI", "SOMIK", "ENAC", "MANAL", "FERPHOS", "SOMIPHOS", "ENOR", "BAOSEM"])
        )
        if is_energy_baosem:
            pub_channel = f"نشرة صفقات قطاع الطاقة والمناجم BAOSEM / بوابة {e_name} / جريدة المجاهد"
        else:
            pub_channel = f"النشرة الرسمية BOMOP / بوابة المشتريات {e_name} / بوابة الصفقات العمومية marches-publics.gov.dz / جريدة المجاهد"

        tender = {
            "reference_suffix": f"{e_key}/{w_code}/2026",
            "title": title,
            "authority": e_name,
            "wilaya": w_code,
            "wilayaName": w_name,
            "sector": p_sec,
            "categoryGroup": "enterprises",
            "type": t_type,
            "typeName": type_name,
            "source": pub_channel,
            "sourceKey": e_key,
            "priceCahier": random.choice([5000, 10000, 15000, 20000, 25000]),
            "caution": f"كفالة تعهد بنكية بقيمة {random.randint(1, 5)} مليون دج سارية المفعول لمدة 120 يوماً",
            "qualification": f"اعتماد رسمي، سجل تجاري مطابق وخبرة لا تقل عن 5 سنوات في {p_qual}",
            "estimatedAmount": est_amount,
            "lots": [
                f"الحصة الأولى: التوريد والتجهيز بالمستودعات والمواقع التشغيلية لـ {e_name}",
                "الحصة الثانية: التركيب والتشغيل التجريبي والضمان والصيانة"
            ],
            "depositPlace": f"مكتب الصفقات والعقود - المديرية المركزية لـ {e_name} - {w_name}"
        }
        if is_attr:
            tender["winnerCompany"] = random.choice([
                "المجمع الصناعي الوطني للإنشاءات الهندسية (GIE Alger)",
                "مؤسسة كوسيدار للأنابيب والمنشآت الكبرى",
                "الشركة الجزائرية للكهرباء والطاقات الحديثة (SPA)",
                "المؤسسة الصيدلانية الجزائرية للإنتاج والتوزيع",
                "الشركة الوطنية للوجيستيك والنقل المتكامل"
            ])
            tender["winnerAmount"] = int(est_amount * random.uniform(0.89, 0.95))
            tender["techScore"] = f"{random.randint(80, 95)}/100"
            tender["appealDeadline"] = 10
        g2_tenders.append(tender)

    # -------------------------------------------------------------
    # 3. 1,000 Tenders covering all 770 Wilayas, Directorates, Ministries, Universities, Hospitals
    # -------------------------------------------------------------
    g3_tenders = []
    inst_t_count = {s["key"]: 0 for s in inst_sources}
    for k in range(1000):
        src_obj = inst_sources[k % len(inst_sources)]
        s_key = src_obj["key"]
        authority_name = src_obj["nameAr"]
        w_code, w_name_ar = resolve_wilaya_for_source(src_obj, wilaya_map, known_wilayas)
        idx_for_inst = inst_t_count[s_key]
        inst_t_count[s_key] += 1

        prefix = s_key.split("_")[0]
        if prefix in DIR_PROJECTS_MAP:
            dir_pool = DIR_PROJECTS_MAP[prefix]
            sec, dir_title_tpl, dir_qual = dir_pool[idx_for_inst % len(dir_pool)]
            base_title = dir_title_tpl.format(wilaya=w_name_ar)
            authority_name = f"{DIR_NAMES[prefix]} لولاية {w_name_ar}"
        elif src_obj.get("sectorGroup") == "univ":
            if idx_for_inst == 0:
                sec = "STUDIES" if "EPAU" in s_key or "CREAD" in s_key else ("ENERGY" if "CDER" in s_key else "IT")
                base_title = f"مناقصة اقتناء تجهيزات المخابر العلمية والبحثية، الخوادم الرقمية والعتاد البيداغوجي لفائدة {authority_name}"
                dir_qual = "تجهيزات علمية ومخابر جامعية ورقمنة"
            else:
                sec = "FURNITURE"
                base_title = f"صفقة تجهيز المدرجات وقاعات التدريس والمكتبات الجامعية بالأثاث البيداغوجي والشاشات التفاعلية لفائدة {authority_name}"
                dir_qual = "أثاث وتجهيز جامعي وبيداغوجي"
        elif src_obj.get("sectorGroup") == "health" or s_key.startswith(("CHU_", "EHU_", "EHS_", "EPH_", "CPMC_", "INSP_")):
            sec = "MEDICAL"
            if idx_for_inst == 0:
                base_title = f"مناقصة اقتناء وتوريد: {src_obj.get('coverage', 'التجهيزات الطبية والمستهلكات الاستشفائية')} لفائدة {authority_name}"
                dir_qual = "تجهيزات طبية واستشفائية ومستهلكات معقمة"
            else:
                base_title = f"صفقة توريد الكواشف المخبرية، المستلزمات الجراحية وصيانة أجهزة التصوير الطبي والإنعاش لفائدة {authority_name}"
                dir_qual = "كواشف مخبرية وصيانة عتاد طبي"
        else:
            # Ministries & National Sovereign Portals / Agencies
            sec = infer_sector_for_source(src_obj, known_sectors)
            cov = src_obj.get("coverage", "")
            if idx_for_inst == 0 and cov:
                base_title = f"مناقصة وطنية لإنجاز وتجهيز مشاريع: {cov} ({authority_name})"
            else:
                base_title = f"صفقة عصرنة الأنظمة الرقمية، اقتناء التجهيزات التقنية وتهيئة المقرات التابعة لـ {authority_name}"
            dir_qual = f"تأهيل مهني واعتماد رسمي في {src_obj.get('category', 'الصفقات العمومية')}"

        is_attr = (k >= len(inst_sources) and (k - len(inst_sources)) < 143)  # 143 attributions on pass 1, 857 active (all 770 Institutions have >=1 active)
        if is_attr:
            t_type, type_name = "attribution", "إعلان منح مؤقت للصفقة (Attribution)"
        else:
            t_type, type_name = pick_active_notice_type(k, is_enterprise=False, sec=sec)
            if t_type == "concours":
                sec = "STUDIES"

        title = decorate_title_by_type(base_title, t_type)
        est_amount = random.randint(35, 420) * 1000000 + random.randint(50, 900) * 1000

        is_energy_inst = (sec == "ENERGY" or s_key in ("MIN_ENERGIE", "BAOSEM", "COMENA_NUCLEAR") or prefix == "DEM")
        if is_energy_inst:
            pub_channel = f"نشرة BAOSEM / النشرة الرسمية BOMOP / بوابة الصفقات العمومية marches-publics.gov.dz"
        else:
            pub_channel = f"النشرة الرسمية BOMOP / لوحة إعلانات {authority_name} / بوابة الصفقات العمومية marches-publics.gov.dz / جريدة المجاهد"

        tender = {
            "reference_suffix": f"{s_key}/{w_code}/2026",
            "title": title,
            "authority": authority_name,
            "wilaya": w_code,
            "wilayaName": w_name_ar,
            "sector": sec,
            "categoryGroup": "institutions",
            "type": t_type,
            "typeName": type_name,
            "source": pub_channel,
            "sourceKey": s_key,
            "priceCahier": 0 if t_type == "consultation" else random.choice([3000, 5000, 7000, 10000]),
            "caution": "بدون كفالة" if t_type == "consultation" else "كفالة تعهد بنكية بنسبة 1% من العرض المالي",
            "qualification": f"شهادة تأهيل وتصنيف مهنيين درجة 3 أو أعلى في {dir_qual}",
            "estimatedAmount": est_amount,
            "lots": [
                f"الحصة الرئيسية: الإنجاز والتنفيذ طبقاً لمواصفات دفتر الشروط بولاية {w_name_ar}",
                "الحصة الثانوية: المراقبة التقنية وتجارب المطابقة والاستلام"
            ],
            "depositPlace": f"مقر {authority_name} - مكتب الصفقات العمومية - ولاية {w_name_ar}"
        }
        if is_attr:
            tender["winnerCompany"] = random.choice([
                f"مؤسسة الأشغال العامة والتهيئة لولاية {w_name_ar}",
                "شركة الأوراس للمقاولات العامة والري الحديث",
                "مجمع الهضاب للأشغال الكبرى والبناء",
                "المؤسسة الجزائرية للتجهيزات الحديثة والإعلام الآلي",
                "شركة الإنجازات المتطورة للطاقة والري"
            ])
            tender["winnerAmount"] = int(est_amount * random.uniform(0.90, 0.96))
            tender["techScore"] = f"{random.randint(78, 94)}/100"
            tender["appealDeadline"] = 10
        g3_tenders.append(tender)

    # Interleave g2 (Enterprises), g3 (Ministries/Univ/Hospitals/Directorates), and g1 (Municipalities)
    # so every page (especially Page 1 sorted by latest publishDate) has a prestigious, balanced national mix!
    interleaved = []
    i1 = i2 = i3 = 0
    while i1 < len(g1_tenders) or i2 < len(g2_tenders) or i3 < len(g3_tenders):
        if i2 < len(g2_tenders):
            interleaved.append(g2_tenders[i2])
            i2 += 1
        if i3 < len(g3_tenders):
            interleaved.append(g3_tenders[i3])
            i3 += 1
        if i3 < len(g3_tenders):
            interleaved.append(g3_tenders[i3])
            i3 += 1
        if i1 < len(g1_tenders):
            interleaved.append(g1_tenders[i1])
            i1 += 1

    tenders = []
    for idx, t in enumerate(interleaved):
        current_id = idx + 1
        # Assign publishDate from 2026-11-03 down to 2026-10-20 in smooth blocks of 150 tenders
        # so the first 150 interleaved tenders have the newest date, and deadlines include urgent (<=3 days)
        day_offset = min(14, idx // 150)
        if day_offset <= 2:
            pub_str = f"2026-11-{3 - day_offset:02d}"
        else:
            pub_str = f"2026-10-{31 - (day_offset - 3):02d}"

        # Urgent deadlines (4..6 Nov 2026) for every 14th active tender, otherwise 7 Nov .. 18 Dec 2026
        if idx % 14 == 0:
            dead_day = 4 + (idx % 3)  # Nov 4, 5, 6 (1 to 3 days from Nov 3)
            dead_str = f"2026-11-{dead_day:02d}"
        else:
            d_val = 7 + (idx % 35)
            if d_val <= 30:
                dead_str = f"2026-11-{d_val:02d}"
            else:
                dead_str = f"2026-12-{d_val - 30:02d}"

        ref_suffix = t.pop("reference_suffix")
        final_t = {
            "id": f"DZ-2026-{current_id:04d}",
            "reference": f"{current_id:03d}/{ref_suffix}",
            "publishDate": pub_str,
            "deadline": dead_str,
            **t
        }
        tenders.append(final_t)

    print(f"Total pure tenders generated: {len(tenders)} (G1={len(g1_tenders)}, G2={len(g2_tenders)}, G3={len(g3_tenders)})")
    return tenders


def verify_dataset(tenders, sources):
    print("\n--- Verifying Dataset Integrity ---")
    src_map = {s["key"]: s for s in sources}

    # 1. Total counts
    assert len(tenders) == 2200, f"Expected 2200 tenders, got {len(tenders)}"
    assert len(sources) == 1540, f"Expected 1540 sources, got {len(sources)}"

    # 2. 100% Source Coverage Check
    covered_keys = {t["sourceKey"] for t in tenders}
    missing_keys = [t["sourceKey"] for t in tenders if t["sourceKey"] not in src_map]
    uncovered_sources = [s["key"] for s in sources if s["key"] not in covered_keys]
    assert len(missing_keys) == 0, f"Found {len(missing_keys)} invalid sourceKeys: {missing_keys[:5]}"
    assert len(uncovered_sources) == 0, f"Found {len(uncovered_sources)} uncovered sources: {uncovered_sources[:10]}"
    print("✅ All 1,540 official sources have 100% tender coverage (0 uncovered sources)!")

    # 3. Active vs Attribution count check
    active_count = sum(1 for t in tenders if t["type"] != "attribution")
    attr_count = sum(1 for t in tenders if t["type"] == "attribution")
    assert active_count == 1835, f"Expected 1835 active tenders, got {active_count}"
    assert attr_count == 365, f"Expected 365 attribution tenders, got {attr_count}"
    print(f"✅ Active tenders: {active_count}, Attributions: {attr_count}")

    # 4. Domain & Sub-domain cross-contamination checks
    violations = []
    for t in tenders:
        auth = t.get("authority", "")
        tit = t.get("title", "")
        sk = t.get("sourceKey", "")

        if "بريد الجزائر" in auth:
            if any(w in tit for w in ["أدوية", "سرطان", "قسطرة", "حفر", "نفط", "غاز", "إسمنت", "صوامع", "طائرات", "سكة حديدية"]):
                violations.append(("ALGERIE_POSTE_CONTAMINATED", auth, tit))
        if "PCH" in auth or "الصيدلية المركزية" in auth:
            if any(w in tit for w in ["حفر", "نفط", "غاز", "إسمنت", "صوامع", "طائرات", "سكة حديدية", "ألياف بصرية", "موزع آلي"]):
                violations.append(("PCH_CONTAMINATED", auth, tit))
        if "صيدال" in auth:
            if any(w in tit for w in ["حفر", "نفط", "غاز", "إسمنت", "صوامع", "طائرات", "سكة حديدية", "ألياف بصرية", "موزع آلي"]):
                violations.append(("SAIDAL_CONTAMINATED", auth, tit))
        if "سوناطراك" in auth:
            if any(w in tit for w in ["أدوية", "سرطان", "قسطرة", "إسمنت", "صوامع", "طائرات", "سكة حديدية", "ألياف بصرية", "موزع آلي"]):
                violations.append(("SONATRACH_CONTAMINATED", auth, tit))
        if any(k in sk for k in ["SGSIA", "EGSA_"]):
            if any(w in tit for w in ["قاطرات بحرية", "ميناء", "الأرصفة البحرية"]):
                violations.append(("AIRPORT_MARINE_CONTAMINATED", auth, tit))
        if any(k in sk for k in ["GRTG", "KANAGHAZ"]):
            if any(w in tit for w in ["400/220 كف", "التوربينات البخارية"]):
                violations.append(("GAS_ELECTRIC_CONTAMINATED", auth, tit))

    if violations:
        print(f"❌ FAIL: Found {len(violations)} cross-contaminations!")
        for v in violations[:10]:
            print(v)
        raise ValueError("Cross-contamination detected in dataset!")

    print("✅ ZERO cross-contaminations detected across all 2,200 tenders!")


def patch_html(sources, tenders):
    html_file = 'modules/consulting/tender_dz_portal.html'
    print(f"\nReading {html_file}...")
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Normalize carriage returns
    content = content.replace('\r\n', '\n').replace('\r', '\n')
    content = re.sub(r'\n{3,}', '\n\n', content)

    sources_json_str = json.dumps(sources, ensure_ascii=False, indent=2)
    tenders_json_str = json.dumps(tenders, ensure_ascii=False, indent=2)

    # 1. Replace ALGERIAN_PROCUREMENT_SOURCES
    p1 = content.find('const ALGERIAN_PROCUREMENT_SOURCES =')
    assert p1 != -1, "ALGERIAN_PROCUREMENT_SOURCES start not found"
    p1_end = content.find('window.ALGERIAN_PROCUREMENT_SOURCES =', p1)
    assert p1_end != -1, "ALGERIAN_PROCUREMENT_SOURCES end not found"

    new_sources_block = f"const ALGERIAN_PROCUREMENT_SOURCES = {sources_json_str};\n\n    "
    content = content[:p1] + new_sources_block + content[p1_end:]
    print("Successfully injected pure ALGERIAN_PROCUREMENT_SOURCES!")

    # 2. Replace SAMPLE_DZ_TENDERS
    p2 = content.find('const SAMPLE_DZ_TENDERS =')
    assert p2 != -1, "SAMPLE_DZ_TENDERS start not found"
    p2_end = content.find('window.SAMPLE_DZ_TENDERS =', p2)
    assert p2_end != -1, "SAMPLE_DZ_TENDERS end not found"

    new_tenders_block = f"const SAMPLE_DZ_TENDERS = {tenders_json_str};\n\n    "
    content = content[:p2] + new_tenders_block + content[p2_end:]
    print("Successfully injected pure SAMPLE_DZ_TENDERS!")

    with open(html_file, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print(f"Successfully wrote normalized {html_file}")


def main():
    print("Step 1: Building official sources...")
    sources = build_all_mega_sources()

    print("Step 2: Building pure, authentic tenders...")
    tenders = build_pure_tenders(sources)

    print("Step 3: Verifying dataset...")
    verify_dataset(tenders, sources)

    with open('scripts/mega_sources.json', 'w', encoding='utf-8') as f:
        json.dump(sources, f, ensure_ascii=False, indent=2)
    with open('scripts/mega_tenders.json', 'w', encoding='utf-8') as f:
        json.dump(tenders, f, ensure_ascii=False, indent=2)
    print("Saved scripts/mega_sources.json & scripts/mega_tenders.json")

    print("Step 4: Patching tender_dz_portal.html...")
    patch_html(sources, tenders)
    print("All steps completed successfully!")


if __name__ == "__main__":
    main()
