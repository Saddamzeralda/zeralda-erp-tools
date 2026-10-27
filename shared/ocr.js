// shared/ocr.js
// وحدة OCR الموحدة لـ Zeralda ERP
// يدمج: unified_ocr.js + ocr_field_extractors.js

(function (global) {
  'use strict';

  // ── OcrFieldExtractors ────────────────────────────────────────

  function normalizeArabicDigits(text) {
    return String(text || '')
      // Arabic-Indic digits ٠-٩ (U+0660-U+0669)
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      // Eastern Arabic-Indic digits ۰-۹ (U+06F0-U+06F9, used in Persian/Urdu)
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      // Arabic decimal separator ٫ (U+066B) → dot
      .replace(/\u066B/g, '.')
      // Arabic thousands separator ٬ (U+066C) → remove
      .replace(/\u066C/g, '');
  }

  function normalizeArabicOcrText(text) {
    if (!text) return '';
    var s = String(text);
    try { if (typeof s.normalize === 'function') s = s.normalize('NFKC'); } catch (_) {}
    s = s.replace(/[\u0640]/g, '').replace(/[\u064B-\u065F\u0670]/g, '');
    s = s.replace(/(?:^|\s)([\u0621-\u064A])\s+([\u0621-\u064A])\s+([\u0621-\u064A])(?:\s+([\u0621-\u064A]))*(?=\s|$)/g, function(m) {
      return m.replace(/\s+/g, '');
    });
    var dict = {
      'ةروتالفلا': 'الفاتورة', 'ةروتالف': 'فاتورة', 'عومجملا': 'المجموع',
      'خيراتلا': 'التاريخ', 'ةكرشلا': 'الشركة', 'ليمعلا': 'العميل',
      'دروملا': 'المورد', 'نوبزلا': 'الزبون', 'غلبملا': 'المبلغ',
      'مقرلا': 'الرقم', 'يمكلا': 'الكمية', 'رعسلا': 'السعر',
      'ةبيرضلا': 'الضريبة', 'يملا': 'الإجمالي', 'يفاصلا': 'الصافي',
      'لمعل': 'العمل', 'ناونعلا': 'العنوان', 'فتاهلا': 'الهاتف',
      'لسلسلا': 'السلسلة', 'عقوملا': 'الموقع', 'كحبلا': 'البحث',
      'عئاضبلا': 'البضائع', 'جتنملا': 'المنتج', 'تاجتنملا': 'المنتجات',
      'لسرملا': 'المرسل', 'ملتسملا': 'المستلم', 'عيقوتلا': 'التوقيع',
      'متخلا': 'الختم', 'لصولا': 'الوصل', 'سابحلا': 'الحساب',
      'فرصملا': 'المصرف', 'كنبلا': 'البنك', 'نمثلا': 'الثمن',
      'ةعاطبلا': 'البضاعة', 'لسوتلا': 'التسليم', 'ةقداصملا': 'المصادقة',
      'ةيرئازجلا': 'الجزائرية', 'ةيروهمجلا': 'الجمهورية', 'ةيدلبلا': 'البلدية',
      'ةيلاولا': 'الولاية', 'ةرازو': 'وزارة', 'ةيريدم': 'مديرية',
      'ةقفصلا': 'الصفقة', 'ةصقانملا': 'المناقصة', 'ةراشتسلا': 'الاستشارة',
      'ضرعلا': 'العرض', 'ليصافتلا': 'التفاصيل', 'ةينقتلا': 'التقنية',
      'ةيلاملا': 'المالية', 'ةداهشلا': 'الشهادة', 'ليجستلا': 'التسجيل',
      'خيراتب': 'بتاريخ', 'ملاسلا': 'الاستلام', 'ةداملا': 'المادة'
    };
    for (var rev in dict) {
      // Support prefix and postfix conjunctions (e.g., وعومجملا -> والمجموع, عومجملاو -> والمجموع)
      var re = new RegExp('([وفبلك]?)' + rev + '([وف]?)', 'g');
      s = s.replace(re, function(_, pre, post) {
        var prefix = pre || post || '';
        return prefix + dict[rev];
      });
    }
    return s;
  }

  function pickFirstNonEmpty(values) {
    var list = Array.isArray(values) ? values : [];
    for (var i = 0; i < list.length; i++) {
      var v = String(list[i] || '').trim();
      if (v) return v;
    }
    return '';
  }

  function extractRc(text) {
    var raw = normalizeArabicDigits(text);
    var m = raw.match(/(?:\bRC\b|registre\s+de\s+commerce|السجل\s+التجاري)\s*[:\-]?\s*([A-Z0-9\-\/]{4,40})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractNis(text) {
    var raw = normalizeArabicDigits(text);
    var m = raw.match(/(?:\bNIS\b|num(?:e|é)ro\s+d['']?identification\s+statistique|numero\s+identification\s+statistique|التعريف\s+الإحصائي|رقم\s+التعريف\s+الإحصائي)\s*[:\-]?\s*([A-Z0-9\-\/]{4,40})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractRib(text) {
    var raw = String(text || '');
    if (!raw) return '';
    var m = raw.match(/\b(?:RIB|IBAN)\s*[:\-]?\s*([A-Z0-9\s]{8,40})/i);
    return m ? String(m[1] || '').replace(/\s+/g, ' ').trim() : '';
  }

  function extractVat(text) {
    var raw = String(text || '');
    if (!raw) return '';
    var m = raw.match(/\b(?:TVA|VAT)\s*(?:N(?:o|°|umero)?)?\s*[:\-]?\s*([A-Z0-9\-\/]{4,30})/i);
    return m ? String(m[1] || '').trim() : '';
  }

  function extractAg(text) {
    var raw = normalizeArabicDigits(text);
    var m = raw.match(/(?:\bN\s*[°º]?\s*AG\b|\bAG\b|agr(?:e|é)ment|رقم\s+الترخيص)\s*[:\-]?\s*([A-Z0-9\-\/]{3,40})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractArt(text) {
    var raw = normalizeArabicDigits(text);
    var m = raw.match(/(?:\bN\s*[°º]?\s*d['']?\s*art\b|\bart\b(?:icle)?|رقم\s+المادة)\s*[:\-]?\s*([A-Z0-9\-\/]{3,40})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractNin(text) {
    var raw = normalizeArabicDigits(text);
    var m = raw.match(/(?:\bNIN\b|الرقم\s+التعريفي\s+الوطني)\s*[:\-]?\s*([A-Z0-9\-\/]{4,40})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractAi(text) {
    var raw = normalizeArabicDigits(text);
    // Algerian "Article d'Imposition" — appears as "AI:" or "N° AI:" or "Art:" on invoices
    var m = raw.match(/(?:\bN\s*[°º]?\s*AI\b|\bAI\b\s*[:\-]?\s*|article\s+d['']?imposition\s*[:\-]?\s*)([0-9]{6,20})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractSubtotal(text) {
    var raw = normalizeArabicDigits(text);
    var m = raw.match(/(?:total\s*ht|montant\s*ht|sous-total|المجموع\s*الخام|المبلغ\s*الخام|المجموع\s*بدون\s*رسوم|الإجمالي\s*الخام)\s*[:\-]?\s*\n?\s*(?:da|dzd)?\s*(\d[\d.,\s]*\d|\d+)/i);
    return m ? String(m[1] || '').trim() : '';
  }

  function extractTimbre(text) {
    var raw = normalizeArabicDigits(text);
    var m = raw.match(/(?:droit\s*de\s*timbre|timbre(?:\s*fiscal)?|حق\s*الطابع|طابع\s*جبائي|حقوق\s*الطابع)\s*[:\-]?\s*\n?\s*(?:da|dzd)?\s*(\d[\d.,\s]*\d|\d+)/i);
    return m ? String(m[1] || '').trim() : '';
  }

  function extractDiscount(text) {
    var raw = normalizeArabicDigits(text);
    var m = raw.match(/(?:remise|rabais|ristourne|خصم|تخفيض|تخفيضات)\s*[:\-]?\s*\n?\s*(?:da|dzd)?\s*(\d[\d.,\s]*\d|\d+)/i);
    return m ? String(m[1] || '').trim() : '';
  }

  function extractAmountInWords(text) {
    var raw = String(text || '');
    if (!raw) return '';
    var patterns = [
      /(?:أوقفت\s+هذه\s+الفاتورة\s+عند\s+مبلغ\s+وقدره|أوقف\s+هذا\s+السند\s+عند\s+مبلغ\s+وقدره|المبلغ\s+بالحروف|المبلغ\s+بالأحرف|مبلغا\s+وقدره|مبلغ\s+وقدره|فقط\s+وقدره)\s*[:\-]?\s*([^\n\r.]+)/i,
      /(?:arr[eê]t[eé]e?\s+(?:la\s+pr[eé]sente\s+facture|le\s+pr[eé]sent\s+bon|le\s+pr[eé]sent\s+devis)?\s+[aà]\s+la\s+somme\s+de|la\s+somme\s+de|soit\s+la\s+somme\s+de|montant\s+en\s+lettres?)\s*[:\-]?\s*([^\n\r.]+)/i
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = raw.match(patterns[i]);
      if (m && m[1]) {
        var s = String(m[1]).trim();
        if (s.length >= 4 && !s.replace(/\s+/g, '').match(/^\d+$/)) return s.substring(0, 160);
      }
    }
    return '';
  }

  function isProductOrHardwareTitle(name) {
    if (!name) return false;
    var s = String(name).toLowerCase();
    var productKeywords = [
      'notebook', 'laptop', 'desktop', 'pc', 'ordinateur', 'fiche technique', 'datasheet',
      'data sheet', 'spécification', 'specification', 'caractéristique', 'caracteristique',
      'imprimante', 'printer', 'scanner', 'serveur', 'server', 'moniteur', 'monitor', 'écran', 'ecran',
      'tablette', 'tablet', 'processeur', 'processor', 'core i3', 'core i5', 'core i7', 'core i9',
      'ryzen', 'geforce', 'radeon', 'ram ', 'ssd', 'hdd', 'disque', 'carte mère', 'switch',
      'routeur', 'router', 'access point', 'point d\'accès', 'onduleur', 'ups', 'souris',
      'clavier', 'keyboard', 'mouse', 'toner', 'cartouche', 'câble', 'cable', 'modèle', 'modele',
      'hp 250', 'hp probook', 'hp elitebook', 'thinkpad', 'latitude', 'ideapad', 'inspiron', 'vostro',
      'حاسوب', 'كمبيوتر', 'لابتوب', 'طابعة', 'شاشة', 'خادم', 'بطاقة تقنية', 'مواصفات', 'بطاقة المواصفات'
    ];
    for (var i = 0; i < productKeywords.length; i++) {
      if (s.indexOf(productKeywords[i]) > -1) return true;
    }
    return false;
  }

  function cleanInvoiceRef(ref) {
    if (!ref) return '';
    var s = String(ref).trim().replace(/^[:\/\-\s#№]+/, '').replace(/[:\/\-\s#№]+$/, '');
    var upper = s.toUpperCase();
    var stopWords = ['LET', 'REF', 'THE', 'AND', 'FOR', 'NOT', 'NON', 'OUI', 'YES', 'PAGE', 'DATE', 'USER', 'HTTP', 'HTTPS', 'WWW', 'PDF', 'URL', 'TEL', 'FAX', 'EMAIL', 'MAIL', 'NOM', 'NAME', 'TOTAL', 'ITEM', 'ITEMS', 'PROD', 'DOC', 'TXT', 'N', 'NO', 'NUM', 'REF.'];
    if (stopWords.indexOf(upper) > -1) return '';
    if (!/\d/.test(s) && s.length <= 4) return '';
    return s;
  }

  function detectDocumentType(text) {
    var raw = String(text || '').toLowerCase();
    if (!raw) return { type: 'universal', label_ar: 'مستند عام', label_fr: 'Document', confidence: 0 };
    var scores = { invoice: 0, delivery_note: 0, purchase_order: 0, proforma: 0, receipt: 0, cheque: 0, tax_return: 0, commercial_register: 0, id_card: 0, tender: 0, technical_sheet: 0 };
    if (raw.indexOf('fiche technique') > -1 || raw.indexOf('datasheet') > -1 || raw.indexOf('spécifications') > -1 || raw.indexOf('caractéristiques') > -1 || raw.indexOf('notebook pc') > -1 || raw.indexOf('quickspecs') > -1 || raw.indexOf('بطاقة تقنية') > -1 || raw.indexOf('بطاقة المواصفات') > -1 || raw.indexOf('المواصفات الفنية') > -1 || raw.indexOf('fiche produit') > -1) scores.technical_sheet += 8;

    if (raw.indexOf('bon de livraison') > -1 || raw.indexOf('وصل تسليم') > -1 || raw.indexOf('bl n°') > -1) scores.delivery_note += 6;
    if (raw.indexOf('bon de commande') > -1 || raw.indexOf('سند طلب') > -1 || raw.indexOf('bc n°') > -1) scores.purchase_order += 6;
    if (raw.indexOf('facture proforma') > -1 || raw.indexOf('devis') > -1 || raw.indexOf('عرض أسعار') > -1 || raw.indexOf('فاتورة شكلية') > -1) scores.proforma += 6;
    if (raw.indexOf('chèque') > -1 || raw.indexOf('cheque') > -1 || raw.indexOf('شيك') > -1 || raw.indexOf('payez contre') > -1) scores.cheque += 7;
    if (raw.indexOf('g50') > -1 || raw.indexOf('تصريح جبائي') > -1 || raw.indexOf('direction des impôts') > -1) scores.tax_return += 8;
    if (raw.indexOf('registre du commerce') > -1 || raw.indexOf('مستخرج السجل التجاري') > -1 || raw.indexOf('cnrc') > -1) scores.commercial_register += 7;
    if (raw.indexOf('carte nationale') > -1 || raw.indexOf('بطاقة التعريف الوطنية') > -1 || raw.indexOf('republique algerienne') > -1) scores.id_card += 7;
    if (raw.indexOf('appel d\'offres') > -1 || raw.indexOf('مناقصة') > -1 || raw.indexOf('دفتر الشروط') > -1) scores.tender += 6;
    if (raw.indexOf('facture') > -1 || raw.indexOf('فاتورة') > -1 || raw.indexOf('net à payer') > -1 || raw.indexOf('total ttc') > -1) scores.invoice += 4;
    if (raw.indexOf('tva') > -1 || raw.indexOf('الرسم على القيمة') > -1) scores.invoice += 2;
    if (raw.indexOf('ticket de caisse') > -1 || raw.indexOf('reçu') > -1 || raw.indexOf('تذكرة صندوق') > -1) scores.receipt += 4;

    var best = 'invoice', maxS = 0;
    for (var k in scores) { if (scores[k] > maxS) { maxS = scores[k]; best = k; } }
    if (maxS < 3) return { type: 'universal', label_ar: 'مستند تجاري', label_fr: 'Document Commercial', confidence: 0.3 };

    var meta = {
      invoice: ['فاتورة تجارية', 'Facture Commerciale'],
      delivery_note: ['وصل تسليم (BL)', 'Bon de Livraison (BL)'],
      purchase_order: ['سند طلب (BC)', 'Bon de Commande (BC)'],
      proforma: ['فاتورة شكلية / عرض أسعار', 'Facture Proforma / Devis'],
      receipt: ['وصل دفع / تذكرة صندوق', 'Reçu / Ticket de Caisse'],
      cheque: ['شيك بنكي / بريدي', 'Chèque Bancaire / Postal'],
      tax_return: ['تصريح جبائي G50', 'Déclaration Fiscale G50'],
      commercial_register: ['مستخرج السجل التجاري', 'Registre du Commerce (CNRC)'],
      id_card: ['وثيقة هوية رسمية', 'Pièce d\'Identité (CNI)'],
      tender: ['إعلان مناقصة / استشارة', 'Appel d\'Offres / Consultation'],
      technical_sheet: ['بطاقة تقنية / مواصفات منتج', 'Fiche Technique / Spécifications']
    };
    var m = meta[best] || ['مستند عام', 'Document'];
    return { type: best, label_ar: m[0], label_fr: m[1], confidence: 0.95 };
  }

  function extractCustomerName(text) {
    var raw = String(text || '');
    if (!raw) return '';
    // Try patterns: "Client:", "Customer:", "Facturé à:", "Doit:", "عميل:"
    var patterns = [
      /(?:client|customer|acheteur|destinataire|factur[eé]\s*[eà]|doit)\s*[:\-]\s*([^\n\r]{3,80})/i,
      /(?:العميل|المشتري|الزبون|اسم\s*العميل)\s*[:\-]?\s*([^\n\r]{3,80})/,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = raw.match(patterns[i]);
      if (m) return String(m[1] || '').trim().substring(0, 80);
    }
    // Fallback: a line that contains an Algerian company-type designator
    var companyLine = raw.match(/^[^\n\r]*\b(SARL|SPA|EURL|EPIC|SNC|SAS)\b[^\n\r]*/m);
    if (companyLine) return companyLine[0].trim().substring(0, 80);
    return '';
  }

  function extractSupplierName(text) {
    var raw = String(text || '');
    if (!raw) return '';
    // Try patterns: "Fournisseur:", "Vendeur:", "Émis par:", "Émetteur:", "المورد:"
    var patterns = [
      /(?:fournisseur|vendeur|vendu\s*par|[eé]mis\s*par|[eé]metteur|raison\s*sociale|d[eé]nomination\s*sociale?)\s*[:\-]\s*([^\n\r]{3,80})/i,
      /(?:المورد|اسم\s*المورد|البائع|مقدم\s*الفاتورة|الشركة)\s*[:\-]?\s*([^\n\r]{3,80})/,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = raw.match(patterns[i]);
      if (m) return String(m[1] || '').trim().substring(0, 80);
    }
    // Fallback: first line with an Algerian company-type designator
    var companyLine = raw.match(/^[^\n\r]*\b(SARL|SPA|EURL|EPIC|SNC|SAS)\b[^\n\r]*/m);
    if (companyLine) return companyLine[0].trim().substring(0, 80);
    return '';
  }

  function extractNif(text) {
    var raw = normalizeArabicDigits(text);
    // Algerian NIF: "NIF:", "N° IF:", "N° d'identification fiscale:"
    var m = raw.match(/(?:\bNIF\b|\bN\s*[°º]?\s*IF\b|num[eé]ro\s+d['']?identification\s+fiscale|الرقم\s+الجبائي)\s*[:\-]?\s*([0-9]{10,20})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractBp(text) {
    var raw = normalizeArabicDigits(text);
    // BP: "BP:", "B.P.:", "Boîte Postale:", "ص.ب"
    var m = raw.match(/(?:\bBP\b|\bB\.?\s*P\.?|bo[îi]te\s+postale|ص\.?\s*ب)\s*[:\-]?\s*([0-9]{3,10})/i);
    return m ? String(m[1] || '').trim() : '';
  }

  function extractCapital(text) {
    var raw = String(text || '');
    if (!raw) return '';
    var m = raw.match(/(?:capital(?:\s+social)?|رأس\s+المال)\s*[:\-]?\s*([0-9\s.,]+(?:\s*(?:DZD|DA|دج|EUR|USD|€|\$))?)/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractSiege(text) {
    var raw = String(text || '');
    if (!raw) return '';
    var m = raw.match(/(?:si[eè]ge(?:\s+social)?|المقر(?:\s+الاجتماعي)?|adresse(?:\s+principale)?|العنوان)\s*[:\-]\s*([^\n\r]{5,120})/i);
    return m ? String(m[1] || '').trim() : '';
  }

  function extractWebsite(text) {
    var raw = String(text || '');
    if (!raw) return '';
    var m = raw.match(/(?:https?:\/\/[a-zA-Z0-9_\-.]+(?:\.[a-zA-Z]{2,})[^\s\n\r]*|www\.[a-zA-Z0-9_\-.]+(?:\.[a-zA-Z]{2,})[^\s\n\r]*)/i);
    return m ? String(m[0] || '').trim() : '';
  }

  function extractBankName(text) {
    var raw = String(text || '');
    if (!raw) return '';
    var m = raw.match(/\b(BEA|BNA|CPA|BADR|BDL|CNEP|SGA|AGB|BARAKA|NATIXIS|FRANSABANK|AL\s*SALAM|GULF\s*BANK|HOUSING\s*BANK|CITIBANK)\b/i);
    return m ? m[0].toUpperCase() : '';
  }

  global.OcrFieldExtractors = {
    pickFirstNonEmpty,
    extractRc,
    extractNis,
    extractNif,
    extractBp,
    extractRib,
    extractVat,
    extractAg,
    extractArt,
    extractAi,
    extractNin,
    extractCapital,
    extractSiege,
    extractWebsite,
    extractBankName,
    extractCustomerName,
    extractSupplierName,
    extractSubtotal,
    extractTimbre,
    extractDiscount
  };

  // ── UnifiedOCR ────────────────────────────────────────────────

  var EXCEL_MIME = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
    'application/vnd.ms-excel': true,
    'text/csv': true,
    'application/csv': true
  };

  var WORD_MIME = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
    'application/msword': true,
    'application/vnd.ms-word': true,
    'text/plain': true
  };

  // SVG is excluded — it's a vector format, not raster. The server reads SVG as XML text.
  var IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.heic', '.heif', '.jfif', '.avif', '.ico'];

  function normalizeMime(mime) { return String(mime || '').toLowerCase().trim(); }
  function normalizeName(name) { return String(name || '').toLowerCase().trim(); }

  function _hasImageExt(name) {
    for (var i = 0; i < IMAGE_EXT.length; i++) {
      if (name.slice(-IMAGE_EXT[i].length) === IMAGE_EXT[i]) return true;
    }
    return false;
  }

  function getFileKind(file, options) {
    var opts = options || {};
    var mime = normalizeMime(file && file.type);
    var name = normalizeName(file && file.name);
    var isImage = mime.indexOf('image/') === 0 || _hasImageExt(name);
    var isPdf   = mime === 'application/pdf' || name.slice(-4) === '.pdf';
    var isExcel = !!EXCEL_MIME[mime] || name.slice(-5) === '.xlsx' || name.slice(-4) === '.xls' || name.slice(-4) === '.csv';
    var isWord  = !!WORD_MIME[mime]  || name.slice(-5) === '.docx' || name.slice(-4) === '.doc' || name.slice(-4) === '.txt';
    if (isImage && opts.allowImage  !== false) return 'image';
    if (isPdf   && opts.allowPdf    !== false) return 'pdf';
    if (isExcel && opts.allowExcel  !== false) return 'excel';
    if (isWord  && opts.allowWordTxt !== false) return 'wordtxt';
    return '';
  }

  function supportedTypesText(options) {
    var opts = options || {}, parts = [];
    if (opts.allowPdf     !== false) parts.push('PDF');
    if (opts.allowImage   !== false) parts.push('image');
    if (opts.allowExcel   !== false) parts.push('Excel');
    if (opts.allowWordTxt !== false) parts.push('Word', 'TXT');
    return parts.join(', ');
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('file-read-failed')); };
      reader.readAsDataURL(file);
    });
  }

  function defaultOptimizeImage(file, maxWidth) {
    maxWidth = maxWidth || 2048;
    return new Promise(function (resolve) {
      if (typeof FileReader === 'undefined' || typeof Image === 'undefined') {
        return fileToDataUrl(file).then(resolve).catch(function () { resolve(''); });
      }
      var reader = new FileReader();
      reader.onerror = function () {
        fileToDataUrl(file).then(resolve).catch(function () { resolve(''); });
      };
      reader.onload = function (e) {
        var rawDataUrl = e.target.result;
        var img = new Image();
        img.onerror = function () { resolve(rawDataUrl); };
        img.onload = function () {
          try {
            var width = img.width || 0;
            var height = img.height || 0;
            if (!width || !height) return resolve(rawDataUrl);

            // If image is already smaller than maxWidth and file size is < 1MB, no recompression needed
            if (width <= maxWidth && height <= maxWidth && file.size < 1024 * 1024) {
              return resolve(rawDataUrl);
            }

            var ratio = 1;
            if (width > maxWidth || height > maxWidth) {
              ratio = Math.min(maxWidth / width, maxWidth / height);
            }
            var targetW = Math.round(width * ratio);
            var targetH = Math.round(height * ratio);

            var canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            var ctx = canvas.getContext('2d');
            if (!ctx) return resolve(rawDataUrl);

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.drawImage(img, 0, 0, targetW, targetH);

            var optUrl = canvas.toDataURL('image/jpeg', 0.88);
            resolve(optUrl);
          } catch (err) {
            console.warn('[UnifiedOCR] Canvas resize fallback to raw:', err);
            resolve(rawDataUrl);
          }
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  async function toDataUrl(file, kind, options) {
    var opts = options || {};
    if (kind === 'image') {
      if (typeof opts.optimizeImageFn === 'function') {
        return opts.optimizeImageFn(file, Number(opts.imageMaxWidth || 2048));
      }
      return defaultOptimizeImage(file, Number(opts.imageMaxWidth || 2048));
    }
    return fileToDataUrl(file);
  }

  async function extract(file, options) {
    var opts = options || {};
    if (!file) throw new Error(opts.emptyFileMessage || 'Please select a file first.');
    var kind = getFileKind(file, opts);
    if (!kind) throw new Error(opts.unsupportedTypeMessage || ('Unsupported file type. Use ' + supportedTypesText(opts) + '.'));

    var mimeType = normalizeMime(file.type);
    if (!mimeType || mimeType === 'application/octet-stream') {
      var _fn = normalizeName(file.name);
      if (_fn.slice(-4) === '.pdf') mimeType = 'application/pdf';
      else if (_fn.slice(-5) === '.xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else if (_fn.slice(-4) === '.xls') mimeType = 'application/vnd.ms-excel';
      else if (_fn.slice(-4) === '.csv') mimeType = 'text/csv';
      else if (_fn.slice(-5) === '.docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (_fn.slice(-4) === '.doc') mimeType = 'application/msword';
      else if (_fn.slice(-4) === '.png') mimeType = 'image/png';
      else if (_fn.slice(-4) === '.jpg' || _fn.slice(-5) === '.jpeg') mimeType = 'image/jpeg';
      else if (_fn.slice(-5) === '.webp') mimeType = 'image/webp';
    }
    var dataUrl  = await toDataUrl(file, kind, opts);
    if (dataUrl && dataUrl.indexOf('data:image/jpeg') === 0) {
      mimeType = 'image/jpeg';
    }
    var endpoint = String(opts.endpoint || '/api/ai/invoice-extract');
    if (typeof opts.buildApiUrl === 'function') endpoint = opts.buildApiUrl(endpoint);

    var token = '';
    try {
      if (typeof ZS !== 'undefined' && ZS && typeof ZS.getItem === 'function') {
        token = ZS.getItem(String(opts.tokenKey || 'zeralda-auth-token')) || ZS.getItem('zeralda-session-token') || '';
      } else if (typeof localStorage !== 'undefined') {
        token = localStorage.getItem(String(opts.tokenKey || 'zeralda-auth-token')) || localStorage.getItem('zeralda-session-token') || '';
      } else if (typeof sessionStorage !== 'undefined') {
        token = sessionStorage.getItem(String(opts.tokenKey || 'zeralda-auth-token')) || sessionStorage.getItem('zeralda-session-token') || '';
      }
    } catch (_) {}

    var headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (token) {
      headers.Authorization = 'Bearer ' + token;
      headers['X-Session-Token'] = token;
    }

    var payloadBody = { fileBase64: dataUrl, mimeType, fileName: file.name || '' };
    if (opts.extraBody && typeof opts.extraBody === 'object') {
      for (var k in opts.extraBody) {
        if (Object.prototype.hasOwnProperty.call(opts.extraBody, k)) payloadBody[k] = opts.extraBody[k];
      }
    }

    var userPrefLang = '';
    try {
      if (typeof window !== 'undefined' && window.UnifiedI18N && typeof window.UnifiedI18N.getCurrentLang === 'function') {
        userPrefLang = window.UnifiedI18N.getCurrentLang();
      } else if (typeof localStorage !== 'undefined' && localStorage) {
        var _s = localStorage.getItem('zeralda-settings');
        if (_s) {
          try { var _sp = JSON.parse(_s); if (_sp && _sp.preferredLanguage) userPrefLang = _sp.preferredLanguage; } catch (_) {}
        }
        if (!userPrefLang) userPrefLang = localStorage.getItem('preferred-language') || localStorage.getItem('language') || localStorage.getItem('preferredLanguage') || '';
      }
    } catch(e) {}
    var lang = ((typeof window !== 'undefined' && window.currentLanguage) || userPrefLang || (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) || 'ar').toLowerCase();
    var isAr = lang.indexOf('ar') === 0;
    var isFr = lang.indexOf('fr') === 0;
    var tooLargeMsg = isAr ? 'الملف كبير جداً (الحد الأقصى المسموح به 100 ميغابايت). يُرجى استخدام ملف أصغر أو ضغط الـ PDF/الصورة.'
      : (isFr ? 'Fichier trop volumineux (max 100 Mo recommandé). Veuillez utiliser un fichier plus petit ou compresser le PDF/image.'
      : 'File too large (max 100MB recommended). Please use a smaller file or compress the PDF/image.');

    if (JSON.stringify(payloadBody).length > 100 * 1024 * 1024) {
      throw new Error(tooLargeMsg);
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId  = controller ? setTimeout(function () { controller.abort(); }, 180000) : null;
    var fetchOpts  = { method: 'POST', headers, body: JSON.stringify(payloadBody) };
    if (controller) fetchOpts.signal = controller.signal;

    var response = await fetch(endpoint, fetchOpts).catch(function (err) {
      if (timeoutId) clearTimeout(timeoutId);
      if (err && err.name === 'AbortError') throw new Error(isAr ? 'انتهت مهلة الطلب (180 ثانية). الملف كبير جداً أو الاتصال بطيء.' : (isFr ? 'Délai d\'attente dépassé (180 s). Fichier trop lourd ou connexion lente.' : 'Request timeout (180 seconds). File is too large or network is too slow.'));
      throw err;
    });
    if (timeoutId) clearTimeout(timeoutId);

    var payload = await response.json().catch(() => ({}));
    if (response.status === 413) throw new Error(tooLargeMsg);
    if (response.status === 408) throw new Error(isAr ? 'انتهت مهلة الخادم. الملف كبير أو الاتصال بطيء.' : 'Request timeout. File is too large or network is slow.');

    // Automatic fallback to Tesseract if Copilot IA fails
    if (!response.ok || !payload.ok) {
      if (endpoint === '/api/ai/invoice-extract') {
        console.warn('[UnifiedOCR] Copilot IA failed (' + (payload.error || response.status) + '). Automatically falling back to Tesseract (/api/ocr/extract)...');
        try {
          var tessEndpoint = typeof opts.buildApiUrl === 'function' ? opts.buildApiUrl('/api/ocr/extract') : '/api/ocr/extract';
          var tessResp = await fetch(tessEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ fileBase64: dataUrl, mimeType: mimeType, fileName: file.name || '', lang: 'ara+fra+eng' })
          });
          var tessPayload = await tessResp.json().catch(() => ({}));
          if (tessResp.ok && tessPayload.ok && (tessPayload.text || '').trim()) {
            tessPayload.ocr_engine_used = 'tesseract-fallback';
            return {
              payload: tessPayload,
              text: String(tessPayload.text || '').trim(),
              mimeType: mimeType,
              fileName: String(file.name || ''),
              engineUsed: 'tesseract'
            };
          }
        } catch (tessErr) {
          console.warn('[UnifiedOCR] Tesseract fallback failed:', tessErr);
        }
      }
      throw new Error(payload.error || ('HTTP ' + response.status));
    }

    return { payload, text: String(payload.text || '').trim(), mimeType, fileName: String(file.name || '') };
  }

  function optimizeImageFileToDataUrl(file, maxSide) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          try {
            var ow = Number(img.width || 0), oh = Number(img.height || 0);
            if (!ow || !oh) { resolve(String(reader.result || '')); return; }
            var limit = Math.max(320, Number(maxSide || 2000));
            var ratio = Math.max(ow, oh) > limit ? limit / Math.max(ow, oh) : 1;
            var tw = Math.max(1, Math.round(ow * ratio)), th = Math.max(1, Math.round(oh * ratio));
            var canvas = document.createElement('canvas');
            canvas.width = tw; canvas.height = th;
            var ctx = canvas.getContext('2d');
            if (!ctx) { resolve(String(reader.result || '')); return; }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, tw, th);
            // Preserve PNG transparency — only use JPEG for opaque formats
            var fileName = String(file && file.name || '').toLowerCase();
            var isPng = fileName.slice(-4) === '.png' || (file && file.type === 'image/png');
            if (isPng) {
              resolve(canvas.toDataURL('image/png'));
            } else {
              resolve(canvas.toDataURL('image/jpeg', 0.95));
            }
          } catch (_) { resolve(String(reader.result || '')); }
        };
        img.onerror = function () { resolve(String(reader.result || '')); };
        img.src = String(reader.result || '');
      };
      reader.onerror = function () { reject(new Error('Failed to optimize image')); };
      reader.readAsDataURL(file);
    });
  }

  global.UnifiedOCR = { getFileKind, supportedTypesText, fileToDataUrl, extract, optimizeImage: optimizeImageFileToDataUrl };

  // ── ZeraldaOCR: Unified Professional Modal & Dropzone Controller ───

  var ZeraldaOCR = {
    state: {
      file: null,
      dataUrl: null,
      kind: null,
      mode: 'customer',
      extracted: null,
      options: null,
      isExtracting: false
    },

    translations: {
      ar: {
        modalTitle: "المساعد الذكي: المسح واستخراج البيانات",
        dropzoneTitle: "اسحب وأفلت المستند هنا، أو اضغط للاستعراض",
        dropzoneSubtitle: "يدعم الصور، PDF، ملفات Excel و Word",
        removeFile: "إزالة",
        scanning: "جاري قراءة وتحليل المستند بالمساعد الذكي...",
        extractBtn: "مسح واستخراج ذكي",
        applyBtn: "تطبيق في النموذج",
        cancelBtn: "إلغاء",
        reScanBtn: "إعادة المسح",
        successExtracted: "تم استخراج البيانات بنجاح!",
        noTextFound: "لم يتم العثور على نصوص قابلة للاستخراج في هذا المستند.",
        fileRequired: "يرجى اختيار ملف مستند أولاً.",
        itemsExtracted: "البنود والمنتجات المستخرجة",
        totalAmount: "المجموع الإجمالي (TTC)",
        subtotal: "المجموع الخام (HT)",
        vat: "الرسم على القيمة المضافة (TVA)",
        timbre: "حق الطابع الجبائي (Timbre)",
        discount: "التخفيض / الخصم",
        selectAll: "تحديد الكل",
        itemDesc: "الوصف / البند",
        qty: "الكمية",
        price: "السعر",
        total: "المجموع",
        customerName: "اسم العميل",
        supplierName: "اسم المورد",
        rc: "السجل التجاري (RC)",
        nif: "الرقم الجبائي (NIF)",
        nis: "رقم التعريف الإحصائي (NIS)",
        ai: "المادة الضريبية (AI)",
        art: "رقم النشاط (ART)",
        phone: "الهاتف",
        email: "البريد الإلكتروني",
        address: "العنوان",
        city: "المدينة",
        tenderRef: "مرجع المناقصة",
        tenderTitle: "موضوع المناقصة",
        authority: "الجهة صاحبة المشروع",
        deadline: "آخر أجل للإيداع",
        amount: "المبلغ التقديري",
        empName: "اسم الموظف / المرشح",
        nin: "الرقم التعريفي الوطني (NIN)",
        birthDate: "تاريخ الميلاد",
        jobTitle: "المنصب / التخصص",
        education: "المؤهل الدراسي",
        takePhoto: "التقاط صورة بالكاميرا",
        productName: "اسم المنتج",
        productPrice: "سعر البيع",
        productCost: "سعر الشراء",
        productBarcode: "الباركود",
        productQty: "الكمية",
        category: "الفئة",
        journalRef: "مرجع القيد / الفاتورة",
        journalDesc: "بيان / وصف القيد",
        journalDate: "التاريخ",
        bankName: "اسم البنك",
        bankRib: "رقم الحساب / RIB",
        accountHolder: "صاحب الحساب",
        companyName: "اسم الشركة / المؤسسة",
        siege: "المقر (العنوان)",
        capital: "رأس المال",
        website: "الموقع الإلكتروني",
        bp: "صندوق البريد (BP)",
        ag: "رقم الترخيص (N° AG)",
        bankAccount: "الحساب البنكي",
        issuer: "المحرر / المصدر",
        clientTag: "العميل",
        aiParsed: "تم الاستخراج بالذكاء الاصطناعي",
        technicalSheetNoticeTitle: "تنبيه: بطاقة مواصفات تقنية",
        technicalSheetNoticeDesc: "تم التعرف على المستند كبطاقة مواصفات تقنية لمنتج. تم استخراج اسم ومواصفات المنتج كبند تلقائياً دون اعتباره اسماً للمورد أو مرجع فاتورة."
      },
      fr: {
        modalTitle: "Copilote IA : Scan et extraction intelligente",
        dropzoneTitle: "Glissez-déposez le document ici, ou cliquez pour parcourir",
        dropzoneSubtitle: "Prend en charge images, PDF, Excel et Word",
        removeFile: "Supprimer",
        scanning: "Analyse et extraction du document par Copilote IA en cours...",
        extractBtn: "Scan & Extraction intelligente (IA)",
        applyBtn: "Appliquer au formulaire",
        cancelBtn: "Annuler",
        reScanBtn: "Réanalyser",
        successExtracted: "Données extraites avec succès !",
        noTextFound: "Aucun texte exploitable trouvé dans ce document.",
        fileRequired: "Veuillez d'abord sélectionner un fichier.",
        itemsExtracted: "Articles et lignes extraits",
        totalAmount: "Montant Total (TTC)",
        subtotal: "Total Hors Taxes (HT)",
        vat: "TVA",
        timbre: "Droit de Timbre",
        discount: "Remise",
        selectAll: "Tout sélectionner",
        itemDesc: "Description / Article",
        qty: "Qté",
        price: "Prix Unitaire",
        total: "Total",
        customerName: "Nom Client",
        supplierName: "Nom Fournisseur",
        rc: "Registre de Commerce (RC)",
        nif: "NIF",
        nis: "NIS",
        ai: "Article d'Imposition (AI)",
        art: "N° d'Activité (ART)",
        phone: "Téléphone",
        email: "Email",
        address: "Adresse",
        city: "Ville",
        tenderRef: "Réf Appel d'Offres",
        tenderTitle: "Objet de l'Appel",
        authority: "Maître d'Ouvrage",
        deadline: "Date Limite",
        amount: "Montant Estimatif",
        empName: "Nom de l'Employé / Candidat",
        nin: "Numéro National (NIN)",
        birthDate: "Date de Naissance",
        jobTitle: "Poste / Spécialité",
        education: "Diplôme / Formation",
        takePhoto: "Prendre une photo (Caméra)",
        productName: "Nom Produit",
        productPrice: "Prix de Vente",
        productCost: "Prix d'Achat",
        productBarcode: "Code-barres",
        productQty: "Quantité",
        category: "Catégorie",
        journalRef: "Réf Écriture / Facture",
        journalDesc: "Libellé de l'Écriture",
        journalDate: "Date",
        bankName: "Nom Banque",
        bankRib: "RIB / Compte",
        accountHolder: "Titulaire Compte",
        companyName: "Société / Entreprise",
        siege: "Siège (Adresse)",
        capital: "Capital Social",
        website: "Site Web",
        bp: "Boîte Postale (BP)",
        ag: "N° AG (Agrément)",
        bankAccount: "Compte Bancaire",
        issuer: "Émetteur",
        clientTag: "Client",
        aiParsed: "Analysé par IA",
        technicalSheetNoticeTitle: "Fiche Technique Détectée",
        technicalSheetNoticeDesc: "Ce document est une fiche technique / spécification produit. Les caractéristiques du produit ont été extraites comme article sans confusion avec le fournisseur."
      },
      en: {
        modalTitle: "AI Copilot: Smart Scan & Extraction",
        dropzoneTitle: "Drag & drop your document here, or click to browse",
        dropzoneSubtitle: "Supports images, PDF, Excel and Word files",
        removeFile: "Remove",
        scanning: "Analyzing and extracting document with AI Copilot...",
        extractBtn: "Smart Scan & Extract (Scan IA)",
        applyBtn: "Apply to Form",
        cancelBtn: "Cancel",
        reScanBtn: "Re-scan",
        successExtracted: "Data extracted successfully!",
        noTextFound: "No usable text found in this document.",
        fileRequired: "Please select a document file first.",
        itemsExtracted: "Extracted Line Items",
        totalAmount: "Total Amount (TTC)",
        subtotal: "Subtotal (HT)",
        vat: "VAT",
        timbre: "Fiscal Stamp",
        discount: "Discount",
        selectAll: "Select All",
        itemDesc: "Description / Item",
        qty: "Qty",
        price: "Unit Price",
        total: "Total",
        customerName: "Customer Name",
        supplierName: "Supplier Name",
        rc: "Commercial Register (RC)",
        nif: "Tax ID (NIF)",
        nis: "Statistical ID (NIS)",
        ai: "Tax Article (AI)",
        art: "Activity Code (ART)",
        phone: "Phone",
        email: "Email",
        address: "Address",
        city: "City",
        tenderRef: "Tender Reference",
        tenderTitle: "Tender Subject",
        authority: "Contracting Authority",
        deadline: "Submission Deadline",
        amount: "Estimated Amount",
        empName: "Employee / Candidate Name",
        nin: "National ID (NIN)",
        birthDate: "Date of Birth",
        jobTitle: "Position / Specialization",
        education: "Education / Degree",
        takePhoto: "Take a Photo (Camera)",
        productName: "Product Name",
        productPrice: "Selling Price",
        productCost: "Purchase Price",
        productBarcode: "Barcode",
        productQty: "Quantity",
        category: "Category",
        journalRef: "Entry Ref / Invoice",
        journalDesc: "Entry Description",
        journalDate: "Date",
        bankName: "Bank Name",
        bankRib: "RIB / Account No",
        accountHolder: "Account Holder",
        companyName: "Company / Organization",
        siege: "Head Office (Address)",
        capital: "Share Capital",
        website: "Website",
        bp: "P.O. Box (BP)",
        ag: "License No (AG)",
        bankAccount: "Bank Account",
        issuer: "Issuer",
        clientTag: "Customer",
        aiParsed: "AI Parsed",
        technicalSheetNoticeTitle: "Technical Datasheet Detected",
        technicalSheetNoticeDesc: "This document is a technical spec sheet. Product name and specifications have been extracted as a product item."
      }
    },

    getLang: function() {
      try {
        if (this.state && this.state.options) {
          var optL = this.state.options.lang || this.state.options.language;
          if (optL && (optL === 'ar' || optL === 'fr' || optL === 'en')) return optL;
          if (this.state.options.title && /[\u0600-\u06FF]/.test(this.state.options.title)) return 'ar';
          if (this.state.options.subtitle && /[\u0600-\u06FF]/.test(this.state.options.subtitle)) return 'ar';
        }
        if (typeof window !== 'undefined' && window.UnifiedI18N && typeof window.UnifiedI18N.getCurrentLang === 'function') {
          var ul = window.UnifiedI18N.getCurrentLang();
          if (ul === 'ar' || ul === 'fr' || ul === 'en') return ul;
        }
        if (typeof document !== 'undefined') {
          var htmlDir = (document.documentElement && document.documentElement.getAttribute('dir')) || '';
          var bodyDir = (document.body && document.body.getAttribute('dir')) || '';
          if (htmlDir.toLowerCase() === 'rtl' || bodyDir.toLowerCase() === 'rtl') return 'ar';
        }
        if (typeof localStorage !== 'undefined' && localStorage) {
          var _s = localStorage.getItem('zeralda-settings');
          if (_s) {
            try {
              var _sp = JSON.parse(_s);
              if (_sp && _sp.preferredLanguage) {
                var pl = String(_sp.preferredLanguage).toLowerCase().substring(0, 2);
                if (pl === 'ar' || pl === 'fr' || pl === 'en') return pl;
              }
            } catch (_) {}
          }
          var l = String(localStorage.getItem('preferred-language') || localStorage.getItem('language') || localStorage.getItem('preferredLanguage') || '').toLowerCase().substring(0, 2);
          if (l === 'ar' || l === 'fr' || l === 'en') return l;
        }
      } catch (e) {}
      var fallback = ((typeof window !== 'undefined' && window.currentLanguage) || (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) || 'ar').toLowerCase();
      if (fallback.indexOf('ar') === 0) return 'ar';
      if (fallback.indexOf('fr') === 0) return 'fr';
      if (fallback.indexOf('en') === 0) return 'en';
      return 'ar';
    },

    t: function(key) {
      var lang = this.getLang();
      var dict = this.translations[lang] || this.translations.ar;
      return dict[key] || this.translations.ar[key] || key;
    },

    ensureStyles: function() {
      if (document.querySelector('link[href*="zeralda_core.bundle.css"]')) return;
      if (!document.getElementById('zeralda-ocr-unified-css')) {
        var link = document.createElement('link');
        link.id = 'zeralda-ocr-unified-css';
        link.rel = 'stylesheet';
        link.href = 'styles/ocr_unified.css?v=20261012d';
        document.head.appendChild(link);
      }
    },

    getModalEl: function() {
      var modal = document.getElementById('zeraldaUnifiedOcrModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'zeraldaUnifiedOcrModal';
        modal.className = 'modal ocr-unified-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modal);
      }
      return modal;
    },

    escapeHtml: function(text) {
      return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    formatBytes: function(bytes) {
      if (!bytes || bytes <= 0) return '0 B';
      var k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
      var i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    renderModalHtml: function(options) {
      var opts = options || {};
      var lang = this.getLang();
      var isRtl = (lang === 'ar');
      var title = opts.title || this.t('modalTitle');
      var subtitle = opts.subtitle || this.t('dropzoneSubtitle');
      var icon = opts.icon || 'fas fa-robot';

      return '' +
        '<div class="modal-content ocr-modal-content" role="document"' + (isRtl ? ' dir="rtl"' : ' dir="ltr"') + '>' +
          '<div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--ocr-border);">' +
            '<h2 style="margin:0;font-size:17px;font-weight:700;display:flex;align-items:center;gap:10px;">' +
              '<i class="' + icon + '" style="color:var(--ocr-primary);" aria-hidden="true"></i>' +
              '<span>' + this.escapeHtml(title) + '</span>' +
            '</h2>' +
            '<button type="button" class="close-modal" id="ocrModalCloseBtn" aria-label="Close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--ocr-text-muted);">&times;</button>' +
          '</div>' +
          '<div class="ocr-shell">' +
            '<div class="ocr-header-banner">' +
              '<div class="ocr-header-icon"><i class="' + icon + '"></i></div>' +
              '<div class="ocr-header-text">' +
                '<h3>' + this.escapeHtml(title) + '</h3>' +
                '<p>' + this.escapeHtml(subtitle) + '</p>' +
              '</div>' +
            '</div>' +

            '<!-- Dropzone -->' +
            '<div class="ocr-dropzone" id="ocrDropzone">' +
              '<input type="file" id="ocrUnifiedFileInput" class="ocr-dropzone-input" accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain">' +
              '<input type="file" id="ocrUnifiedCameraInput" accept="image/*" capture="environment" style="display:none;">' +
              '<div class="ocr-dropzone-icon"><i class="fas fa-cloud-upload-alt"></i></div>' +
              '<div class="ocr-dropzone-title">' + this.t('dropzoneTitle') + '</div>' +
              '<div class="ocr-dropzone-subtitle">' + this.t('dropzoneSubtitle') + '</div>' +
              '<div class="ocr-formats-badges">' +
                '<span class="ocr-format-badge"><i class="fas fa-file-pdf"></i> PDF</span>' +
                '<span class="ocr-format-badge"><i class="fas fa-file-image"></i> JPG / PNG</span>' +
                '<span class="ocr-format-badge"><i class="fas fa-file-excel"></i> Excel / CSV</span>' +
                '<span class="ocr-format-badge"><i class="fas fa-file-word"></i> Word / TXT</span>' +
              '</div>' +
              '<div class="ocr-dropzone-actions">' +
                '<button type="button" class="ocr-camera-btn" id="ocrCameraTriggerBtn"><i class="fas fa-camera"></i> <span>' + this.t('takePhoto') + '</span></button>' +
              '</div>' +
            '</div>' +

            '<!-- Selected File Card -->' +
            '<div class="ocr-file-card" id="ocrFileCard">' +
              '<i class="fas fa-file-alt ocr-file-icon" id="ocrFileIcon"></i>' +
              '<div class="ocr-file-meta">' +
                '<div class="ocr-file-name" id="ocrFileName">filename.pdf</div>' +
                '<div class="ocr-file-size" id="ocrFileSize">0 KB</div>' +
              '</div>' +
              '<button type="button" class="ocr-file-remove" id="ocrFileRemoveBtn"><i class="fas fa-times"></i> ' + this.t('removeFile') + '</button>' +
            '</div>' +

            '<!-- Scanning Beam Animation -->' +
            '<div class="ocr-scanning-container" id="ocrScanningContainer">' +
              '<div class="ocr-laser-sim"><div class="ocr-laser-beam"></div></div>' +
              '<div class="ocr-scanning-text"><i class="fas fa-spinner fa-spin"></i> ' + this.t('scanning') + '</div>' +
              '<div class="ocr-scanning-subtext">' + (this.getLang() === 'ar' ? 'المسح الضوئي الذكي والتعرف الدقيق على النصوص' : (this.getLang() === 'fr' ? 'Scan Intelligent & OCR Haute Précision' : 'AI Smart Scan & Precision OCR')) + '</div>' +
            '</div>' +

            '<!-- Status Banner -->' +
            '<div class="ocr-status-box" id="ocrStatusBox"></div>' +

            '<!-- Preview Panel -->' +
            '<div class="ocr-preview-panel" id="ocrPreviewPanel"></div>' +

            '<!-- Actions Footer -->' +
            '<div class="ocr-actions-footer">' +
              '<button type="button" class="btn btn-secondary" id="ocrCancelBtn">' + this.t('cancelBtn') + '</button>' +
              '<button type="button" class="btn btn-primary" id="ocrExtractBtn">' +
                '<i class="fas fa-bolt"></i> <span>' + this.t('extractBtn') + '</span>' +
              '</button>' +
              '<button type="button" class="btn btn-success" id="ocrApplyBtn" style="display:none;">' +
                '<i class="fas fa-check-circle"></i> <span>' + this.t('applyBtn') + '</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    },

    bindEvents: function(modal) {
      var self = this;
      var dropzone = modal.querySelector('#ocrDropzone');
      var fileInput = modal.querySelector('#ocrUnifiedFileInput');
      var cameraInput = modal.querySelector('#ocrUnifiedCameraInput');
      var cameraBtn = modal.querySelector('#ocrCameraTriggerBtn');
      var fileCard = modal.querySelector('#ocrFileCard');
      var removeBtn = modal.querySelector('#ocrFileRemoveBtn');
      var closeBtn = modal.querySelector('#ocrModalCloseBtn');
      var cancelBtn = modal.querySelector('#ocrCancelBtn');
      var extractBtn = modal.querySelector('#ocrExtractBtn');
      var applyBtn = modal.querySelector('#ocrApplyBtn');

      function closeIt() { self.close(); }
      if (closeBtn) closeBtn.onclick = closeIt;
      if (cancelBtn) cancelBtn.onclick = closeIt;
      modal.onclick = function(e) {
        if (e.target === modal) self.close();
      };

      if (cameraBtn && cameraInput) {
        cameraBtn.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          cameraInput.click();
        };
      }
      if (cameraInput) {
        cameraInput.addEventListener('change', function(e) {
          if (e.target.files && e.target.files.length) {
            self.handleFileSelect(e.target.files[0], modal);
          }
        });
      }

      // Drag & Drop
      ['dragenter', 'dragover'].forEach(function(evt) {
        dropzone.addEventListener(evt, function(e) {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('is-dragover');
        });
      });

      ['dragleave', 'drop'].forEach(function(evt) {
        dropzone.addEventListener(evt, function(e) {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('is-dragover');
        });
      });

      dropzone.addEventListener('drop', function(e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          self.handleFileSelect(e.dataTransfer.files[0], modal);
        }
      });

      fileInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length) {
          self.handleFileSelect(e.target.files[0], modal);
        }
      });

      if (removeBtn) {
        removeBtn.onclick = function() {
          self.state.file = null;
          self.state.extracted = null;
          fileInput.value = '';
          if (cameraInput) cameraInput.value = '';
          fileCard.classList.remove('is-active');
          dropzone.style.display = 'flex';
          self.hideScanning(modal);
          self.hideStatus(modal);
          self.hidePreview(modal);
          if (applyBtn) applyBtn.style.display = 'none';
        };
      }

      if (extractBtn) {
        extractBtn.onclick = function() {
          self.runExtraction(modal);
        };
      }

      if (applyBtn) {
        applyBtn.onclick = function() {
          self.applyResult(modal);
        };
      }
    },

    handleFileSelect: function(file, modal) {
      this.state.file = file;
      this.state.extracted = null;

      var dropzone = modal.querySelector('#ocrDropzone');
      var fileCard = modal.querySelector('#ocrFileCard');
      var fileNameEl = modal.querySelector('#ocrFileName');
      var fileSizeEl = modal.querySelector('#ocrFileSize');
      var fileIconEl = modal.querySelector('#ocrFileIcon');
      var applyBtn = modal.querySelector('#ocrApplyBtn');

      if (applyBtn) applyBtn.style.display = 'none';
      this.hideStatus(modal);
      this.hidePreview(modal);

      if (fileNameEl) fileNameEl.textContent = file.name;
      if (fileSizeEl) fileSizeEl.textContent = this.formatBytes(file.size);

      // Icon determination
      var fn = (file.name || '').toLowerCase();
      var iconCls = 'fas fa-file-alt';
      if (fn.endsWith('.pdf')) iconCls = 'fas fa-file-pdf text-danger';
      else if (fn.endsWith('.xlsx') || fn.endsWith('.xls') || fn.endsWith('.csv')) iconCls = 'fas fa-file-excel text-success';
      else if (fn.endsWith('.docx') || fn.endsWith('.doc')) iconCls = 'fas fa-file-word text-primary';
      else if (file.type && file.type.indexOf('image/') === 0) iconCls = 'fas fa-file-image text-info';
      if (fileIconEl) fileIconEl.className = iconCls + ' ocr-file-icon';

      dropzone.style.display = 'none';
      fileCard.classList.add('is-active');
    },

    showScanning: function(modal) {
      var scan = modal.querySelector('#ocrScanningContainer');
      var extractBtn = modal.querySelector('#ocrExtractBtn');
      if (scan) scan.classList.add('is-active');
      if (extractBtn) {
        extractBtn.disabled = true;
        extractBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + this.t('scanning');
      }
    },

    hideScanning: function(modal) {
      var scan = modal.querySelector('#ocrScanningContainer');
      var extractBtn = modal.querySelector('#ocrExtractBtn');
      if (scan) scan.classList.remove('is-active');
      if (extractBtn) {
        extractBtn.disabled = false;
        extractBtn.innerHTML = '<i class="fas fa-bolt"></i> <span>' + this.t('extractBtn') + '</span>';
      }
    },

    showStatus: function(modal, message, tone) {
      var box = modal.querySelector('#ocrStatusBox');
      if (!box) return;
      var icon = tone === 'success' ? 'fa-check-circle' : (tone === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
      box.className = 'ocr-status-box is-active tone-' + (tone || 'info');
      box.innerHTML = '<i class="fas ' + icon + '" style="font-size:16px;margin-top:2px;"></i><div>' + this.escapeHtml(message) + '</div>';
    },

    hideStatus: function(modal) {
      var box = modal.querySelector('#ocrStatusBox');
      if (box) box.classList.remove('is-active');
    },

    hidePreview: function(modal) {
      var p = modal.querySelector('#ocrPreviewPanel');
      if (p) {
        p.classList.remove('is-active');
        p.innerHTML = '';
      }
    },

    runExtraction: async function(modal) {
      if (!this.state.file) {
        this.showStatus(modal, this.t('fileRequired'), 'error');
        return;
      }

      this.state.isExtracting = true;
      this.hideStatus(modal);
      this.hidePreview(modal);
      this.showScanning(modal);

      try {
        var isTenderOrConsult = (this.state.mode === 'tender' || this.state.mode === 'consultation');
        var result = await UnifiedOCR.extract(this.state.file, {
          endpoint: isTenderOrConsult ? '/api/ocr/extract' : '/api/ai/invoice-extract',
          imageMaxWidth: 1600
        });

        var payload = result.payload || {};
        var text = result.text || '';
        var analysis = payload.analysis || {};
        var fields = analysis.fields || {};
        var lineItems = payload.lineItems || analysis.line_items || [];

        // Parse standard model
        var parsed = this.parseDocumentData(payload, text, this.state.mode);
        this.state.extracted = parsed;

        this.hideScanning(modal);
        var successMsg = this.t('successExtracted');
        if (result.engineUsed === 'tesseract' || payload.ocr_engine_used === 'tesseract-fallback') {
          var isAr = this.getLang() === 'ar';
          var isFr = this.getLang() === 'fr';
          successMsg += isAr ? ' (تم التبديل تلقائياً إلى Tesseract)' : (isFr ? ' (Basculé automatiquement sur Tesseract)' : ' (Auto fallback to Tesseract)');
        }
        this.showStatus(modal, successMsg, 'success');
        this.renderPreview(modal, parsed);

        var applyBtn = modal.querySelector('#ocrApplyBtn');
        if (applyBtn) {
          applyBtn.style.display = 'inline-flex';
          applyBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } catch (err) {
        this.hideScanning(modal);
        var msg = (err && err.message) || 'Unknown OCR Error';
        this.showStatus(modal, msg, 'error');
      } finally {
        this.state.isExtracting = false;
      }
    },

    cleanOcrNum: function(val) {
      if (val === null || val === undefined) return 0;
      if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
      var s = String(val).trim();
      if (!s) return 0;
      for (var i = 0; i < 10; i++) {
        s = s.replace(new RegExp(String.fromCharCode(0x0660 + i), 'g'), String(i));
        s = s.replace(new RegExp(String.fromCharCode(0x06F0 + i), 'g'), String(i));
      }
      s = s.replace(/[\s\u00a0\u202f]/g, '');
      if (s.indexOf('.') > -1 && s.indexOf(',') > -1) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
          s = s.replace(/\./g, '').replace(',', '.');
        } else {
          s = s.replace(/,/g, '');
        }
      } else if (s.indexOf(',') > -1) {
        var parts = s.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
          s = parts[0] + '.' + parts[1];
        } else {
          s = s.replace(/,/g, '');
        }
      } else if (s.indexOf('.') > -1) {
        var dParts = s.split('.');
        if (dParts.length > 2) {
          var lastPart = dParts[dParts.length - 1];
          var head = dParts.slice(0, dParts.length - 1).join('');
          s = head + '.' + lastPart;
        }
      }
      s = s.replace(/[^0-9.\-]/g, '');
      var p = parseFloat(s);
      return Number.isFinite(p) ? p : 0;
    },

    parseDocumentData: function(payload, text, mode) {
      var self = this;
      var cleanOcrNum = function(v) { return self.cleanOcrNum(v); };
      var ext = global.OcrFieldExtractors || {};
      var raw = normalizeArabicOcrText(text || '');
      var fields = (payload.analysis && payload.analysis.fields) || {};
      var docTypeMeta = detectDocumentType(raw);
      var amountInWords = payload.amountInWords || fields.amount_in_words || (ext.extractAmountInWords ? ext.extractAmountInWords(raw) : '');

      // 1. Separate Customer and Supplier carefully
      var customerName = payload.customer || fields.customer_name || fields.customer || '';
      var customerRc = payload.customerRc || fields.customer_rc || '';
      var customerNif = payload.customerTaxId || fields.customer_nif || '';
      var customerNis = payload.customerNis || fields.customer_nis || '';
      var customerArt = payload.customerArt || fields.customer_art || '';
      var customerPhone = payload.customerPhone || fields.customer_phone || '';
      var customerEmail = payload.customerEmail || fields.customer_email || '';
      var customerAddress = payload.customerAddress || fields.customer_address || '';
      var customerCity = payload.customerCity || fields.customer_city || '';

      var supplierName = payload.supplier || fields.supplier_name || fields.company_name || fields.supplier || '';
      var detectedProductName = payload.productName || fields.product_name || '';
      if (isProductOrHardwareTitle(supplierName)) {
        if (!detectedProductName) detectedProductName = supplierName;
        supplierName = '';
      }
      var supplierRc = payload.supplierRc || fields.supplier_rc || '';
      var supplierNif = payload.supplierTaxId || fields.supplier_nif || '';
      var supplierNis = payload.supplierNis || fields.supplier_nis || '';
      var supplierArt = payload.supplierArt || fields.supplier_art || '';
      var supplierAi = payload.supplierAi || fields.supplier_ai || '';
      var supplierPhone = payload.supplierPhone || fields.supplier_phone || '';
      var supplierEmail = payload.supplierEmail || fields.supplier_email || '';
      var supplierAddress = payload.supplierAddress || fields.supplier_address || '';
      var supplierCity = payload.supplierCity || fields.supplier_city || '';

      // Text fallbacks if fields are missing
      if (!customerName && raw) {
        var cm = raw.match(/(?:Client|Factur[eé]\s*[aà]|Acheteur|Destinataire|العميل|الزبون|المشتري)\s*[:\-]\s*([^\n\r]{3,80})/i);
        if (cm) customerName = cm[1].trim();
      }
      if (!supplierName && raw) {
        if (ext.extractSupplierName) supplierName = ext.extractSupplierName(raw);
        else {
          var sm = raw.match(/(?:Fournisseur|Vendeur|Soci[eé]t[eé]|المورد|البائع|الشركة)\s*[:\-]\s*([^\n\r]{3,80})/i);
          if (sm) supplierName = sm[1].trim();
        }
      }
      if (!supplierRc && raw && ext.extractRc) supplierRc = ext.extractRc(raw);
      if (!supplierNif && raw && ext.extractNif) supplierNif = ext.extractNif(raw);
      if (!supplierNis && raw && ext.extractNis) supplierNis = ext.extractNis(raw);
      if (!supplierArt && raw && ext.extractArt) supplierArt = ext.extractArt(raw);
      if (!supplierAi && raw && ext.extractAi) supplierAi = ext.extractAi(raw);

      var rc = (mode === 'supplier' || mode === 'bill' || mode === 'po' || mode === 'company') ? (supplierRc || customerRc) : (customerRc || supplierRc);
      var nif = (mode === 'supplier' || mode === 'bill' || mode === 'po' || mode === 'company') ? (supplierNif || customerNif) : (customerNif || supplierNif);
      var nis = (mode === 'supplier' || mode === 'bill' || mode === 'po' || mode === 'company') ? (supplierNis || customerNis) : (customerNis || supplierNis);
      var art = (mode === 'supplier' || mode === 'bill' || mode === 'po' || mode === 'company') ? (supplierArt || customerArt) : (customerArt || supplierArt);
      var ai = supplierAi || '';
      var rib = payload.rib || fields.rib || (ext.extractRib ? ext.extractRib(raw) : '');
      var phone = (mode === 'supplier' || mode === 'bill' || mode === 'po' || mode === 'company') ? (supplierPhone || customerPhone) : (customerPhone || supplierPhone);
      var email = (mode === 'supplier' || mode === 'bill' || mode === 'po' || mode === 'company') ? (supplierEmail || customerEmail) : (customerEmail || supplierEmail);
      var address = (mode === 'supplier' || mode === 'bill' || mode === 'po' || mode === 'company') ? (supplierAddress || customerAddress) : (customerAddress || supplierAddress);
      var city = (mode === 'supplier' || mode === 'bill' || mode === 'po' || mode === 'company') ? (supplierCity || customerCity) : (customerCity || supplierCity);

      // Tender extraction (with specialized Algerian Public Procurement patterns)
      var isTenderMode = (mode === 'tender' || mode === 'consultation');
      var tenderTitle = '';
      var tenderRef = '';
      var authority = '';
      var deadline = '';
      var candName = '';

      if (raw) {
        var cleanRawForRef = raw.replace(/(?:ordonnance|d[eé]cret|loi|article|code\s+p[eé]nal|registre(?:\s+du\s+commerce)?)\s*(?:n[°oº]|r[eé]f)?\s*[:\.\s]*[0-9\-\/]+/gi, '');
        var rm = cleanRawForRef.match(/(?:AON?|AOI?|Consultation|Avis\s+d['’]appel\s+d['’]offres|Appel\s+d['’]offres|الصفقة|المناقصة|الاستشارة)\s*(?:N[°oº]|R[eé]f(?:\.|erence)?|رقم|مرجع)?\s*[:\/\-\s#№]+\s*([0-9]{1,4}\s*[\/\-]\s*[0-9]{2,4}|[A-Za-z0-9\/\-_]{3,30})/i);
        if (rm) {
          var candRef = rm[1].replace(/\s+/g, '').trim();
          if (/\d/.test(candRef) && candRef.length >= 3 && !/^(66-156|03-03|15-247)$/.test(candRef)) {
            tenderRef = candRef;
          }
        }
        if (!tenderRef) {
          var rm2 = cleanRawForRef.match(/(?:N[°oº]|R[eé]f(?:\.|erence)?|مرجع|رقم)\s*[:\/\-\s#№]+\s*([0-9]{1,4}\s*[\/\-]\s*20[2-3][0-9])/i);
          if (rm2) {
            var candRef2 = rm2[1].replace(/\s+/g, '').trim();
            if (/\d/.test(candRef2) && !/^(66-156|03-03|15-247)$/.test(candRef2)) tenderRef = candRef2;
          }
        }

        var mService = raw.match(/(?:D[eé]signation\s+du\s+service\s+contractant|l['’]Assembl[eé]e\s+Populaire\s+Communale\s+d[e\'’]\s*[A-Za-zÀ-ÿ\-]+|المجلس\s+الشعبي\s+البلدي\s+ل?[^\n\r]+)\s*[:\-]?\s*([^\n\r]+)?/i);
        if (mService) {
          authority = (mService[1] || mService[0]).replace(/\s+/g, ' ').replace(/^[0-9\/\-.:\s]+/, '').replace(/[.;,]+$/, '').trim();
          authority = authority.replace(/Staou[a-zÀ-ÿ]+/gi, 'Staoueli').replace(/Staqueli/gi, 'Staoueli');
          if (authority.length > 4 && !authority.match(/^[0-9]+$/)) {
            var mWil = raw.match(/(?:Wilaya\s+d[e\'’]\s*[A-Za-zÀ-ÿ\-]+|ولاية\s+[\u0621-\u064A\-]+)/i);
            if (mWil && !authority.toLowerCase().includes('wilaya') && !authority.toLowerCase().includes('alger')) {
              authority += ' (' + mWil[0].trim() + ')';
            }
          }
        }
        if (!authority) {
          var am = raw.match(/(?:Commune\s+d[e\'’]\s*[A-Za-zÀ-ÿ\-]+|بلدية\s+[\u0621-\u064A\-]+|Wilaya\s+d[e\'’]\s*[A-Za-zÀ-ÿ\-]+|ولاية\s+[\u0621-\u064A\-]+|Minist[eè]re\s+d[e\'’]\s*[A-Za-zÀ-ÿ\s\-]+|وزارة\s+[\u0621-\u064A\s\-]+|Direction\s+d[e\'’]\s*[A-Za-zÀ-ÿ\s\-]+|مديرية\s+[\u0621-\u064A\s\-]+|ma[iî]tre\s+d['’]ouvrage|المصلحة\s+المتعاقدة|صاحب\s+المشروع|الجهة\s+المتعاقدة)[\s\:\-]*([^\n\r]{3,80})/i);
          if (am) {
            authority = am[0].trim().replace(/^(ma[iî]tre\s+d['’]ouvrage|المصلحة\s+المتعاقدة|صاحب\s+المشروع|الجهة\s+المتعاقدة)\s*[:\-]\s*/i, '').replace(/Staou[a-zÀ-ÿ]+/gi, 'Staoueli').replace(/Staqueli/gi, 'Staoueli').trim();
          }
        }

        var tm = raw.match(/(?:Objet(?:\s+du\s+march[eé](?:\s+public)?|\s+de\s+la\s+consultation|\s+de\s+l['’]appel\s+d['’]offres|\s+de\s+la\s+prestation)?|portant(?:\s+sur)?|relatif\s+[aà]|intitul[eé]|موضوع(?:\s+الصفقة|\s+المناقصة|\s+الاستشارة)?|يتضمن|مشروع)\s*[:\-]\s*([^\n\r]+)/i);
        if (tm) {
          tenderTitle = tm[1].replace(/\s+/g, ' ').replace(/^[0-9\/\-.:\s]+/, '').replace(/[.;,]+$/, '').trim();
        }
        if (!tenderTitle || /^(d[eé]claration|candidature|probit[eé]|soumission)$/i.test(tenderTitle)) {
          var lines = raw.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
          for (var i = 0; i < Math.min(lines.length, 12); i++) {
            if (/^(objet|titre|موضوع|مشروع|projet)\s*[:\-]/i.test(lines[i])) {
              var cl = lines[i].replace(/^(objet|titre|موضوع|مشروع|projet)\s*[:\-]\s*/i, '').trim();
              if (cl.length > 3) { tenderTitle = cl; break; }
            }
          }
        }
        if (!tenderTitle) {
          var tm2 = raw.match(/(?:tender|appel\s+d['’]offres|مناقصة|طلب\s+عروض)[\s\w]*[\:\-]?\s*([^\n\r]{5,120})/i);
          if (tm2) tenderTitle = tm2[1].trim();
        }

        var candMatch = raw.match(/\b(SARL|EURL|SPA|SNC|ETS)\s+[A-Z0-9\s\-]{3,35}\b/);
        candName = candMatch ? candMatch[0].trim() : '';
        if (candName && !customerName && !supplierName) {
          customerName = candName;
        }

        var dm = raw.match(/(?:d[eé]lai\s+de\s+pr[eé]paration[^\n\r:]*[:\-]\s*([^\n\r.]{3,40})|deadline|échéance|date\s+limite|آخر\s+أجل|تاريخ\s+الإيداع|مدة\s+التحضير)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|[^\n\r,.;]{3,35})/i);
        if (dm) deadline = (dm[1] || dm[2] || '').trim();
      }

      var rawItems = [];
      if (isTenderMode) {
        if (raw) {
          var lotMatches = raw.matchAll(/(?:Lot|Poste|Article|بند|حصة)\s*N?[°oº]?\s*(\d+)\s*[:\-]\s*([^\n\r]+)/gi);
          for (var lm of lotMatches) {
            rawItems.push({
              description: lm[0].trim(),
              quantity: 1,
              unit_price: 0,
              total: 0
            });
          }
        }
        if (!rawItems.length && tenderTitle && tenderTitle.length > 2) {
          rawItems.push({
            description: tenderTitle,
            quantity: 1,
            unit_price: 0,
            total: 0
          });
        }
      } else {
        rawItems = Array.isArray(payload.lineItems) ? payload.lineItems : (Array.isArray(payload.analysis && payload.analysis.line_items) ? payload.analysis.line_items : []);
        if (!rawItems.length && raw) {
          var lines = raw.split(/\r?\n/);
          for (var li = 0; li < lines.length; li++) {
            var lineTrim = lines[li].trim();
            if (!lineTrim || lineTrim.length < 5) continue;
            if (/(?:total|tva|sous-total|net\s*a\s*payer|remise|montant\s*total|المجموع|الضريبة|الإجمالي|facture|client|date|page|merci)/i.test(lineTrim)) continue;
            var mEnd = lineTrim.match(/(\d[\d\s.,]*\d|\d+)\s+(\d[\d\s.,]*\d|\d+)(?:\s+(\d[\d\s.,]*\d|\d+))?\s*(?:DA|DZD|EUR|€|\$)?\s*$/i);
            if (mEnd) {
              var descPart = lineTrim.slice(0, mEnd.index).trim();
              descPart = descPart.replace(/^(?:[0-9]{1,3}\s*[\.\-\/:\)]\s*)/, '').trim();
              if (descPart.length >= 2) {
                var v1 = cleanOcrNum(mEnd[1]);
                var v2 = cleanOcrNum(mEnd[2]);
                var v3 = mEnd[3] ? cleanOcrNum(mEnd[3]) : 0;
                var qVal = 1, pVal = 0, tVal = 0;
                if (v3 > 0) {
                  qVal = v1; pVal = v2; tVal = v3;
                } else if (v2 > 0) {
                  qVal = v1; pVal = v2; tVal = v1 * v2;
                }
                rawItems.push({ description: descPart, quantity: qVal, unit_price: pVal, total: tVal });
              }
            }
          }
        }
      }

      if (!rawItems.length && (detectedProductName || isProductOrHardwareTitle(raw))) {
        var pTitle = detectedProductName;
        if (!pTitle && raw) {
          var fLines = raw.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
          for (var fi = 0; fi < Math.min(fLines.length, 5); fi++) {
            if (isProductOrHardwareTitle(fLines[fi])) { pTitle = fLines[fi]; break; }
          }
        }
        if (pTitle) {
          rawItems.push({
            description: pTitle,
            quantity: 1,
            unit_price: 0,
            total: 0
          });
        }
      }

      var items = rawItems.map(function(it, idx) {
        var q = cleanOcrNum(it.quantity);
        var p = cleanOcrNum(it.unit_price || it.unitPrice || it.price);
        var t = cleanOcrNum(it.total || it.amount || it.totalHT);

        if (q <= 0) q = 1;

        if (q > 50 && p > 0 && p <= 50 && t > 0 && Math.abs(q * p - t) < Math.max(t * 0.1, 5)) {
          var temp = q;
          q = p;
          p = temp;
        }
        if (p <= 0 && t > 0 && q > 0) {
          p = t / q;
        }
        if (t <= 0 && p > 0 && q > 0) {
          t = q * p;
        }
        if (q > 1 && p > 0 && t > 0 && Math.abs(p - t) < 0.01) {
          p = t / q;
        }

        var desc = String(it.description || it.designation || it.name || ('Item #' + (idx + 1))).trim();
        desc = desc.replace(/^(?:[0-9]{1,3}\s*[\.\-\/:\)]\s*)/, '').trim();

        return {
          id: idx,
          description: desc || ('Article #' + (idx + 1)),
          quantity: q,
          unitPrice: p,
          total: t,
          unit: it.unit || it.um || 'piece',
          selected: true
        };
      });

      var subtotal = cleanOcrNum(payload.subtotal || payload.totalHT || fields.subtotal || (ext.extractSubtotal ? ext.extractSubtotal(raw) : 0));
      var vat = cleanOcrNum(payload.vat || payload.vatAmount || payload.totalTVA || payload.tax || fields.tax || (ext.extractVat ? ext.extractVat(raw) : 0));
      var timbre = cleanOcrNum(payload.timbre || payload.timbreFiscal || fields.timbre || fields.stamp_duty || (ext.extractTimbre ? ext.extractTimbre(raw) : 0));
      var discount = cleanOcrNum(payload.discount || payload.remise || fields.discount || fields.remise || (ext.extractDiscount ? ext.extractDiscount(raw) : 0));
      var total = cleanOcrNum(payload.total || payload.amount || payload.totalTTC || fields.total || 0);
      if (!total && subtotal > 0) {
        total = subtotal + vat + timbre - discount;
      } else if (!total && items.length && !isTenderMode) {
        total = items.reduce(function(acc, i) { return acc + i.total; }, 0);
      }
      if (!amountInWords && total > 0 && typeof window !== 'undefined' && window.ZeraldaPrinter && window.ZeraldaPrinter.Tafqeet) {
        try { amountInWords = window.ZeraldaPrinter.Tafqeet.toWords(total, self.getLang()); } catch(_) {}
      }

      if (!phone && raw) {
        var pm = raw.match(/(?:(?:0[567][0-9]{8})|(?:\+213\s?[567][0-9]{8})|(?:0[234][0-9]{7}))/);
        if (pm) phone = pm[0].replace(/\s+/g, '');
      }
      if (!email && raw) {
        var em = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (em) email = em[0];
      }

      var empName = payload.employeeName || fields.employee_name || customerName || '';
      var nin = payload.nin || fields.nin || '';
      if (!nin && raw) {
        var ninM = raw.match(/(?:(?:nin|رقم التعريف الوطني|cni)\s*[:\-]?\s*([0-9]{18}))/i);
        if (ninM) nin = ninM[1];
      }
      var birthDate = payload.birthDate || fields.birth_date || '';
      if (!birthDate && raw) {
        var bM = raw.match(/(?:né\(e\)\s*le|تاريخ الميلاد|date\s*de\s*naissance)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
        if (bM) birthDate = bM[1];
      }
      var jobTitle = payload.jobTitle || fields.job_title || '';
      if (!jobTitle && raw) {
        var jM = raw.match(/(?:poste|fonction|المنصب|مهنة|spécialité)\s*[:\-]?\s*([^\n\r]{3,60})/i);
        if (jM) jobTitle = jM[1].trim();
      }

      var productName = payload.productName || fields.product_name || (items[0] && items[0].description) || '';
      var barcode = payload.barcode || fields.barcode || '';
      if (!barcode && raw) {
        var bcM = raw.match(/\b([0-9]{8,14})\b/);
        if (bcM) barcode = bcM[1];
      }
      var purchasePrice = cleanOcrNum(payload.purchasePrice || (items[0] && items[0].unitPrice) || 0);
      var sellingPrice = cleanOcrNum(payload.sellingPrice || (payload.purchasePrice ? (payload.purchasePrice * 1.25) : (items[0] && items[0].unitPrice ? (items[0].unitPrice * 1.25) : 0)));
      var quantity = cleanOcrNum(payload.quantity || (items[0] && items[0].quantity) || 1);
      var category = payload.category || fields.category || 'General';

      var journalDate = payload.billDate || payload.date || fields.invoice_date || fields.date || '';
      if (journalDate && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(String(journalDate).trim())) {
        var dp = String(journalDate).trim().split(/[\/\-]/);
        journalDate = dp[2] + '-' + ('0' + dp[1]).slice(-2) + '-' + ('0' + dp[0]).slice(-2);
      }
      var invoiceNumber = cleanInvoiceRef(payload.externalRef || payload.invoiceNumber || payload.number || fields.invoice_number || '');
      if (!invoiceNumber && raw) {
        var invM = raw.match(/(?:(?:n[°º]|réf|ref|facture|proforma|quittance|reçu|رقم|مرجع)\s*[:\/\-]?\s*([A-Za-z0-9\/\-_]{2,30}))/i);
        if (invM) invoiceNumber = cleanInvoiceRef(invM[1]);
      }
      var bankName = payload.bankName || payload.supplierBank || '';
      if (!bankName && raw) {
        if (ext.extractBankName) bankName = ext.extractBankName(raw);
        else {
          var bnkM = raw.match(/\b(BEA|BNA|CPA|BADR|BDL|CNEP|SGA|AGB|BARAKA|NATIXIS|FRANSABANK)\b/i);
          if (bnkM) bankName = bnkM[1].toUpperCase();
        }
      }
      var accountHolder = customerName || supplierName || empName || '';
      var company = payload.company || customerName || supplierName || '';

      var companyName = payload.companyName || payload.company || fields.company_name || supplierName || '';
      if (!companyName && raw) {
        var cnM = raw.match(/(?:raison\s+sociale|d[eé]nomination(?:\s+sociale)?|nom\s+de\s+l['’]entreprise|اسم\s+الشركة|المؤسسة)\s*[:\-]?\s*([^\n\r]{3,80})/i);
        if (cnM) companyName = cnM[1].trim();
        else {
          var sarlM = raw.match(/^[^\n\r]*\b(SARL|SPA|EURL|EPIC|SNC|SAS|ETS)\b[^\n\r]*/im);
          if (sarlM) companyName = sarlM[0].trim().substring(0, 80);
          else {
            var firstCleanLine = raw.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 3 && !/^(facture|devis|bon|re[cç]u|date)/i.test(l); })[0];
            if (firstCleanLine && firstCleanLine.length < 80) companyName = firstCleanLine;
          }
        }
      }

      var siege = payload.siege || supplierAddress || address || (ext.extractSiege ? ext.extractSiege(raw) : '');
      var capital = payload.capital || (ext.extractCapital ? ext.extractCapital(raw) : '');
      var website = payload.website || (ext.extractWebsite ? ext.extractWebsite(raw) : '');
      var bp = payload.bp || payload.supplierBp || (ext.extractBp ? ext.extractBp(raw) : '');
      var ag = payload.ag || (ext.extractAg ? ext.extractAg(raw) : '');

      return {
        customerName: customerName,
        customerRc: customerRc,
        customerNif: customerNif,
        customerNis: customerNis,
        customerArt: customerArt,
        customerPhone: customerPhone,
        customerEmail: customerEmail,
        customerAddress: customerAddress,
        customerCity: customerCity,

        supplierName: supplierName,
        supplierRc: supplierRc,
        supplierNif: supplierNif,
        supplierNis: supplierNis,
        supplierArt: supplierArt,
        supplierAi: supplierAi,
        supplierPhone: supplierPhone,
        supplierEmail: supplierEmail,
        supplierAddress: supplierAddress,
        supplierCity: supplierCity,

        companyName: companyName,
        siege: siege,
        capital: capital,
        website: website,
        bp: bp,
        ag: ag,
        empName: empName,
        nin: nin,
        birthDate: birthDate,
        jobTitle: jobTitle,
        tenderTitle: tenderTitle,
        tenderRef: tenderRef,
        authority: authority,
        deadline: deadline,
        client: customerName,
        subject: tenderTitle || (raw ? raw.split('\n')[0].slice(0, 100) : ''),
        rc: rc,
        nif: nif,
        nis: nis,
        ai: ai,
        art: art,
        rib: rib,
        phone: phone,
        email: email,
        address: address || siege,
        city: city,
        items: items,
        totals: { subtotal: subtotal, vat: vat, timbre: timbre, discount: discount, total: total },
        documentType: docTypeMeta.type,
        documentTypeLabel: (self.getLang() === 'ar' ? docTypeMeta.label_ar : docTypeMeta.label_fr),
        amountInWords: amountInWords,
        subtotal: subtotal,
        vat: vat,
        timbre: timbre,
        discount: discount,
        date: journalDate,
        invoiceNumber: invoiceNumber,
        productName: productName,
        barcode: barcode,
        purchasePrice: purchasePrice,
        sellingPrice: sellingPrice,
        quantity: quantity,
        category: category,
        reference: invoiceNumber,
        journalDate: journalDate,
        journalDesc: supplierName || customerName || (raw ? raw.split('\n')[0].slice(0, 80) : 'قيد مستند'),
        bankName: bankName,
        accountHolder: accountHolder,
        company: company,
        rawText: raw,
        payload: payload
      };
    },

    renderPreview: function(modal, data) {
      var p = modal.querySelector('#ocrPreviewPanel');
      if (!p) return;

      var mode = this.state.mode;
      var html = '<div class="ocr-preview-header">' +
        '<div class="ocr-preview-title"><i class="fas fa-check-circle text-success"></i> <span>' + this.t('itemsExtracted') + '</span></div>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          (data.documentTypeLabel ? '<span class="ocr-confidence-badge" style="background:#e0f2fe;color:#0369a1;border-color:#bae6fd;"><i class="fas fa-file-alt"></i> ' + ZeraldaOCR.escapeHtml(data.documentTypeLabel) + '</span>' : '') +
          '<span class="ocr-confidence-badge"><i class="fas fa-magic"></i> ' + this.t('aiParsed') + '</span>' +
        '</div>' +
      '</div>';

      if (data.documentType === 'technical_sheet' || isProductOrHardwareTitle(data.rawText)) {
        html += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#1e40af;display:flex;align-items:center;gap:10px;">' +
          '<i class="fas fa-info-circle" style="font-size:18px;"></i>' +
          '<div><strong>' + this.t('technicalSheetNoticeTitle') + '</strong>: ' + this.t('technicalSheetNoticeDesc') + '</div>' +
        '</div>';
      }

      // 1. Entity Fields Grid
      var fieldsList = [];
      if (mode === 'customer' || mode === 'invoice' || mode === 'proforma') {
        if (data.customerName) fieldsList.push({ label: this.t('customerName'), val: data.customerName });
        if (data.customerRc) fieldsList.push({ label: this.t('rc') + ' (' + this.t('clientTag') + ')', val: data.customerRc });
        if (data.customerNif) fieldsList.push({ label: this.t('nif') + ' (' + this.t('clientTag') + ')', val: data.customerNif });
        if (data.customerPhone) fieldsList.push({ label: this.t('phone'), val: data.customerPhone });
        if (data.customerAddress) fieldsList.push({ label: this.t('address'), val: data.customerAddress });

        if (data.supplierName && data.supplierName !== data.customerName && !isProductOrHardwareTitle(data.supplierName)) {
          fieldsList.push({ label: this.t('supplierName') + ' (' + this.t('issuer') + ')', val: data.supplierName });
        }
        if (data.invoiceNumber && !cleanInvoiceRef(data.invoiceNumber) === false) fieldsList.push({ label: this.t('journalRef'), val: cleanInvoiceRef(data.invoiceNumber) });
        if (data.date) fieldsList.push({ label: this.t('journalDate'), val: data.date });
      } else if (mode === 'supplier' || mode === 'po' || mode === 'bill') {
        if (data.supplierName) fieldsList.push({ label: this.t('supplierName'), val: data.supplierName });
        if (data.supplierRc || data.rc) fieldsList.push({ label: this.t('rc'), val: data.supplierRc || data.rc });
        if (data.supplierNif || data.nif) fieldsList.push({ label: this.t('nif'), val: data.supplierNif || data.nif });
        if (data.supplierNis || data.nis) fieldsList.push({ label: this.t('nis'), val: data.supplierNis || data.nis });
        if (data.supplierArt || data.art) fieldsList.push({ label: this.t('art'), val: data.supplierArt || data.art });
        if (data.supplierPhone || data.phone) fieldsList.push({ label: this.t('phone'), val: data.supplierPhone || data.phone });
        if (data.supplierEmail || data.email) fieldsList.push({ label: this.t('email'), val: data.supplierEmail || data.email });
        if (data.supplierAddress || data.address) fieldsList.push({ label: this.t('address'), val: data.supplierAddress || data.address });
      } else if (mode === 'company' || mode === 'enterprise') {
        if (data.companyName) fieldsList.push({ label: this.t('companyName'), val: data.companyName });
        if (data.siege || data.address) fieldsList.push({ label: this.t('siege'), val: data.siege || data.address });
        if (data.capital) fieldsList.push({ label: this.t('capital'), val: data.capital });
        if (data.website) fieldsList.push({ label: this.t('website'), val: data.website });
        if (data.bp) fieldsList.push({ label: this.t('bp'), val: data.bp });
        if (data.ag) fieldsList.push({ label: this.t('ag'), val: data.ag });
        if (data.bankName) fieldsList.push({ label: this.t('bankName'), val: data.bankName });
        if (data.rib) fieldsList.push({ label: this.t('bankRib'), val: data.rib });
        if (data.rc) fieldsList.push({ label: this.t('rc'), val: data.rc });
        if (data.nif) fieldsList.push({ label: this.t('nif'), val: data.nif });
        if (data.nis) fieldsList.push({ label: this.t('nis'), val: data.nis });
        if (data.art) fieldsList.push({ label: this.t('art'), val: data.art });
        if (data.phone) fieldsList.push({ label: this.t('phone'), val: data.phone });
        if (data.email) fieldsList.push({ label: this.t('email'), val: data.email });
      } else if (mode === 'employee' || mode === 'cv') {
        if (data.empName) fieldsList.push({ label: this.t('empName'), val: data.empName });
        if (data.nin) fieldsList.push({ label: this.t('nin'), val: data.nin });
        if (data.birthDate) fieldsList.push({ label: this.t('birthDate'), val: data.birthDate });
        if (data.jobTitle) fieldsList.push({ label: this.t('jobTitle'), val: data.jobTitle });
      } else if (mode === 'tender') {
        if (data.tenderRef) fieldsList.push({ label: this.t('tenderRef'), val: data.tenderRef });
        if (data.tenderTitle) fieldsList.push({ label: this.t('tenderTitle'), val: data.tenderTitle });
        if (data.authority) fieldsList.push({ label: this.t('authority'), val: data.authority });
        if (data.deadline) fieldsList.push({ label: this.t('deadline'), val: data.deadline });
      } else if (mode === 'consultation') {
        if (data.customerName || data.client) fieldsList.push({ label: this.t('customerName'), val: data.customerName || data.client });
        if (data.subject) fieldsList.push({ label: this.t('tenderTitle'), val: data.subject });
      } else if (mode === 'inventory' || mode === 'product') {
        if (data.productName) fieldsList.push({ label: this.t('productName'), val: data.productName });
        if (data.barcode) fieldsList.push({ label: this.t('productBarcode'), val: data.barcode });
        if (data.purchasePrice > 0) fieldsList.push({ label: this.t('productCost'), val: data.purchasePrice.toFixed(2) + ' DZD' });
        if (data.sellingPrice > 0) fieldsList.push({ label: this.t('productPrice'), val: data.sellingPrice.toFixed(2) + ' DZD' });
        if (data.quantity > 0) fieldsList.push({ label: this.t('productQty'), val: String(data.quantity) });
        if (data.category) fieldsList.push({ label: this.t('category'), val: data.category });
      } else if (mode === 'journal' || mode === 'finance') {
        if (data.journalDate || data.date) fieldsList.push({ label: this.t('journalDate'), val: data.journalDate || data.date });
        if (data.reference || data.invoiceNumber) fieldsList.push({ label: this.t('journalRef'), val: data.reference || data.invoiceNumber });
        if (data.supplierName || data.customerName) fieldsList.push({ label: this.t('journalDesc'), val: data.supplierName || data.customerName });
      } else if (mode === 'bank') {
        if (data.bankName) fieldsList.push({ label: this.t('bankName'), val: data.bankName });
        if (data.rib) fieldsList.push({ label: this.t('bankRib'), val: data.rib });
        if (data.accountHolder) fieldsList.push({ label: this.t('accountHolder'), val: data.accountHolder });
      } else if (mode === 'crm' || mode === 'lead') {
        if (data.customerName) fieldsList.push({ label: this.t('customerName'), val: data.customerName });
        if (data.company) fieldsList.push({ label: this.t('companyName'), val: data.company });
      } else if (mode === 'universal') {
        if (data.customerName) fieldsList.push({ label: this.t('customerName'), val: data.customerName });
        if (data.supplierName) fieldsList.push({ label: this.t('supplierName'), val: data.supplierName });
        if (data.productName) fieldsList.push({ label: this.t('productName'), val: data.productName });
        if (data.barcode) fieldsList.push({ label: this.t('productBarcode'), val: data.barcode });
        if (data.reference || data.invoiceNumber) fieldsList.push({ label: this.t('journalRef'), val: data.reference || data.invoiceNumber });
        if (data.bankName) fieldsList.push({ label: this.t('bankName'), val: data.bankName });
        if (data.rib) fieldsList.push({ label: this.t('bankRib'), val: data.rib });
        if (data.nif) fieldsList.push({ label: this.t('nif'), val: data.nif });
        if (data.rc) fieldsList.push({ label: this.t('rc'), val: data.rc });
        if (data.phone) fieldsList.push({ label: this.t('phone'), val: data.phone });
        if (data.email) fieldsList.push({ label: this.t('email'), val: data.email });
      }

      if (fieldsList.length) {
        html += '<div class="ocr-fields-grid">';
        fieldsList.forEach(function(f) {
          html += '<div class="ocr-field-item">' +
            '<span class="ocr-field-label">' + ZeraldaOCR.escapeHtml(f.label) + '</span>' +
            '<span class="ocr-field-val">' + ZeraldaOCR.escapeHtml(f.val) + '</span>' +
          '</div>';
        });
        html += '</div>';
      }

      // 2. Line Items Table (if any)
      if (data.items && data.items.length) {
        html += '<div class="ocr-table-wrap">' +
          '<table class="ocr-items-table">' +
            '<thead>' +
              '<tr>' +
                '<th style="width:36px;text-align:center;"><input type="checkbox" id="ocrToggleAllItems" checked></th>' +
                '<th>' + this.t('itemDesc') + '</th>' +
                '<th style="text-align:center;width:60px;">' + this.t('qty') + '</th>' +
                '<th style="text-align:center;width:90px;">' + this.t('price') + '</th>' +
                '<th style="text-align:center;width:90px;">' + this.t('total') + '</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>';

        data.items.forEach(function(it, idx) {
          html += '<tr>' +
            '<td style="text-align:center;"><input type="checkbox" class="ocr-item-check" data-idx="' + idx + '" ' + (it.selected ? 'checked' : '') + '></td>' +
            '<td><strong>' + ZeraldaOCR.escapeHtml(it.description) + '</strong></td>' +
            '<td style="text-align:center;">' + it.quantity + '</td>' +
            '<td style="text-align:center;">' + (it.unitPrice > 0 ? it.unitPrice.toFixed(2) : '-') + '</td>' +
            '<td style="text-align:center;">' + (it.total > 0 ? it.total.toFixed(2) : '-') + '</td>' +
          '</tr>';
        });

        html += '</tbody></table></div>';

        // Totals Strip
        if (data.totals && (data.totals.total > 0 || data.totals.subtotal > 0)) {
          var curSym = (typeof window !== 'undefined' && typeof window.getCurrencySymbol === 'function') ? window.getCurrencySymbol() : 'DA';
          html += '<div class="ocr-totals-strip">';
          if (data.totals.subtotal > 0) {
            html += '<div class="ocr-total-badge" style="background:rgba(59,130,246,0.1);color:#2563eb;border-color:rgba(59,130,246,0.25);">' + this.t('subtotal') + ': <strong>' + data.totals.subtotal.toFixed(2) + ' ' + curSym + '</strong></div>';
          }
          if (data.totals.vat > 0) {
            html += '<div class="ocr-total-badge" style="background:rgba(234,179,8,0.1);color:#ca8a04;border-color:rgba(234,179,8,0.25);">' + this.t('vat') + ': <strong>' + data.totals.vat.toFixed(2) + ' ' + curSym + '</strong></div>';
          }
          if (data.totals.timbre > 0) {
            html += '<div class="ocr-total-badge" style="background:rgba(168,85,247,0.1);color:#9333ea;border-color:rgba(168,85,247,0.25);">' + this.t('timbre') + ': <strong>' + data.totals.timbre.toFixed(2) + ' ' + curSym + '</strong></div>';
          }
          html += '<div class="ocr-total-badge">' + this.t('totalAmount') + ': <strong>' + (data.totals.total || data.totals.subtotal).toFixed(2) + ' ' + curSym + '</strong></div>' +
          '</div>';
        }
      }

      p.innerHTML = html;
      p.classList.add('is-active');

      // Bind table checkbox toggles
      var toggleAll = p.querySelector('#ocrToggleAllItems');
      var itemChecks = p.querySelectorAll('.ocr-item-check');
      if (toggleAll) {
        toggleAll.onchange = function() {
          var checked = toggleAll.checked;
          itemChecks.forEach(function(cb) {
            cb.checked = checked;
            var idx = parseInt(cb.getAttribute('data-idx'), 10);
            if (data.items[idx]) data.items[idx].selected = checked;
          });
        };
      }
      itemChecks.forEach(function(cb) {
        cb.onchange = function() {
          var idx = parseInt(cb.getAttribute('data-idx'), 10);
          if (data.items[idx]) data.items[idx].selected = cb.checked;
        };
      });
    },

    applyResult: function(modal) {
      var data = this.state.extracted;
      if (!data) return;

      var opts = this.state.options || {};
      this.close();

      if (typeof opts.onApply === 'function') {
        opts.onApply(data);
      } else {
        // Default handlers based on mode
        this.defaultApply(this.state.mode, data);
      }
    },

    defaultApply: function(mode, data) {
      var setVal = function(id, val) {
        var el = document.getElementById(id);
        if (el && val != null && String(val).trim() !== '') el.value = String(val).trim();
      };

      if (mode === 'customer') {
        // Populate customer fields if present
        setVal('newCustomerName', data.customerName);
        setVal('newCustomerRC', data.rc);
        setVal('newCustomerNIF', data.nif);
        setVal('newCustomerNIS', data.nis);
        setVal('newCustomerAI', data.ai);
        setVal('newCustomerART', data.art);
        setVal('newCustomerPhone', data.phone);
        setVal('newCustomerEmail', data.email);
        setVal('newCustomerCity', data.city);

        var typeSelect = document.getElementById('newCustomerType');
        if (typeSelect && (data.rc || data.nif)) {
          typeSelect.value = 'legal';
          if (typeof window.toggleCustomerBusinessFields === 'function') {
            window.toggleCustomerBusinessFields();
          }
        }
      } else if (mode === 'supplier') {
        var sName = document.getElementById('supplierName') || document.getElementById('newSupplierName');
        if (sName && data.supplierName) sName.value = data.supplierName;
        var sRc = document.getElementById('supplierRC') || document.getElementById('newSupplierRC');
        if (sRc && data.rc) sRc.value = data.rc;
        var sNif = document.getElementById('supplierNIF') || document.getElementById('newSupplierNIF');
        if (sNif && data.nif) sNif.value = data.nif;
        var sNis = document.getElementById('supplierNIS') || document.getElementById('newSupplierNIS');
        if (sNis && data.nis) sNis.value = data.nis;
        var sPhone = document.getElementById('supplierPhone') || document.getElementById('newSupplierPhone');
        if (sPhone && data.phone) sPhone.value = data.phone;
        var sEmail = document.getElementById('supplierEmail') || document.getElementById('newSupplierEmail');
        if (sEmail && data.email) sEmail.value = data.email;
        var sAddr = document.getElementById('supplierAddress') || document.getElementById('newSupplierAddress');
        if (sAddr && (data.address || data.city)) sAddr.value = data.address || data.city;
      } else if (mode === 'employee' || mode === 'cv') {
        setVal('employeeName', data.empName);
        setVal('employeeNationalId', data.nin);
        setVal('employeeDob', data.birthDate);
        setVal('employeePhone', data.phone);
        setVal('employeeEmail', data.email);
        setVal('employeeAddress', data.address || data.city);
        setVal('employeePosition', data.jobTitle);
      } else if (mode === 'consultation') {
        setVal('consultClient', data.customerName || data.client);
        setVal('consultSubject', data.subject || data.tenderTitle);
        setVal('consultDate', data.date);
      } else if (mode === 'tender') {
        setVal('tenderRef', data.tenderRef);
        setVal('tenderTitle', data.tenderTitle);
        setVal('tenderAuthority', data.authority);
        setVal('tenderDeadline', data.deadline);
        if (data.totals && data.totals.total > 0) setVal('tenderAmount', data.totals.total.toFixed(2));
      } else if (mode === 'inventory' || mode === 'product') {
        var pName = data.productName || (data.items && data.items[0] && data.items[0].description) || '';
        setVal('productName', pName);
        setVal('productBarcode', data.barcode);
        if (data.purchasePrice > 0) setVal('productPurchasePrice', data.purchasePrice.toFixed(2));
        else if (data.items && data.items[0] && data.items[0].unitPrice > 0) setVal('productPurchasePrice', data.items[0].unitPrice.toFixed(2));
        if (data.sellingPrice > 0) setVal('productSellingPrice', data.sellingPrice.toFixed(2));
        if (data.quantity > 0) setVal('productQuantity', data.quantity);
        if (data.category && typeof window.ensureCategoryExists === 'function') {
          window.ensureCategoryExists(data.category);
          setVal('productCategory', data.category);
        }
        if (typeof window.showToast === 'function') {
          window.showToast('تم تطبيق بيانات المنتج المستخرجة بنجاح!', 'success');
        }
      } else if (mode === 'journal' || mode === 'finance') {
        var jForm = document.getElementById('journalForm');
        if (jForm) {
          var dateInput = jForm.querySelector('input[type="date"]');
          if (dateInput && (data.journalDate || data.date)) dateInput.value = data.journalDate || data.date;
          var refInput = jForm.querySelector('input[placeholder*="reference"], input[placeholder*="مرجع"]');
          if (refInput && (data.reference || data.invoiceNumber)) refInput.value = data.reference || data.invoiceNumber;
          var descInput = jForm.querySelector('textarea');
          if (descInput) descInput.value = data.journalDesc || ('فاتورة ' + (data.supplierName || data.customerName || data.reference || ''));
          if (data.items && data.items.length && typeof window.addJournalLine === 'function') {
            var tbody = document.getElementById('journalLinesTable');
            if (tbody && tbody.querySelectorAll('tr').length === 0) {
              tbody.innerHTML = '';
              data.items.filter(function(i){ return i.selected; }).forEach(function(it) {
                window.addJournalLine();
                var rows = tbody.querySelectorAll('tr');
                var lastRow = rows[rows.length - 1];
                if (lastRow) {
                  var descInp = lastRow.querySelector('input[type="text"]');
                  if (descInp) descInp.value = it.description;
                  var numInps = lastRow.querySelectorAll('input[type="number"]');
                  if (numInps.length >= 2) {
                    numInps[0].value = (it.total || (it.quantity * it.unitPrice)).toFixed(2);
                    numInps[1].value = '0.00';
                  }
                }
              });
              if (typeof window.calculateJournalBalance === 'function') window.calculateJournalBalance();
            }
          }
          if (typeof window.showToast === 'function') {
            window.showToast('تم تعبئة سطور القيد المحاسبي بنجاح!', 'success');
          }
        }
      } else if (mode === 'bank') {
        if (data.bankName) {
          var bSel = document.getElementById('bankNameSelect');
          if (bSel) {
            for (var bi = 0; bi < bSel.options.length; bi++) {
              if (bSel.options[bi].value === data.bankName || bSel.options[bi].text.indexOf(data.bankName) !== -1) {
                bSel.selectedIndex = bi;
                break;
              }
            }
          }
        }
        setVal('bankRib', data.rib);
        setVal('bankAccountNumber', data.accountNumber || (data.rib ? data.rib.replace(/\s+/g, '') : ''));
        setVal('bankHolderName', data.accountHolder);
      } else if (mode === 'crm' || mode === 'lead') {
        var cForm = document.getElementById('customerForm') || document.getElementById('leadForm');
        if (cForm) {
          var inputs = cForm.querySelectorAll('input');
          inputs.forEach(function(inp) {
            var ph = (inp.placeholder || '').toLowerCase();
            var lbl = inp.parentElement ? (inp.parentElement.textContent || '').toLowerCase() : '';
            if ((ph.indexOf('name') !== -1 || lbl.indexOf('اسم') !== -1) && data.customerName && !inp.value) inp.value = data.customerName;
            if ((ph.indexOf('company') !== -1 || lbl.indexOf('شركة') !== -1) && (data.company || data.customerName) && !inp.value) inp.value = data.company || data.customerName;
            if (inp.type === 'email' && data.email && !inp.value) inp.value = data.email;
            if (inp.type === 'tel' && data.phone && !inp.value) inp.value = data.phone;
            if ((ph.indexOf('street') !== -1 || ph.indexOf('address') !== -1 || lbl.indexOf('عنوان') !== -1) && data.address && !inp.value) inp.value = data.address;
            if ((ph.indexOf('city') !== -1 || lbl.indexOf('مدينة') !== -1) && data.city && !inp.value) inp.value = data.city;
          });
        }
      } else if (mode === 'company' || mode === 'enterprise') {
        setVal('companyName', data.companyName || data.supplierName);
        setVal('companySiege', data.siege || data.address);
        setVal('companyAddress', data.address || data.siege);
        setVal('companyRC', data.rc);
        setVal('companyArtNumber', data.art || data.ai);
        setVal('companyNIF', data.nif);
        setVal('companyNIS', data.nis);
        setVal('companyBP', data.bp);
        setVal('companyAG', data.ag);
        setVal('companyNIN', data.nin);
        setVal('companyPhone', data.phone);
        setVal('companyEmail', data.email);
        setVal('companyWebsite', data.website);
        setVal('companyCity', data.city);
        setVal('companyCapital', data.capital);
        setVal('companyBankName', data.bankName);
        setVal('companyRIB', data.rib);
        setVal('companyBankAccount', data.bankAccount || data.rib);
        if (data.vat) setVal('companyVAT', data.vat);

        var logoName = document.getElementById('logoPreviewCompanyName');
        if (logoName && (data.companyName || data.supplierName)) {
          logoName.textContent = data.companyName || data.supplierName;
        }

        if (typeof window.showToast === 'function') {
          window.showToast('تم تطبيق بيانات الشركة المستخرجة بنجاح عبر Copilot IA!', 'success');
        }
      } else if (mode === 'universal') {
        if (typeof window.showToast === 'function') {
          window.showToast('تم الاستخراج بنجاح! يمكنك نسخ البيانات أو استخدامها.', 'success');
        }
      }
    },

    open: function(options) {
      var opts = options || {};
      this._previousActiveElement = document.activeElement;
      this.ensureStyles();
      this.state.file = null;
      this.state.dataUrl = null;
      this.state.kind = null;
      this.state.mode = opts.mode || 'customer';
      this.state.extracted = null;
      this.state.options = opts;
      this.state.isExtracting = false;

      var modal = this.getModalEl();
      modal.innerHTML = this.renderModalHtml(opts);
      this.bindEvents(modal);

      modal.inert = false;
      modal.classList.add('is-active');
      modal.classList.add('active');
      modal.style.setProperty('display', 'flex', 'important');
      modal.style.setProperty('z-index', '999999', 'important');
      modal.style.setProperty('position', 'fixed', 'important');
      modal.style.setProperty('top', '0', 'important');
      modal.style.setProperty('left', '0', 'important');
      modal.style.setProperty('right', '0', 'important');
      modal.style.setProperty('bottom', '0', 'important');
      modal.style.setProperty('width', '100vw', 'important');
      modal.style.setProperty('height', '100vh', 'important');
      modal.style.setProperty('background', 'rgba(15, 23, 42, 0.75)', 'important');
      modal.style.setProperty('align-items', 'center', 'important');
      modal.style.setProperty('justify-content', 'center', 'important');
      modal.removeAttribute('aria-hidden');
      modal.setAttribute('aria-hidden', 'false');
      if (document.body) document.body.classList.add('modal-open');
      return modal;
    },

    close: function() {
      var modal = document.getElementById('zeraldaUnifiedOcrModal');
      var prev = this._previousActiveElement;
      this._previousActiveElement = null;

      if (modal) {
        modal.inert = true;
        modal.classList.remove('is-active');
        modal.classList.remove('active');
        modal.style.setProperty('display', 'none', 'important');
      }
      if (document.body) document.body.classList.remove('modal-open');

      // 1. Move focus outside modal FIRST
      if (prev && document.contains(prev) && typeof prev.focus === 'function') {
        try { prev.focus(); } catch(e) {}
      } else if (modal && document.activeElement && modal.contains(document.activeElement)) {
        try {
          document.activeElement.blur();
          if (document.body && typeof document.body.focus === 'function') {
            document.body.focus();
          }
        } catch(e) {}
      }

      // 2. Defer aria-hidden to ensure click event loop has completely finished and focus has moved
      if (modal) {
        setTimeout(function() {
          if (modal.contains(document.activeElement)) {
            try {
              if (document.activeElement) document.activeElement.blur();
              if (document.body) document.body.focus();
            } catch(e) {}
          }
          if (!modal.contains(document.activeElement)) {
            modal.setAttribute('aria-hidden', 'true');
          }
        }, 0);
      }
    },

    openModal: function(options) {
      return this.open(options);
    }
  };

  function openUniversalOcrModal(options) {
    var isAr = ZeraldaOCR.getLang() === 'ar';
    var isFr = ZeraldaOCR.getLang() === 'fr';
    var opts = options || {};
    opts.mode = opts.mode || 'universal';
    opts.title = opts.title || (isAr ? 'المسح الضوئي الذكي الشامل (Scan IA)' : (isFr ? 'Scan Intelligent Universel (IA)' : 'Universal AI Smart Scan'));
    opts.subtitle = opts.subtitle || (isAr ? 'امسح أي فاتورة، إيصال، كشف بنكي، بطاقة عمل، أو ملصق منتج' : (isFr ? 'Scannez factures, reçus, chèques, cartes de visite ou articles' : 'Scan any invoice, receipt, check, business card, or product label'));
    opts.icon = opts.icon || 'fas fa-camera';
    return ZeraldaOCR.open(opts);
  }

  global.ZeraldaOCR = ZeraldaOCR;
  global.openUniversalOcrModal = openUniversalOcrModal;
  if (typeof window !== 'undefined') {
    window.ZeraldaOCR = ZeraldaOCR;
    window.openOcrModal = function(options) {
      return ZeraldaOCR.open(options);
    };
    window.openUniversalOcrModal = openUniversalOcrModal;
  }

})(typeof window !== 'undefined' ? window : this);

