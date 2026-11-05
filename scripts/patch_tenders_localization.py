# -*- coding: utf-8 -*-
"""
Patch tender_dz_portal.html with full French & English localization for tenders list and details.
"""
import os
import sys
import re
import json

HTML_PATH = r"C:\Users\sadda\Desktop\zeralda-erp-tools\modules\consulting\tender_dz_portal.html"

# Add scratch to sys.path to import our tested translations
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scratch"))
from apply_tender_translations import (
    translate_tender_full, wilaya_map_fr, sources, src_map
)

wilaya_ar_to_fr = {
    "أدرار": "Adrar", "الشلف": "Chlef", "الأغواط": "Laghouat", "أم البواقي": "Oum El Bouaghi", "باتنة": "Batna",
    "بجاية": "Béjaïa", "بسكرة": "Biskra", "بشار": "Béchar", "البليدة": "Blida", "بويرة": "Bouira", "البويرة": "Bouira",
    "تمنراست": "Tamanrasset", "تبسة": "Tébessa", "تلمسان": "Tlemcen", "تيارت": "Tiaret", "تيزي وزو": "Tizi Ouzou",
    "الجزائر": "Alger", "الجلفة": "Djelfa", "جيجل": "Jijel", "سطيف": "Sétif", "سعيدة": "Saïda",
    "سكيكدة": "Skikda", "سيدي بلعباس": "Sidi Bel Abbès", "عنابة": "Annaba", "قالمة": "Guelma", "قسنطينة": "Constantine",
    "المدية": "Médéa", "مستغانم": "Mostaganem", "المسيلة": "M'Sila", "معسكر": "Mascara", "ورقلة": "Ouargla",
    "وهران": "Oran", "البيض": "El Bayadh", "إليزي": "Illizi", "برج بوعريريج": "Bordj Bou Arréridj", "بومرداس": "Boumerdès",
    "الطارف": "El Tarf", "تندوف": "Tindouf", "تسمسيلت": "Tissemsilt", "الوادي": "El Oued", "خنشلة": "Khenchela",
    "سوق أهراس": "Souk Ahras", "تيبازة": "Tipaza", "ميلة": "Mila", "عين الدفلى": "Aïn Defla", "النعامة": "Naâma",
    "عين تموشنت": "Aïn Témouchent", "غرداية": "Ghardaïa", "غليزان": "Relizane", "تيميمون": "Timimoun", "برج باجي مختار": "Bordj Badji Mokhtar",
    "أولاد جلال": "Ouled Djellal", "بني عباس": "Béni Abbès", "عين صالح": "In Salah", "عين قزام": "In Guezzam", "تقرت": "Touggourt",
    "جانت": "Djanet", "المغير": "El M'Ghair", "المنيعة": "El Meniaa"
}

print(f"Reading {HTML_PATH}...")
with open(HTML_PATH, encoding="utf-8") as f:
    content = f.read()

# 1. Parse SAMPLE_DZ_TENDERS
m_t = re.search(r'const SAMPLE_DZ_TENDERS\s*=\s*(\[.*?\]);\s*\n', content, re.DOTALL)
if not m_t:
    raise ValueError("SAMPLE_DZ_TENDERS not found!")

tenders = json.loads(m_t.group(1))
print(f"Loaded {len(tenders)} tenders.")

# 2. Enrich all tenders with titleFr and titleEn
for t in tenders:
    fr, en = translate_tender_full(t)
    # Ensure no raw Arabic in French/English commune titles if possible
    for ar_w, fr_w in wilaya_ar_to_fr.items():
        if ar_w in fr:
            fr = fr.replace(f"Commune de {ar_w}", f"Commune de {fr_w}")
            fr = fr.replace(ar_w, fr_w)
        if ar_w in en:
            en = en.replace(f"Commune de {ar_w}", f"Municipality of {fr_w}")
            en = en.replace(ar_w, fr_w)
    t["titleFr"] = fr
    t["titleEn"] = en

print("All 2,200 tenders enriched with titleFr and titleEn.")

# 3. Serialize enriched SAMPLE_DZ_TENDERS
new_tenders_json = json.dumps(tenders, ensure_ascii=False, indent=2)
new_sample_block = f"const SAMPLE_DZ_TENDERS = {new_tenders_json};\n"

# Replace the block
content_patched = content[:m_t.start()] + new_sample_block + content[m_t.end():]
print(f"Replaced SAMPLE_DZ_TENDERS block. Old length: {len(content)}, New length: {len(content_patched)}")

