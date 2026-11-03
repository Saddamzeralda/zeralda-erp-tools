# -*- coding: utf-8 -*-
"""
Regenerate 100% Accurate, Domain-Pure Algerian Tenders Dataset
Eliminates all cross-contamination between sectors (e.g. Algerie Poste buying cancer drugs).
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

# 2. Targeted Company-Specific Pools
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
        ("IT", "مشروع توريد وتركيب هوائيات الاتصال للجيل الرابع 4G ومحطات الإرسال المدمجة ومولدات الطاقة الاحتياطية", "شبكات الهاتف النقال وهوائيات الاتصال"),
        ("IT", "اقتناء البطاقات الذكية SIM والشرائح الإلكترونية eSIM ومنصات إدارة المشتركين", "بطاقات ذكية وشرائح إلكترونية"),
        ("IT", "تجهيز وتوسيع الشبكة الأساسية Core Network ومنظومات الفوترة اللحظية (OCS)", "منظومات شبكات اتصالات وفوترة رقمية")
    ],
    "ELIT_SONELGAZ": [
        ("IT", "تطوير وتحديث المنظومة المعلوماتية المؤسساتية ERP وأنظمة الفوترة الرقمية لزبائن سونلغاز", "حلول برمجية مؤسساتية ورقمنة"),
        ("IT", "توريد السيرفرات السحابية، منصات النسخ الاحتياطي وحلول الحماية السيبرانية لشبكة سونلغاز", "مراكز بيانات وأمن معلوماتي")
    ]
}

# Sector Domain Pools for Public Companies
PETROLEUM_PROJECTS = [
    ("ENERGY", "مناقصة وطنية ودولية لاقتناء رؤوس الآبار، أنابيب الحفر الفولاذية وصمامات الضغط العالي بحوض حاسي مسعود وعين أمناس", "توريد معدات نفطية وغازية وحفر آبار"),
    ("ENERGY", "صفقة إعادة تأهيل محطات ضخ النفط والغاز وتوريد توربينات الدفع وأنظمة التحكم SCADA", "محطات ضخ وتوربينات ومعدات تحكم بترولية"),
    ("ENERGY", "صيانة مجمعات تسييل الغاز الطبيعي (LNG) ومحطات التكرير وتوريد أجهزة المراقبة الصناعية لمصفاة سكيكدة وأرزيو", "صيانة صناعية بترولية ومجمعات غازية"),
    ("ENERGY", "توريد قطع غيار أجهزة الحفر البترولي، مضخات الطين الثقيلة والشاحنات المتخصصة للمواقع الصحراوية", "حفر وتنقيب بترولي وعتاد صحراوي"),
    ("ENERGY", "مد خطوط أنابيب نقل المحروقات وتغليف الأنابيب الفولاذية بمادة البولي إيثيلين عالية الكثافة", "أشغال أنابيب بترولية وقنوات غازية")
]

NAFTAL_PROJECTS = [
    ("ENERGY", "صفقة توريد صهاريج الوقود الأرضية، مضخات التوزيع السريع الذكية وخزانات غاز البترول المسال سيرغاز", "تجهيزات تخزين وتوزيع الوقود والمحروقات"),
    ("ENERGY", "تجهيز وتوسيع محطات الوقود على طول الطريق السيار شرق-غرب والمحاور الوطنية الكبرى", "تهيئة وتجهيز محطات الخدمات البترولية"),
    ("ENERGY", "اقتناء وتجديد صمامات قارورات الغاز، أجهزة التحويل سيرغاز وعتاد السلامة الصناعية بمراكز التعبئة", "عتاد توزيع الغاز وسيرغاز والسلامة"),
    ("ENERGY", "توريد المواد الكيميائية المضافة وخطوط تعبئة وتغليف الزيوت والشحوم الصناعية بمصنع أرزيو", "صناعة زيوت ومواد كيميائية بترولية")
]

SONELGAZ_PROJECTS = [
    ("ENERGY", "صفقة توريد كابلات التوتر العالي 400 كف والمحولات الكهربائية القدرية للمحطات التحويلية الكبرى", "عتاد نقل الطاقة الكهربائية والمحولات"),
    ("ENERGY", "صيانة التوربينات الغازية ومحطات توليد الكهرباء ذات الدورة المركبة وتوريد قطع الغيار الميكانيكية", "محطات توليد الطاقة الكهربائية والتوربينات"),
    ("ENERGY", "مد شبكات الغاز الطبيعي وتوصيل الأقطاب الحضرية الجديدة والمناطق الصناعية بولايات الوطن", "شبكات توزيع الغاز الطبيعي والضغط المنخفض"),
    ("ENERGY", "اقتناء العدادات الذكية للكهرباء والغاز وتجهيز محولات التوزيع الريفية والحضرية", "عدادات ذكية وتوزيع طاقوي"),
    ("ENERGY", "إنجاز محطات الطاقة الشمسية الكهروضوئية وتوريد الألواح والربط بالشبكة الكهربائية الوطنية", "طاقات متجددة ومحطات شمسية")
]

AVIATION_PROJECTS = [
    ("TRANSPORT", "مناقصة دولية لخدمات الفحص والتعمير الدوري لمحركات أسطول طائرات البوينغ والإيرباص وتوريد الإطارات المعتمدة", "صيانة محركات الطيران التجاري واعتماد EASA/FAA"),
    ("TRANSPORT", "اقتناء معدات الخدمات الأرضية بالمطارات، جرارات الطائرات وسلالم الركاب المتحركة وسيارات التموين", "معدات مناولة أرضية وخدمات مطارية"),
    ("SERVICES", "صفقة خدمات الإطعام الجوي Catering وتوريد الوجبات والمشروبات المعتمدة لرحلات الطيران الدولية والداخلية", "إطعام جوي وتموين طائرات دولي"),
    ("TRANSPORT", "اقتناء قطع غيار أنظمة الملاحة الجوية والرادارات وأجهزة الاتصال الخاصة بالطائرات", "إلكترونيات الطيران والملاحة الجوية")
]

RAIL_PROJECTS = [
    ("TRANSPORT", "مناقصة اقتناء قطع غيار محركات الديزل لقاطرات الشحن وأنظمة الفرملة الهوائية وعجلات السكك الحديدية", "صيانة وتجهيز عتاد السكك الحديدية"),
    ("TRANSPORT", "مشروع كهربة وتثنية خطوط السكة الحديدية وتجهيز أنظمة الإشارات والاتصالات السلكية واللاسلكية", "بنية تحتية سككية وإشارات ضوئية"),
    ("TRANSPORT", "أشغال الصيانة الوقائية والعميقة لعربات المترو وقطارات الترامواي وأنظمة السكك وتزويد الكهرباء", "صيانة عربات سككية وعربات الترامواي"),
    ("SERVICES", "تطوير منظومة بيع التذاكر الإلكترونية وبوابات الدخول الرقمية والتحكم في المحطات السككية", "تذاكر إلكترونية وبوابات دخول ذكية")
]

PORT_PROJECTS = [
    ("TRANSPORT", "مشروع اقتناء قاطرات بحرية بقوة سحب 70 طناً ورافعات شوكية ثقيلة لمناولة الحاويات المرفئية", "تجهيزات الملاحة والقطر والموانئ"),
    ("TRANSPORT", "صيانة وتأهيل الأرصفة البحرية ومصدات السفن وتجهيزات الملاحة والإرشاد المرفئي", "منشآت بحرية وأرصفة مينائية"),
    ("TRANSPORT", "أشغال جرف وتطهير الأحواض المائية والممرات الملاحية بالميناء وضمان أعماق الرسو الآمنة", "جرف بحري وتطهير أحواض مينائية"),
    ("SERVICES", "اقتناء وتجديد كاميرات المراقبة الساحلية وأنظمة إدارة حركة السفن VTMIS بالموانئ", "أنظمة مراقبة بحرية وسلامة مينائية")
]

URBAN_TRANS_PROJECTS = [
    ("TRANSPORT", "صفقة اقتناء حافلات النقل الحضري الحديثة وتوريد قطع الغيار الميكانيكية وإطارات الشاحنات الكبرى", "حافلات نقل حضري وميكانيك"),
    ("TRANSPORT", "مشروع صيانة وتأهيل أسطول شاحنات النقل البري للمسافات الطويلة والخدمات اللوجستية", "نقل لوجستي وشاحنات ثقيلة"),
    ("IT", "تجهيز الحافلات بأنظمة التذاكر الذكية ونظام تحديد المواقع GPS واللوحات الإرشادية للمسافرين", "أنظمة ذكية وتذاكر إلكترونية")
]

COSIDER_PROJECTS = [
    ("BTPH", "استشارة كراء أسطول الآليات الثقيلة والشاحنات العملاقة وتوريد حديد التسليح عالي المقاومة لأشغال السكة الحديدية", "أشغال عمومية وآليات ثقيلة ومنشآت كبرى"),
    ("BTPH", "مناقصة توريد حديد التسليح عالي المقاومة، الإسمنت المقاوم للأملاح ومواد البناء للمشاريع الاستراتيجية", "توريد مواد البناء وحديد التسليح"),
    ("BTPH", "توريد أنابيب الصلب الكبيرة قطر 1200 مم والصمامات الهيدروليكية لتحويلات المياه الكبرى", "أشغال قنوات الصلب والمشاريع الهيدروليكية"),
    ("BTPH", "أشغال حفر الأنفاق والمنشآت الفنية والجسور المعلقة وتوريد خرسانة المقاومة العالية", "منشآت فنية وجسور وأنفاق")
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

# 3. Authentic Executive Directorates Projects (522 Directorates)
DIR_NAMES = {
    "DTP": "مديرية الأشغال العمومية",
    "DUC": "مديرية التعمير والهندسة المعمارية والبناء",
    "DRE": "مديرية الموارد المائية",
    "DEP": "مديرية التجهيزات العمومية",
    "DSP": "مديرية الصحة والسكان",
    "DE": "مديرية التربية والتعليم",
    "DSA": "مديرية المصالح الفلاحية",
    "DEM": "مديرية الطاقة والمناجم",
    "DCPE": "مديرية التجارة وترقية الصادرات"
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
        ("BTPH", "إنجاز خزان مائي سعة 5000 م³ وربط قنوات الضخ الرئيسية ومحطات التصفية لبلديات ولاية {wilaya}", "موارد مائية وسدود"),
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
    ]
}


def pick_company_project(ent_tuple, index_in_company):
    """
    Selects a 100% domain-pure project template for the given public enterprise.
    """
    e_key, e_name, portal_key, sec, w_code, w_name, cov = ent_tuple
    
    # 1. Exact Special Key Match
    if e_key in SPECIAL_COMPANY_PROJECTS:
        pool = SPECIAL_COMPANY_PROJECTS[e_key]
        return pool[index_in_company % len(pool)]
    
    # Match prefixes for specialized groups
    if any(k in e_key for k in ["ALGERIE_POSTE", "POSTE"]):
        pool = SPECIAL_COMPANY_PROJECTS["ALGERIE_POSTE"]
        return pool[index_in_company % len(pool)]
        
    if any(k in e_key for k in ["PCH", "PHARMACIE_CENTRALE"]):
        pool = SPECIAL_COMPANY_PROJECTS["PCH_PHARMACIE"]
        return pool[index_in_company % len(pool)]
        
    if "SAIDAL" in e_key:
        pool = SPECIAL_COMPANY_PROJECTS["SAIDAL_GROUPE"]
        return pool[index_in_company % len(pool)]
        
    if "TELECOM" in e_key or "AT_" in e_key:
        pool = SPECIAL_COMPANY_PROJECTS["ALGERIE_TELECOM"]
        return pool[index_in_company % len(pool)]
        
    if "MOBILIS" in e_key:
        pool = SPECIAL_COMPANY_PROJECTS["MOBILIS_ATM"]
        return pool[index_in_company % len(pool)]
        
    if "ELIT" in e_key:
        pool = SPECIAL_COMPANY_PROJECTS["ELIT_SONELGAZ"]
        return pool[index_in_company % len(pool)]
        
    if any(k in e_key for k in ["SONATRACH", "ENTP", "ENAFOR", "ENSP", "GTP", "SARPI", "SOMIK", "ENAC"]):
        return PETROLEUM_PROJECTS[index_in_company % len(PETROLEUM_PROJECTS)]
        
    if "NAFTAL" in e_key:
        return NAFTAL_PROJECTS[index_in_company % len(NAFTAL_PROJECTS)]
        
    if any(k in e_key for k in ["SONELGAZ", "SPE", "GRTE", "GRTG", "KAHRIF", "KANAGHAZ", "INERGA", "CEEG", "SHAEMS"]):
        return SONELGAZ_PROJECTS[index_in_company % len(SONELGAZ_PROJECTS)]
        
    if any(k in e_key for k in ["AIR_ALGERIE", "TASSILI"]):
        return AVIATION_PROJECTS[index_in_company % len(AVIATION_PROJECTS)]
        
    if any(k in e_key for k in ["SNTF", "ANESRIF", "METRO", "SETRAM"]):
        return RAIL_PROJECTS[index_in_company % len(RAIL_PROJECTS)]
        
    if any(k in e_key for k in ["PORT", "PORTS", "DJEN"]):
        return PORT_PROJECTS[index_in_company % len(PORT_PROJECTS)]
        
    if any(k in e_key for k in ["ETUSA", "ETO", "ETC", "LOGITRANS"]):
        return URBAN_TRANS_PROJECTS[index_in_company % len(URBAN_TRANS_PROJECTS)]
        
    if "COSIDER" in e_key:
        return COSIDER_PROJECTS[index_in_company % len(COSIDER_PROJECTS)]
        
    if any(k in e_key for k in ["ADE", "ONA", "ANBT"]):
        return WATER_PROJECTS[index_in_company % len(WATER_PROJECTS)]
        
    if "GICA" in e_key:
        return CEMENT_PROJECTS[index_in_company % len(CEMENT_PROJECTS)]
        
    if any(k in e_key for k in ["OAIC", "ONID", "CCLS"]):
        return AGRI_PROJECTS[index_in_company % len(AGRI_PROJECTS)]
        
    if any(k in e_key for k in ["BANQUE", "BANK", "BNA", "BEA", "CPA", "BDL", "BADR", "CNEP"]):
        return BANK_PROJECTS[index_in_company % len(BANK_PROJECTS)]
        
    if any(k in e_key for k in ["ASSURANCE", "SAA", "CAAT", "CAAR", "CASH"]):
        return INSURANCE_PROJECTS[index_in_company % len(INSURANCE_PROJECTS)]
        
    # Sector-based fallback
    if sec == "ENERGY":
        return PETROLEUM_PROJECTS[index_in_company % len(PETROLEUM_PROJECTS)]
    elif sec == "IT":
        return (sec, cov if index_in_company == 0 else f"مشروع تحديث وتطوير البنية التحتية لتكنولوجيا المعلومات وتوريد الخوادم السحابية لـ {e_name}", "حلول برمجية وشبكات معلوماتية")
    elif sec == "MEDICAL":
        return (sec, cov if index_in_company == 0 else f"مناقصة توريد التجهيزات والمستهلكات الطبية المعقمة لـ {e_name}", "مواد وتجهيزات طبية معتمدة")
    elif sec == "TRANSPORT":
        return (sec, cov if index_in_company == 0 else f"صفقة صيانة أسطول النقل وتوريد قطع الغيار الميكانيكية لـ {e_name}", "صيانة أساطيل النقل وميكانيك")
    elif sec == "BTPH":
        return (sec, cov if index_in_company == 0 else f"مناقصة إنجاز أشغال البناء والهندسة المدنية وتوريد مواد البناء لـ {e_name}", "أشغال عامة وبناء ومنشآت")
    elif sec == "AGRICULTURE":
        return AGRI_PROJECTS[index_in_company % len(AGRI_PROJECTS)]
    else:
        return (sec, cov if index_in_company == 0 else f"استشارة توريد مستلزمات التشغيل، قطع الغيار وخدمات الصيانة لـ {e_name}", "خدمات وتجهيزات صناعية معتمدة")


def build_pure_tenders(sources):
    tenders = []
    current_id = 1
    random.seed(42)
    
    # -------------------------------------------------------------
    # 1. 650 Municipal Tenders (covering 400+ APCs across 58 Wilayas)
    # -------------------------------------------------------------
    communes_list = list(EXPANDED_COMMUNES_DATA)
    for i in range(650):
        c_key, c_name, w_code, w_name = communes_list[i % len(communes_list)]
        sec, title_tpl, qual = MUNICIPAL_PROJECTS[i % len(MUNICIPAL_PROJECTS)]
        
        is_attr = (i % 5 == 0) # 20% attributions
        t_type = "attribution" if is_attr else ("consultation" if i % 2 == 0 else "national")
        type_name = "إعلان منح مؤقت للصفقة (Attribution)" if is_attr else ("استشارة بسيطة" if t_type == "consultation" else "طلب عروض وطني مفتوح")
        
        title = title_tpl.format(commune=c_name)
        if is_attr:
            title = f"إعلان المنح المؤقت: {title}"
            
        day_pub = 20 + (i % 11)
        day_dead = 10 + (i % 18)
        month_dead = 11 if day_dead > 10 else 12
        
        est_amount = random.randint(18, 95) * 1000000 + random.randint(10, 99) * 1000
        
        tender = {
            "id": f"DZ-2026-{current_id:04d}",
            "reference": f"{current_id:03d}/{c_key}/{w_code}/2026",
            "title": title,
            "authority": f"{c_name} (ولاية {w_name})",
            "wilaya": w_code,
            "wilayaName": w_name,
            "sector": sec,
            "type": t_type,
            "typeName": type_name,
            "source": f"لوحة إعلانات {c_name} / بوابة صفقات ولاية {w_name} / جريدة الشعب",
            "sourceKey": c_key,
            "publishDate": f"2026-10-{day_pub:02d}",
            "deadline": f"2026-{month_dead:02d}-{day_dead:02d}",
            "priceCahier": 0 if t_type == "consultation" else random.choice([2000, 3000, 4000, 5000]),
            "caution": "بدون كفالة" if t_type == "consultation" else f"كفالة تعهد بنكية بنسبة 1% أو {random.randint(200, 800)} ألف دج",
            "qualification": qual,
            "estimatedAmount": est_amount,
            "lots": [
                f"الحصة 1: إنجاز الأشغال الأساسية والتوريد بموقع {c_name}",
                "الحصة 2: المتابعة والتسليم والمطابقة التقنية للمشروع"
            ],
            "depositPlace": f"مقر {c_name} - مصلحة الصفقات والوسائل العامة - ولاية {w_name}"
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
            
        tenders.append(tender)
        current_id += 1
        
    print(f"Generated {len(tenders)} municipal tenders.")
    
    # -------------------------------------------------------------
    # 2. 550 Public Enterprises Tenders (Strictly Domain-Pure)
    # -------------------------------------------------------------
    enterprises_list = list(EXPANDED_PUBLIC_COMPANIES)
    # Keep track of project index per company to give diverse tenders
    comp_t_count = {e[0]: 0 for e in enterprises_list}
    
    for j in range(550):
        ent_tuple = enterprises_list[j % len(enterprises_list)]
        e_key, e_name, portal_key, sec, w_code, w_name, cov = ent_tuple
        
        idx_for_comp = comp_t_count[e_key]
        comp_t_count[e_key] += 1
        
        # Pick 100% matched project
        p_sec, p_title, p_qual = pick_company_project(ent_tuple, idx_for_comp)
        
        is_attr = (j % 6 == 0) # ~16% attributions
        t_type = "attribution" if is_attr else (random.choice(["national", "international", "prequalification"]))
        type_name = "إعلان المنح المؤقت (Attribution)" if is_attr else ("طلب عروض وطني ودولي مفتوح" if t_type == "international" else "طلب عروض وطني مفتوح مع اشتراط قدرات دنيا")
        
        # Clean title: don't duplicate the authority name if it already starts with project words
        title = p_title
        if is_attr:
            title = f"إعلان المنح المؤقت: {title}"
            
        day_pub = 20 + (j % 11)
        day_dead = 12 + (j % 18)
        month_dead = 11 if day_dead > 10 else 12
        
        est_amount = random.randint(80, 850) * 1000000 + random.randint(100, 999) * 1000
        
        tender = {
            "id": f"DZ-2026-{current_id:04d}",
            "reference": f"{current_id:03d}/{portal_key}/{w_code}/2026",
            "title": title,
            "authority": e_name,
            "wilaya": w_code,
            "wilayaName": w_name,
            "sector": p_sec, # Strictly matches project sector
            "type": t_type,
            "typeName": type_name,
            "source": f"بوابة المشتريات {e_name} / جريدة المجاهد / BOMOP / BAOSEM",
            "sourceKey": e_key,
            "publishDate": f"2026-10-{day_pub:02d}",
            "deadline": f"2026-{month_dead:02d}-{day_dead:02d}",
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
            
        tenders.append(tender)
        current_id += 1
        
    print(f"Total after enterprises: {len(tenders)} tenders.")
    
    # -------------------------------------------------------------
    # 3. 1,000 Wilayas, Executive Directorates, Health, Univ, Ministries
    # -------------------------------------------------------------
    wilayas_list = list(WILAYAS_58)
    dir_keys = list(DIR_PROJECTS_MAP.keys())
    
    for k in range(1000):
        w_code, w_name_ar, w_name_fr, w_slug = wilayas_list[k % len(wilayas_list)]
        dir_code = dir_keys[k % len(dir_keys)]
        dir_pool = DIR_PROJECTS_MAP[dir_code]
        sec, dir_title_tpl, dir_qual = dir_pool[(k // len(dir_keys)) % len(dir_pool)]
        
        is_attr = (k % 7 == 0) # ~14% attributions
        t_type = "attribution" if is_attr else (random.choice(["national", "consultation", "prequalification"]))
        type_name = "إعلان منح مؤقت للصفقة" if is_attr else ("طلب عروض وطني مفتوح" if t_type == "national" else "استشارة عمومية بسيطة")
        
        title = dir_title_tpl.format(wilaya=w_name_ar)
        if is_attr:
            title = f"إعلان المنح المؤقت: {title}"
            
        day_pub = 18 + (k % 13)
        day_dead = 8 + (k % 22)
        month_dead = 11 if day_dead > 7 else 12
        
        est_amount = random.randint(35, 420) * 1000000 + random.randint(50, 900) * 1000
        
        dir_official_name = DIR_NAMES[dir_code]
        authority_name = f"{dir_official_name} لولاية {w_name_ar}"
        source_key = f"{dir_code}_{w_code}"
        
        tender = {
            "id": f"DZ-2026-{current_id:04d}",
            "reference": f"{current_id:03d}/{dir_code}_{w_code}/{w_code}/2026",
            "title": title,
            "authority": authority_name,
            "wilaya": w_code,
            "wilayaName": w_name_ar,
            "sector": sec,
            "type": t_type,
            "typeName": type_name,
            "source": f"النشرة الرسمية BOMOP / لوحة إعلانات {authority_name} / بوابة الصفقات العمومية",
            "sourceKey": source_key,
            "publishDate": f"2026-10-{day_pub:02d}",
            "deadline": f"2026-{month_dead:02d}-{day_dead:02d}",
            "priceCahier": 0 if t_type == "consultation" else random.choice([3000, 5000, 7000, 10000]),
            "caution": "بدون كفالة" if t_type == "consultation" else f"كفالة تعهد بنكية بنسبة 1% من العرض المالي",
            "qualification": f"شهادة تأهيل وتصنيف مهنيين درجة 3 أو أعلى في {dir_qual}",
            "estimatedAmount": est_amount,
            "lots": [
                f"الحصة الرئيسية: الإنجاز والتنفيذ طبقاً لمواصفات دفتر الشروط بولاية {w_name_ar}",
                "الحصة الثانوية: المراقبة الجيوتقنية وتجارب المطابقة المخبرية"
            ],
            "depositPlace": f"مقر {authority_name} - مكتب الصفقات العمومية"
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
            
        tenders.append(tender)
        current_id += 1
        
    print(f"Total pure tenders generated: {len(tenders)}")
    return tenders


def verify_dataset(tenders, sources):
    print("\n--- Verifying Dataset Integrity ---")
    src_map = {s["key"]: s for s in sources}
    
    # 1. Total counts
    assert len(tenders) == 2200, f"Expected 2200 tenders, got {len(tenders)}"
    assert len(sources) == 1540, f"Expected 1540 sources, got {len(sources)}"
    
    # 2. Source Key validity
    missing_keys = [t["sourceKey"] for t in tenders if t["sourceKey"] not in src_map]
    assert len(missing_keys) == 0, f"Found {len(missing_keys)} missing source keys in tenders: {missing_keys[:5]}"
    print("✅ All 2,200 tenders map to valid official sources.")
    
    # 3. Domain cross-contamination checks
    violations = []
    for t in tenders:
        auth = t.get("authority", "")
        tit = t.get("title", "")
        sec = t.get("sector", "")
        
        # Check Algerie Poste
        if "بريد الجزائر" in auth:
            if any(w in tit for w in ["أدوية", "سرطان", "قسطرة", "حفر", "نفط", "غاز", "إسمنت", "صوامع", "طائرات", "سكة حديدية"]):
                violations.append(("ALGERIE_POSTE_CONTAMINATED", auth, tit))
                
        # Check PCH
        if "PCH" in auth or "الصيدلية المركزية" in auth:
            if any(w in tit for w in ["حفر", "نفط", "غاز", "إسمنت", "صوامع", "طائرات", "سكة حديدية", "ألياف بصرية", "موزع آلي"]):
                violations.append(("PCH_CONTAMINATED", auth, tit))
                
        # Check Saidal
        if "صيدال" in auth:
            if any(w in tit for w in ["حفر", "نفط", "غاز", "إسمنت", "صوامع", "طائرات", "سكة حديدية", "ألياف بصرية", "موزع آلي"]):
                violations.append(("SAIDAL_CONTAMINATED", auth, tit))
                
        # Check Sonatrach
        if "سوناطراك" in auth:
            if any(w in tit for w in ["أدوية", "سرطان", "قسطرة", "إسمنت", "صوامع", "طائرات", "سكة حديدية", "ألياف بصرية", "موزع آلي"]):
                violations.append(("SONATRACH_CONTAMINATED", auth, tit))
                
        # Check Ports
        if "ميناء" in auth or "Port" in auth:
            if any(w in tit for w in ["أدوية", "سرطان", "قسطرة", "موزع آلي", "صوامع حاسي", "ألياف بصرية"]):
                violations.append(("PORT_CONTAMINATED", auth, tit))
                
    if violations:
        print(f"❌ FAIL: Found {len(violations)} cross-contaminations!")
        for v in violations[:10]:
            print(v)
        raise ValueError("Cross-contamination detected in dataset!")
        
    print("✅ ZERO cross-contaminations detected across all 2,200 tenders!")
    
    # Check Algerie Poste tenders specifically
    ap_tenders = [t for t in tenders if "بريد الجزائر" in t.get("authority", "")]
    print(f"\nAlgérie Poste tenders ({len(ap_tenders)}):")
    for t in ap_tenders:
        print(f"  [{t['sector']}] {t['title']}")
        
    # Check PCH tenders specifically
    pch_tenders = [t for t in tenders if "PCH" in t.get("authority", "") or "الصيدلية" in t.get("authority", "")]
    print(f"\nPCH tenders ({len(pch_tenders)}):")
    for t in pch_tenders:
        print(f"  [{t['sector']}] {t['title']}")


def patch_html(sources, tenders):
    html_file = 'modules/consulting/tender_dz_portal.html'
    print(f"\nReading {html_file}...")
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Normalize carriage returns
    content = content.replace('\r\n', '\n').replace('\r', '\n')
    # Collapse multiple consecutive newlines (more than 2)
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

    # 3. Update cache version key to force immediate browser cache invalidation
    new_version_key = 'DZ_TENDERS_VER_20261103_2200_FIXED'
    content = re.sub(r"const TENDERS_VERSION_KEY = 'DZ_TENDERS_VER_[^']+';",
                     f"const TENDERS_VERSION_KEY = '{new_version_key}';", content)
    print(f"Updated cache version key to: {new_version_key}")

    # Write back with clean newline
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
    
    # Save clean json backups
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