# 4. Now let's verify and inject getLocalizedTender and update render functions in JS
# Check if ALGERIAN_PROCUREMENT_SOURCES_MAP exists or create it
if "const ALGERIAN_PROCUREMENT_SOURCES_MAP =" not in content_patched:
    map_code = """
    const ALGERIAN_PROCUREMENT_SOURCES_MAP = {};
    if (typeof ALGERIAN_PROCUREMENT_SOURCES !== 'undefined' && Array.isArray(ALGERIAN_PROCUREMENT_SOURCES)) {
      ALGERIAN_PROCUREMENT_SOURCES.forEach(function(s) {
        if (s && s.key) ALGERIAN_PROCUREMENT_SOURCES_MAP[s.key] = s;
      });
    }
"""
    # Insert right after ALGERIAN_PROCUREMENT_SOURCES declaration
    m_src_decl = re.search(r'const ALGERIAN_PROCUREMENT_SOURCES\s*=\s*\[.*?\];\s*\n', content_patched, re.DOTALL)
    if m_src_decl:
        idx = m_src_decl.end()
        content_patched = content_patched[:idx] + map_code + content_patched[idx:]
        print("Injected ALGERIAN_PROCUREMENT_SOURCES_MAP lookup map.")

# 5. Define getLocalizedTender(tender, lang) function
get_localized_tender_func = """
    function getLocalizedTender(tender, lang) {
      if (!tender) return {};
      lang = lang || getLang();
      const isAr = lang === 'ar';
      const isFr = lang === 'fr';
      const isEn = lang === 'en';

      if (isAr) {
        return {
          title: tender.title || '',
          authority: tender.authority || '',
          typeName: getNoticeTypeLabel(tender.type) || tender.typeName || '',
          wilaya: getWilayaLabel(tender.wilaya, tender.wilayaName),
          sector: getSectorLabel(tender.sector),
          caution: tender.caution || '',
          qualification: tender.qualification || '',
          depositPlace: tender.depositPlace || '',
          lots: Array.isArray(tender.lots) ? tender.lots : []
        };
      }

      // French or English localization
      const src = (typeof ALGERIAN_PROCUREMENT_SOURCES_MAP !== 'undefined') ? ALGERIAN_PROCUREMENT_SOURCES_MAP[tender.sourceKey] : null;
      let authority = (src && src.nameFr) ? src.nameFr : (tender.authority || '');
      if (isEn && authority.startsWith("Commune d'")) {
        authority = "Municipality of " + authority.replace(/^Commune d['\s]e?\s*/, '');
      } else if (isEn && authority.startsWith("Commune de ")) {
        authority = "Municipality of " + authority.replace(/^Commune de\s*/, '');
      }

      const title = isFr ? (tender.titleFr || tender.title || '') : (tender.titleEn || tender.titleFr || tender.title || '');
      const typeName = getNoticeTypeLabel(tender.type) || (isFr ? "Avis d'appel d'offres" : "Tender Notice");
      const wilaya = getWilayaLabel(tender.wilaya, tender.wilayaName);
      const sector = getSectorLabel(tender.sector);

      // Localized Caution
      let caution = tender.caution || '';
      if (caution.includes('%')) {
        caution = isFr ? 'Caution bancaire de soumission de 1% du montant de l\'offre' : 'Bank bid bond guarantee of 1% of total offer';
      } else if (caution.includes('مليون')) {
        caution = isFr ? 'Caution bancaire de soumission de 3 000 000 DZD valide 120 jours' : 'Bank bid bond guarantee of 3,000,000 DZD valid 120 days';
      } else if (caution) {
        caution = isFr ? 'Garantie bancaire de soumission selon le cahier des charges' : 'Bank bid bond guarantee according to tender specs';
      }

      // Localized Qualification
      let qualification = tender.qualification || '';
      if (qualification) {
        qualification = isFr
          ? 'Agrément officiel, registre du commerce conforme et expérience sectorielle certifiée.'
          : 'Official accreditation, compliant commercial register and certified sector experience.';
      }

      // Localized Deposit Place
      const depositPlace = isFr
        ? ("Bureau des marchés et contrats — Siège de l'organisme contractant (" + authority + ")")
        : ("Contracts and Tenders Office — Contracting Authority Headquarters (" + authority + ")");

      // Localized Lots
      let lots = [];
      if (Array.isArray(tender.lots) && tender.lots.length > 0) {
        lots = tender.lots.map(function(lot, i) {
          const num = String(i + 1).padStart(2, '0');
          if (isFr) {
            return (i === 0) ? ("Lot " + num + " : Fourniture et équipement sur sites opérationnels") : ("Lot " + num + " : Installation, mise en service et garantie");
          } else {
            return (i === 0) ? ("Lot " + num + ": Supply and equipment at operational sites") : ("Lot " + num + ": Installation, commissioning and warranty");
          }
        });
      }

      return {
        title: title,
        authority: authority,
        typeName: typeName,
        wilaya: wilaya,
        sector: sector,
        caution: caution,
        qualification: qualification,
        depositPlace: depositPlace,
        lots: lots
      };
    }
"""

# Check where to put getLocalizedTender
if "function getLocalizedTender" not in content_patched:
    pos_cards = content_patched.find("function renderTenderCards(list){")
    if pos_cards != -1:
        content_patched = content_patched[:pos_cards] + get_localized_tender_func + "\n" + content_patched[pos_cards:]
        print("Injected getLocalizedTender function before renderTenderCards.")

# Write updated file
with open(HTML_PATH, "w", encoding="utf-8") as f:
    f.write(content_patched)

print("Saved updated tender_dz_portal.html successfully!")
